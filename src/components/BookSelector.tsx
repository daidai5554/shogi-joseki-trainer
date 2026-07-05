import { store, useStoreRevision } from "../lib/store";

interface Props {
  /** ブック作成・削除ボタンを表示するか */
  manage?: boolean;
}

export function BookSelector({ manage = false }: Props) {
  useStoreRevision();
  const books = store.data.books;
  const active = store.activeBook;

  const handleCreate = () => {
    const name = window.prompt("新しい定跡ブックの名前");
    if (!name) return;
    const side = window.confirm(
      "自分の手番を選んでください。\nOK = 先手番 / キャンセル = 後手番",
    )
      ? "black"
      : "white";
    store.createBook(name.trim(), side);
  };

  const handleDelete = () => {
    if (!active) return;
    if (
      window.confirm(
        `「${active.name}」を削除します。登録した定跡と出題履歴も消えます。よろしいですか?`,
      )
    ) {
      store.deleteBook(active.id);
    }
  };

  const handleRename = () => {
    if (!active) return;
    const name = window.prompt("ブック名を変更", active.name);
    if (name?.trim()) {
      store.renameBook(active.id, name.trim());
    }
  };

  return (
    <div className="book-selector">
      <select
        value={active?.id ?? ""}
        onChange={(e) => store.setActiveBook(e.target.value)}
        aria-label="定跡ブックを選択"
      >
        {books.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}({b.side === "black" ? "先手" : "後手"})
          </option>
        ))}
      </select>
      {manage && (
        <div className="book-actions">
          <button type="button" className="btn small" onClick={handleCreate}>
            新規
          </button>
          <button type="button" className="btn small" onClick={handleRename}>
            改名
          </button>
          <button type="button" className="btn small danger" onClick={handleDelete}>
            削除
          </button>
        </div>
      )}
    </div>
  );
}
