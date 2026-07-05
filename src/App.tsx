import { useState } from "react";
import { EditorPage } from "./pages/EditorPage";
import { KifPage } from "./pages/KifPage";
import { QuizPage } from "./pages/QuizPage";
import { SettingsPage } from "./pages/SettingsPage";

type Tab = "editor" | "quiz" | "kif" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "editor", label: "定跡", icon: "☗" },
  { id: "quiz", label: "出題", icon: "?" },
  { id: "kif", label: "棋譜", icon: "📋" },
  { id: "settings", label: "設定", icon: "⚙" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("editor");

  return (
    <div className="app">
      <header className="app-header">
        <h1>将棋定跡トレーナー</h1>
      </header>
      <main>
        {tab === "editor" && <EditorPage />}
        {tab === "quiz" && <QuizPage />}
        {tab === "kif" && <KifPage />}
        {tab === "settings" && <SettingsPage />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
