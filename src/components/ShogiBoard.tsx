import { useEffect, useMemo, useState } from "react";
import {
  Color,
  type ImmutablePosition,
  Move,
  Piece,
  PieceType,
  Square,
} from "tsshogi";
import { listMovesFrom, pieceKanji } from "../lib/shogi";

interface Props {
  position: ImmutablePosition;
  flipped: boolean;
  interactive?: boolean;
  onMove?: (move: Move) => void;
  /** 直前の指し手の移動先(ハイライト表示) */
  lastMoveTo?: Square | null;
}

type Selection =
  | { kind: "square"; square: Square }
  | { kind: "hand"; pieceType: PieceType }
  | null;

interface PendingPromotion {
  normal: Move;
  promoted: Move;
}

const HAND_ORDER: PieceType[] = [
  PieceType.ROOK,
  PieceType.BISHOP,
  PieceType.GOLD,
  PieceType.SILVER,
  PieceType.KNIGHT,
  PieceType.LANCE,
  PieceType.PAWN,
];

const FILE_LABELS = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
const RANK_LABELS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function ShogiBoard({ position, flipped, interactive = false, onMove, lastMoveTo }: Props) {
  const [selection, setSelection] = useState<Selection>(null);
  const [pending, setPending] = useState<PendingPromotion | null>(null);

  const bottomColor = flipped ? Color.WHITE : Color.BLACK;
  const topColor = flipped ? Color.BLACK : Color.WHITE;

  // 局面が変わったら選択状態をリセットする
  const sfen = position.sfen;
  useEffect(() => {
    setSelection(null);
    setPending(null);
  }, [sfen]);

  const candidateMoves = useMemo(() => {
    if (!selection) {
      return [];
    }
    const from = selection.kind === "square" ? selection.square : selection.pieceType;
    return listMovesFrom(position, from);
  }, [position, selection]);

  const destIndexes = useMemo(
    () => new Set(candidateMoves.map((m) => m.to.index)),
    [candidateMoves],
  );

  const clearSelection = () => {
    setSelection(null);
    setPending(null);
  };

  const play = (move: Move) => {
    clearSelection();
    onMove?.(move);
  };

  const handleSquareTap = (square: Square) => {
    if (!interactive || pending) {
      return;
    }
    if (selection && destIndexes.has(square.index)) {
      const moves = candidateMoves.filter((m) => m.to.equals(square));
      const normal = moves.find((m) => !m.promote);
      const promoted = moves.find((m) => m.promote);
      if (normal && promoted) {
        setPending({ normal, promoted });
      } else if (promoted) {
        play(promoted); // 強制成り
      } else if (normal) {
        play(normal);
      }
      return;
    }
    const piece = position.board.at(square);
    if (piece && piece.color === position.color) {
      if (selection?.kind === "square" && selection.square.equals(square)) {
        clearSelection();
      } else {
        setSelection({ kind: "square", square });
      }
      return;
    }
    clearSelection();
  };

  const handleHandTap = (color: Color, pieceType: PieceType) => {
    if (!interactive || pending || color !== position.color) {
      return;
    }
    if (selection?.kind === "hand" && selection.pieceType === pieceType) {
      clearSelection();
    } else {
      setSelection({ kind: "hand", pieceType });
    }
  };

  // 表示順(反転対応)
  const ranks = useMemo(() => {
    const r = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return flipped ? r.reverse() : r;
  }, [flipped]);
  const files = useMemo(() => {
    const f = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    return flipped ? f.reverse() : f;
  }, [flipped]);

  const fileLabels = flipped ? [...FILE_LABELS].reverse() : FILE_LABELS;
  const rankLabels = flipped ? [...RANK_LABELS].reverse() : RANK_LABELS;

  const renderHand = (color: Color) => {
    const hand = position.hand(color);
    const items = HAND_ORDER.map((t) => ({ type: t, count: hand.count(t) })).filter(
      (x) => x.count > 0,
    );
    const isTurn = position.color === color;
    return (
      <div className={`hand ${color === topColor ? "hand-top" : "hand-bottom"}`}>
        <span className={`hand-mark ${isTurn ? "turn" : ""}`}>
          {color === Color.BLACK ? "▲先手" : "△後手"}
        </span>
        <div className="hand-pieces">
          {items.length === 0 && <span className="hand-empty">なし</span>}
          {items.map(({ type, count }) => {
            const selected =
              selection?.kind === "hand" &&
              selection.pieceType === type &&
              position.color === color;
            return (
              <button
                key={type}
                type="button"
                className={`hand-piece ${selected ? "selected" : ""}`}
                onClick={() => handleHandTap(color, type)}
              >
                {pieceKanji(type)}
                {count > 1 && <span className="hand-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCell = (file: number, rank: number) => {
    const square = new Square(file, rank);
    const piece: Piece | null = position.board.at(square);
    const isSelected =
      selection?.kind === "square" && selection.square.equals(square);
    const isDest = destIndexes.has(square.index);
    const isLast = lastMoveTo?.equals(square) ?? false;
    const classes = ["cell"];
    if (isSelected) classes.push("selected");
    if (isDest) classes.push("dest");
    if (isLast) classes.push("last-move");
    return (
      <div key={square.index} className={classes.join(" ")} onClick={() => handleSquareTap(square)}>
        {piece && (
          <span className={`piece ${piece.color !== bottomColor ? "enemy" : ""}`}>
            {pieceKanji(piece.type)}
          </span>
        )}
        {isDest && !piece && <span className="dest-dot" />}
      </div>
    );
  };

  return (
    <div className="board-wrap">
      {renderHand(topColor)}
      <div className="board-frame">
        <div className="file-labels">
          {fileLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="board-row">
          <div className="board-grid">
            {ranks.map((rank) => files.map((file) => renderCell(file, rank)))}
          </div>
          <div className="rank-labels">
            {rankLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
        {pending && (
          <div className="promotion-overlay">
            <div className="promotion-dialog">
              <p>成りますか?</p>
              <div className="promotion-buttons">
                <button type="button" className="btn primary" onClick={() => play(pending.promoted)}>
                  成る
                </button>
                <button type="button" className="btn" onClick={() => play(pending.normal)}>
                  成らず
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {renderHand(bottomColor)}
    </div>
  );
}
