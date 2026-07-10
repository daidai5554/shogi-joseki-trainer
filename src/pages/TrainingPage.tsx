import { useMemo, useState } from "react";
import { Move, Square } from "tsshogi";
import { ShogiBoard } from "../components/ShogiBoard";
import { formatUserCp, PHASE_LABEL } from "../lib/gameAnalysis";
import { keyToPosition, usiToDestination } from "../lib/shogi";
import { store, useStoreRevision } from "../lib/store";
import type { DrillProblem, GamePhase } from "../lib/types";

const SESSION_LIMIT = 10;

type PhaseFilter = GamePhase | "all";

const FILTERS: { id: PhaseFilter; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "opening", label: "序盤" },
  { id: "middle", label: "中盤" },
  { id: "endgame", label: "終盤" },
];

type QuestionPhase = "asking" | "wrong" | "done";

interface QuestionState {
  attempts: number;
  revealed: boolean;
  phase: QuestionPhase;
  correct: boolean;
  movedTo: Square | null;
}

interface Session {
  queue: DrillProblem[];
  index: number;
  answered: number;
  perfect: number;
}

const freshQuestion: QuestionState = {
  attempts: 0,
  revealed: false,
  phase: "asking",
  correct: false,
  movedTo: null,
};

export function TrainingPage() {
  useStoreRevision();
  const [filter, setFilter] = useState<PhaseFilter>("all");
  const [session, setSession] = useState<Session | null>(null);
  const [question, setQuestion] = useState<QuestionState>(freshQuestion);

  const problem: DrillProblem | null =
    session && session.index < session.queue.length ? session.queue[session.index] : null;

  const position = useMemo(
    () => (problem ? keyToPosition(problem.sfenKey) : null),
    [problem?.id],
  );

  // ---- セッション操作 ----

  const startSession = () => {
    const queue = store.buildProblemQueue(filter, SESSION_LIMIT);
    if (queue.length === 0) return;
    setSession({ queue, index: 0, answered: 0, perfect: 0 });
    setQuestion(freshQuestion);
  };

  const quitSession = () => {
    setSession(null);
    setQuestion(freshQuestion);
  };

  const nextQuestion = () => {
    if (!session) return;
    setSession({ ...session, index: session.index + 1 });
    setQuestion(freshQuestion);
  };

  const finishQuestion = (correct: boolean, movedTo: Square | null) => {
    if (!session || !problem) return;
    const quality = question.revealed ? 1 : correct && question.attempts === 0 ? 5 : correct ? 2 : 1;
    store.rateProblem(problem.id, quality);
    setSession({
      ...session,
      answered: session.answered + 1,
      perfect: session.perfect + (quality === 5 ? 1 : 0),
    });
    setQuestion({ ...question, phase: "done", correct, movedTo });
  };

  const handleMove = (move: Move) => {
    if (!problem || question.phase === "done") return;
    if (problem.acceptedUsis.includes(move.usi)) {
      finishQuestion(true, move.to);
      return;
    }
    setQuestion({
      ...question,
      attempts: question.attempts + 1,
      phase: "wrong",
      movedTo: null,
    });
  };

  const handleReveal = () => {
    setQuestion({ ...question, revealed: true });
    finishQuestion(false, usiToDestination(problem?.bestUsi ?? ""));
  };

  const handleDelete = () => {
    if (!problem || !session) return;
    store.deleteProblem(problem.id);
    nextQuestion();
  };

  // ---- スタート画面 ----

  if (!session) {
    const totalAll = store.problemStats("all").total;
    return (
      <div className="page">
        <section className="panel">
          <h3>実戦特訓</h3>
          <p className="hint">
            「棋譜」タブでエンジン解析した自分のミスが問題になります。
            間違えた問題ほど頻繁に出題されます(SRS)。
          </p>
          <div className="phase-chips">
            {FILTERS.map((f) => {
              const stats = store.problemStats(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`chip ${filter === f.id ? "active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="chip-count">
                    {stats.due > 0 ? `${stats.due}/` : ""}{stats.total}
                  </span>
                </button>
              );
            })}
          </div>
          {totalAll === 0 ? (
            <p className="hint">
              まだ問題がありません。「棋譜」タブで対局のKIFを貼り付けて
              「エンジン解析をはじめる」を実行してください。
            </p>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={store.problemStats(filter).total === 0}
              onClick={startSession}
            >
              特訓をはじめる(最大{SESSION_LIMIT}問)
            </button>
          )}
        </section>
      </div>
    );
  }

  // ---- セッション終了 ----

  if (!problem) {
    return (
      <div className="page">
        <section className="panel center">
          <h3>特訓終了</h3>
          <p className="summary-score">
            一発正解 {session.perfect} / {session.answered}
          </p>
          <button type="button" className="btn primary" onClick={quitSession}>
            特訓トップへ
          </button>
        </section>
      </div>
    );
  }

  // ---- 出題画面 ----

  let message = "";
  switch (question.phase) {
    case "asking":
      message = `この局面での最善手は?(実戦${problem.ply}手目・${PHASE_LABEL[problem.phase]})`;
      break;
    case "wrong":
      message = "不正解… もう一度考えてみましょう";
      break;
    case "done":
      message = question.correct ? "正解!" : `最善手: ${problem.bestLabel}`;
      break;
  }

  return (
    <div className="page">
      <div className="quiz-header">
        <span>
          第{session.index + 1}問 / {session.queue.length}
          <span className="badge phase">{PHASE_LABEL[problem.phase]}</span>
          {problem.card.priority && <span className="badge priority">重点</span>}
        </span>
        <button type="button" className="btn small" onClick={quitSession}>
          中断
        </button>
      </div>
      {position && (
        <ShogiBoard
          position={position}
          flipped={problem.userSide === "white"}
          interactive={question.phase !== "done"}
          onMove={handleMove}
          lastMoveTo={question.movedTo}
        />
      )}
      <div className={`quiz-message ${question.phase === "done" && question.correct ? "opponent" : question.phase}`}>
        {message}
      </div>
      {question.phase === "wrong" && (
        <div className="kif-actions">
          <button type="button" className="btn" onClick={handleReveal}>
            答えを見る
          </button>
          {question.attempts >= 1 && (
            <p className="hint">実戦では {problem.playedLabel} と指して形勢を損ねました。</p>
          )}
        </div>
      )}
      {question.phase === "done" && (
        <section className="panel drill-feedback">
          <p>
            最善手: <strong>{problem.bestLabel}</strong>
            (評価 {formatUserCp(problem.evalBest)})
            <br />
            実戦の手: {problem.playedLabel}
            (評価 {formatUserCp(problem.evalPlayed)} / 損失 {problem.lossCp}cp)
          </p>
          {problem.pvLabel && (
            <p className="hint">読み筋: {problem.pvLabel}</p>
          )}
          <p className="hint">{problem.gameLabel}</p>
          <div className="kif-actions">
            <button type="button" className="btn primary" onClick={nextQuestion}>
              次の問題へ
            </button>
            <button type="button" className="btn small danger" onClick={handleDelete}>
              この問題を削除
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
