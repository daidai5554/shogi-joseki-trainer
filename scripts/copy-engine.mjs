import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

function copyEngine() {
  const src = join(root, "node_modules", "@mizarjp", "yaneuraou.k-p", "lib");
  const dest = join(publicDir, "engine");
  const files = ["yaneuraou.k-p.js", "yaneuraou.k-p.wasm", "yaneuraou.k-p.worker.js"];

  if (!existsSync(src)) {
    console.warn("Engine package not found. Run: npm install");
    return;
  }

  mkdirSync(dest, { recursive: true });
  for (const file of files) {
    const from = join(src, file);
    if (!existsSync(from)) {
      console.warn(`Missing: ${from}`);
      continue;
    }
    cpSync(from, join(dest, file));
  }
  console.log("Engine files copied to public/engine/");
}

function copyCoi() {
  const from = join(root, "node_modules", "coi-serviceworker", "coi-serviceworker.js");
  const dest = join(publicDir, "coi-serviceworker.js");
  if (!existsSync(from)) {
    console.warn("coi-serviceworker not found. Run: npm install");
    return;
  }
  cpSync(from, dest);
  console.log("coi-serviceworker copied to public/");
}

copyEngine();
copyCoi();

