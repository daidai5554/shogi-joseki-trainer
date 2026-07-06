import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const required = [
  "index.html",
  "coi-init.js",
  "coi-serviceworker.js",
  "sw.js",
  "engine/yaneuraou.k-p.wasm",
  "engine/yaneuraou.k-p.js",
  "engine/shogi-engine.worker.js",
  "icons/icon-192.png",
];

let failed = false;

for (const file of required) {
  const path = join(dist, file);
  if (!existsSync(path)) {
    console.error(`MISSING: dist/${file}`);
    failed = true;
  }
}

if (existsSync(join(dist, "index.html"))) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  if (!html.includes("coi-serviceworker.js")) {
    console.error("FAIL: index.html does not reference coi-serviceworker.js");
    failed = true;
  }
}

if (existsSync(join(dist, "sw.js"))) {
  const sw = readFileSync(join(dist, "sw.js"), "utf8");
  if (!sw.includes("Cross-Origin-Opener-Policy") && !sw.includes("same-origin")) {
    console.error("FAIL: sw.js does not inject COOP/COEP headers");
    failed = true;
  }
}

if (failed) {
  console.error("\nBuild verification FAILED.");
  process.exit(1);
}

console.log("Build verification OK (COI + engine assets present).");
