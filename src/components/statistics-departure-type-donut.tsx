import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";

const chartConfig = {
  administrativa: { label: "Administrativa", color: "var(--chart-1)" },
  ambulancia: { label: "Ambulância", color: "var(--chart-2)" },
  outros: { label: "Outros", color: "var(--chart-5)" },
} satisfies ChartConfig;

type SliceRow = { name: keyof typeof chartConfig; value: number };

export function StatisticsDepartureTypeDonut({
  admin,
  ambulance,
  total,
}: {
  admin: number;
  ambulance: number;
  total: number;
}) {
  const data = useMemo((): SliceRow[] => {
    const outros = Math.max(0, total - admin - ambulance);
    const rows: SliceRow[] = [];
    if (admin > 0) rows.push({ name: "administrativa", value: admin });
    if (ambulance > 0) rows.push({ name: "ambulancia", value: ambulance });
    if (outros > 0) rows.push({ name: "outros", value: outros });
    return rows;
  }, [admin, ambulance, total]);

  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  if (total === 0) {
    return (
      <div
        data-pdf-chart="composicao-tipo-saida"
        data-pdf-chart-title="Composição por tipo de saída"
        data-pdf-order="1"
      >
        <Card className="overflow-hidden border-[hsl(var(--border))]/80 bg-gradient-to-br from-[hsl(var(--card))] via-[hsl(var(--card))] to-[hsl(var(--muted))]/25 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.12)] ring-1 ring-[hsl(var(--border))]/40 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composição por tipo de saída</CardTitle>
          <p className="text-sm font-normal text-[hsl(var(--muted-foreground))]">
            Distribuição das saídas no período filtrado (sem dados).
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Sem saídas no período atual.</p>
        </CardContent>
      </Card>
      </div>
    );
  }

  return (
    <div
      data-pdf-chart="composicao-tipo-saida"
      data-pdf-chart-title="Composição por tipo de saída"
      data-pdf-order="1"
    >
    <Card className="overflow-hidden border-[hsl(var(--border))]/80 bg-gradient-to-br from-[hsl(var(--card))] via-[hsl(var(--card))] to-[hsl(var(--primary))]/[0.04] shadow-[0_20px_50px_-18px_rgba(0,0,0,0.12)] ring-1 ring-[hsl(var(--border))]/40 dark:from-[hsl(var(--card))] dark:via-[hsl(var(--card))] dark:to-[hsl(var(--primary))]/[0.07] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
      <CardHeader className="flex flex-col gap-1 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Composição por tipo de saída</CardTitle>
          <p className="text-sm font-normal text-[hsl(var(--muted-foreground))]">
            Proporção entre saídas administrativas, ambulância e outros tipos no período filtrado.
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 pb-6 pt-0 sm:flex-row sm:items-center sm:justify-center sm:gap-10">
        <ChartContainer
          config={chartConfig}
          className="aspect-square h-[min(280px,72vw)] w-full max-w-[300px] shrink-0 [&_.recharts-pie-sector]:outline-none"
        >
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-6">
                      <span className="text-[hsl(var(--muted-foreground))]">
                        {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {typeof value === "number" ? `${value} (${pct(value)}%)` : String(value)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="56%"
              outerRadius="82%"
              paddingAngle={4}
              cornerRadius={8}
              stroke="hsl(var(--background))"
              strokeWidth={3}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            >
              {data.map((entry) => (
                <Cell
                  key={`cell-${entry.name}`}
                  fill={`var(--color-${entry.name})`}
                  className="drop-shadow-sm transition-opacity hover:opacity-90"
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <ul className="flex w-full max-w-sm flex-col gap-3 sm:min-w-[200px]">
          {data.map((row) => {
            const label = chartConfig[row.name].label;
            const p = pct(row.value);
            return (
              <li
                key={row.name}
                className="flex items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/80 px-3 py-2.5 shadow-sm backdrop-blur-sm"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full shadow-sm ring-2 ring-[hsl(var(--background))]"
                    style={{ backgroundColor: `var(--color-${row.name})` }}
                  />
                  {label}
                </span>
                <span className="text-sm tabular-nums text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold text-[hsl(var(--foreground))]">{row.value}</span>
                  {" · "}
                  {p}%
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
    </div>
  );
}
