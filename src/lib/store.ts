import { useSyncExternalStore } from "react";
import { Position } from "tsshogi";
import { createKakugawariPresetBooks } from "./presets/kakugawariShiken";
import { STANDARD_ROOT_KEY, sideToColor, turnOfKey } from "./shogi";
import { isDue, newCard, rateCard } from "./srs";
import type {
  AppData,
  Book,
  DrillProblem,
  GamePhase,
  JosekiEdge,
  JosekiNode,
  Side,
  SrsCard,
} from "./types";

const STORAGE_KEY = "shogi-joseki-trainer/v1";
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function makeBook(name: string, side: Side): Book {
  return {
    id: genId(),
    name,
    side,
    root: STANDARD_ROOT_KEY,
    nodes: {
      [STANDARD_ROOT_KEY]: { moves: [], comment: "" },
    },
  };
}

function defaultData(): AppData {
  const b1 = makeBook("先手", "black");
  const b2 = makeBook("後手", "white");
  return {
    version: 1,
    books: [b1, b2],
    cards: {},
    activeBookId: b1.id,
    problems: [],
  };
}

// ---- インポートデータの検証(不正なJSONを取り込まないための境界チェック) ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isValidKey(key: string): boolean {
  return typeof key === "string" && key.length < 200 && Position.isValidSFEN(`${key} 1`);
}

function sanitizeEdge(v: unknown): JosekiEdge | null {
  if (!isRecord(v)) return null;
  const { usi, to, label } = v;
  if (typeof usi !== "string" || usi.length > 8) return null;
  if (typeof to !== "string" || !isValidKey(to)) return null;
  if (typeof label !== "string" || label.length > 20) return null;
  return { usi, to, label };
}

function sanitizeBook(v: unknown): Book | null {
  if (!isRecord(v)) return null;
  const { id, name, side, root, nodes } = v;
  if (typeof id !== "string" || id.length > 100) return null;
  if (typeof name !== "string" || name.length > 100) return null;
  if (side !== "black" && side !== "white") return null;
  if (typeof root !== "string" || !isValidKey(root)) return null;
  if (!isRecord(nodes)) return null;
  const outNodes: Record<string, JosekiNode> = {};
  for (const [key, node] of Object.entries(nodes)) {
    if (!isValidKey(key) || !isRecord(node)) continue;
    const moves = Array.isArray(node.moves)
      ? node.moves.map(sanitizeEdge).filter((e): e is JosekiEdge => e !== null)
      : [];
    const comment = typeof node.comment === "string" ? node.comment.slice(0, 5000) : "";
    const out: JosekiNode = { moves, comment };
    if (typeof node.evalCp === "number" && isFinite(node.evalCp)) {
      out.evalCp = Math.max(-30000, Math.min(30000, node.evalCp));
    }
    if (typeof node.evalMate === "number" && isFinite(node.evalMate)) {
      out.evalMate = Math.max(-1000, Math.min(1000, node.evalMate));
    }
    outNodes[key] = out;
  }
  if (!outNodes[root]) {
    outNodes[root] = { moves: [], comment: "" };
  }
  return { id, name, side, root, nodes: outNodes };
}

function sanitizeCard(v: unknown): SrsCard | null {
  if (!isRecord(v)) return null;
  const num = (x: unknown, def: number) => (typeof x === "number" && isFinite(x) ? x : def);
  return {
    ef: Math.max(1.3, Math.min(5, num(v.ef, 2.5))),
    reps: Math.max(0, Math.floor(num(v.reps, 0))),
    interval: Math.max(0, num(v.interval, 0)),
    due: Math.max(0, num(v.due, 0)),
    lapses: Math.max(0, Math.floor(num(v.lapses, 0))),
    priority: v.priority === true,
  };
}

const MAX_PROBLEMS = 2000;

function sanitizeProblem(v: unknown): DrillProblem | null {
  if (!isRecord(v)) return null;
  const num = (x: unknown, def: number) => (typeof x === "number" && isFinite(x) ? x : def);
  const str = (x: unknown, max: number): string | null =>
    typeof x === "string" && x.length > 0 && x.length <= max ? x : null;
  const id = str(v.id, 100);
  const sfenKey = typeof v.sfenKey === "string" && isValidKey(v.sfenKey) ? v.sfenKey : null;
  const userSide = v.userSide === "black" || v.userSide === "white" ? v.userSide : null;
  const phase =
    v.phase === "opening" || v.phase === "middle" || v.phase === "endgame" ? v.phase : null;
  const playedUsi = str(v.playedUsi, 8);
  const playedLabel = str(v.playedLabel, 30);
  const bestUsi = str(v.bestUsi, 8);
  const bestLabel = str(v.bestLabel, 30);
  if (
    !id || !sfenKey || !userSide || !phase ||
    !playedUsi || !playedLabel || !bestUsi || !bestLabel
  ) {
    return null;
  }
  let acceptedUsis = Array.isArray(v.acceptedUsis)
    ? v.acceptedUsis
        .filter((u): u is string => typeof u === "string" && u.length > 0 && u.length <= 8)
        .slice(0, 10)
    : [];
  if (!acceptedUsis.includes(bestUsi)) {
    acceptedUsis = [bestUsi, ...acceptedUsis];
  }
  const clampCp = (x: number) => Math.max(-30000, Math.min(30000, x));
  return {
    id,
    createdAt: Math.max(0, num(v.createdAt, 0)),
    sfenKey,
    userSide,
    ply: Math.max(1, Math.floor(num(v.ply, 1))),
    phase,
    playedUsi,
    playedLabel,
    bestUsi,
    bestLabel,
    acceptedUsis,
    evalBest: clampCp(num(v.evalBest, 0)),
    evalPlayed: clampCp(num(v.evalPlayed, 0)),
    lossCp: Math.max(0, clampCp(num(v.lossCp, 0))),
    pvLabel: typeof v.pvLabel === "string" ? v.pvLabel.slice(0, 300) : "",
    gameLabel: typeof v.gameLabel === "string" ? v.gameLabel.slice(0, 100) : "",
    card: sanitizeCard(v.card) ?? newCard(0),
  };
}

export function parseImportedData(text: string): AppData | Error {
  if (text.length > MAX_IMPORT_BYTES) {
    return new Error("ファイルが大きすぎます");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new Error("JSONの解析に失敗しました");
  }
  if (!isRecord(json) || json.version !== 1 || !Array.isArray(json.books)) {
    return new Error("このアプリのエクスポートデータではありません");
  }
  const rawBooks: unknown[] = json.books;
  const books = rawBooks.map(sanitizeBook).filter((b): b is Book => b !== null);
  if (books.length === 0) {
    return new Error("有効な定跡ブックが含まれていません");
  }
  const cards: Record<string, SrsCard> = {};
  if (isRecord(json.cards)) {
    const bookIds = new Set(books.map((b) => b.id));
    for (const [key, value] of Object.entries(json.cards)) {
      const bookId = key.split("|")[0];
      if (!bookIds.has(bookId)) continue;
      const card = sanitizeCard(value);
      if (card) cards[key] = card;
    }
  }
  const activeBookId =
    typeof json.activeBookId === "string" && books.some((b) => b.id === json.activeBookId)
      ? json.activeBookId
      : books[0].id;
  const problems = Array.isArray(json.problems)
    ? json.problems
        .map(sanitizeProblem)
        .filter((p): p is DrillProblem => p !== null)
        .slice(0, MAX_PROBLEMS)
    : [];
  return { version: 1, books, cards, activeBookId, problems };
}

// ---- ストア本体 ----

class Store {
  data: AppData;
  revision = 0;
  private listeners = new Set<() => void>();

  constructor() {
    this.data = this.load() ?? defaultData();
  }

  private load(): AppData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = parseImportedData(raw);
      if (parsed instanceof Error) {
        console.warn("保存データの読み込みに失敗:", parsed.message);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn("保存に失敗しました(容量不足の可能性):", e);
    }
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private commit(): void {
    this.revision++;
    this.save();
    for (const fn of this.listeners) fn();
  }

  // ---- ブック操作 ----

  getBook(id: string | null): Book | null {
    return this.data.books.find((b) => b.id === id) ?? null;
  }

  get activeBook(): Book | null {
    return this.getBook(this.data.activeBookId) ?? this.data.books[0] ?? null;
  }

  setActiveBook(id: string): void {
    this.data.activeBookId = id;
    this.commit();
  }

  createBook(name: string, side: Side): Book {
    const book = makeBook(name, side);
    this.data.books.push(book);
    this.data.activeBookId = book.id;
    this.commit();
    return book;
  }

  /**
   * 棋譜自動追記の対象ブックを探す。
   * 手番が一致するアクティブブック → 同じ手番の先頭ブック の順で選ぶ。
   */
  findAppendTarget(side: Side): Book | null {
    const active = this.activeBook;
    if (active && active.side === side) return active;
    return this.data.books.find((b) => b.side === side) ?? null;
  }

  /** 自動追記先ブックを取得し、なければ「先手」「後手」ブックを作成する(アクティブは変えない) */
  ensureAppendTarget(side: Side): Book {
    const existing = this.findAppendTarget(side);
    if (existing) return existing;
    const book = makeBook(side === "black" ? "先手" : "後手", side);
    this.data.books.push(book);
    this.commit();
    return book;
  }

  renameBook(id: string, name: string): void {
    const book = this.getBook(id);
    if (!book) return;
    book.name = name;
    this.commit();
  }

  deleteBook(id: string): void {
    this.data.books = this.data.books.filter((b) => b.id !== id);
    for (const key of Object.keys(this.data.cards)) {
      if (key.startsWith(`${id}|`)) delete this.data.cards[key];
    }
    if (this.data.activeBookId === id) {
      this.data.activeBookId = this.data.books[0]?.id ?? null;
    }
    this.commit();
  }

  // ---- 定跡ツリー操作 ----

  private ensureNode(book: Book, key: string): JosekiNode {
    let node = book.nodes[key];
    if (!node) {
      node = { moves: [], comment: "" };
      book.nodes[key] = node;
    }
    return node;
  }

  addEdge(bookId: string, fromKey: string, edge: JosekiEdge): void {
    const book = this.getBook(bookId);
    if (!book) return;
    const node = this.ensureNode(book, fromKey);
    if (!node.moves.some((m) => m.usi === edge.usi)) {
      node.moves.push(edge);
    }
    this.ensureNode(book, edge.to);
    this.commit();
  }

  removeEdge(bookId: string, fromKey: string, usi: string): void {
    const book = this.getBook(bookId);
    const node = book?.nodes[fromKey];
    if (!book || !node) return;
    node.moves = node.moves.filter((m) => m.usi !== usi);
    this.gc(book);
    this.commit();
  }

  setComment(bookId: string, key: string, comment: string): void {
    const book = this.getBook(bookId);
    if (!book) return;
    this.ensureNode(book, key).comment = comment;
    this.commit();
  }

  setNodeEval(
    bookId: string,
    key: string,
    evalCp: number | null,
    evalMate: number | null,
  ): void {
    const book = this.getBook(bookId);
    if (!book) return;
    const node = this.ensureNode(book, key);
    if (evalCp !== null) node.evalCp = evalCp;
    else delete node.evalCp;
    if (evalMate !== null) node.evalMate = evalMate;
    else delete node.evalMate;
    this.commit();
  }

  /** 角交換四間飛車のプリセット定跡を読み込む(同名ブックは上書き) */
  loadKakugawariPreset(): { nodes: number; books: number } {
    const presets = createKakugawariPresetBooks();
    let nodes = 0;
    for (const preset of presets) {
      const idx = this.data.books.findIndex(
        (b) => b.id === preset.id || b.name === preset.name,
      );
      if (idx >= 0) {
        this.data.books[idx] = preset;
      } else {
        this.data.books.push(preset);
      }
      nodes += Object.keys(preset.nodes).length;
    }
    this.data.activeBookId = presets[0].id;
    this.commit();
    return { nodes, books: presets.length };
  }

  /** ルートから到達できないノードとそのカードを削除する */
  private gc(book: Book): void {
    const reachable = new Set<string>();
    const stack = [book.root];
    while (stack.length > 0) {
      const key = stack.pop()!;
      if (reachable.has(key)) continue;
      reachable.add(key);
      const node = book.nodes[key];
      if (!node) continue;
      for (const edge of node.moves) stack.push(edge.to);
    }
    for (const key of Object.keys(book.nodes)) {
      if (!reachable.has(key)) {
        delete book.nodes[key];
        delete this.data.cards[`${book.id}|${key}`];
      }
    }
  }

  /**
   * 棋譜の手順をツリーへ追記する。
   * prioritize が真なら、追記範囲の自分手番局面を最優先出題に設定する。
   */
  appendLine(bookId: string, entries: JosekiEdge2[], prioritize: boolean): void {
    const book = this.getBook(bookId);
    if (!book) return;
    for (const entry of entries) {
      const node = this.ensureNode(book, entry.fromKey);
      if (!node.moves.some((m) => m.usi === entry.usi)) {
        node.moves.push({ usi: entry.usi, to: entry.to, label: entry.label });
      }
      this.ensureNode(book, entry.to);
    }
    if (prioritize) {
      const own = sideToColor(book.side);
      for (const entry of entries) {
        if (turnOfKey(entry.fromKey) === own) {
          this.setPriorityInternal(book.id, entry.fromKey);
        }
      }
    }
    this.commit();
  }

  // ---- SRSカード操作 ----

  private cardKey(bookId: string, sfenKey: string): string {
    return `${bookId}|${sfenKey}`;
  }

  getCard(bookId: string, sfenKey: string): SrsCard | null {
    return this.data.cards[this.cardKey(bookId, sfenKey)] ?? null;
  }

  ensureCard(bookId: string, sfenKey: string, now = Date.now()): SrsCard {
    const key = this.cardKey(bookId, sfenKey);
    let card = this.data.cards[key];
    if (!card) {
      card = newCard(now);
      this.data.cards[key] = card;
    }
    return card;
  }

  rate(bookId: string, sfenKey: string, quality: number, now = Date.now()): void {
    const card = this.ensureCard(bookId, sfenKey, now);
    this.data.cards[this.cardKey(bookId, sfenKey)] = rateCard(card, quality, now);
    this.commit();
  }

  private setPriorityInternal(bookId: string, sfenKey: string): void {
    const card = this.ensureCard(bookId, sfenKey);
    card.priority = true;
    card.due = 0;
  }

  setPriority(bookId: string, sfenKey: string): void {
    this.setPriorityInternal(bookId, sfenKey);
    this.commit();
  }

  /** 出題対象(自分の手番で候補手が登録済みの局面)の一覧 */
  listQuizKeys(book: Book): string[] {
    const own = sideToColor(book.side);
    return Object.entries(book.nodes)
      .filter(([key, node]) => node.moves.length > 0 && turnOfKey(key) === own)
      .map(([key]) => key);
  }

  /** 出題キューを構築する(優先フラグ→期限順) */
  buildQueue(book: Book, limit: number, now = Date.now()): string[] {
    const keys = this.listQuizKeys(book);
    const withCards = keys.map((key) => ({
      key,
      card: this.getCard(book.id, key) ?? newCard(now),
    }));
    const due = withCards.filter(({ card }) => isDue(card, now));
    due.sort((a, b) => {
      if (a.card.priority !== b.card.priority) return a.card.priority ? -1 : 1;
      return a.card.due - b.card.due;
    });
    return due.slice(0, limit).map(({ key }) => key);
  }

  /** 期限に関係なくランダムに出題キューを構築する */
  buildRandomQueue(book: Book, limit: number): string[] {
    const keys = this.listQuizKeys(book);
    const shuffled = [...keys];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, limit);
  }

  countDue(book: Book, now = Date.now()): { due: number; priority: number; total: number } {
    const keys = this.listQuizKeys(book);
    let due = 0;
    let priority = 0;
    for (const key of keys) {
      const card = this.getCard(book.id, key);
      if (!card) {
        due++;
        continue;
      }
      if (isDue(card, now)) due++;
      if (card.priority) priority++;
    }
    return { due, priority, total: keys.length };
  }

  // ---- 特訓問題(実戦棋譜からの自動生成) ----

  get problems(): DrillProblem[] {
    return this.data.problems;
  }

  /**
   * 解析で検出した問題を登録する。同一局面+同一悪手は重複登録しない。
   * 新規問題は最優先(priority)で出題される。
   */
  addProblems(list: NewProblem[]): { added: number; skipped: number } {
    const existing = new Set(
      this.data.problems.map((p) => `${p.sfenKey}|${p.playedUsi}`),
    );
    const now = Date.now();
    let added = 0;
    let skipped = 0;
    for (const p of list) {
      const dedupeKey = `${p.sfenKey}|${p.playedUsi}`;
      if (existing.has(dedupeKey)) {
        skipped++;
        continue;
      }
      existing.add(dedupeKey);
      const card = newCard(now);
      card.priority = true;
      this.data.problems.push({ ...p, id: genId(), createdAt: now, card });
      added++;
    }
    if (this.data.problems.length > MAX_PROBLEMS) {
      this.data.problems = this.data.problems.slice(-MAX_PROBLEMS);
    }
    if (added > 0) this.commit();
    return { added, skipped };
  }

  deleteProblem(id: string): void {
    this.data.problems = this.data.problems.filter((p) => p.id !== id);
    this.commit();
  }

  rateProblem(id: string, quality: number, now = Date.now()): void {
    const problem = this.data.problems.find((p) => p.id === id);
    if (!problem) return;
    problem.card = rateCard(problem.card, quality, now);
    this.commit();
  }

  listProblems(phase: GamePhase | "all"): DrillProblem[] {
    return phase === "all"
      ? this.data.problems
      : this.data.problems.filter((p) => p.phase === phase);
  }

  problemStats(
    phase: GamePhase | "all",
    now = Date.now(),
  ): { due: number; total: number } {
    const list = this.listProblems(phase);
    return {
      due: list.filter((p) => isDue(p.card, now)).length,
      total: list.length,
    };
  }

  /** 特訓の出題キュー(期限到来を優先度→期限順、残りは損失の大きい順) */
  buildProblemQueue(
    phase: GamePhase | "all",
    limit: number,
    now = Date.now(),
  ): DrillProblem[] {
    const list = this.listProblems(phase);
    const due = list.filter((p) => isDue(p.card, now));
    due.sort((a, b) => {
      if (a.card.priority !== b.card.priority) return a.card.priority ? -1 : 1;
      return a.card.due - b.card.due;
    });
    const rest = list.filter((p) => !isDue(p.card, now));
    rest.sort((a, b) => b.lossCp - a.lossCp);
    return [...due, ...rest].slice(0, limit);
  }

  // ---- エクスポート / インポート ----

  exportJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  importData(data: AppData): void {
    this.data = data;
    this.commit();
  }

  resetAll(): void {
    this.data = defaultData();
    this.commit();
  }
}

/** appendLine 用のエントリ(枝+追記元キー) */
export interface JosekiEdge2 extends JosekiEdge {
  fromKey: string;
}

/** addProblems 用(id/カード/作成日時はストアが付与する) */
export type NewProblem = Omit<DrillProblem, "id" | "card" | "createdAt">;

export const store = new Store();

/** ストアの変更を購読するフック。返り値のリビジョンが変わると再描画される */
export function useStoreRevision(): number {
  return useSyncExternalStore(store.subscribe, () => store.revision);
}
