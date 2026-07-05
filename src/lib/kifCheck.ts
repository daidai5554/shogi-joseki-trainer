import { importKIF, Move } from "tsshogi";
import { colorToSide, moveLabel, normalizeSfen } from "./shogi";
import type { JosekiEdge2 } from "./store";
import type { Book, JosekiEdge, Side } from "./types";

/** 逸脱地点から先、何手分をツリー追記の対象にするか */
const APPEND_PLIES = 10;

export interface Deviation {
  /** 何手目で外れたか */
  ply: number;
  /** 外した側 */
  mover: Side;
  /** 外したのは自分か */
  moverIsSelf: boolean;
  /** 実戦で指された手 */
  playedLabel: string;
  playedUsi: string;
  /** 逸脱直前の局面キー */
  fromKey: string;
  /** 定跡に登録されていた候補手 */
  bookMoves: JosekiEdge[];
}

export interface BookOut {
  /** 定跡登録が尽きた地点(この手から未登録) */
  ply: number;
  fromKey: string;
}

export interface KifAnalysis {
  totalPlies: number;
  /** 定跡と一致した手数 */
  matchedPlies: number;
  deviation: Deviation | null;
  bookOut: BookOut | null;
  /** 逸脱/登録切れ地点からの実戦手順(ツリー追記用) */
  appendEntries: JosekiEdge2[];
}

interface WalkStep {
  ply: number;
  move: Move;
  fromKey: string;
  toKey: string;
}

function walkMainline(kifText: string): WalkStep[] | Error {
  const record = importKIF(kifText);
  if (record instanceof Error) {
    return record;
  }
  const steps: WalkStep[] = [];
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
  return steps;
}

/**
 * KIF棋譜を定跡ブックと突き合わせ、どこで定跡から外れたかを解析する。
 */
export function analyzeKif(book: Book, kifText: string): KifAnalysis | Error {
  const steps = walkMainline(kifText);
  if (steps instanceof Error) {
    return new Error(`KIFの読み込みに失敗しました: ${steps.message}`);
  }
  if (steps.length === 0) {
    return new Error("指し手が含まれていません");
  }
  if (steps[0].fromKey !== book.root) {
    return new Error("開始局面が定跡ブックの開始局面(平手)と一致しません");
  }

  let matchedPlies = 0;
  let deviation: Deviation | null = null;
  let bookOut: BookOut | null = null;
  let breakIndex = steps.length;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const node = book.nodes[step.fromKey];
    if (!node || node.moves.length === 0) {
      bookOut = { ply: step.ply, fromKey: step.fromKey };
      breakIndex = i;
      break;
    }
    const edge = node.moves.find((m) => m.usi === step.move.usi);
    if (!edge) {
      const mover = colorToSide(step.move.color);
      deviation = {
        ply: step.ply,
        mover,
        moverIsSelf: mover === book.side,
        playedLabel: moveLabel(step.move),
        playedUsi: step.move.usi,
        fromKey: step.fromKey,
        bookMoves: node.moves,
      };
      breakIndex = i;
      break;
    }
    matchedPlies++;
  }

  const appendEntries: JosekiEdge2[] = steps
    .slice(breakIndex, breakIndex + APPEND_PLIES)
    .map((step) => ({
      fromKey: step.fromKey,
      usi: step.move.usi,
      to: step.toKey,
      label: moveLabel(step.move),
    }));

  return {
    totalPlies: steps.length,
    matchedPlies,
    deviation,
    bookOut,
    appendEntries,
  };
}
