import type { SrsCard } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 失敗時の再出題までの猶予(同一セッション内で再挑戦できる程度に短く) */
const RETRY_MS = 10 * 60 * 1000;

export function newCard(now: number): SrsCard {
  return { ef: 2.5, reps: 0, interval: 0, due: now, lapses: 0, priority: false };
}

/**
 * 簡易SM-2で成績(quality: 0-5)を反映する。
 * 3未満は失敗扱いで間隔をリセットし、短時間後に再出題する。
 */
export function rateCard(card: SrsCard, quality: number, now: number): SrsCard {
  const q = Math.max(0, Math.min(5, quality));
  let { ef, reps, interval, lapses } = card;
  ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  let due: number;
  if (q < 3) {
    reps = 0;
    interval = 0;
    lapses += 1;
    due = now + RETRY_MS;
  } else {
    reps += 1;
    if (reps === 1) {
      interval = 1;
    } else if (reps === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ef);
    }
    due = now + interval * DAY_MS;
  }
  return {
    ef,
    reps,
    interval,
    due,
    lapses,
    // 一度成功したら最優先フラグを外す
    priority: q >= 3 ? false : card.priority,
  };
}

export function isDue(card: SrsCard, now: number): boolean {
  return card.priority || card.due <= now;
}
