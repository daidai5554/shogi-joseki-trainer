import { useMemo, useState } from "react";
import { BookSelector } from "../components/BookSelector";
import { ShogiBoard } from "../components/ShogiBoard";
import { analyzeKif, type KifAnalysis } from "../lib/kifCheck";
import { keyToPosition } from "../lib/shogi";
import { store, useStoreRevision } from "../lib/store";

export function KifPage() {
  useStoreRevision();
  const book = store.activeBook;
  const [kifText, setKifText] = useState("");
  const [result, setResult] = useState<KifAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  const dev = result?.deviation ?? null;

  return (
    <div className="page">
      <BookSelector />
      <section className="panel">
        <h3>ウォーズ棋譜の逸脱チェック</h3>
        <p className="hint">
          将棋ウォーズなどのKIF形式の棋譜を貼り付けると、何手目に定跡から外れたかを解析します。
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
          解析する
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>

      {result && (
        <section className="panel">
          <h3>解析結果</h3>
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
    </div>
  );
}
