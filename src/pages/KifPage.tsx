import { useEffect, useMemo, useRef, useState } from "react";
import { BookSelector } from "../components/BookSelector";
import { EvalGraph } from "../components/EvalGraph";
import { ShogiBoard } from "../components/ShogiBoard";
import {
  analyzeGame,
  AUTO_APPEND_PLIES,
  autoAppendEntries,
  BLUNDER_THRESHOLD,
  formatUserCp,
  parseGameKif,
  PHASE_LABEL,
  type GameAnalysisResult,
} from "../lib/gameAnalysis";
import { analyzeKif, type KifAnalysis } from "../lib/kifCheck";
import { keyToPosition, STANDARD_ROOT_KEY, usiToDestination } from "../lib/shogi";
import { store, useStoreRevision } from "../lib/store";
import type { Side } from "../lib/types";

type Speed = "fast" | "normal" | "deep";

const SPEED_MOVETIME: Record<Speed, number> = {
  fast: 400,
  normal: 800,
  deep: 1500,
};

interface EngineAnalysisState {
  result: GameAnalysisResult;
  registered: { added: number; skipped: number };
  appendedPlies: number;
  appendBookName: string;
  /** 自分のミス検出により途中で追記を打ち切ったか */
  appendTruncated: boolean;
  gameLabel: string;
}

export function KifPage() {
  useStoreRevision();
  const book = store.activeBook;
  const [kifText, setKifText] = useState("");
  const [result, setResult] = useState<KifAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // ---- エンジン解析(悪手検出) ----
  const [userSide, setUserSide] = useState<Side>(book?.side ?? "black");
  const [speed, setSpeed] = useState<Speed>("normal");
  const [autoAppend, setAutoAppend] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineResult, setEngineResult] = useState<EngineAnalysisState | null>(null);
  const [selectedAnalysisPly, setSelectedAnalysisPly] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (book) setUserSide(book.side);
  }, [book?.id]);

  const deviationPosition = useMemo(() => {
    const key = result?.deviation?.fromKey ?? result?.bookOut?.fromKey;
    return key ? keyToPosition(key) : null;
  }, [result]);

  if (!book) {
    return (
      <div className="page">
        <p>定跡ブックがありません。設定タブから作成してください。</p>
      </div>
    );
  }

  const handleAnalyze = () => {
    setDone(null);
    setResult(null);
    setError(null);
    const analysis = analyzeKif(book, kifText);
    if (analysis instanceof Error) {
      setError(analysis.message);
      return;
    }
    setResult(analysis);
  };

  const handleAppend = (prioritize: boolean) => {
    if (!result) return;
    store.appendLine(book.id, result.appendEntries, prioritize);
    setDone(
      "ツリーに追記しました。相手の新手には「定跡」タブで自分の応手を登録してください。",
    );
  };

  const handlePrioritize = () => {
    if (!result?.deviation) return;
    store.setPriority(book.id, result.deviation.fromKey);
    setDone("この局面を最優先で出題するよう設定しました。");
  };

  const handleEngineAnalyze = async () => {
    setEngineError(null);
    setEngineResult(null);
    setSelectedAnalysisPly(0);
    const parsed = parseGameKif(kifText);
    if (parsed instanceof Error) {
      setEngineError(parsed.message);
      return;
    }
    cancelRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: parsed.steps.length + 1 });
    try {
      const analysis = await analyzeGame({
        parsed,
        userSide,
        movetime: SPEED_MOVETIME[speed],
        onProgress: (d, t) => setProgress({ done: d, total: t }),
        isCancelled: () => cancelRef.current,
      });
      if (analysis.cancelled) {
        return;
      }
      const registered = store.addProblems(analysis.problems);
      let appendedPlies = 0;
      let appendBookName = "";
      let appendTruncated = false;
      if (autoAppend && parsed.steps[0].fromKey === STANDARD_ROOT_KEY) {
        // 自分の最初のミスの直前までを、手番に合ったブックへ追記する
        const firstMistakePly =
          analysis.problems.length > 0
            ? Math.min(...analysis.problems.map((p) => p.ply))
            : undefined;
        const entries = autoAppendEntries(parsed, AUTO_APPEND_PLIES, firstMistakePly);
        if (entries.length > 0) {
          const target = store.ensureAppendTarget(userSide);
          store.appendLine(target.id, entries, false);
          appendedPlies = entries.length;
          appendBookName = target.name;
          appendTruncated =
            firstMistakePly !== undefined && firstMistakePly - 1 < AUTO_APPEND_PLIES;
        }
      }
      setEngineResult({
        result: analysis,
        registered,
        appendedPlies,
        appendBookName,
        appendTruncated,
        gameLabel: parsed.gameLabel,
      });
      setSelectedAnalysisPly(analysis.problems[0]?.ply ?? 0);
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const dev = result?.deviation ?? null;
  const remainSec = progress
    ? Math.ceil(((progress.total - progress.done) * SPEED_MOVETIME[speed]) / 1000)
    : 0;
  const mistakes = engineResult?.result.problems ?? [];
  const evalPoints = engineResult?.result.evalPoints ?? [];
  const selectedEvalPoint =
    evalPoints.find((point) => point.ply === selectedAnalysisPly) ?? evalPoints[0];
  const selectedAnalysisPosition = selectedEvalPoint
    ? keyToPosition(selectedEvalPoint.sfenKey)
    : null;

  return (
    <div className="page">
      <BookSelector />
      <section className="panel">
        <h3>棋譜の貼り付け</h3>
        <p className="hint">
          将棋ウォーズ・将棋クエストなどのKIF形式の棋譜を貼り付けてください。
        </p>
        <textarea
          value={kifText}
          onChange={(e) => setKifText(e.target.value)}
          placeholder="ここにKIF棋譜を貼り付け"
          rows={6}
        />
        <button
          type="button"
          className="btn primary"
          disabled={kifText.trim().length === 0}
          onClick={handleAnalyze}
        >
          定跡とのズレをチェック
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>

      {result && (
        <section className="panel">
          <h3>定跡チェック結果</h3>
          <p>
            全{result.totalPlies}手のうち、<strong>{result.matchedPlies}手</strong>
            まで定跡と一致しました。
          </p>

          {dev && (
            <>
              <p className={dev.moverIsSelf ? "deviation-self" : "deviation-opponent"}>
                <strong>{dev.ply}手目</strong>で
                <strong>{dev.moverIsSelf ? "自分" : "相手"}</strong>
                ({dev.mover === "black" ? "先手" : "後手"})が定跡から外れました。
              </p>
              <p>
                実戦の手: <strong>{dev.playedLabel}</strong>
                <br />
                定跡の候補手: {dev.bookMoves.map((m) => m.label).join(" / ")}
              </p>
              {deviationPosition && (
                <ShogiBoard
                  position={deviationPosition}
                  flipped={book.side === "white"}
                  interactive={false}
                />
              )}
              {dev.moverIsSelf ? (
                <div className="kif-actions">
                  <button type="button" className="btn primary" onClick={handlePrioritize}>
                    この局面を最優先で出題する
                  </button>
                  <button type="button" className="btn" onClick={() => handleAppend(true)}>
                    実戦の手順もツリーに追記する
                  </button>
                  <p className="hint">
                    自分が定跡を外した場合は、正しい手を思い出せるよう出題を優先します。
                  </p>
                </div>
              ) : (
                <div className="kif-actions">
                  <button type="button" className="btn primary" onClick={() => handleAppend(true)}>
                    この手順をツリーに追記して優先出題する
                  </button>
                  <p className="hint">
                    相手の新手とその後の実戦手順(最大10手)をツリーへ追記し、
                    自分の手番の局面を最優先で出題します。
                  </p>
                </div>
              )}
            </>
          )}

          {!dev && result.bookOut && (
            <>
              <p>
                <strong>{result.bookOut.ply}手目</strong>
                以降は定跡ツリーに未登録です(逸脱なしで登録範囲の終わりに到達)。
              </p>
              {deviationPosition && (
                <ShogiBoard
                  position={deviationPosition}
                  flipped={book.side === "white"}
                  interactive={false}
                />
              )}
              <div className="kif-actions">
                <button type="button" className="btn primary" onClick={() => handleAppend(true)}>
                  続きの手順をツリーに追記する
                </button>
              </div>
            </>
          )}

          {!dev && !result.bookOut && (
            <p>最後まで定跡どおりでした。素晴らしい!</p>
          )}

          {done && <p className="done-text">{done}</p>}
        </section>
      )}

      <section className="panel">
        <h3>エンジン解析(悪手検出)</h3>
        <p className="hint">
          棋譜全体をやねうら王で解析し、自分が形勢を損ねた手を検出して
          「特訓」タブの問題に自動登録します。序盤〜中盤の手順を、
          手番に合った定跡ツリーへ自動追記することもできます。
        </p>
        <div className="analysis-options">
          <label className="option-row">
            <span>自分の手番</span>
            <div className="side-toggle">
              <button
                type="button"
                className={`btn small ${userSide === "black" ? "primary" : ""}`}
                onClick={() => setUserSide("black")}
              >
                先手
              </button>
              <button
                type="button"
                className={`btn small ${userSide === "white" ? "primary" : ""}`}
                onClick={() => setUserSide("white")}
              >
                後手
              </button>
            </div>
          </label>
          <label className="option-row">
            <span>解析精度</span>
            <select value={speed} onChange={(e) => setSpeed(e.target.value as Speed)}>
              <option value="fast">速い(0.4秒/局面)</option>
              <option value="normal">標準(0.8秒/局面)</option>
              <option value="deep">精密(1.5秒/局面)</option>
            </select>
          </label>
          <label className="option-row checkbox">
            <input
              type="checkbox"
              checked={autoAppend}
              onChange={(e) => setAutoAppend(e.target.checked)}
            />
            <span>
              実戦の手順(最大{AUTO_APPEND_PLIES}手)を定跡ツリー
              「{store.findAppendTarget(userSide)?.name ??
                (userSide === "black" ? "先手(新規作成)" : "後手(新規作成)")}」
              へ自動追記
              <span className="hint">(自分のミスが検出された場合はその直前まで)</span>
            </span>
          </label>
        </div>
        {!running ? (
          <button
            type="button"
            className="btn primary"
            disabled={kifText.trim().length === 0}
            onClick={() => void handleEngineAnalyze()}
          >
            エンジン解析をはじめる
          </button>
        ) : (
          <div className="analysis-progress">
            {progress && (
              <>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <p className="hint">
                  {progress.done} / {progress.total} 局面(残り約{remainSec}秒)
                </p>
              </>
            )}
            <button
              type="button"
              className="btn small"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              キャンセル
            </button>
          </div>
        )}
        {engineError && (
          <>
            <p className="error-text">{engineError}</p>
            {typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated && (
              <button
                type="button"
                className="btn small"
                onClick={() => window.location.reload()}
              >
                再読み込みして解析を有効化
              </button>
            )}
          </>
        )}
      </section>

      {engineResult && (
        <section className="panel">
          <h3>エンジン解析結果</h3>
          <p className="hint">{engineResult.gameLabel}(全{engineResult.result.totalPlies}手)</p>
          <EvalGraph
            points={engineResult.result.evalPoints}
            mistakePlies={mistakes.map((m) => m.ply)}
            selectedPly={selectedAnalysisPly}
            onSelectPly={setSelectedAnalysisPly}
          />
          {selectedEvalPoint && selectedAnalysisPosition && (
            <div className="analysis-position">
              <div className="analysis-position-header">
                <button
                  type="button"
                  className="btn small"
                  disabled={selectedEvalPoint.ply === 0}
                  onClick={() => setSelectedAnalysisPly(selectedEvalPoint.ply - 1)}
                >
                  ◀ 前
                </button>
                <strong>
                  {selectedEvalPoint.ply === 0
                    ? "開始局面"
                    : `${selectedEvalPoint.ply}手目 ${selectedEvalPoint.lastMoveLabel ?? ""}`}
                </strong>
                <span className="analysis-position-eval">
                  評価 {formatUserCp(selectedEvalPoint.cpUser)}
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={selectedEvalPoint.ply >= engineResult.result.totalPlies}
                  onClick={() => setSelectedAnalysisPly(selectedEvalPoint.ply + 1)}
                >
                  次 ▶
                </button>
              </div>
              <ShogiBoard
                position={selectedAnalysisPosition}
                flipped={userSide === "white"}
                interactive={false}
                lastMoveTo={usiToDestination(selectedEvalPoint.lastMoveUsi ?? "")}
              />
            </div>
          )}
          {mistakes.length === 0 ? (
            <p>大きなミスは検出されませんでした。好局です!</p>
          ) : (
            <>
              <p>
                <strong>{mistakes.length}件</strong>のミスを検出し、
                特訓タブに<strong>{engineResult.registered.added}問</strong>を追加しました
                {engineResult.registered.skipped > 0 &&
                  `(登録済み${engineResult.registered.skipped}問はスキップ)`}
                。
              </p>
              <ul className="mistake-list">
                {mistakes.map((m) => (
                  <li
                    key={`${m.ply}-${m.playedUsi}`}
                    className={selectedAnalysisPly === m.ply ? "selected" : ""}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAnalysisPly(m.ply)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        setSelectedAnalysisPly(m.ply);
                      }
                    }}
                  >
                    <span
                      className={`badge ${m.lossCp >= BLUNDER_THRESHOLD ? "blunder" : "dubious"}`}
                    >
                      {m.lossCp >= BLUNDER_THRESHOLD ? "悪手" : "疑問手"}
                    </span>
                    <span className="badge phase">{PHASE_LABEL[m.phase]}</span>
                    <strong>{m.ply}手目 {m.playedLabel}</strong>
                    (最善: {m.bestLabel} / 損失 {m.lossCp}cp /
                    評価 {formatUserCp(m.evalBest)} → {formatUserCp(m.evalPlayed)})
                  </li>
                ))}
              </ul>
            </>
          )}
          {engineResult.appendedPlies > 0 && (
            <p className="done-text">
              {engineResult.appendedPlies}手までを定跡ツリー
              「{engineResult.appendBookName}」へ追記しました
              {engineResult.appendTruncated && "(最初のミスの直前まで)"}。
            </p>
          )}
          <p className="hint">
            「特訓」タブで検出されたミスの局面を反復練習できます。
          </p>
        </section>
      )}
    </div>
  );
}
