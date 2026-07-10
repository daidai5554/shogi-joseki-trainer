"use strict";

/** @type {import('@mizarjp/yaneuraou.k-p/lib/yaneuraou.module').YaneuraOuModule | null} */
let engine = null;
let ready = false;
let busy = false;
/** @type {Array<{ resolve: (v: unknown) => void; reject: (e: Error) => void; waitToken: string; gather: string[] }>} */
const waitQueue = [];
const rCache = {};
/** 探索中のinfo行を全て収集するバッファ(null=収集しない) */
let infoLines = null;
let currentMultiPv = 1;

function postEngine(command) {
  engine.postMessage(command);
}

function postEngineWait(command, waitToken, gather = []) {
  return new Promise((resolve, reject) => {
    waitQueue.push({ resolve, reject, waitToken, gather });
    rCache[waitToken] = "";
    for (const key of gather) {
      rCache[key] = "";
    }
    postEngine(command);
  });
}

function onEngineLine(line) {
  if (infoLines !== null && line.startsWith("info ")) {
    infoLines.push(line);
  }
  for (const item of waitQueue) {
    if (line.startsWith(item.waitToken)) {
      rCache[item.waitToken] = line;
      item.resolve({ [item.waitToken]: line, ...pickGather(item.gather) });
      const idx = waitQueue.indexOf(item);
      if (idx >= 0) waitQueue.splice(idx, 1);
      return;
    }
    for (const key of item.gather) {
      if (line.startsWith(key)) {
        rCache[key] = line;
      }
    }
  }
}

function pickGather(keys) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of keys) {
    out[key] = rCache[key] ?? "";
  }
  return out;
}

function parseInfo(infoLine) {
  /** @type {{ cp?: number; mate?: number; depth?: number; pv?: string; multipv?: number }} */
  const result = {};
  const tokens = infoLine.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "depth" && tokens[i + 1]) {
      result.depth = Number(tokens[i + 1]);
    }
    if (tokens[i] === "multipv" && tokens[i + 1]) {
      result.multipv = Number(tokens[i + 1]);
    }
    if (tokens[i] === "score") {
      if (tokens[i + 1] === "cp" && tokens[i + 2]) {
        result.cp = Number(tokens[i + 2]);
      }
      if (tokens[i + 1] === "mate" && tokens[i + 2]) {
        result.mate = Number(tokens[i + 2]);
      }
    }
    if (tokens[i] === "pv") {
      result.pv = tokens.slice(i + 1).join(" ");
      break;
    }
  }
  return result;
}

async function initEngine() {
  importScripts("yaneuraou.k-p.js");
  const factory = self.YaneuraOu_K_P;
  if (typeof factory !== "function") {
    throw new Error("YaneuraOu load failed");
  }
  const engineUrl = new URL("yaneuraou.k-p.js", self.location.href).href;
  engine = await factory({
    locateFile: (name) => new URL(name, self.location.href).href,
    mainScriptUrlOrBlob: engineUrl,
    print: () => {},
    printErr: (line) => console.warn("[yaneuraou]", line),
  });
  engine.addMessageListener(onEngineLine);
  await postEngineWait("usi", "usiok");
  postEngine("setoption name USI_Hash value 64");
  postEngine("setoption name Threads value 1");
  postEngine("setoption name PvInterval value 0");
  await postEngineWait("isready", "readyok");
  ready = true;
}

/**
 * 局面を解析して候補手(MultiPV)を返す。
 * cp/mate は USI 同様、手番側から見た値。
 */
async function analyzeSfen(sfenKey, movetime, multipv) {
  if (!ready || !engine) {
    throw new Error("Engine not ready");
  }
  if (busy) {
    postEngine("stop");
  }
  busy = true;
  try {
    if (multipv !== currentMultiPv) {
      postEngine(`setoption name MultiPV value ${multipv}`);
      currentMultiPv = multipv;
    }
    postEngine(`position sfen ${sfenKey} 1`);
    infoLines = [];
    const res = await postEngineWait(`go movetime ${movetime}`, "bestmove");
    const lines = infoLines;
    infoLines = null;
    const bestToken = String(res.bestmove || "").split(/\s+/)[1] || "";
    const bestUsi = bestToken && bestToken !== "resign" && bestToken !== "win" ? bestToken : null;
    // multipvインデックスごとに最後(=最深)のinfo行を採用
    const byIndex = new Map();
    for (const line of lines) {
      const parsed = parseInfo(line);
      if (parsed.pv === undefined) continue;
      if (parsed.cp === undefined && parsed.mate === undefined) continue;
      byIndex.set(parsed.multipv ?? 1, parsed);
    }
    const candidates = [...byIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, p]) => ({
        usi: (p.pv || "").split(/\s+/)[0] || "",
        cp: p.cp ?? null,
        mate: p.mate ?? null,
        depth: p.depth ?? null,
        pv: p.pv || "",
      }))
      .filter((c) => c.usi.length > 0);
    return { bestUsi, candidates };
  } finally {
    infoLines = null;
    busy = false;
  }
}

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      await initEngine();
      self.postMessage({ type: "ready" });
      return;
    }
    if (msg.type === "eval") {
      const result = await analyzeSfen(msg.sfenKey, msg.movetime ?? 800, 1);
      const top = result.candidates[0] || {};
      self.postMessage({
        type: "evalResult",
        id: msg.id,
        cp: top.cp ?? null,
        mate: top.mate ?? null,
        depth: top.depth ?? null,
        pv: top.pv ?? "",
      });
      return;
    }
    if (msg.type === "analyze") {
      const result = await analyzeSfen(msg.sfenKey, msg.movetime ?? 800, msg.multipv ?? 3);
      self.postMessage({
        type: "analyzeResult",
        id: msg.id,
        bestUsi: result.bestUsi,
        candidates: result.candidates,
      });
      return;
    }
    if (msg.type === "stop") {
      if (engine) postEngine("stop");
      self.postMessage({ type: "stopped" });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id: msg.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
