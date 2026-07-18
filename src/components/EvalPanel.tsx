import { useEffect, useRef, useState } from "react";
import { formatEval, turnLabel, type EvalResult } from "../lib/evalFormat";
import { shogiEngine, type AnalyzeCandidate } from "../lib/engine";
import { keyToPosition, moveLabel } from "../lib/shogi";
import { store } from "../lib/store";
import type { Side } from "../lib/types";

interface EvalPanelProps {
  bookId: string;
  sfenKey: string;
  userSide: Side;
  /** 保存済み評価(cp)。手番視点 */
  cachedCp?: number;
  cachedMate?: number;
  compact?: boolean;
  registeredUsis?: string[];
  onSelectCandidate?: (usi: string) => void;
}

export function EvalPanel({
  bookId,
  sfenKey,
  userSide,
  cachedCp,
  cachedMate,
  compact = false,
  registeredUsis = [],
  onSelectCandidate,
}: EvalPanelProps) {
  const [live, setLive] = useState<EvalResult | null>(null);
  const [candidates, setCandidates] = useState<AnalyzeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const cached: EvalResult | null =
    cachedCp !== undefined || cachedMate !== undefined
      ? { cp: cachedCp ?? null, mate: cachedMate ?? null, depth: null, pv: "" }
      : null;

  const display = live ?? cached;

  useEffect(() => {
    const id = ++reqRef.current;
    setLoading(true);
    setError(null);
    setLive(null);
    setCandidates([]);

    const timer = window.setTimeout(() => {
      const request = compact
        ? shogiEngine.evaluate(sfenKey, 600).then((result) => ({
            evaluation: result,
            candidates: [] as AnalyzeCandidate[],
          }))
        : shogiEngine.analyze(sfenKey, 1200, 3).then((result) => ({
            evaluation: result.candidates[0] ?? null,
            candidates: result.candidates.slice(0, 3),
          }));
      void request
        .then((result) => {
          if (reqRef.current !== id) return;
          setLive(result.evaluation);
          setCandidates(result.candidates);
          setLoading(false);
        })
        .catch((e: Error) => {
          if (reqRef.current !== id) return;
          setError(e.message);
          setLoading(false);
        });
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sfenKey, compact]);

  const handleSave = () => {
    if (!live) return;
    store.setNodeEval(bookId, sfenKey, live.cp, live.mate);
  };

  const text = formatEval(display, sfenKey, userSide);
  const position = keyToPosition(sfenKey);

  return (
    <section className={`eval-panel ${compact ? "compact" : ""}`}>
      <div className="eval-row">
        <span className="eval-label">評価</span>
        <span className={`eval-value ${loading ? "loading" : ""}`}>{loading ? "計算中…" : text}</span>
        {!compact && display?.depth && (
          <span className="eval-meta">深さ{display.depth}</span>
        )}
      </div>
      {!compact && (
        <p className="hint eval-hint">
          {turnLabel(sfenKey)}の評価(やねうら王・端末内計算)。▲は自分有利、△は不利。
        </p>
      )}
      {!compact && candidates.length > 0 && (
        <div className="engine-candidates">
          <div className="engine-candidates-title">最善候補手</div>
          <ol>
            {candidates.map((candidate, index) => {
              const move = position.createMoveByUSI(candidate.usi);
              const label = move ? moveLabel(move) : candidate.usi;
              const registered = registeredUsis.includes(candidate.usi);
              return (
                <li key={candidate.usi}>
                  <span className="candidate-rank">{index + 1}</span>
                  <span className="candidate-move">{label}</span>
                  <span className="candidate-eval">
                    {formatEval(candidate, sfenKey, userSide)}
                  </span>
                  {candidate.depth !== null && (
                    <span className="candidate-depth">深さ{candidate.depth}</span>
                  )}
                  {onSelectCandidate && (
                    <button
                      type="button"
                      className={`btn small ${registered ? "" : "primary"}`}
                      onClick={() => onSelectCandidate(candidate.usi)}
                    >
                      {registered ? "この手へ" : "分岐に追加"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="hint eval-hint">
            候補手をタップすると定跡に登録して、その局面へ進みます。
          </p>
        </div>
      )}
      {error && (
        <>
          <p className="error-text">{error}</p>
          {typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated && (
            <button
              type="button"
              className="btn small"
              onClick={() => window.location.reload()}
            >
              再読み込みして評価を有効化
            </button>
          )}
        </>
      )}
      {live && !compact && (
        <button type="button" className="btn small" onClick={handleSave}>
          この評価を局面に保存
        </button>
      )}
    </section>
  );
}
