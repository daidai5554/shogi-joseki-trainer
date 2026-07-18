import { useEffect, useMemo, useState } from "react";
import { Move, Square } from "tsshogi";
import { BookSelector } from "../components/BookSelector";
import { EvalPanel } from "../components/EvalPanel";
import { ShogiBoard } from "../components/ShogiBoard";
import { keyToPosition, moveLabel, normalizeSfen, sideToColor } from "../lib/shogi";
import { store, useStoreRevision } from "../lib/store";

export function EditorPage() {
  useStoreRevision();
  const book = store.activeBook;
  const [path, setPath] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(book?.side === "white");

  // ブック切り替え時は初期局面に戻し、後手番ブックなら盤を反転する
  useEffect(() => {
    setPath([]);
    setFlipped(book?.side === "white");
  }, [book?.id, book?.side]);

  const replay = useMemo(() => {
    if (!book) return null;
    const pos = keyToPosition(book.root);
    const labels: string[] = [];
    let lastTo: Square | null = null;
    for (const usi of path) {
      const move = pos.createMoveByUSI(usi);
      if (!move || !pos.doMove(move)) break;
      labels.push(moveLabel(move));
      lastTo = move.to;
    }
    return { pos, labels, lastTo };
  }, [book, path]);

  if (!book || !replay) {
    return (
      <div className="page">
        <p>定跡ブックがありません。設定タブから作成してください。</p>
      </div>
    );
  }

  const currentKey = normalizeSfen(replay.pos.sfen);
  const node = book.nodes[currentKey];
  const isOwnTurn = replay.pos.color === sideToColor(book.side);

  const handleMove = (move: Move) => {
    const next = replay.pos.clone();
    if (!next.doMove(move)) return;
    store.addEdge(book.id, currentKey, {
      usi: move.usi,
      to: normalizeSfen(next.sfen),
      label: moveLabel(move),
    });
    setPath([...path, move.usi]);
  };

  const handleEngineCandidate = (usi: string) => {
    const move = replay.pos.createMoveByUSI(usi);
    if (!move || !replay.pos.isValidMove(move)) return;
    handleMove(move);
  };

  const advance = (usi: string) => setPath([...path, usi]);

  const handleRemoveEdge = (usi: string, label: string) => {
    if (
      window.confirm(`候補手「${label}」を削除します。以降の枝も消えます。よろしいですか?`)
    ) {
      store.removeEdge(book.id, currentKey, usi);
    }
  };

  return (
    <div className="page">
      <BookSelector manage />
      <ShogiBoard
        position={replay.pos}
        flipped={flipped}
        interactive
        onMove={handleMove}
        lastMoveTo={replay.lastTo}
      />
      <EvalPanel
        bookId={book.id}
        sfenKey={currentKey}
        userSide={book.side}
        cachedCp={node?.evalCp}
        cachedMate={node?.evalMate}
        registeredUsis={node?.moves.map((edge) => edge.usi)}
        onSelectCandidate={handleEngineCandidate}
      />
      <div className="toolbar">
        <button type="button" className="btn" disabled={path.length === 0} onClick={() => setPath([])}>
          ⏮ 最初
        </button>
        <button
          type="button"
          className="btn"
          disabled={path.length === 0}
          onClick={() => setPath(path.slice(0, -1))}
        >
          ◀ 戻る
        </button>
        <button type="button" className="btn" onClick={() => setFlipped(!flipped)}>
          ⇅ 反転
        </button>
        <span className="ply-info">{path.length}手目 {isOwnTurn ? "(自分の手番)" : "(相手の手番)"}</span>
      </div>

      <section className="panel">
        <h3>この局面の候補手 {node?.moves.length ? `(${node.moves.length})` : ""}</h3>
        {!node?.moves.length && (
          <p className="hint">盤上で駒を動かすと、この局面の候補手として登録されます。</p>
        )}
        <ul className="edge-list">
          {node?.moves.map((edge) => (
            <li key={edge.usi}>
              <button type="button" className="edge-btn" onClick={() => advance(edge.usi)}>
                {edge.label}
              </button>
              <button
                type="button"
                className="btn small danger"
                onClick={() => handleRemoveEdge(edge.usi, edge.label)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h3>局面メモ</h3>
        <textarea
          value={node?.comment ?? ""}
          placeholder="狙い筋、注意点などをメモ"
          onChange={(e) => store.setComment(book.id, currentKey, e.target.value)}
          rows={3}
        />
      </section>

      <section className="panel">
        <h3>手順</h3>
        <div className="move-path">
          <button type="button" className={`path-btn ${path.length === 0 ? "current" : ""}`} onClick={() => setPath([])}>
            開始局面
          </button>
          {replay.labels.map((label, i) => (
            <button
              key={`${i}-${path[i]}`}
              type="button"
              className={`path-btn ${i === path.length - 1 ? "current" : ""}`}
              onClick={() => setPath(path.slice(0, i + 1))}
            >
              {i + 1}.{label}
            </button>
          ))}
        </div>
        <p className="hint">登録局面数: {Object.keys(book.nodes).length}</p>
      </section>
    </div>
  );
}
