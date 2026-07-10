import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const required = [
  "index.html",
  "sw.js",
  "engine/yaneuraou.k-p.wasm",
  "engine/yaneuraou.k-p.js",
  "engine/yaneuraou.k-p.worker.js",
  "engine/shogi-engine.worker.js",
  "icons/icon-192.png",
];

let failed = false;

for (const file of required) {
  if (!existsSync(join(dist, file))) {
    console.error(`MISSING: dist/${file}`);
    failed = true;
  }
}

// coi-serviceworker はリロードループの原因なので、残っていたら失敗させる
if (existsSync(join(dist, "coi-serviceworker.js"))) {
  console.error("FAIL: dist/coi-serviceworker.js must not exist (reload loop risk)");
  failed = true;
}

if (existsSync(join(dist, "index.html"))) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  if (html.includes("coi-serviceworker")) {
    console.error("FAIL: index.html still references coi-serviceworker (reload loop risk)");
    failed = true;
  }
}

if (existsSync(join(dist, "sw.js"))) {
  const sw = readFileSync(join(dist, "sw.js"), "utf8");
  if (!sw.includes("Cross-Origin-Embedder-Policy")) {
    console.error("FAIL: sw.js does not inject COOP/COEP headers");
    failed = true;
  }
}

if (failed) {
  console.error("\nBuild verification FAILED.");
  process.exit(1);
}

console.log("Build verification OK (single SW with COI headers + engine assets).");
