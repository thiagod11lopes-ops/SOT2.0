import { parseIsoDateToDate, parsePtBrToDate } from "./dateFormat";
import {
  addBaselineCalendarDaysToSet,
  getStatisticsBaselineContribution,
  mergeMonthlyEvolutionWithBaseline,
  STATISTICS_BASELINE_2025_JAN_AUG,
  type StatisticsBaselineFilters,
} from "./statisticsHistoricalBaseline";
import { parseHhMm } from "./timeInput";
import type { DepartureRecord, DepartureType } from "../types/departure";

type StatisticsRagChunk = { id: string; category: string; text: string };

const EXCLUDED_LATE_SECTORS = new Set(["siad", "secom", "emergencia"]);
const DEFAULT_FILTERS: StatisticsBaselineFilters = {
  yearFilter: "todos",
  monthFilter: "todos",
  driverFilter: "todos",
  vehicleFilter: "todos",
  typeFilter: "todos",
};

const TOP_MOTORISTAS = 15;
const TOP_VIATURAS = 10;
const TOP_DESTINOS = 15;
const TOP_SETORES_LATE = 10;

type RankEntry = { label: string; total: number };

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

function foldBairroDestinoKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeBairroDestinoEstatistica(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const f = foldBairroDestinoKey(t);
  if (/\bdicamp\w*\b/i.test(f) || /di\s*-?\s*camp\b/i.test(f)) return "Campo Grande";
  if (/\bcemeru\w*\b/i.test(f) || /ce\s*-?\s*meru\b/i.test(f)) return "Santa Cruz";
  if (f === "campo grande" || f.startsWith("campo grande ")) return "Campo Grande";
  if (f === "santa cruz" || f.startsWith("santa cruz ")) return "Santa Cruz";
  return t;
}

function rowHasAsdPlaceholder(row: DepartureRecord): boolean {
  const has = (s: string) => s.trim().toUpperCase().includes("ASD");
  return (
    has(row.viaturas) ||
    has(row.motoristas) ||
    has(row.bairro) ||
    has(row.cidade) ||
    has(row.hospitalDestino) ||
    has(row.setor) ||
    has(row.ramal) ||
    has(row.objetivoSaida) ||
    has(row.numeroPassageiros) ||
    has(row.responsavelPedido) ||
    has(row.om)
  );
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

function toTopRanking(entriesMap: Map<string, number>, limit: number): RankEntry[] {
  return [...entriesMap.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => (b.total !== a.total ? b.total - a.total : a.label.localeCompare(b.label, "pt-BR")))
    .slice(0, limit);
}

function formatRankingLines(entries: RankEntry[]): string {
  if (!entries.length) return "Sem dados.";
  return entries.map((e, i) => `${i + 1}º ${e.label}: ${e.total}`).join("\n");
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

function buildMonthlyEvolution(rows: DepartureRecord[]) {
  const map = new Map<string, { admin: number; ambulance: number; late: number; total: number }>();
  for (const row of rows) {
    const d = parseDepartureDate(row.dataSaida);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(key) ?? { admin: 0, ambulance: 0, late: 0, total: 0 };
    cur.total += 1;
    if (row.tipo === "Administrativa") cur.admin += 1;
    if (row.tipo === "Ambulância") cur.ambulance += 1;
    if (isLateRequested(row) && !EXCLUDED_LATE_SECTORS.has(normalizeSectorKey(row.setor))) cur.late += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => {
      const [y, m] = key.split("-");
      const pctLate = v.total > 0 ? Math.round((v.late / v.total) * 100) : 0;
      return {
        key,
        label: `${m}/${y}`,
        admin: v.admin,
        ambulance: v.ambulance,
        total: v.total,
        late: v.late,
        pctLate,
      };
    });
}

function computeDailyExitAverageByTipo(
  rows: DepartureRecord[],
  baselineFilters: StatisticsBaselineFilters,
  tipo: DepartureType,
): number {
  const eligible = rows.filter((row) => row.tipo === tipo);
  const tipoFilters = { ...baselineFilters, typeFilter: tipo };
  const baseline = getStatisticsBaselineContribution(tipoFilters);
  const count = eligible.length + (baseline ? (tipo === "Administrativa" ? baseline.admin : baseline.ambulance) : 0);
  if (count === 0) return 0;

  const days = new Set<string>();
  for (const row of eligible) {
    const d = parseDepartureDate(row.dataSaida);
    if (!d) continue;
    days.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  const periodBaseline = getStatisticsBaselineContribution({ ...baselineFilters, typeFilter: "todos" });
  if (periodBaseline) addBaselineCalendarDaysToSet(days, baselineFilters);

  const divisor = days.size > 0 ? days.size : 1;
  return count / divisor;
}

function formatAverage(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function buildSotStatisticsRagChunks(departures: DepartureRecord[]): StatisticsRagChunk[] {
  const rows = departures.filter((r) => r.cancelada !== true && !rowHasAsdPlaceholder(r));
  const baseline = getStatisticsBaselineContribution(DEFAULT_FILTERS);

  const adminCount = rows.filter((r) => r.tipo === "Administrativa").length + (baseline?.admin ?? 0);
  const ambulanceCount = rows.filter((r) => r.tipo === "Ambulância").length + (baseline?.ambulance ?? 0);
  const totalCount = adminCount + ambulanceCount;

  const lateRows = rows.filter(
    (r) => isLateRequested(r) && !EXCLUDED_LATE_SECTORS.has(normalizeSectorKey(r.setor)),
  );
  const lateTotal = lateRows.length;
  const latePercent = rows.length > 0 ? Math.round((lateTotal / rows.length) * 100) : 0;

  const monthlyEvolution = baseline
    ? mergeMonthlyEvolutionWithBaseline(buildMonthlyEvolution(rows), baseline.byMonth)
    : buildMonthlyEvolution(rows);

  const rankingMotoristas = toTopRanking(toCountMap(rows, (r) => r.motoristas), TOP_MOTORISTAS);
  const adminRows = rows.filter((r) => r.tipo === "Administrativa");
  const ambulanceRows = rows.filter((r) => r.tipo === "Ambulância");
  const rankingViaturasAdmin = toTopRanking(toCountMap(adminRows, (r) => r.viaturas), TOP_VIATURAS);
  const rankingViaturasAmbulance = toTopRanking(toCountMap(ambulanceRows, (r) => r.viaturas), TOP_VIATURAS);
  const rankingDestinos = toTopRanking(
    toCountMap(rows, (r) => normalizeBairroDestinoEstatistica(r.bairro)),
    TOP_DESTINOS,
  );
  const rankingSetoresLate = toTopRanking(toCountMap(lateRows, (r) => r.setor), TOP_SETORES_LATE);

  const mediaAdmin = computeDailyExitAverageByTipo(rows, DEFAULT_FILTERS, "Administrativa");
  const mediaAmbulance = computeDailyExitAverageByTipo(rows, DEFAULT_FILTERS, "Ambulância");

  const chunks: StatisticsRagChunk[] = [
    {
      id: "stats-totais-geral",
      category: "Estatística — totais gerais",
      text: [
        "Resumo agregado da aba Estatística (todos os anos/meses, sem filtro de motorista ou viatura).",
        `Total de saídas: ${totalCount} (${adminCount} administrativas, ${ambulanceCount} ambulância).`,
        `Cadastros digitais no sistema: ${rows.length} saídas ativas (exclui canceladas e placeholders ASD).`,
        baseline
          ? `Baseline legado jan–ago/${STATISTICS_BASELINE_2025_JAN_AUG.year}: +${baseline.admin} administrativas e +${baseline.ambulance} ambulância (período pré-cadastro completo).`
          : "",
        `Média diária de saídas: ${formatAverage(mediaAdmin)} administrativas e ${formatAverage(mediaAmbulance)} ambulância.`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      id: "stats-fora-prazo",
      category: "Estatística — fora do prazo",
      text: [
        `Pedidos fora do prazo (pedido em dia anterior com hora após 09:59; exclui setores SIAD, SECOM e Emergência): ${lateTotal} de ${rows.length} cadastros (${latePercent}%).`,
        `No prazo: ${Math.max(0, rows.length - lateTotal)}.`,
        rankingSetoresLate.length ? `Setores com mais fora do prazo:\n${formatRankingLines(rankingSetoresLate)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      id: "stats-ranking-motoristas",
      category: "Estatística — ranking motoristas",
      text: `Top ${TOP_MOTORISTAS} motoristas por quantidade de saídas (todos os tipos):\n${formatRankingLines(rankingMotoristas)}`,
    },
    {
      id: "stats-ranking-viaturas",
      category: "Estatística — ranking viaturas",
      text: [
        `Top ${TOP_VIATURAS} viaturas — administrativas:\n${formatRankingLines(rankingViaturasAdmin)}`,
        "",
        `Top ${TOP_VIATURAS} viaturas — ambulância:\n${formatRankingLines(rankingViaturasAmbulance)}`,
      ].join("\n"),
    },
    {
      id: "stats-destinos",
      category: "Estatística — destinos mais solicitados",
      text: `Top ${TOP_DESTINOS} bairros/destinos (normalização igual à aba Estatística):\n${formatRankingLines(rankingDestinos)}`,
    },
  ];

  if (monthlyEvolution.length > 0) {
    chunks.push({
      id: "stats-evolucao-mensal",
      category: "Estatística — evolução mensal",
      text: monthlyEvolution
        .map(
          (m) =>
            `${m.label}: total ${m.total} (adm ${m.admin}, amb ${m.ambulance}) | fora do prazo ${m.late} (${m.pctLate}%)`,
        )
        .join("\n"),
    });
  }

  return chunks;
}

export function isStatisticsRagQuery(query: string): boolean {
  const q = query.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return (
    /\bestatist/.test(q) ||
    /\branking\b/.test(q) ||
    /\bmedias?\b/.test(q) ||
    /\bfora do prazo\b/.test(q) ||
    /\bpodio\b/.test(q) ||
    /\bevolucao\b/.test(q) ||
    /\bquantas\b/.test(q) ||
    /\bdestinos?\b/.test(q) ||
    /\bviaturas?\b/.test(q) && /\bmais\b|\btop\b|\branking\b/.test(q) ||
    /\bmotoristas?\b/.test(q) && /\bmais\b|\btop\b|\branking\b|\bquantas\b/.test(q) ||
    /\btotal\b/.test(q) && /\bsaidas?\b/.test(q) && !/\bhoje\b/.test(q) && !/\bproxim/.test(q)
  );
}
