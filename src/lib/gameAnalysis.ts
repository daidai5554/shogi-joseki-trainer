import {
  getBlackPlayerName,
  getWhitePlayerName,
  importKIF,
  Move,
} from "tsshogi";
import { shogiEngine, type AnalyzeCandidate } from "./engine";
import {
  colorToSide,
  keyToPosition,
  moveLabel,
  normalizeSfen,
  sideToColor,
  turnOfKey,
} from "./shogi";
import type { JosekiEdge2, NewProblem } from "./store";
import type { GamePhase, Side } from "./types";

/** この損失(cp)以上で問題として登録する */
export const MISTAKE_THRESHOLD = 200;
/** この損失(cp)以上は「悪手」、未満は「疑問手」と表示する */
export const BLUNDER_THRESHOLD = 500;
/** 最善からこの差(cp)以内の候補手も正解として許容する */
const ACCEPT_MARGIN = 100;
/** この手数までを序盤とみなす */
const OPENING_MAX_PLY = 32;
/** 読み筋の表示手数 */
const PV_LABEL_MOVES = 6;
/** 定跡ツリーへ自動追記する最大手数(序盤〜中盤) */
export const AUTO_APPEND_PLIES = 60;
/** 詰みスコアをcpへ変換する際の基準値 */
const MATE_CP = 30000;

export interface GameStep {
  ply: number;
  move: Move;
  fromKey: string;
  toKey: string;
}

export interface ParsedGame {
  steps: GameStep[];
  gameLabel: string;
}

/** KIF棋譜を読み込み、本譜の手順と対局表示名を取り出す */
export function parseGameKif(kifText: string): ParsedGame | Error {
  const record = importKIF(kifText);
  if (record instanceof Error) {
    return new Error(`KIFの読み込みに失敗しました: ${record.message}`);
  }
  const steps: GameStep[] = [];
  let prevKey = normalizeSfen(record.initialPosition.sfen);
  for (const node of record.moves) {
    const move = node.move;
    if (!(move instanceof Move)) {
      continue; // 開始・投了などの特殊手
    }
    const toKey = normalizeSfen(node.sfen);
    steps.push({ ply: node.ply, move, fromKey: prevKey, toKey });
    prevKey = toKey;
  }
  if (steps.length === 0) {
    return new Error("指し手が含まれていません");
  }
  const black = getBlackPlayerName(record.metadata) ?? "先手";
  const white = getWhitePlayerName(record.metadata) ?? "後手";
  return { steps, gameLabel: `▲${black} vs △${white}` };
}

/** 手数からフェーズを簡易判定する */
export function phaseOfPly(ply: number, totalPlies: number): GamePhase {
  if (ply <= OPENING_MAX_PLY) return "opening";
  const endgameStart = Math.max(OPENING_MAX_PLY + 1, Math.floor(totalPlies * 0.7));
  return ply >= endgameStart ? "endgame" : "middle";
}

export const PHASE_LABEL: Record<GamePhase, string> = {
  opening: "序盤",
  middle: "中盤",
  endgame: "終盤",
};

/** 候補手のスコア(手番側視点)をcp相当値に変換する */
function candidateCp(c: Pick<AnalyzeCandidate, "cp" | "mate">): number {
  if (c.mate !== null) {
    return c.mate > 0
      ? MATE_CP - Math.min(c.mate, 999) * 10
      : -MATE_CP - Math.max(c.mate, -999) * 10;
  }
  return c.cp ?? 0;
}

/** 読み筋(USI列)を日本語表記に変換する */
function pvToLabel(fromKey: string, pv: string, maxMoves: number): string {
  try {
    const pos = keyToPosition(fromKey);
    const labels: string[] = [];
    for (const usi of pv.split(/\s+/).slice(0, maxMoves)) {
      const move = pos.createMoveByUSI(usi);
      if (!move || !pos.doMove(move)) break;
      labels.push(moveLabel(move));
    }
    return labels.join(" ");
  } catch {
    return "";
  }
}

/**
 * 実戦の手順を定跡ツリー追記用エントリに変換する。
 * 自分の悪手を定跡化しないよう、stopBeforePly(最初のミスの手数)以降は含めない。
 */
export function autoAppendEntries(
  parsed: ParsedGame,
  maxPly = AUTO_APPEND_PLIES,
  stopBeforePly?: number,
): JosekiEdge2[] {
  const limit = stopBeforePly !== undefined ? Math.min(maxPly, stopBeforePly - 1) : maxPly;
  return parsed.steps
    .filter((s) => s.ply <= limit)
    .map((s) => ({
      fromKey: s.fromKey,
      usi: s.move.usi,
      to: s.toKey,
      label: moveLabel(s.move),
    }));
}

/** 評価グラフ用の1点(局面index=その時点までの手数、自分視点cp) */
export interface EvalPoint {
  ply: number;
  cpUser: number;
}

export interface GameAnalysisResult {
  totalPlies: number;
  evalPoints: EvalPoint[];
  problems: NewProblem[];
  cancelled: boolean;
}

export interface AnalyzeGameOptions {
  parsed: ParsedGame;
  userSide: Side;
  /** 1局面あたりの思考時間(ms) */
  movetime: number;
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}

/**
 * 棋譜の全局面をエンジンで解析し、自分が形勢を損ねた手を検出して
 * 特訓問題(NewProblem)を生成する。
 */
export async function analyzeGame(opts: AnalyzeGameOptions): Promise<GameAnalysisResult> {
  const { parsed, userSide, movetime, onProgress, isCancelled } = opts;
  const { steps } = parsed;
  const userColor = sideToColor(userSide);

  // 局面キー列: keys[i] = i手目を指す前の局面(keys[N]は最終局面)
  const keys = [steps[0].fromKey, ...steps.map((s) => s.toKey)];
  const total = keys.length;

  const cpUser: number[] = [];
  const candidatesAt: AnalyzeCandidate[][] = [];

  for (let i = 0; i < total; i++) {
    if (isCancelled?.()) {
      return { totalPlies: steps.length, evalPoints: [], problems: [], cancelled: true };
    }
    const key = keys[i];
    const isUserTurn = turnOfKey(key) === userColor;
    // 自分の手番(かつ次の手がある)局面のみMultiPVで候補手を取る
    const multipv = isUserTurn && i < steps.length ? 3 : 1;
    const result = await shogiEngine.analyze(key, movetime, multipv);
    candidatesAt.push(result.candidates);
    if (result.candidates.length === 0) {
      // 合法手なし(詰み)。手番側の負け
      cpUser.push(isUserTurn ? -MATE_CP : MATE_CP);
    } else {
      const cpSide = candidateCp(result.candidates[0]);
      cpUser.push(isUserTurn ? cpSide : -cpSide);
    }
    onProgress?.(i + 1, total);
  }

  const problems: NewProblem[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (colorToSide(step.move.color) !== userSide) continue;
    const lossCp = cpUser[i] - cpUser[i + 1];
    if (lossCp < MISTAKE_THRESHOLD) continue;
    const candidates = candidatesAt[i];
    const best = candidates[0];
    if (!best || best.usi === step.move.usi) continue;
    const bestCp = candidateCp(best);
    const acceptedUsis = candidates
      .filter((c) => bestCp - candidateCp(c) <= ACCEPT_MARGIN)
      .map((c) => c.usi);
    const bestMove = keyToPosition(step.fromKey).createMoveByUSI(best.usi);
    if (!bestMove) continue;
    problems.push({
      sfenKey: step.fromKey,
      userSide,
      ply: step.ply,
      phase: phaseOfPly(step.ply, steps.length),
      playedUsi: step.move.usi,
      playedLabel: moveLabel(step.move),
      bestUsi: best.usi,
      bestLabel: moveLabel(bestMove),
      acceptedUsis,
      evalBest: Math.round(bestCp),
      evalPlayed: Math.round(cpUser[i + 1]),
      lossCp: Math.round(lossCp),
      pvLabel: pvToLabel(step.fromKey, best.pv, PV_LABEL_MOVES),
      gameLabel: parsed.gameLabel,
    });
  }

  const evalPoints: EvalPoint[] = cpUser.map((cp, i) => ({ ply: i, cpUser: cp }));
  return { totalPlies: steps.length, evalPoints, problems, cancelled: false };
}

/** 自分視点cpの表示用フォーマット */
export function formatUserCp(cp: number): string {
  if (cp >= MATE_CP - 10000) return "勝ち(詰みあり)";
  if (cp <= -(MATE_CP - 10000)) return "負け(詰まされ)";
  return cp >= 0 ? `+${cp}` : `${cp}`;
}
