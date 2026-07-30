import type { DetalheServicoFeriasPeriodo } from "./detalheServicoBundle";

/** Opções de ausência na Programação de Ausência (Detalhe de Serviço). */
export const DETALHE_SERVICO_AUSENCIA_TIPOS = [
  "Férias",
  "Curso",
  "Luto",
  "LTS",
  "Paternidade",
  "Maternidade",
  "Núpcias",
  "Movimentação",
  "LTSPF",
  "LTSP",
  "LLTIP",
  "Trânsito",
  "Instalação",
] as const;

export type DetalheServicoAusenciaTipo = (typeof DETALHE_SERVICO_AUSENCIA_TIPOS)[number];

export const DETALHE_SERVICO_AUSENCIA_TIPO_DEFAULT: DetalheServicoAusenciaTipo = "Férias";

function foldAusenciaKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Resolve o tipo gravado (inclui dados antigos sem `tipo` e aliases). */
export function resolveAusenciaTipo(raw: unknown): DetalheServicoAusenciaTipo {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return DETALHE_SERVICO_AUSENCIA_TIPO_DEFAULT;
  const fold = foldAusenciaKey(t);
  const aliases: Record<string, DetalheServicoAusenciaTipo> = {
    nupciais: "Núpcias",
    nupcias: "Núpcias",
    lltip: "LLTIP",
    ltip: "LLTIP",
    ferias: "Férias",
    luto: "Luto",
    curso: "Curso",
    lts: "LTS",
    paternidade: "Paternidade",
    maternidade: "Maternidade",
    movimentacao: "Movimentação",
    ltspf: "LTSPF",
    ltsp: "LTSP",
    transito: "Trânsito",
    instalacao: "Instalação",
  };
  if (aliases[fold]) return aliases[fold];
  const found = DETALHE_SERVICO_AUSENCIA_TIPOS.find((x) => foldAusenciaKey(x) === fold);
  return found ?? DETALHE_SERVICO_AUSENCIA_TIPO_DEFAULT;
}

/** Rótulo na grelha / PDF (ex.: «FÉRIAS», «CURSO»). */
export function ausenciaLabelForCell(tipo: unknown): string {
  return resolveAusenciaTipo(tipo).toLocaleUpperCase("pt-BR");
}

function parseIsoDateLocal(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Primeiro período que cobre o dia (ordem do array). */
export function findAusenciaPeriodForDay(
  year: number,
  monthIndex: number,
  day: number,
  periods: DetalheServicoFeriasPeriodo[] | undefined,
): DetalheServicoFeriasPeriodo | undefined {
  if (!periods?.length) return undefined;
  const t = new Date(year, monthIndex, day);
  t.setHours(0, 0, 0, 0);
  for (const p of periods) {
    const a = parseIsoDateLocal(p.inicio);
    const b = parseIsoDateLocal(p.fim);
    if (!a || !b) continue;
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    const lo = a <= b ? a : b;
    const hi = a <= b ? b : a;
    if (t >= lo && t <= hi) return p;
  }
  return undefined;
}

export function isDayInAusenciaPeriods(
  year: number,
  monthIndex: number,
  day: number,
  periods: DetalheServicoFeriasPeriodo[] | undefined,
): boolean {
  return Boolean(findAusenciaPeriodForDay(year, monthIndex, day, periods));
}

/**
 * Extensão contígua do mesmo tipo de ausência (para fundo cinza mesclado + rótulo no meio).
 */
export function getAusenciaRunForDay(
  year: number,
  monthIndex: number,
  day: number,
  lastCalendarDay: number,
  periods: DetalheServicoFeriasPeriodo[] | undefined,
): {
  isAusencia: boolean;
  tipo: DetalheServicoAusenciaTipo;
  label: string;
  start: number;
  end: number;
  isLabelDay: boolean;
  hasPrev: boolean;
  hasNext: boolean;
} | null {
  const cur = findAusenciaPeriodForDay(year, monthIndex, day, periods);
  if (!cur) return null;
  const tipo = resolveAusenciaTipo(cur.tipo);
  let start = day;
  let end = day;
  while (start > 1) {
    const prev = findAusenciaPeriodForDay(year, monthIndex, start - 1, periods);
    if (!prev || resolveAusenciaTipo(prev.tipo) !== tipo) break;
    start -= 1;
  }
  while (end < lastCalendarDay) {
    const next = findAusenciaPeriodForDay(year, monthIndex, end + 1, periods);
    if (!next || resolveAusenciaTipo(next.tipo) !== tipo) break;
    end += 1;
  }
  const middle = Math.floor((start + end) / 2);
  return {
    isAusencia: true,
    tipo,
    label: ausenciaLabelForCell(tipo),
    start,
    end,
    isLabelDay: day === middle,
    hasPrev: day > start,
    hasNext: day < end,
  };
}
