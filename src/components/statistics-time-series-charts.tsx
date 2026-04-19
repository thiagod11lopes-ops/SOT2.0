import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";

export type StatisticsMonthlyEvolutionRow = {
  label: string;
  admin: number;
  ambulance: number;
  late: number;
  pctLate: number;
};

const chartTipoConfig = {
  month: { label: "Período" },
  administrativa: { label: "Administrativa", color: "var(--chart-1)" },
  ambulancia: { label: "Ambulância", color: "var(--chart-2)" },
} satisfies ChartConfig;

const chartLateConfig = {
  month: { label: "Período" },
  foraPrazo: { label: "Fora do prazo", color: "var(--chart-3)" },
} satisfies ChartConfig;

const chartPctConfig = {
  month: { label: "Período" },
  pctForaPrazo: { label: "% fora do prazo", color: "var(--chart-4)" },
} satisfies ChartConfig;

const chartShell =
  "aspect-auto h-[280px] w-full rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--card))] p-2 shadow-sm";

function EmptyCharts() {
  return (
    <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">
      Sem dados para o período.
    </p>
  );
}

export function StatisticsTimeSeriesCharts({ evolution }: { evolution: StatisticsMonthlyEvolutionRow[] }) {
  const data = useMemo(
    () =>
      evolution.map((m) => ({
        month: m.label,
        administrativa: m.admin,
        ambulancia: m.ambulance,
        foraPrazo: m.late,
        pctForaPrazo: m.pctLate,
      })),
    [evolution],
  );

  if (data.length === 0) {
    return <EmptyCharts />;
  }

  return (
    <div className="space-y-8">
      <div
        className="space-y-3 rounded-lg bg-white p-2 dark:bg-[hsl(var(--card))]"
        data-pdf-chart="evolucao-tipo"
        data-pdf-chart-title="Saídas por tipo (Administrativa e Ambulância)"
        data-pdf-order="5"
      >
        <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">
          Saídas por tipo (Administrativa e Ambulância)
        </h4>
        <ChartContainer config={chartTipoConfig} className={chartShell}>
          <LineChart
            data={data}
            margin={{ left: 8, right: 12, top: 8, bottom: 4 }}
            accessibilityLayer
          >
            <CartesianGrid strokeDasharray="4 4" vertical={false} className="stroke-[hsl(var(--border))]/60" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={28}
            />
            <YAxis tickLine={false} axisLine={false} width={44} tickMargin={6} />
            <ChartTooltip
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "4 4" }}
              content={<ChartTooltipContent labelFormatter={(v) => String(v)} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="administrativa"
              stroke="var(--color-administrativa)"
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 2 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="ambulancia"
              stroke="var(--color-ambulancia)"
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 2 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ChartContainer>
      </div>

      <div
        className="space-y-3 rounded-lg bg-white p-2 dark:bg-[hsl(var(--card))]"
        data-pdf-chart="evolucao-fora-prazo"
        data-pdf-chart-title="Pedidos fora do prazo por mês"
        data-pdf-order="6"
      >
        <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Pedidos fora do prazo por mês</h4>
        <ChartContainer config={chartLateConfig} className={chartShell}>
          <LineChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="4 4" vertical={false} className="stroke-[hsl(var(--border))]/60" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={28}
            />
            <YAxis tickLine={false} axisLine={false} width={44} tickMargin={6} allowDecimals={false} />
            <ChartTooltip
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "4 4" }}
              content={<ChartTooltipContent labelFormatter={(v) => String(v)} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="foraPrazo"
              stroke="var(--color-foraPrazo)"
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 2 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ChartContainer>
      </div>

      <div
        className="space-y-3 rounded-lg bg-white p-2 dark:bg-[hsl(var(--card))]"
        data-pdf-chart="evolucao-pct-fora"
        data-pdf-chart-title="Percentagem fora do prazo por mês"
        data-pdf-order="7"
      >
        <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Percentagem fora do prazo por mês</h4>
        <ChartContainer config={chartPctConfig} className={chartShell}>
          <LineChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 4 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="4 4" vertical={false} className="stroke-[hsl(var(--border))]/60" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={28}
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              width={44}
              tickMargin={6}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "4 4" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(v) => String(v)}
                  formatter={(value, name) => (
                    <div className="flex w-full flex-wrap items-center justify-between gap-4">
                      <span className="text-[hsl(var(--muted-foreground))]">{name}</span>
                      <span className="font-mono font-medium tabular-nums text-[hsl(var(--foreground))]">
                        {typeof value === "number" ? `${value}%` : String(value)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="pctForaPrazo"
              stroke="var(--color-pctForaPrazo)"
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 2 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );
}
