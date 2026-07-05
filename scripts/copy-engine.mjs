import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mizarjp", "yaneuraou.k-p", "lib");
const dest = join(root, "public", "engine");

const files = ["yaneuraou.k-p.js", "yaneuraou.k-p.wasm", "yaneuraou.k-p.worker.js"];

if (!existsSync(src)) {
  console.warn(
    "Engine package not found. Run: npm install\nSkipping engine copy.",
  );
  process.exit(0);
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
