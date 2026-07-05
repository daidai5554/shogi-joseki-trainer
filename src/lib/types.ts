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

export interface AppData {
  version: 1;
  books: Book[];
  /** `${bookId}|${sfenKey}` → カード */
  cards: Record<string, SrsCard>;
  activeBookId: string | null;
}
