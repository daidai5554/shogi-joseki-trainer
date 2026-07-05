import type { EvalResult } from "./evalFormat";

type WorkerOut =
  | { type: "ready" }
  | { type: "evalResult"; id: number; cp: number | null; mate: number | null; depth: number | null; pv: string }
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
    { resolve: (r: EvalResult) => void; reject: (e: Error) => void }
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

  evaluate(sfenKey: string, movetime = 800): Promise<EvalResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      void (async () => {
        try {
          await this.ensureReady();
          if (!this.worker) {
            reject(new Error("Engine not available"));
            return;
          }
          this.pending.set(id, { resolve, reject });
          this.worker.postMessage({ type: "eval", id, sfenKey, movetime });
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    });
  }

  stop(): void {
    this.worker?.postMessage({ type: "stop" });
  }
}

export const shogiEngine = new ShogiEngine();
