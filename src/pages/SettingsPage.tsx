import { useRef, useState } from "react";
import { parseImportedData, store, useStoreRevision } from "../lib/store";

export function SettingsPage() {
  useStoreRevision();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const totalNodes = store.data.books.reduce(
    (sum, b) => sum + Object.keys(b.nodes).length,
    0,
  );

  const handleExport = () => {
    const blob = new Blob([store.exportJson()], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `shogi-joseki-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("エクスポートしました。");
  };

  const handleImportFile = async (file: File) => {
    setMessage(null);
    const text = await file.text();
    const parsed = parseImportedData(text);
    if (parsed instanceof Error) {
      setMessage(`インポート失敗: ${parsed.message}`);
      return;
    }
    if (
      !window.confirm(
        "現在のデータをインポート内容で置き換えます。よろしいですか?\n(必要なら先にエクスポートしてください)",
      )
    ) {
      return;
    }
    store.importData(parsed);
    setMessage("インポートしました。");
  };

  const handleReset = () => {
    if (
      window.confirm("すべてのデータを削除して初期状態に戻します。よろしいですか?") &&
      window.confirm("本当によろしいですか? この操作は取り消せません。")
    ) {
      store.resetAll();
      setMessage("初期化しました。");
    }
  };

  return (
    <div className="page">
      <section className="panel">
        <h3>データ</h3>
        <p className="hint">
          ブック数: {store.data.books.length} / 登録局面数: {totalNodes} /
          出題カード数: {Object.keys(store.data.cards).length}
          <br />
          データはこの端末のブラウザ内(localStorage)にのみ保存されます。
        </p>
        <div className="settings-buttons">
          <button type="button" className="btn primary" onClick={handleExport}>
            JSONエクスポート
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            JSONインポート
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn danger" onClick={handleReset}>
            全データ初期化
          </button>
        </div>
        {message && <p className="done-text">{message}</p>}
      </section>

      <section className="panel">
        <h3>使い方のヒント</h3>
        <ol className="help-list">
          <li>「定跡」タブで盤面を動かし、自分の定跡を分岐付きで登録する。</li>
          <li>「出題」タブで次の一手クイズ。間違えた局面ほど高頻度で再出題される。</li>
          <li>
            実戦後は「棋譜」タブにウォーズのKIFを貼り付け、定跡から外れた箇所を
            ワンタップでドリルに追加する。
          </li>
        </ol>
      </section>

      <section className="panel">
        <h3>PWAについて</h3>
        <p className="hint">
          このアプリはオフラインで動作します。AndroidのChromeでは、メニューから
          「ホーム画面に追加」(または「アプリをインストール」)を選ぶと
          アプリとして利用できます。
        </p>
      </section>
    </div>
  );
}
