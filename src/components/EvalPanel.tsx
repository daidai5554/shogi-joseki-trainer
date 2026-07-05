import { useEffect, useRef, useState } from "react";
import { formatEval, turnLabel, type EvalResult } from "../lib/evalFormat";
import { shogiEngine } from "../lib/engine";
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
}

export function EvalPanel({
  bookId,
  sfenKey,
  userSide,
  cachedCp,
  cachedMate,
  compact = false,
}: EvalPanelProps) {
  const [live, setLive] = useState<EvalResult | null>(null);
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

    const timer = window.setTimeout(() => {
      void shogiEngine
        .evaluate(sfenKey, compact ? 600 : 900)
        .then((result) => {
          if (reqRef.current !== id) return;
          setLive(result);
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
      {error && <p className="error-text">{error}</p>}
      {live && !compact && (
        <button type="button" className="btn small" onClick={handleSave}>
          この評価を局面に保存
        </button>
      )}
    </section>
  );
}
