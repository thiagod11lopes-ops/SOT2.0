import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CarFront, ChartColumnBig, ChevronDown, ClipboardList, Siren, TriangleAlert, UserRound } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import { parseIsoDateToDate, parsePtBrToDate } from "../lib/dateFormat";
import { parseHhMm } from "../lib/timeInput";
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type RankEntry = { label: string; total: number };
type MonthlyLateEntry = { monthLabel: string; total: number };
const EXCLUDED_LATE_SECTORS = new Set(["siad", "secom", "emergencia"]);
const MONTH_OPTIONS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

function parseDepartureDate(value: string): Date | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  return parsePtBrToDate(raw) ?? parseIsoDateToDate(raw);
}

function normalizeSectorKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/~/g, "")
    .toLowerCase();
}

/** Chave para comparar bairros em «Destinos mais solicitados» (acentos e espaços colapsados). */
function foldBairroDestinoKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Agrupa grafias usadas no cadastro para o mesmo destino em estatísticas.
 * DiCamp (e variantes) → Campo Grande · Cemeru (e variantes) → Santa Cruz;
 * «campo grande» / «santa cruz» (qualquer maiúsculas) unificam com esses rótulos.
 */
function normalizeBairroDestinoEstatistica(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const f = foldBairroDestinoKey(t);
  if (/\bdicamp\w*\b/i.test(f) || /di\s*[\-]?\s*camp\b/i.test(f)) {
    return "Campo Grande";
  }
  if (/\bcemeru\w*\b/i.test(f) || /ce\s*[\-]?\s*meru\b/i.test(f)) {
    return "Santa Cruz";
  }
  if (f === "campo grande" || f.startsWith("campo grande ")) {
    return "Campo Grande";
  }
  if (f === "santa cruz" || f.startsWith("santa cruz ")) {
    return "Santa Cruz";
  }
  return t;
}

/** Registos com «ASD» no motorista ou na viatura não entram nas estatísticas. */
function rowHasAsdDriverOrVehicle(row: DepartureRecord): boolean {
  const motor = row.motoristas.trim().toUpperCase();
  const viat = row.viaturas.trim().toUpperCase();
  return motor.includes("ASD") || viat.includes("ASD");
}

function toCountMap(rows: DepartureRecord[], pickValue: (row: DepartureRecord) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = pickValue(row).trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function toTopRanking(entriesMap: Map<string, number>, limit = 3): RankEntry[] {
  return [...entriesMap.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => (b.total !== a.total ? b.total - a.total : a.label.localeCompare(b.label, "pt-BR")))
    .slice(0, limit);
}

function isLateRequested(row: DepartureRecord): boolean {
  const requestDate = parseDepartureDate(row.dataPedido);
  const departureDate = parseDepartureDate(row.dataSaida);
  const requestTime = parseHhMm(row.horaPedido.trim());
  if (!requestDate || !departureDate || !requestTime) return false;
  const thresholdMinutes = 9 * 60 + 59;
  const requestMinutes = requestTime.h * 60 + requestTime.m;
  return requestDate.getTime() < departureDate.getTime() && requestMinutes > thresholdMinutes;
}

function byMonthLateRequests(rows: DepartureRecord[]): MonthlyLateEntry[] {
  const monthly = new Map<string, number>();
  for (const row of rows) {
    const departureDate = parseDepartureDate(row.dataSaida);
    if (!departureDate) continue;
    const key = `${departureDate.getFullYear()}-${String(departureDate.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) ?? 0) + 1);
  }
  return [...monthly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, total]) => {
      const [year, month] = key.split("-");
      return { monthLabel: `${month}/${year}`, total };
    });
}

function PodiumCard({
  title,
  icon,
  ranking,
  fullRanking,
  entityColumnLabel,
}: {
  title: string;
  icon: ReactNode;
  ranking: RankEntry[];
  fullRanking: RankEntry[];
  entityColumnLabel: string;
}) {
  const [animateIn, setAnimateIn] = useState(false);
  const [showGeral, setShowGeral] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setAnimateIn(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  const max = ranking[0]?.total ?? 1;
  const visualOrder = [ranking[1], ranking[0], ranking[2]].filter(Boolean) as RankEntry[];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="min-w-0 flex-1">{title}</CardTitle>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant={showGeral ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowGeral((v) => !v)}
            aria-pressed={showGeral}
          >
            Geral
          </Button>
          <span className="text-[hsl(var(--primary))]">{icon}</span>
        </div>
      </CardHeader>
      <CardContent>
        {showGeral ? (
          fullRanking.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Sem dados para listar.</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-xl border border-[hsl(var(--border))]">
              <Table>
                <TableHeader className="sticky top-0 z-[1] bg-[hsl(var(--muted))/0.35]">
                  <TableRow>
                    <TableHead className="w-24 font-bold text-[hsl(var(--primary))]">Colocação</TableHead>
                    <TableHead className="font-bold text-[hsl(var(--primary))]">{entityColumnLabel}</TableHead>
                    <TableHead className="text-right font-bold text-[hsl(var(--primary))]">Saídas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fullRanking.map((entry, index) => (
                    <TableRow
                      key={entry.label}
                      className={index % 2 === 0 ? "bg-transparent" : "bg-[hsl(var(--muted))/0.15]"}
                    >
                      <TableCell className="font-semibold text-[hsl(var(--primary))]">{index + 1}º</TableCell>
                      <TableCell className="font-semibold text-[hsl(var(--foreground))]">{entry.label}</TableCell>
                      <TableCell className="text-right font-semibold text-[hsl(var(--primary))]">{entry.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : ranking.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Sem dados suficientes para montar o pódio.</p>
        ) : (
          <div className="flex min-h-56 items-end justify-center gap-3">
            {visualOrder.map((entry, index) => {
              const heightPct = Math.max(25, Math.round((entry.total / max) * 100));
              const medal = index === 1 ? "🥇" : index === 0 ? "🥈" : "🥉";
              const place = index === 1 ? "1º" : index === 0 ? "2º" : "3º";
              return (
                <div key={`${entry.label}-${place}`} className="flex w-24 flex-col items-center gap-2">
                  <span className="text-lg">{medal}</span>
                  <div className="relative flex h-44 w-full items-end overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.35]">
                    <div
                      className="w-full rounded-md bg-[hsl(var(--primary))] transition-all duration-700"
                      style={{ height: `${animateIn ? heightPct : 0}%` }}
                    />
                    <span className="absolute inset-x-0 bottom-1 text-center text-xs font-semibold text-white">{entry.total}</span>
                  </div>
                  <span className="text-xs font-semibold text-[hsl(var(--primary))]">{place}</span>
                  <span className="line-clamp-2 text-center text-xs">{entry.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{label}</p>
          <p className="text-3xl font-bold text-[hsl(var(--primary))]">{value}</p>
        </div>
        <span className="text-[hsl(var(--primary))]">{icon}</span>
      </CardContent>
    </Card>
  );
}

export function StatisticsPage() {
  const { departures } = useDepartures();
  const [yearFilter, setYearFilter] = useState("todos");
  const [monthFilter, setMonthFilter] = useState("todos");
  const [driverFilter, setDriverFilter] = useState("todos");
  const [vehicleFilter, setVehicleFilter] = useState("todos");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [lateSectorsExpanded, setLateSectorsExpanded] = useState(false);
  const [lateDestinationsExpanded, setLateDestinationsExpanded] = useState(false);

  const departuresActive = useMemo(() => departures.filter((row) => row.cancelada !== true), [departures]);
  const departuresForStatistics = useMemo(
    () => departuresActive.filter((row) => !rowHasAsdDriverOrVehicle(row)),
    [departuresActive],
  );
  const filteredDepartures = useMemo(() => {
    return departuresForStatistics.filter((row) => {
      const departureDate = parseDepartureDate(row.dataSaida);
      const rowYear = departureDate ? String(departureDate.getFullYear()) : "";
      const rowMonth = departureDate ? String(departureDate.getMonth() + 1) : "";
      const rowDriver = row.motoristas.trim();
      const rowVehicle = row.viaturas.trim();
      const rowType = row.tipo;
      if (yearFilter !== "todos" && rowYear !== yearFilter) return false;
      if (monthFilter !== "todos" && rowMonth !== monthFilter) return false;
      if (driverFilter !== "todos" && rowDriver !== driverFilter) return false;
      if (vehicleFilter !== "todos" && rowVehicle !== vehicleFilter) return false;
      if (typeFilter !== "todos" && rowType !== typeFilter) return false;
      return true;
    });
  }, [departuresForStatistics, yearFilter, monthFilter, driverFilter, vehicleFilter, typeFilter]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const row of departuresForStatistics) {
      const d = parseDepartureDate(row.dataSaida);
      if (d) years.add(String(d.getFullYear()));
    }
    return [...years].sort((a, b) => Number(b) - Number(a));
  }, [departuresForStatistics]);

  const availableDrivers = useMemo(() => {
    return [...new Set(departuresForStatistics.map((row) => row.motoristas.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [departuresForStatistics]);

  const availableVehicles = useMemo(() => {
    return [...new Set(departuresForStatistics.map((row) => row.viaturas.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [departuresForStatistics]);

  const totals = useMemo(() => {
    const total = filteredDepartures.length;
    const admin = filteredDepartures.filter((row) => row.tipo === "Administrativa").length;
    const ambulance = filteredDepartures.filter((row) => row.tipo === "Ambulância").length;
    return { total, admin, ambulance };
  }, [filteredDepartures]);

  const countMapViaturas = useMemo(() => toCountMap(filteredDepartures, (row) => row.viaturas), [filteredDepartures]);
  const countMapMotoristas = useMemo(() => toCountMap(filteredDepartures, (row) => row.motoristas), [filteredDepartures]);
  const rankingViaturas = useMemo(() => toTopRanking(countMapViaturas), [countMapViaturas]);
  const rankingMotoristas = useMemo(() => toTopRanking(countMapMotoristas), [countMapMotoristas]);
  const rankingViaturasFull = useMemo(() => toTopRanking(countMapViaturas, Number.POSITIVE_INFINITY), [countMapViaturas]);
  const rankingMotoristasFull = useMemo(() => toTopRanking(countMapMotoristas, Number.POSITIVE_INFINITY), [countMapMotoristas]);

  const lateRequestedDepartures = useMemo(
    () => filteredDepartures.filter((row) => isLateRequested(row)),
    [filteredDepartures],
  );
  const lateRequestedDeparturesFilteredBySector = useMemo(
    () =>
      lateRequestedDepartures.filter(
        (row) => !EXCLUDED_LATE_SECTORS.has(normalizeSectorKey(row.setor)),
      ),
    [lateRequestedDepartures],
  );

  const monthlyLateStats = useMemo(
    () => byMonthLateRequests(lateRequestedDeparturesFilteredBySector),
    [lateRequestedDeparturesFilteredBySector],
  );
  const lateSectors = useMemo(
    () =>
      toTopRanking(
        toCountMap(lateRequestedDeparturesFilteredBySector, (row) => row.setor),
        Number.POSITIVE_INFINITY,
      ),
    [lateRequestedDeparturesFilteredBySector],
  );
  const lateTotal = lateRequestedDeparturesFilteredBySector.length;
  const onTimeTotal = Math.max(0, filteredDepartures.length - lateTotal);
  const latePercent = filteredDepartures.length > 0 ? Math.round((lateTotal / filteredDepartures.length) * 100) : 0;
  const maxMonthlyLate = monthlyLateStats.reduce((max, row) => Math.max(max, row.total), 1);
  const lateSectorsTotal = lateSectors.reduce((acc, entry) => acc + entry.total, 0);

  const lateDestinations = useMemo(
    () =>
      toTopRanking(
        toCountMap(lateRequestedDeparturesFilteredBySector, (row) =>
          normalizeBairroDestinoEstatistica(row.bairro),
        ),
        Number.POSITIVE_INFINITY,
      ),
    [lateRequestedDeparturesFilteredBySector],
  );
  const lateDestinationsTotal = lateDestinations.reduce((acc, entry) => acc + entry.total, 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Estatística Geral do Sistema</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Painel com métricas totais, ranking de uso e controle de solicitações fora do prazo.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-5">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-[hsl(var(--foreground))]">Ano</span>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="h-8 w-full min-w-0 rounded-md border border-[hsl(var(--border))] bg-white px-2 text-xs text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                <option value="todos">Todos</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-[hsl(var(--foreground))]">Mês</span>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="h-8 w-full min-w-0 rounded-md border border-[hsl(var(--border))] bg-white px-2 text-xs text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                <option value="todos">Todos</option>
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-[hsl(var(--foreground))]">Motorista</span>
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="h-8 w-full min-w-0 rounded-md border border-[hsl(var(--border))] bg-white px-2 text-xs text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                <option value="todos">Todos</option>
                {availableDrivers.map((driver) => (
                  <option key={driver} value={driver}>
                    {driver}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-[hsl(var(--foreground))]">Viatura</span>
              <select
                value={vehicleFilter}
                onChange={(e) => setVehicleFilter(e.target.value)}
                className="h-8 w-full min-w-0 rounded-md border border-[hsl(var(--border))] bg-white px-2 text-xs text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                <option value="todos">Todas</option>
                {availableVehicles.map((vehicle) => (
                  <option key={vehicle} value={vehicle}>
                    {vehicle}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-[hsl(var(--foreground))]">Tipo de saída</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 w-full min-w-0 rounded-md border border-[hsl(var(--border))] bg-white px-2 text-xs text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                <option value="todos">Todos</option>
                <option value="Administrativa">Administrativa</option>
                <option value="Ambulância">Ambulância</option>
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Número de saídas totais" value={totals.total} icon={<ClipboardList size={24} />} />
        <MetricCard label="Saídas Administrativas" value={totals.admin} icon={<ChartColumnBig size={24} />} />
        <MetricCard label="Saídas de Ambulância" value={totals.ambulance} icon={<Siren size={24} />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PodiumCard
          title="Pódio de saídas por viatura"
          icon={<CarFront size={22} />}
          ranking={rankingViaturas}
          fullRanking={rankingViaturasFull}
          entityColumnLabel="Viatura"
        />
        <PodiumCard
          title="Pódio de saídas por motorista"
          icon={<UserRound size={22} />}
          ranking={rankingMotoristas}
          fullRanking={rankingMotoristasFull}
          entityColumnLabel="Motorista"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Solicitações fora do prazo</CardTitle>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Regra aplicada: data do pedido anterior a data da saída e hora do pedido depois de 09:59.
            </p>
          </div>
          <span className="text-[hsl(var(--primary))]">
            <TriangleAlert size={22} />
          </span>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Fora do prazo" value={lateTotal} icon={<TriangleAlert size={20} />} />
            <MetricCard label="No prazo" value={onTimeTotal} icon={<ClipboardList size={20} />} />
            <MetricCard label="% fora do prazo" value={latePercent} icon={<ChartColumnBig size={20} />} />
          </div>

          <div className="rounded-lg border border-[hsl(var(--border))] p-4">
            <p className="mb-4 text-sm font-semibold text-[hsl(var(--primary))]">Gráfico mensal de saídas fora do prazo</p>
            {monthlyLateStats.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Não há registros fora do prazo para montar o gráfico.
              </p>
            ) : (
              <div className="space-y-3">
                {monthlyLateStats.map((row) => {
                  const widthPct = Math.max(6, Math.round((row.total / maxMonthlyLate) * 100));
                  return (
                    <div key={row.monthLabel} className="grid grid-cols-[80px_1fr_40px] items-center gap-3">
                      <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{row.monthLabel}</span>
                      <div className="h-3 rounded-full bg-[hsl(var(--muted))/0.45]">
                        <div className="h-3 rounded-full bg-[hsl(var(--primary))]" style={{ width: `${widthPct}%` }} />
                      </div>
                      <span className="text-right text-xs font-bold text-[hsl(var(--primary))]">{row.total}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[hsl(var(--border))] p-4">
            <button
              type="button"
              onClick={() => setLateSectorsExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={lateSectorsExpanded}
            >
              <span className="text-sm font-semibold text-[hsl(var(--primary))]">Setores com pedidos fora do prazo</span>
              <ChevronDown
                size={18}
                className={`text-[hsl(var(--primary))] transition-transform ${lateSectorsExpanded ? "rotate-180" : "rotate-0"}`}
              />
            </button>
            {lateSectorsExpanded ? (
              <div className="mt-3">
                {lateSectors.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Não há setores com registros fora do prazo no período atual.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                    <Table>
                      <TableHeader className="bg-[hsl(var(--muted))/0.35]">
                        <TableRow>
                          <TableHead className="font-bold text-[hsl(var(--primary))]">Setor</TableHead>
                          <TableHead className="text-right font-bold text-[hsl(var(--primary))]">Quantidade</TableHead>
                          <TableHead className="text-right font-bold text-[hsl(var(--primary))]">Participação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lateSectors.map((entry, index) => {
                          const percent = lateSectorsTotal > 0 ? Math.round((entry.total / lateSectorsTotal) * 100) : 0;
                          return (
                            <TableRow
                              key={entry.label}
                              className={index % 2 === 0 ? "bg-transparent" : "bg-[hsl(var(--muted))/0.15]"}
                            >
                              <TableCell className="font-semibold text-[hsl(var(--foreground))]">{entry.label}</TableCell>
                              <TableCell className="text-right font-semibold text-[hsl(var(--primary))]">{entry.total}</TableCell>
                              <TableCell className="text-right text-[hsl(var(--muted-foreground))]">{percent}%</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-[hsl(var(--border))] p-4">
            <button
              type="button"
              onClick={() => setLateDestinationsExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={lateDestinationsExpanded}
            >
              <span className="text-sm font-semibold text-[hsl(var(--primary))]">Destinos mais solicitados</span>
              <ChevronDown
                size={18}
                className={`text-[hsl(var(--primary))] transition-transform ${lateDestinationsExpanded ? "rotate-180" : "rotate-0"}`}
              />
            </button>
            {lateDestinationsExpanded ? (
              <div className="mt-3">
                {lateDestinations.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Não há destinos com registros fora do prazo no período atual.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                    <Table>
                      <TableHeader className="bg-[hsl(var(--muted))/0.35]">
                        <TableRow>
                          <TableHead className="font-bold text-[hsl(var(--primary))]">Destino</TableHead>
                          <TableHead className="text-right font-bold text-[hsl(var(--primary))]">Quantidade</TableHead>
                          <TableHead className="text-right font-bold text-[hsl(var(--primary))]">Participação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lateDestinations.map((entry, index) => {
                          const percent =
                            lateDestinationsTotal > 0 ? Math.round((entry.total / lateDestinationsTotal) * 100) : 0;
                          return (
                            <TableRow
                              key={entry.label}
                              className={index % 2 === 0 ? "bg-transparent" : "bg-[hsl(var(--muted))/0.15]"}
                            >
                              <TableCell className="font-semibold text-[hsl(var(--foreground))]">{entry.label}</TableCell>
                              <TableCell className="text-right font-semibold text-[hsl(var(--primary))]">{entry.total}</TableCell>
                              <TableCell className="text-right text-[hsl(var(--muted-foreground))]">{percent}%</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
