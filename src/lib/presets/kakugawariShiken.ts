import { Position } from "tsshogi";
import { moveLabel, normalizeSfen, STANDARD_ROOT_KEY } from "../shogi";
import type { Book, Side } from "../types";

interface LineDef {
  moves: string[];
  /** 手数(1始まり) → その手を指した後の局面へのメモ */
  comments?: Record<number, string>;
}

function buildBookFromLines(id: string, name: string, side: Side, lines: LineDef[]): Book {
  const book: Book = {
    id,
    name,
    side,
    root: STANDARD_ROOT_KEY,
    nodes: {
      [STANDARD_ROOT_KEY]: { moves: [], comment: "角交換四間飛車の定跡開始局面" },
    },
  };

  for (const line of lines) {
    const pos = Position.newBySFEN(`${STANDARD_ROOT_KEY} 1`);
    if (!pos) continue;

    for (let i = 0; i < line.moves.length; i++) {
      const usi = line.moves[i];
      const fromKey = normalizeSfen(pos.sfen);
      const move = pos.createMoveByUSI(usi);
      if (!move || !pos.doMove(move)) {
        console.warn(`[preset] invalid move ${usi} at ply ${i + 1} in ${name}`);
        break;
      }
      const toKey = normalizeSfen(pos.sfen);

      const fromNode = book.nodes[fromKey] ?? { moves: [], comment: "" };
      book.nodes[fromKey] = fromNode;
      if (!fromNode.moves.some((m) => m.usi === usi)) {
        fromNode.moves.push({ usi, to: toKey, label: moveLabel(move) });
      }

      const toNode = book.nodes[toKey] ?? { moves: [], comment: "" };
      book.nodes[toKey] = toNode;
      const comment = line.comments?.[i + 1];
      if (comment && !toNode.comment) {
        toNode.comment = comment;
      }
    }
  }

  return book;
}

/** 本筋: 角交換〜高美濃〜5八飛 */
const MAIN_LINE: LineDef = {
  moves: [
    "7g7f", "3c3d", "6g6f", "8c8d", "7f7e", "8d8e",
    "6i7h", "2b3c", "7h6g", "6c6d", "6f6e", "5d5e",
    "6e6d", "5e6d", "5g5f", "4a3b", "7i6h", "7a6b",
    "6h5g", "4c4d", "5i6i", "5a4b", "4g4f", "3a4c",
    "4f4e", "3b2c", "2h3g", "4b4c", "3g4f", "5c5d",
    "4f5e", "2c3d", "5e6d", "1c1d", "6d6e", "6b5c",
    "2i5h",
  ],
  comments: {
    2: "四間飛車の出だし。7五歩は突かず6六歩から入る。",
    8: "角交換の基本。相手が3三角と取ってきた形。",
    14: "6五歩の突き出し。角を取り合う展開。",
    20: "高美濃の駒組みへ。",
    28: "矢倉系の組み上げ。4五桂を狙う準備。",
    36: "角を6四で取り、6五銀の形。",
    37: "▲5八飛。四間飛車の本体。",
  },
};

/** 先手番: 角交換四間飛車の主要分岐 */
const SENTE_LINES: LineDef[] = [
  MAIN_LINE,
  {
    moves: [
      "7g7f", "3c3d", "6g6f", "7c7d", "2g2f", "8c8d",
      "2f2e", "8d8e", "6i7h", "2b3c", "7h6g", "6c6d",
      "6f6e", "5d5e", "6e6d", "5e6d", "5g5f", "4a3b",
      "7i6h", "7a6b", "6h5g", "4c4d", "5i6i", "5a4b",
      "4g4f", "3a4c", "4f4e", "3b2c", "2h3g", "4b4c",
    ],
    comments: {
      4: "△7四歩のときは▲2六歩で向かい飛車の振り直しを狙う。",
      8: "向かい飛車→角交換四間飛車への振り直しルート。",
    },
  },
  {
    moves: [
      ...MAIN_LINE.moves.slice(0, 30),
      "4f5e", "2c3d", "5e6d", "1c1d", "6d6e", "6b5c",
      "2i5h", "3d3e", "5h6h", "2a3c", "7e7d", "3c4e",
      "7d7c", "5b5c", "6h5i", "4e3g", "5i6i", "3g4f",
      "6i7i", "4f5e", "7i6h", "5e6d", "6h7i",
    ],
    comments: {
      31: "▲4五桂(速攻)の一例。相手の5四歩に桂を跳ねる。",
    },
  },
  {
    moves: [
      ...MAIN_LINE.moves.slice(0, 30),
      "4f4e", "3b2c", "2h3g", "4b4c", "3g4f", "5c5d",
      "4f5e", "2c3d", "5e6d", "1c1d", "6d6e", "6b5c",
      "2i5h", "3d3e", "5h6h", "2a3c", "7e7d", "3c4e",
      "7d7c", "5b5c", "6h5i", "4e3g", "5i6i", "3g4f",
      "6i7i", "4f5e", "7i6h", "5e6d", "6h7i", "6d7f",
    ],
    comments: {
      31: "▲4六歩の一例。5四歩を突き出して相手の5五歩を誘う。",
    },
  },
];

/** 後手番: 角交換四間飛車側の応手・定跡 */
const GOTE_LINES: LineDef[] = [
  {
    moves: MAIN_LINE.moves,
    comments: {
      10: "後手は6四歩で6五歩に対抗。角交換後の基本。",
      16: "3二銀上がりで高美濃の形に入る。",
      24: "4四歩で先手の美濃を牽制。",
      32: "5五歩で4五桂を防ぐ定跡手。",
    },
  },
  {
    moves: [
      "7g7f", "3c3d", "6g6f", "7c7d", "2g2f", "8c8d",
      "2f2e", "8d8e", "6i7h", "2b3c", "7h6g", "6c6d",
      "6f6e", "5d5e", "6e6d", "5e6d", "5g5f", "4a3b",
      "7i6h", "7a6b", "6h5g", "4c4d", "5i6i", "5a4b",
      "4g4f", "3a4c", "4f4e", "3b2c", "2h3g", "4b4c",
    ],
    comments: {
      4: "△7四歩には▲2六歩。向かい飛車の振り直しを警戒。",
      12: "振り直し後も角交換四間飛車の形を維持する。",
    },
  },
  {
    moves: [
      ...MAIN_LINE.moves.slice(0, 37),
      "3d3e", "5h6h", "2a3c", "7e7d", "3c4e", "7d7c",
      "5b5c", "6h5i", "4e3g", "5i6i", "3g4f", "6i7i",
      "4f5e", "7i6h", "5e6d", "6h7i", "6d7f", "8h7i",
      "7f6h", "7i6h", "5c5d", "6h7i", "5d5e", "7i8h",
      "5e5f", "8h7i", "5f5g",
    ],
    comments: {
      38: "居飛車穴熊への対応例。5五歩〜5七歩と突いて角を活かす。",
    },
  },
];

export const PRESET_BOOK_IDS = {
  sente: "preset-kakugawari-shiken-sente",
  gote: "preset-kakugawari-shiken-gote",
} as const;

export function createKakugawariPresetBooks(): Book[] {
  return [
    buildBookFromLines(
      PRESET_BOOK_IDS.sente,
      "角交換四間飛車(先手番・プリセット)",
      "black",
      SENTE_LINES,
    ),
    buildBookFromLines(
      PRESET_BOOK_IDS.gote,
      "角交換四間飛車(後手番・プリセット)",
      "white",
      GOTE_LINES,
    ),
  ];
}
