import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swPath = join(root, "dist", "sw.js");

if (!existsSync(swPath)) {
  console.error("patch-sw-coi: dist/sw.js not found");
  process.exit(1);
}

const sw = readFileSync(swPath, "utf8");
if (sw.includes("Cross-Origin-Opener-Policy")) {
  console.log("patch-sw-coi: already patched");
  process.exit(0);
}

const patched = sw.replace(
  /NavigationRoute\((\w+)\.createHandlerBoundToURL\(([^)]+)\)\)/,
  (_match, wb, indexUrl) =>
    `NavigationRoute(async (opts) => { const res = await ${wb}.createHandlerBoundToURL(${indexUrl})(opts); const headers = new Headers(res.headers); headers.set("Cross-Origin-Opener-Policy", "same-origin"); headers.set("Cross-Origin-Embedder-Policy", "require-corp"); return new Response(res.body, { status: res.status, statusText: res.statusText, headers }); })`,
);

if (patched === sw) {
  console.error("patch-sw-coi: NavigationRoute pattern not found in sw.js");
  process.exit(1);
}

writeFileSync(swPath, patched);
console.log("patch-sw-coi: COOP/COEP headers injected into sw.js");
