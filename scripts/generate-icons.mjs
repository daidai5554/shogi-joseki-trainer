// PWA用アイコン(PNG)を依存パッケージなしで生成するスクリプト。
// prebuild / predev で自動実行され、public/icons/ に出力する。
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// ---- PNGエンコーダ ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- 描画 ----
function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// 将棋駒の五角形(相対座標)
const KOMA = [
  [0, -0.52],
  [0.37, -0.27],
  [0.46, 0.5],
  [-0.46, 0.5],
  [-0.37, -0.27],
];

function scalePoly(poly, cx, cy, s) {
  return poly.map(([x, y]) => [cx + x * s, cy + y * s]);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [18, 18, 28];
  const border = [82, 52, 22];
  const body = [242, 219, 170];
  const cx = size / 2;
  const cy = size * 0.52;
  const outer = scalePoly(KOMA, cx, cy, size * 0.72);
  const inner = scalePoly(KOMA, cx, cy, size * 0.66);
  const SS = 2; // 2x2スーパーサンプリング
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let c = bg;
          if (inPolygon(px, py, inner)) c = body;
          else if (inPolygon(px, py, outer)) c = border;
          rSum += c[0];
          gSum += c[1];
          bSum += c[2];
        }
      }
      const i = (y * size + x) * 4;
      const n = SS * SS;
      rgba[i] = Math.round(rSum / n);
      rgba[i + 1] = Math.round(gSum / n);
      rgba[i + 2] = Math.round(bSum / n);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`generated: ${file}`);
}
