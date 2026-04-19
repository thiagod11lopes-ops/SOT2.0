import { useEffect, useId, useMemo, useState } from "react";

export type StatisticsLineSeries = {
  name: string;
  values: number[];
  color: string;
};

type StatisticsLineChartProps = {
  /** Descrição para leitores de ecrã */
  ariaLabel: string;
  labels: string[];
  series: StatisticsLineSeries[];
  /** Valor máximo do eixo Y (ex.: 100 para percentagens). Se omitido, usa o máximo dos dados. */
  yMax?: number;
  yAxisFormat?: (n: number) => string;
  emptyMessage?: string;
};

const VIEW_W = 400;
const VIEW_H = 220;
const PAD_L = 46;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 42;

function buildPoints(
  values: number[],
  maxY: number,
  n: number,
): { x: number; y: number }[] {
  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;
  const safeMax = maxY > 0 ? maxY : 1;
  if (n === 0) return [];
  if (n === 1) {
    const v = values[0] ?? 0;
    const y = PAD_T + innerH * (1 - v / safeMax);
    return [{ x: PAD_L + innerW / 2, y }];
  }
  return values.map((v, i) => {
    const x = PAD_L + (i / (n - 1)) * innerW;
    const y = PAD_T + innerH * (1 - v / safeMax);
    return { x, y };
  });
}

function pointsToPathLine(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

export function StatisticsLineChart({
  ariaLabel,
  labels,
  series,
  yMax: yMaxProp,
  yAxisFormat = (n) => String(n),
  emptyMessage = "Sem dados para o período.",
}: StatisticsLineChartProps) {
  const titleId = useId();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDrawn(true), 40);
    return () => window.clearTimeout(t);
  }, [labels, series]);

  const { maxY, hasData } = useMemo(() => {
    let max = 0;
    for (const s of series) {
      for (const v of s.values) {
        if (v > max) max = v;
      }
    }
    const computed = yMaxProp !== undefined ? yMaxProp : Math.max(1, max);
    const hd =
      labels.length > 0 &&
      series.length > 0 &&
      series.every((s) => s.values.length === labels.length);
    return { maxY: computed, hasData: hd };
  }, [series, labels, yMaxProp]);

  const n = labels.length;
  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = VIEW_H - PAD_T - PAD_B;

  const yTicks = useMemo(() => {
    const ticks: number[] = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * maxY));
    return [...new Set(ticks)].sort((a, b) => a - b);
  }, [maxY]);

  const xLabelIndices = useMemo(() => {
    if (n === 0) return [];
    if (n <= 12) return [...Array(n).keys()];
    const step = Math.ceil(n / 10);
    const idx: number[] = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    return idx;
  }, [n]);

  if (!hasData || n === 0 || series.length === 0 || series.some((s) => s.values.length !== n)) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full min-w-[280px] max-w-full"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{ariaLabel}</title>
        <rect
          x={PAD_L}
          y={PAD_T}
          width={innerW}
          height={innerH}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={1}
          rx={4}
        />
        {yTicks.map((tick) => {
          const y = PAD_T + innerH * (1 - tick / maxY);
          return (
            <g key={tick}>
              <line
                x1={PAD_L}
                y1={y}
                x2={PAD_L + innerW}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={tick === 0 ? 1 : 0.5}
                strokeDasharray={tick === 0 ? undefined : "4 4"}
                opacity={tick === 0 ? 1 : 0.45}
              />
              <text
                x={PAD_L - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-[hsl(var(--muted-foreground))] text-[9px]"
              >
                {yAxisFormat(tick)}
              </text>
            </g>
          );
        })}
        {xLabelIndices.map((i) => {
          const x = n === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW;
          return (
            <text
              key={`xlab-${i}-${labels[i]}`}
              x={x}
              y={VIEW_H - 10}
              textAnchor="middle"
              className="fill-[hsl(var(--muted-foreground))] text-[8px]"
            >
              {labels[i]}
            </text>
          );
        })}
        {series.map((s) => {
          const pts = buildPoints(s.values, maxY, n);
          const d = pointsToPathLine(pts);
          return (
            <g key={s.name}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={drawn ? 1 : 0}
                style={{ transition: "opacity 0.35s ease" }}
              />
              {pts.map((p, i) => (
                <circle
                  key={`${s.name}-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={3.5}
                  fill="hsl(var(--background))"
                  stroke={s.color}
                  strokeWidth={2}
                  opacity={drawn ? 1 : 0}
                  style={{ transition: "opacity 0.35s ease" }}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]" aria-hidden>
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
