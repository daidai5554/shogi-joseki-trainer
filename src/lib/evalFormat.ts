import { Color } from "tsshogi";
import { sideToColor, turnOfKey } from "./shogi";
import type { Side } from "./types";

export interface EvalResult {
  cp: number | null;
  mate: number | null;
  depth: number | null;
  pv: string;
}

/** 評価値をユーザー視点(自分の手番=プラス)で表示用に整形する */
export function formatEval(
  evalResult: Pick<EvalResult, "cp" | "mate"> | null,
  sfenKey: string,
  userSide: Side,
): string {
  if (!evalResult) return "—";
  const { cp, mate } = evalResult;
  if (mate !== null) {
    const turn = turnOfKey(sfenKey);
    const userColor = sideToColor(userSide);
    const signed = turn === userColor ? mate : -mate;
    if (signed > 0) return `詰み${signed}手`;
    if (signed < 0) return `詰み${Math.abs(signed)}手(不利)`;
    return "詰み";
  }
  if (cp === null) return "—";
  const turn = turnOfKey(sfenKey);
  const userColor = sideToColor(userSide);
  let score = turn === userColor ? cp : -cp;
  const mark = score >= 0 ? "▲" : "△";
  return `${mark}${Math.abs(score)}`;
}

export function evalTone(
  evalResult: Pick<EvalResult, "cp" | "mate"> | null,
  sfenKey: string,
  userSide: Side,
): "good" | "bad" | "neutral" {
  if (!evalResult) return "neutral";
  if (evalResult.mate !== null) {
    const turn = turnOfKey(sfenKey);
    const userColor = sideToColor(userSide);
    const signed = turn === userColor ? evalResult.mate : -evalResult.mate;
    return signed > 0 ? "good" : signed < 0 ? "bad" : "neutral";
  }
  if (evalResult.cp === null) return "neutral";
  const turn = turnOfKey(sfenKey);
  const userColor = sideToColor(userSide);
  const score = turn === userColor ? evalResult.cp : -evalResult.cp;
  if (score >= 80) return "good";
  if (score <= -80) return "bad";
  return "neutral";
}

/** USIの手番文字列 */
export function turnLabel(sfenKey: string): string {
  return turnOfKey(sfenKey) === Color.BLACK ? "先手番" : "後手番";
}
