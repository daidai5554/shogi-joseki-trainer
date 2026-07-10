import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// やねうら王 WASM(SharedArrayBuffer) に必要なクロスオリジン分離ヘッダー
const COI_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// 本番ビルドにのみ Content-Security-Policy を注入する。
// (開発サーバーは HMR 用のインラインスクリプトを使うため対象外)
const CSP = [
  "default-src 'self'",
  "script-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function injectCsp(): PluginOption {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
            injectTo: "head-prepend",
          },
        ],
      };
    },
  };
}

function coiDevHeaders(): PluginOption {
  const applyHeaders = (
    req: { url?: string },
    res: { setHeader: (k: string, v: string) => void },
    next: () => void,
  ) => {
    for (const [key, value] of Object.entries(COI_HEADERS)) {
      res.setHeader(key, value);
    }
    if (req.url?.match(/\.(js|wasm|mjs)(\?|$)/)) {
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    }
    next();
  };
  return {
    name: "coi-dev-headers",
    configureServer(server) {
      server.middlewares.use(applyHeaders);
    },
    configurePreviewServer(server) {
      server.middlewares.use(applyHeaders);
    },
  };
}

export default defineConfig({
  // GitHub Pages へデプロイする場合は BASE_PATH=/リポジトリ名/ を指定する
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    injectCsp(),
    coiDevHeaders(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "将棋定跡トレーナー",
        short_name: "定跡トレーナー",
        description: "角交換四間飛車の定跡練習用アプリ(オフライン対応)",
        lang: "ja",
        display: "standalone",
        orientation: "portrait",
        background_color: "#12121c",
        theme_color: "#12121c",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,wasm}"],
      },
    }),
  ],
});
