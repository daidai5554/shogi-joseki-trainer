/** 自分が持つ手番 */
export type Side = "black" | "white";

/** 定跡ツリーの枝(ある局面からの指し手) */
export interface JosekiEdge {
  /** USI形式の指し手 (例: "7g7f", "P*4e") */
  usi: string;
  /** 指した後の局面の正規化SFENキー */
  to: string;
  /** 表示用テキスト (例: "▲７六歩") */
  label: string;
}

/** 定跡ツリーのノード(局面)。SFENキーで管理するため合流も自然に扱える */
export interface JosekiNode {
  moves: JosekiEdge[];
  comment: string;
  /** 保存済み評価(cp)。USI同様、手番側から見た値 */
  evalCp?: number;
  /** 保存済み詰み手数。USI同様、手番側から見た符号 */
  evalMate?: number;
}

/** 定跡ブック(先手用/後手用などを分けて管理) */
export interface Book {
  id: string;
  name: string;
  /** この定跡で自分が持つ手番 */
  side: Side;
  /** 開始局面の正規化SFENキー */
  root: string;
  /** 正規化SFENキー → ノード */
  nodes: Record<string, JosekiNode>;
}

/** SRS(簡易SM-2)のカード。自分の手番の局面ごとに1枚 */
export interface SrsCard {
  /** easiness factor */
  ef: number;
  /** 連続正解回数 */
  reps: number;
  /** 復習間隔(日) */
  interval: number;
  /** 次回出題時刻 (epoch ms) */
  due: number;
  /** 失敗回数 */
  lapses: number;
  /** 逸脱検出などで付く最優先フラグ */
  priority: boolean;
}

/** 局面のフェーズ(簡易判定) */
export type GamePhase = "opening" | "middle" | "endgame";

/**
 * 実戦棋譜のエンジン解析から自動生成される「特訓問題」。
 * 自分が形勢を損ねた局面で、最善手を指せるかを問う。
 */
export interface DrillProblem {
  id: string;
  createdAt: number;
  /** 出題局面(自分の手番)の正規化SFENキー */
  sfenKey: string;
  userSide: Side;
  /** 実戦での手数(この局面から指した手が何手目か) */
  ply: number;
  phase: GamePhase;
  /** 実戦で指してしまった手 */
  playedUsi: string;
  playedLabel: string;
  /** エンジンの最善手 */
  bestUsi: string;
  bestLabel: string;
  /** 正解として許容する手(最善手を含む、最善から差が小さい候補) */
  acceptedUsis: string[];
  /** 最善を指した場合の評価(自分視点cp) */
  evalBest: number;
  /** 実戦の手を指した後の評価(自分視点cp) */
  evalPlayed: number;
  /** 損失(cp) */
  lossCp: number;
  /** 最善の読み筋(日本語表記) */
  pvLabel: string;
  /** 出典対局の表示名 */
  gameLabel: string;
  card: SrsCard;
}

export interface AppData {
  version: 1;
  books: Book[];
  /** `${bookId}|${sfenKey}` → カード */
  cards: Record<string, SrsCard>;
  activeBookId: string | null;
  /** 実戦棋譜から自動生成した特訓問題 */
  problems: DrillProblem[];
}
