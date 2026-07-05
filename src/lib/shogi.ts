import {
  Color,
  type ImmutablePosition,
  isPromotable,
  Move,
  PieceType,
  Position,
  Square,
} from "tsshogi";
import type { Side } from "./types";

export const STANDARD_ROOT_KEY =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b -";

/** SFENから手数フィールドを除去し、局面キーとして正規化する */
export function normalizeSfen(sfen: string): string {
  return sfen.trim().split(/\s+/).slice(0, 3).join(" ");
}

/** 正規化SFENキーから局面を復元する */
export function keyToPosition(key: string): Position {
  const pos = Position.newBySFEN(`${key} 1`);
  if (!pos) {
    throw new Error(`不正な局面キー: ${key}`);
  }
  return pos;
}

/** 正規化SFENキーの手番 */
export function turnOfKey(key: string): Color {
  return key.split(" ")[1] === "w" ? Color.WHITE : Color.BLACK;
}

export function sideToColor(side: Side): Color {
  return side === "black" ? Color.BLACK : Color.WHITE;
}

export function colorToSide(color: Color): Side {
  return color === Color.BLACK ? "black" : "white";
}

/**
 * 指定の駒(盤上マスまたは持ち駒)から指せる合法手を列挙する。
 * 成り/不成が両方可能な場合は両方含む。
 */
export function listMovesFrom(
  pos: ImmutablePosition,
  from: Square | PieceType,
): Move[] {
  const result: Move[] = [];
  for (const to of Square.all) {
    const move = pos.createMove(from, to);
    if (!move) {
      continue;
    }
    if (pos.isValidMove(move)) {
      result.push(move);
    }
    if (move.from instanceof Square && !move.promote && isPromotable(move.pieceType)) {
      const promoted = move.withPromote();
      if (pos.isValidMove(promoted)) {
        result.push(promoted);
      }
    }
  }
  return result;
}

const PIECE_KANJI: Record<PieceType, string> = {
  [PieceType.PAWN]: "歩",
  [PieceType.LANCE]: "香",
  [PieceType.KNIGHT]: "桂",
  [PieceType.SILVER]: "銀",
  [PieceType.GOLD]: "金",
  [PieceType.BISHOP]: "角",
  [PieceType.ROOK]: "飛",
  [PieceType.KING]: "玉",
  [PieceType.PROM_PAWN]: "と",
  [PieceType.PROM_LANCE]: "杏",
  [PieceType.PROM_KNIGHT]: "圭",
  [PieceType.PROM_SILVER]: "全",
  [PieceType.HORSE]: "馬",
  [PieceType.DRAGON]: "竜",
};

export function pieceKanji(type: PieceType): string {
  return PIECE_KANJI[type];
}

const FULL_WIDTH_NUM = ["", "１", "２", "３", "４", "５", "６", "７", "８", "９"];
const RANK_KANJI = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 指し手の日本語表記 (例: "▲７六歩", "△４五歩打", "▲２二角成") */
export function moveLabel(move: Move): string {
  const mark = move.color === Color.BLACK ? "▲" : "△";
  const dest = `${FULL_WIDTH_NUM[move.to.file]}${RANK_KANJI[move.to.rank]}`;
  // 成り駒を動かす場合は成り駒の名前、成る手は元の駒名+「成」
  const base = PIECE_KANJI[move.pieceType];
  const drop = !(move.from instanceof Square);
  return `${mark}${dest}${base}${move.promote ? "成" : ""}${drop ? "打" : ""}`;
}

/** USI指し手文字列から移動先マスを取り出す(ハイライト用) */
export function usiToDestination(usi: string): Square | null {
  if (usi.length < 4) {
    return null;
  }
  return Square.newByUSI(usi.slice(2, 4));
}
