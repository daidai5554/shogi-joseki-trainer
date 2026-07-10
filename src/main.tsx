import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { reloadOnceForIsolation, unregisterLegacyCoiWorkers } from "./lib/swCleanup";
import "./styles.css";

void unregisterLegacyCoiWorkers().then(() => {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const tryReload = () => reloadOnceForIsolation();
      if (navigator.serviceWorker.controller) {
        tryReload();
        return;
      }
      navigator.serviceWorker.addEventListener("controllerchange", tryReload, { once: true });
    },
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
