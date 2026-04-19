import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export type StatisticsLineSeries = {
  name: string;
  values: number[];
  color: string;
};

type StatisticsLineChartProps = {
  ariaLabel: string;
  labels: string[];
  series: StatisticsLineSeries[];
  yMax?: number;
  yAxisFormat?: (n: number) => string;
  /** Formato dos valores no tooltip (ex.: percentagem). */
  valueFormat?: (n: number) => string;
  emptyMessage?: string;
};

const VIEW_W = 400;
const VIEW_H = 232;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 44;

function buildPoints(values: number[], maxY: number, n: number): { x: number; y: number }[] {
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

function pointsToAreaPath(points: { x: number; y: number }[], bottomY: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  let d = `M ${first.x.toFixed(2)} ${bottomY.toFixed(2)} L ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  d += ` L ${points[points.length - 1].x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
  return d;
}

export function StatisticsLineChart({
  ariaLabel,
  labels,
  series,
  yMax: yMaxProp,
  yAxisFormat = (n) => String(n),
  valueFormat = (n) => String(n),
  emptyMessage = "Sem dados para o período.",
}: StatisticsLineChartProps) {
  const titleId = useId();
  const baseId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hoverSeries, setHoverSeries] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

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
  const bottomY = PAD_T + innerH;

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

  const seriesPaths = useMemo(
    () =>
      series.map((s) => {
        const pts = buildPoints(s.values, maxY, n);
        return {
          lineD: pointsToPathLine(pts),
          areaD: pointsToAreaPath(pts, bottomY),
          pts,
        };
      }),
    [series, maxY, n, bottomY],
  );

  useEffect(() => {
    pathRefs.current = pathRefs.current.slice(0, series.length);
  }, [series.length]);

  useEffect(() => {
    const timers: number[] = [];
    const raf = requestAnimationFrame(() => {
      seriesPaths.forEach((sp, i) => {
        const path = pathRefs.current[i];
        if (!path || !sp.lineD) return;
        path.style.transition = "none";
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
        const len = path.getTotalLength();
        path.style.strokeDasharray = `${len}`;
        path.style.strokeDashoffset = `${len}`;
        const start = window.setTimeout(() => {
          path.style.transition = "stroke-dashoffset 1.05s cubic-bezier(0.22, 1, 0.36, 1)";
          path.style.strokeDashoffset = "0";
        }, 60 + i * 90);
        timers.push(start);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [seriesPaths]);

  const handlePointerOnOverlay = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg || n === 0) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const x = svgPt.x;
      if (x < PAD_L - 2 || x > PAD_L + innerW + 2) {
        setActiveIndex(null);
        setTooltip(null);
        return;
      }
      let idx: number;
      if (n === 1) idx = 0;
      else idx = Math.round(((x - PAD_L) / innerW) * (n - 1));
      idx = Math.max(0, Math.min(n - 1, idx));
      setActiveIndex(idx);
      setTooltip({ x: e.clientX, y: e.clientY });
    },
    [n, innerW],
  );

  const handleOverlayLeave = useCallback(() => {
    setActiveIndex(null);
    setTooltip(null);
  }, []);

  const crosshairX =
    activeIndex !== null && n > 0
      ? n === 1
        ? PAD_L + innerW / 2
        : PAD_L + (activeIndex / (n - 1)) * innerW
      : null;

  if (!hasData || n === 0 || series.length === 0 || series.some((s) => s.values.length !== n)) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="relative w-full overflow-x-auto rounded-2xl border border-[hsl(var(--border))]/80 bg-gradient-to-b from-[hsl(var(--muted))]/25 via-transparent to-[hsl(var(--primary))]/[0.03] p-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] ring-1 ring-[hsl(var(--border))]/40 dark:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.45)]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-auto w-full min-w-[280px] max-w-full touch-none select-none"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{ariaLabel}</title>
        <defs>
          {series.map((s, si) => (
            <linearGradient
              key={`g-${s.name}`}
              id={`stat-line-area-${baseId}-${si}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
          <filter id={`stat-line-glow-${baseId}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect
          x={PAD_L}
          y={PAD_T}
          width={innerW}
          height={innerH}
          fill="hsl(var(--background))"
          fillOpacity={0.35}
          stroke="hsl(var(--border))"
          strokeWidth={1}
          rx={8}
          className="transition-colors duration-300"
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
                strokeDasharray={tick === 0 ? undefined : "5 6"}
                opacity={tick === 0 ? 0.55 : 0.28}
                className="transition-opacity duration-300"
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[hsl(var(--muted-foreground))] text-[9px] font-medium tabular-nums"
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
              className="fill-[hsl(var(--muted-foreground))] text-[8px] font-medium"
            >
              {labels[i]}
            </text>
          );
        })}
        {seriesPaths.map((sp, si) => {
          const dim =
            hoverSeries !== null && hoverSeries !== si ? 0.22 : hoverSeries === si ? 1 : 0.92;
          return (
            <g
              key={series[si].name}
              style={{ opacity: dim, transition: "opacity 0.25s ease" }}
            >
              <path
                d={sp.areaD}
                fill={`url(#stat-line-area-${baseId}-${si})`}
                className="transition-[opacity] duration-500 ease-out"
                style={{ opacity: activeIndex !== null ? 0.55 : 0.4 }}
              />
            </g>
          );
        })}
        {seriesPaths.map((sp, si) => {
          const s = series[si];
          const dim =
            hoverSeries !== null && hoverSeries !== si ? 0.2 : hoverSeries === si ? 1 : 0.95;
          const active = hoverSeries === null || hoverSeries === si;
          return (
            <g key={`line-${s.name}`} style={{ opacity: dim, transition: "opacity 0.22s ease" }}>
              <path
                ref={(el) => {
                  pathRefs.current[si] = el;
                }}
                d={sp.lineD}
                fill="none"
                stroke={s.color}
                strokeWidth={active ? 2.6 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={active && hoverSeries === si ? `url(#stat-line-glow-${baseId})` : undefined}
                className="drop-shadow-sm"
              />
              {sp.pts.map((p, i) => {
                const isActive = activeIndex === i;
                const r = isActive ? 5.5 : 3.2;
                return (
                  <circle
                    key={`${s.name}-pt-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill="hsl(var(--background))"
                    stroke={s.color}
                    strokeWidth={isActive ? 2.5 : 2}
                    className="transition-all duration-200 ease-out"
                    style={{
                      filter: isActive ? `drop-shadow(0 0 6px ${s.color})` : undefined,
                    }}
                  />
                );
              })}
            </g>
          );
        })}
        {crosshairX !== null && activeIndex !== null ? (
          <line
            x1={crosshairX}
            y1={PAD_T}
            x2={crosshairX}
            y2={bottomY}
            stroke="hsl(var(--primary))"
            strokeWidth={1}
            strokeDasharray="4 5"
            opacity={0.45}
            className="pointer-events-none opacity-80 transition-opacity duration-150"
          />
        ) : null}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={innerW}
          height={innerH}
          fill="transparent"
          style={{ cursor: "crosshair", touchAction: "none" }}
          onPointerMove={handlePointerOnOverlay}
          onPointerDown={handlePointerOnOverlay}
          onPointerLeave={handleOverlayLeave}
        />
      </svg>
      {tooltip && activeIndex !== null ? (
        <div
          className="pointer-events-none fixed z-50 min-w-[9rem] max-w-[min(90vw,16rem)] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 py-2 text-xs shadow-xl ring-1 ring-[hsl(var(--border))]/50 backdrop-blur-md"
          style={{
            left: Math.max(
              8,
              Math.min(
                tooltip.x + 14,
                (typeof window !== "undefined" ? window.innerWidth : 1200) - 220,
              ),
            ),
            top: Math.max(12, tooltip.y - 10),
          }}
        >
          <p className="font-semibold text-[hsl(var(--foreground))]">{labels[activeIndex]}</p>
          <ul className="mt-1.5 space-y-1">
            {series.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-3 tabular-nums">
                <span className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
                <span className="font-semibold text-[hsl(var(--foreground))]">
                  {valueFormat(s.values[activeIndex] ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[hsl(var(--muted-foreground))]">
        {series.map((s, si) => (
          <li key={s.name}>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-[hsl(var(--muted))]/50"
              aria-label={`Destacar série ${s.name}`}
              onMouseEnter={() => setHoverSeries(si)}
              onMouseLeave={() => setHoverSeries(null)}
              onFocus={() => setHoverSeries(si)}
              onBlur={() => setHoverSeries(null)}
            >
              <span className="inline-block h-0.5 w-5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="font-medium text-[hsl(var(--foreground))]">{s.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
