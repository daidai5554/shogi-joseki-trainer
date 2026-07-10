const RELOAD_AT_KEY = "shogi-joseki-trainer/coi-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

/** 旧構成の coi-serviceworker 登録を解除する(リロードループの原因) */
export async function unregisterLegacyCoiWorkers(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((reg) =>
          [reg.active, reg.waiting, reg.installing].some((worker) =>
            worker?.scriptURL.includes("coi-serviceworker"),
          ),
        )
        .map((reg) => reg.unregister()),
    );
  } catch {
    // 解除失敗時は何もしない(次回起動時に再試行される)
  }
}

/**
 * Service Worker 有効化後、COOP/COEP 付きの応答を得るために1回だけ再読み込みする。
 * ループ防止のため localStorage のクールダウン(60秒)で制限し、
 * 記録が書けない環境では再読み込み自体を行わない。
 */
export function reloadOnceForIsolation(): void {
  if (typeof crossOriginIsolated === "undefined" || crossOriginIsolated) return;
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;

  const now = Date.now();
  let lastReload = 0;
  try {
    lastReload = Number(localStorage.getItem(RELOAD_AT_KEY)) || 0;
  } catch {
    return;
  }
  if (now - lastReload < RELOAD_COOLDOWN_MS) return;
  try {
    localStorage.setItem(RELOAD_AT_KEY, String(now));
  } catch {
    return;
  }
  window.location.reload();
}
