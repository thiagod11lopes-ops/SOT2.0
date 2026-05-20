/**
 * Totais legados (jan–ago/2025) antes do cadastro digital completo.
 * Não geram registos na UI — apenas incrementam métricas agregadas da aba Estatística.
 */
export const STATISTICS_BASELINE_2025_JAN_AUG = {
  year: 2025,
  firstMonth: 1,
  lastMonth: 8,
  admin: 681,
  ambulance: 622,
} as const;

const BASELINE_DAYS_PER_MONTH_2025 = [31, 28, 31, 30, 31, 30, 31, 31] as const;

export type StatisticsBaselineContribution = {
  admin: number;
  ambulance: number;
  /** Dias de calendário no recorte (para média diária). */
  calendarDays: number;
  /** Incrementos por mês (`YYYY-MM`). */
  byMonth: Map<string, { admin: number; ambulance: number }>;
};

export type StatisticsBaselineFilters = {
  yearFilter: string;
  monthFilter: string;
  driverFilter: string;
  vehicleFilter: string;
  typeFilter: string;
};

function distributeProportional(total: number, weights: readonly number[]): number[] {
  const sumW = weights.reduce((acc, w) => acc + w, 0);
  if (sumW <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const out = raw.map((r) => Math.floor(r));
  let remainder = total - out.reduce((acc, n) => acc + n, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - out[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) out[order[k % order.length].i] += 1;
  return out;
}

function monthIncludedInFilters(month: number, filters: StatisticsBaselineFilters): boolean {
  const { yearFilter, monthFilter } = filters;
  const yearOk = yearFilter === "todos" || yearFilter === String(STATISTICS_BASELINE_2025_JAN_AUG.year);
  if (!yearOk) return false;
  if (monthFilter === "todos") return true;
  return monthFilter === String(month);
}

function baselineMonthsInFilter(filters: StatisticsBaselineFilters): number[] {
  const months: number[] = [];
  for (let m = STATISTICS_BASELINE_2025_JAN_AUG.firstMonth; m <= STATISTICS_BASELINE_2025_JAN_AUG.lastMonth; m++) {
    if (monthIncludedInFilters(m, filters)) months.push(m);
  }
  return months;
}

/** Baseline só entra em totais agregados (sem motorista/viatura específicos). */
export function canApplyStatisticsBaseline(filters: StatisticsBaselineFilters): boolean {
  return filters.driverFilter === "todos" && filters.vehicleFilter === "todos";
}

export function getStatisticsBaselineContribution(
  filters: StatisticsBaselineFilters,
): StatisticsBaselineContribution | null {
  if (!canApplyStatisticsBaseline(filters)) return null;

  const months = baselineMonthsInFilter(filters);
  if (months.length === 0) return null;

  const weights = months.map((m) => BASELINE_DAYS_PER_MONTH_2025[m - 1]);
  const adminParts = distributeProportional(STATISTICS_BASELINE_2025_JAN_AUG.admin, weights);
  const ambulanceParts = distributeProportional(STATISTICS_BASELINE_2025_JAN_AUG.ambulance, weights);

  let admin = 0;
  let ambulance = 0;
  let calendarDays = 0;
  const byMonth = new Map<string, { admin: number; ambulance: number }>();

  const typeFilter = filters.typeFilter;
  months.forEach((month, idx) => {
    const monthAdmin = typeFilter === "Ambulância" ? 0 : adminParts[idx];
    const monthAmbulance = typeFilter === "Administrativa" ? 0 : ambulanceParts[idx];
    admin += monthAdmin;
    ambulance += monthAmbulance;
    calendarDays += BASELINE_DAYS_PER_MONTH_2025[month - 1];
    const key = `${STATISTICS_BASELINE_2025_JAN_AUG.year}-${String(month).padStart(2, "0")}`;
    byMonth.set(key, { admin: monthAdmin, ambulance: monthAmbulance });
  });

  if (admin === 0 && ambulance === 0) return null;

  return { admin, ambulance, calendarDays, byMonth };
}

/** Garante 2025 no filtro de ano mesmo sem cadastros nesse ano. */
export function statisticsBaselineYears(): string[] {
  return [String(STATISTICS_BASELINE_2025_JAN_AUG.year)];
}

export function addBaselineCalendarDaysToSet(days: Set<string>, filters: StatisticsBaselineFilters): void {
  const months = baselineMonthsInFilter(filters);
  const y = STATISTICS_BASELINE_2025_JAN_AUG.year;
  for (const month of months) {
    const dim = BASELINE_DAYS_PER_MONTH_2025[month - 1];
    for (let d = 1; d <= dim; d++) {
      days.add(`${y}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
}

export type MonthlyEvolutionBucketLike = {
  key: string;
  label: string;
  admin: number;
  ambulance: number;
  total: number;
  late: number;
  pctLate: number;
};

export function mergeMonthlyEvolutionWithBaseline<T extends MonthlyEvolutionBucketLike>(
  buckets: T[],
  byMonth: Map<string, { admin: number; ambulance: number }>,
): T[] {
  if (byMonth.size === 0) return buckets;
  const map = new Map(buckets.map((b) => [b.key, { ...b }]));
  for (const [key, inc] of byMonth) {
    const [y, m] = key.split("-");
    const cur =
      map.get(key) ??
      ({
        key,
        label: `${m}/${y}`,
        admin: 0,
        ambulance: 0,
        total: 0,
        late: 0,
        pctLate: 0,
      } as T);
    cur.admin += inc.admin;
    cur.ambulance += inc.ambulance;
    cur.total += inc.admin + inc.ambulance;
    cur.pctLate = cur.total > 0 ? Math.round((cur.late / cur.total) * 100) : 0;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}
