import type { MouseEvent } from "react";
import type { EvalPoint } from "../lib/gameAnalysis";

const WIDTH = 320;
const HEIGHT = 96;
const CLAMP_CP = 1500;

interface EvalGraphProps {
  points: EvalPoint[];
  /** 悪手として検出された手数(赤点表示) */
  mistakePlies: number[];
  selectedPly: number;
  onSelectPly: (ply: number) => void;
}

/** 対局全体の形勢推移(自分視点)を折れ線で表示する */
export function EvalGraph({
  points,
  mistakePlies,
  selectedPly,
  onSelectPly,
}: EvalGraphProps) {
  if (points.length < 2) return null;
  const maxPly = points[points.length - 1].ply;
  const x = (ply: number) => (ply / maxPly) * WIDTH;
  const y = (cp: number) => {
    const clamped = Math.max(-CLAMP_CP, Math.min(CLAMP_CP, cp));
    return HEIGHT / 2 - (clamped / CLAMP_CP) * (HEIGHT / 2 - 6);
  };
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.ply).toFixed(1)},${y(p.cpUser).toFixed(1)}`)
    .join(" ");
  const mistakes = new Set(mistakePlies);
  const selected = points.reduce((nearest, point) =>
    Math.abs(point.ply - selectedPly) < Math.abs(nearest.ply - selectedPly)
      ? point
      : nearest,
  );

  const selectFromGraph = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const targetPly = ratio * maxPly;
    const nearest = points.reduce((best, point) =>
      Math.abs(point.ply - targetPly) < Math.abs(best.ply - targetPly)
        ? point
        : best,
    );
    onSelectPly(nearest.ply);
  };

  return (
    <div className="eval-graph">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="形勢グラフ。タップするとその局面を表示します"
        onClick={selectFromGraph}
      >
        <rect x="0" y="0" width={WIDTH} height={HEIGHT / 2} className="graph-good-bg" />
        <rect x="0" y={HEIGHT / 2} width={WIDTH} height={HEIGHT / 2} className="graph-bad-bg" />
        <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} className="graph-midline" />
        <path d={path} className="graph-line" fill="none" />
        {points
          .filter((p) => mistakes.has(p.ply))
          .map((p) => (
            <circle
              key={p.ply}
              cx={x(p.ply)}
              cy={y(p.cpUser)}
              r="3.5"
              className="graph-mistake"
            />
          ))}
        <line
          x1={x(selected.ply)}
          y1="0"
          x2={x(selected.ply)}
          y2={HEIGHT}
          className="graph-selection-line"
        />
        <circle
          cx={x(selected.ply)}
          cy={y(selected.cpUser)}
          r="4"
          className="graph-selection"
        />
      </svg>
      <input
        className="graph-slider"
        type="range"
        min={0}
        max={maxPly}
        step={1}
        value={selected.ply}
        aria-label="表示する局面の手数"
        onChange={(event) => onSelectPly(Number(event.target.value))}
      />
      <p className="hint">
        グラフをタップまたはスライダーを動かすと、その時点の盤面を表示します。
        上=自分有利 / 下=不利(±{CLAMP_CP}cpで打ち切り)。赤点は検出した悪手・疑問手。
      </p>
    </div>
  );
}
