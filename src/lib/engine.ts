import type { EvalResult } from "./evalFormat";

/** MultiPV解析の候補手。cp/mateはUSI同様、手番側から見た値 */
export interface AnalyzeCandidate {
  usi: string;
  cp: number | null;
  mate: number | null;
  depth: number | null;
  pv: string;
}

export interface AnalyzeResult {
  bestUsi: string | null;
  candidates: AnalyzeCandidate[];
}

type WorkerOut =
  | { type: "ready" }
  | { type: "evalResult"; id: number; cp: number | null; mate: number | null; depth: number | null; pv: string }
  | { type: "analyzeResult"; id: number; bestUsi: string | null; candidates: AnalyzeCandidate[] }
  | { type: "error"; id?: number; message: string }
  | { type: "stopped" };

type EngineState = "idle" | "loading" | "ready" | "error";

class ShogiEngine {
  private worker: Worker | null = null;
  private state: EngineState = "idle";
  private errorMessage = "";
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (r: unknown) => void; reject: (e: Error) => void }
  >();
  private initPromise: Promise<void> | null = null;

  get status(): EngineState {
    return this.state;
  }

  get error(): string {
    return this.errorMessage;
  }

  async ensureReady(): Promise<void> {
    if (this.state === "ready") return;
    if (this.state === "error") {
      throw new Error(this.errorMessage || "Engine error");
    }
    if (typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
      throw new Error(
        "評価エンジンの準備中です。ページが自動で再読み込みされない場合は、一度更新してください。",
      );
    }
    if (!this.initPromise) {
      this.initPromise = this.start();
    }
    await this.initPromise;
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state = "loading";
      try {
        const url = `${import.meta.env.BASE_URL}engine/shogi-engine.worker.js`;
        this.worker = new Worker(url);
      } catch {
        this.state = "error";
        this.errorMessage = "エンジンワーカーの起動に失敗しました";
        reject(new Error(this.errorMessage));
        return;
      }

      const timeout = window.setTimeout(() => {
        this.state = "error";
        this.errorMessage = "エンジンの初期化がタイムアウトしました";
        reject(new Error(this.errorMessage));
      }, 30000);

      this.worker.onmessage = (event: MessageEvent<WorkerOut>) => {
        const msg = event.data;
        if (msg.type === "ready") {
          window.clearTimeout(timeout);
          this.state = "ready";
          resolve();
          return;
        }
        if (msg.type === "evalResult") {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            p.resolve({
              cp: msg.cp,
              mate: msg.mate,
              depth: msg.depth,
              pv: msg.pv,
            });
          }
          return;
        }
        if (msg.type === "analyzeResult") {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            p.resolve({ bestUsi: msg.bestUsi, candidates: msg.candidates });
          }
          return;
        }
        if (msg.type === "error") {
          if (msg.id !== undefined) {
            const p = this.pending.get(msg.id);
            if (p) {
              this.pending.delete(msg.id);
              p.reject(new Error(msg.message));
            }
          } else {
            window.clearTimeout(timeout);
            this.state = "error";
            this.errorMessage = msg.message;
            reject(new Error(msg.message));
          }
        }
      };

      this.worker.onerror = () => {
        window.clearTimeout(timeout);
        this.state = "error";
        this.errorMessage = "エンジン実行中にエラーが発生しました";
        reject(new Error(this.errorMessage));
      };

      this.worker.postMessage({ type: "init" });
    });
  }

  private request<T>(message: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      void (async () => {
        try {
          await this.ensureReady();
          if (!this.worker) {
            reject(new Error("Engine not available"));
            return;
          }
          this.pending.set(id, { resolve: (r) => resolve(r as T), reject });
          this.worker.postMessage({ ...message, id });
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    });
  }

  evaluate(sfenKey: string, movetime = 800): Promise<EvalResult> {
    return this.request<EvalResult>({ type: "eval", sfenKey, movetime });
  }

  /** MultiPVで候補手を解析する(棋譜解析用) */
  analyze(sfenKey: string, movetime = 800, multipv = 3): Promise<AnalyzeResult> {
    return this.request<AnalyzeResult>({ type: "analyze", sfenKey, movetime, multipv });
  }

  stop(): void {
    this.worker?.postMessage({ type: "stop" });
  }
}

export const shogiEngine = new ShogiEngine();
