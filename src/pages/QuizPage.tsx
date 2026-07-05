import { useEffect, useMemo, useRef, useState } from "react";
import { Move, Square } from "tsshogi";
import { BookSelector } from "../components/BookSelector";
import { EvalPanel } from "../components/EvalPanel";
import { ShogiBoard } from "../components/ShogiBoard";
import { keyToPosition, usiToDestination } from "../lib/shogi";
import { store, useStoreRevision } from "../lib/store";

/** 1問あたり実戦風に継続する最大手数 */
const MAX_LINE_PLIES = 16;
const DUE_LIMIT = 20;
const RANDOM_LIMIT = 10;
const OPPONENT_DELAY_MS = 650;

type Phase = "asking" | "wrong" | "revealed" | "opponent" | "lineEnd";

interface LineState {
  startKey: string;
  key: string;
  lastTo: Square | null;
  attempts: number;
  revealed: boolean;
  ply: number;
  phase: Phase;
}

interface Session {
  queue: string[];
  index: number;
  answered: number;
  perfect: number;
  answeredKeys: string[];
}

export function QuizPage() {
  useStoreRevision();
  const book = store.activeBook;
  const [session, setSession] = useState<Session | null>(null);
  const [line, setLine] = useState<LineState | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  // ブックが変わったらセッションを破棄
  useEffect(() => {
    setSession(null);
    setLine(null);
  }, [book?.id]);

  const position = useMemo(() => (line ? keyToPosition(line.key) : null), [line]);

  if (!book) {
    return (
      <div className="page">
        <p>定跡ブックがありません。設定タブから作成してください。</p>
      </div>
    );
  }

  const stats = store.countDue(book);

  const startSession = (mode: "due" | "random") => {
    const queue =
      mode === "due" ? store.buildQueue(book, DUE_LIMIT) : store.buildRandomQueue(book, RANDOM_LIMIT);
    if (queue.length === 0) {
      return;
    }
    setSession({ queue, index: 0, answered: 0, perfect: 0, answeredKeys: [] });
    startLine(queue[0]);
  };

  const startLine = (key: string) => {
    setLine({
      startKey: key,
      key,
      lastTo: null,
      attempts: 0,
      revealed: false,
      ply: 0,
      phase: "asking",
    });
  };

  const scheduleOpponent = (key: string, ply: number) => {
    timerRef.current = window.setTimeout(() => {
      const node = book.nodes[key];
      if (!node || node.moves.length === 0 || ply >= MAX_LINE_PLIES) {
        setLine((cur) => (cur ? { ...cur, phase: "lineEnd" } : cur));
        return;
      }
      const edge = node.moves[Math.floor(Math.random() * node.moves.length)];
      const nextKey = edge.to;
      const lastTo = usiToDestination(edge.usi);
      const ownNode = book.nodes[nextKey];
      const canContinue = !!ownNode && ownNode.moves.length > 0 && ply + 1 < MAX_LINE_PLIES;
      setLine((cur) =>
        cur
          ? {
              ...cur,
              key: nextKey,
              lastTo,
              ply: ply + 1,
              attempts: 0,
              revealed: false,
              phase: canContinue ? "asking" : "lineEnd",
            }
          : cur,
      );
    }, OPPONENT_DELAY_MS);
  };

  const handleMove = (move: Move) => {
    if (!line || !session) return;
    if (line.phase !== "asking" && line.phase !== "wrong" && line.phase !== "revealed") return;
    const node = book.nodes[line.key];
    const edge = node?.moves.find((m) => m.usi === move.usi);
    if (!edge) {
      setLine({ ...line, attempts: line.attempts + 1, phase: "wrong" });
      return;
    }
    // 成績を反映(最初の一発正解=5、間違えてから正解=2、答えを見た=1)
    const quality = line.revealed ? 1 : line.attempts === 0 ? 5 : 2;
    store.rate(book.id, line.key, quality);
    setSession({
      ...session,
      answered: session.answered + 1,
      perfect: session.perfect + (quality === 5 ? 1 : 0),
      answeredKeys: [...session.answeredKeys, line.key],
    });
    setLine({
      ...line,
      key: edge.to,
      lastTo: move.to,
      ply: line.ply + 1,
      phase: "opponent",
    });
    scheduleOpponent(edge.to, line.ply + 1);
  };

  const nextQuestion = () => {
    if (!session) return;
    const answered = new Set(session.answeredKeys);
    let index = session.index + 1;
    while (index < session.queue.length && answered.has(session.queue[index])) {
      index++;
    }
    if (index >= session.queue.length) {
      setLine(null);
      setSession({ ...session, index });
      return;
    }
    setSession({ ...session, index });
    startLine(session.queue[index]);
  };

  const quitSession = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setSession(null);
    setLine(null);
  };

  // ---- 描画 ----

  if (!session) {
    return (
      <div className="page">
        <BookSelector />
        <section className="panel">
          <h3>出題モード</h3>
          <p>
            復習対象: <strong>{stats.due}</strong> 局面
            {stats.priority > 0 && (
              <span className="badge priority">重点 {stats.priority}</span>
            )}
            <br />
            <span className="hint">登録済みの出題局面: {stats.total}</span>
          </p>
          {stats.total === 0 ? (
            <p className="hint">
              まず「定跡」タブで自分の手番の局面に候補手を登録してください。
            </p>
          ) : (
            <div className="quiz-start-buttons">
              <button
                type="button"
                className="btn primary"
                disabled={stats.due === 0}
                onClick={() => startSession("due")}
              >
                復習をはじめる({Math.min(stats.due, DUE_LIMIT)}問)
              </button>
              <button type="button" className="btn" onClick={() => startSession("random")}>
                ランダム練習({Math.min(stats.total, RANDOM_LIMIT)}問)
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (!line) {
    // セッション終了サマリー
    return (
      <div className="page">
        <section className="panel center">
          <h3>セッション終了</h3>
          <p className="summary-score">
            一発正解 {session.perfect} / {session.answered}
          </p>
          <button type="button" className="btn primary" onClick={quitSession}>
            出題トップへ
          </button>
        </section>
      </div>
    );
  }

  const node = book.nodes[line.key];
  const askedNode = line.phase === "lineEnd" ? null : node;
  const startCard = store.getCard(book.id, line.startKey);
  const interactive =
    line.phase === "asking" || line.phase === "wrong" || line.phase === "revealed";

  let message = "";
  switch (line.phase) {
    case "asking":
      message = "次の一手は?";
      break;
    case "wrong":
      message = "不正解… もう一度考えてみましょう";
      break;
    case "revealed":
      message = `正解手: ${node?.moves.map((m) => m.label).join(" / ") ?? ""}`;
      break;
    case "opponent":
      message = "正解! 相手の応手…";
      break;
    case "lineEnd":
      message = "この課題はここまで。おつかれさまでした";
      break;
  }

  return (
    <div className="page">
      <div className="quiz-header">
        <span>
          第{session.index + 1}問 / {session.queue.length}
          {startCard?.priority && <span className="badge priority">重点</span>}
        </span>
        <button type="button" className="btn small" onClick={quitSession}>
          中断
        </button>
      </div>
      {position && (
        <>
          <ShogiBoard
            position={position}
            flipped={book.side === "white"}
            interactive={interactive}
            onMove={handleMove}
            lastMoveTo={line.lastTo}
          />
          <EvalPanel
            bookId={book.id}
            sfenKey={line.key}
            userSide={book.side}
            cachedCp={node?.evalCp}
            cachedMate={node?.evalMate}
            compact
          />
        </>
      )}
      <div className={`quiz-message ${line.phase}`}>{message}</div>
      {line.phase === "wrong" && (
        <button
          type="button"
          className="btn"
          onClick={() => setLine({ ...line, revealed: true, phase: "revealed" })}
        >
          答えを見る
        </button>
      )}
      {line.phase === "revealed" && (
        <p className="hint">正解手を盤上で指して次に進んでください。</p>
      )}
      {line.phase === "lineEnd" && (
        <button type="button" className="btn primary" onClick={nextQuestion}>
          次の問題へ
        </button>
      )}
      {askedNode?.comment && line.phase !== "asking" && (
        <section className="panel">
          <h3>メモ</h3>
          <p className="comment-text">{askedNode.comment}</p>
        </section>
      )}
    </div>
  );
}
