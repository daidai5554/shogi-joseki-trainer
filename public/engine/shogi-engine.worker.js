"use strict";

/** @type {import('@mizarjp/yaneuraou.k-p/lib/yaneuraou.module').YaneuraOuModule | null} */
let engine = null;
let ready = false;
let busy = false;
/** @type {Array<{ resolve: (v: unknown) => void; reject: (e: Error) => void; waitToken: string; gather: string[] }>} */
const waitQueue = [];
const rCache = {};

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
  /** @type {{ cp?: number; mate?: number; depth?: number; pv?: string }} */
  const result = {};
  const tokens = infoLine.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "depth" && tokens[i + 1]) {
      result.depth = Number(tokens[i + 1]);
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

async function evaluateSfen(sfenKey, movetime) {
  if (!ready || !engine) {
    throw new Error("Engine not ready");
  }
  if (busy) {
    postEngine("stop");
  }
  busy = true;
  try {
    postEngine(`position sfen ${sfenKey} 1`);
    const res = await postEngineWait(`go movetime ${movetime}`, "bestmove", ["info"]);
    const infoLines = (res.info || "").split("\n").filter((l) => l.startsWith("info"));
    let best = {};
    for (const line of infoLines) {
      const parsed = parseInfo(line);
      if (parsed.depth !== undefined) {
        best = parsed;
      }
    }
    if (!best.depth && res.info) {
      best = parseInfo(String(res.info).split("\n").pop() || "");
    }
    return best;
  } finally {
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
      const result = await evaluateSfen(msg.sfenKey, msg.movetime ?? 800);
      self.postMessage({
        type: "evalResult",
        id: msg.id,
        cp: result.cp ?? null,
        mate: result.mate ?? null,
        depth: result.depth ?? null,
        pv: result.pv ?? "",
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
