import type {
  DetalheServicoRodapeAssinatura,
  DetalheServicoSheetSnapshot,
} from "../lib/generateDetalheServicoMotoristaPdf";

const KEY_MOTORISTA = "motorista";
const KEY_CARGA_HORARIA = "cargaHoraria";
const KEY_NUM_SERVICOS = "numServicos";
const KEY_NUM_ROTINAS = "numRotinas";

const COLUNAS_EXTRAS = [
  { key: KEY_CARGA_HORARIA, titulo: "Carga Horária" },
  { key: KEY_NUM_SERVICOS, titulo: "Nº de Serviços" },
  { key: KEY_NUM_ROTINAS, titulo: "Nº de Rotinas" },
] as const;

type DayMeta = { day: number; date: Date; isWeekend: boolean };

function parseMonthInput(value: string): { year: number; monthIndex: number } {
  const [y, m] = value.split("-").map(Number);
  return { year: y, monthIndex: (m || 1) - 1 };
}

function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildMonthDays(year: number, monthIndex: number): DayMeta[] {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const out: DayMeta[] = [];
  for (let day = 1; day <= last; day++) {
    const date = new Date(year, monthIndex, day);
    const wd = date.getDay();
    out.push({ day, date, isWeekend: wd === 0 || wd === 6 });
  }
  return out;
}

function letraDiaSemana(date: Date): string {
  const nome = date.toLocaleDateString("pt-PT", { weekday: "long" });
  return nome.charAt(0).toLocaleUpperCase("pt-PT");
}

function isMotoristaRM1(motorista: string): boolean {
  return motorista.toUpperCase().includes("RM1");
}

function tallyDayCellTokens(
  rowCells: Record<string, string>,
  year: number,
  monthIndex: number,
  days: DayMeta[],
): { s: number; ro: number; horas: number } {
  let s = 0;
  let ro = 0;
  for (const { day } of days) {
    const dk = dateKey(year, monthIndex, day);
    const raw = (rowCells[dk] ?? "").trim();
    if (!raw) continue;
    const tokens = raw
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    for (const t of tokens) {
      if (t === "RO") ro += 1;
      else if (t === "S") s += 1;
    }
  }
  return { s, ro, horas: s * 24 + ro * 8 };
}

function parseHorasCargaTexto(s: string): number | null {
  const m = s.trim().match(/[\d.,]+/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const LIMITE_CARGA_HORAS_ALERTA = 160;

function normalizeSheet(loaded: DetalheServicoSheetSnapshot | null | undefined): DetalheServicoSheetSnapshot {
  if (!loaded || !Array.isArray(loaded.rows)) {
    return { rows: [], cells: {} };
  }
  return { rows: [...loaded.rows], cells: structuredClone(loaded.cells ?? {}) };
}

function formatMonthTitlePt(monthKey: string): string {
  const { year, monthIndex } = parseMonthInput(monthKey);
  const s = new Date(year, monthIndex, 1).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toLocaleUpperCase("pt-PT") + s.slice(1);
}

function rodapeHasContent(r: DetalheServicoRodapeAssinatura): boolean {
  return (
    r.nome.trim().length > 0 ||
    r.postoGraduacao.trim().length > 0 ||
    r.funcao.trim().length > 0
  );
}

type Props = {
  monthKey: string;
  sheet: DetalheServicoSheetSnapshot;
  columnGray: Record<string, boolean>;
  rodape: DetalheServicoRodapeAssinatura;
};

/** Tabela principal do Detalhe de Serviço (só leitura), alinhada à grelha do sistema principal. */
export function DetalheServicoReadonlyTable({ monthKey, sheet: rawSheet, columnGray, rodape }: Props) {
  const sheet = normalizeSheet(rawSheet);
  const { year, monthIndex } = parseMonthInput(monthKey);
  const days = buildMonthDays(year, monthIndex);
  const rows = sheet.rows;

  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-semibold text-[hsl(var(--foreground))]">{formatMonthTitlePt(monthKey)}</p>
      <div className="w-full min-w-0 touch-pan-x touch-pan-y overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
        <table className="w-max min-w-full border-collapse text-left text-[10px] leading-tight sm:text-[11px]">
          <thead>
            <tr>
              <th
                scope="col"
                className={`sticky left-0 z-[1] min-w-[5.5rem] whitespace-nowrap border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-[0.4em] py-[0.25em] text-left font-semibold shadow-[2px_0_6px_-2px_rgba(0,0,0,0.1)] ${
                  columnGray[KEY_MOTORISTA] ? "bg-neutral-200" : ""
                }`}
              >
                Motorista
              </th>
              {days.map(({ day, date, isWeekend }) => {
                const dkHead = dateKey(year, monthIndex, day);
                const headDayGray = columnGray[dkHead] || isWeekend;
                return (
                  <th
                    key={dkHead}
                    scope="col"
                    className={`border border-[hsl(var(--border))] px-[0.3em] py-[0.2em] text-center font-medium ${
                      headDayGray ? "bg-neutral-200" : "bg-[hsl(var(--card))]"
                    }`}
                    title={date.toLocaleDateString("pt-PT", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  >
                    <div className="flex flex-col items-center gap-px leading-none">
                      <span className="text-[0.85em] font-semibold">{letraDiaSemana(date)}</span>
                      <span className="tabular-nums">{day}</span>
                    </div>
                  </th>
                );
              })}
              {COLUNAS_EXTRAS.map(({ key, titulo }) => (
                <th
                  key={key}
                  scope="col"
                  className={`min-w-[3.75rem] max-w-[5rem] whitespace-normal border border-[hsl(var(--border))] px-[0.3em] py-[0.2em] text-center text-[9px] font-semibold leading-tight sm:text-[10px] ${
                    columnGray[key] ? "bg-neutral-200" : "bg-[hsl(var(--muted)/0.2)]"
                  }`}
                >
                  {titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={days.length + 1 + COLUNAS_EXTRAS.length}
                  className="border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.08)] px-2 py-4 text-center text-[hsl(var(--muted-foreground))]"
                >
                  Sem linhas neste mês.
                </td>
              </tr>
            ) : (
              rows.map((rowId) => {
                const cells = sheet.cells[rowId] ?? {};
                const motoristaVal = cells[KEY_MOTORISTA] ?? "";
                const rm1 = isMotoristaRM1(motoristaVal);
                const tally = tallyDayCellTokens(cells, year, monthIndex, days);
                return (
                  <tr key={rowId}>
                    <td
                      className={`sticky left-0 z-[1] min-w-[5.5rem] max-w-[12rem] border border-[hsl(var(--border))] px-[0.35em] py-[0.2em] align-middle text-[hsl(var(--foreground))] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] ${
                        columnGray[KEY_MOTORISTA] ? "bg-neutral-300/80" : "bg-[hsl(var(--muted)/0.1)]"
                      }`}
                    >
                      {motoristaVal.trim() || "—"}
                    </td>
                    {days.map(({ day, isWeekend }) => {
                      const dk = dateKey(year, monthIndex, day);
                      const dayColGray = columnGray[dk] || isWeekend;
                      const raw = cells[dk] ?? "";
                      return (
                        <td
                          key={dk}
                          className={`min-w-[2rem] max-w-[4rem] border border-[hsl(var(--border))] px-[0.25em] py-[0.15em] text-center align-middle tabular-nums ${
                            dayColGray ? "bg-neutral-300/70" : "bg-[hsl(var(--muted)/0.08)]"
                          }`}
                        >
                          {raw.trim() || "—"}
                        </td>
                      );
                    })}
                    {COLUNAS_EXTRAS.map(({ key: cellKey }) => {
                      let display = cells[cellKey] ?? "";
                      if (cellKey === KEY_CARGA_HORARIA && rm1) {
                        display = String(tally.horas);
                      } else if (cellKey === KEY_NUM_SERVICOS) {
                        display = String(tally.s);
                      } else if (cellKey === KEY_NUM_ROTINAS) {
                        display = String(tally.ro);
                      }
                      const cargaReadOnly = cellKey === KEY_CARGA_HORARIA && rm1;
                      const horasCargaNum =
                        cellKey === KEY_CARGA_HORARIA
                          ? rm1
                            ? tally.horas
                            : parseHorasCargaTexto(cells[KEY_CARGA_HORARIA] ?? "")
                          : null;
                      const cargaExcede =
                        cellKey === KEY_CARGA_HORARIA &&
                        horasCargaNum !== null &&
                        horasCargaNum > LIMITE_CARGA_HORAS_ALERTA;
                      return (
                        <td
                          key={cellKey}
                          className={`min-w-[3.25rem] border px-[0.25em] py-[0.15em] text-center align-middle ${
                            cargaExcede
                              ? "border-red-400/80 bg-red-100/90 dark:bg-red-950/40"
                              : columnGray[cellKey]
                                ? "border-[hsl(var(--border))] bg-neutral-200"
                                : cargaReadOnly || cellKey === KEY_NUM_SERVICOS || cellKey === KEY_NUM_ROTINAS
                                  ? "border-[hsl(var(--border))] bg-emerald-50/80 dark:bg-emerald-950/20"
                                  : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)]"
                          }`}
                        >
                          <span
                            className={
                              cargaExcede ? "font-medium text-red-900 dark:text-red-100" : undefined
                            }
                          >
                            {display || (cargaReadOnly || cellKey === KEY_NUM_SERVICOS || cellKey === KEY_NUM_ROTINAS ? "0" : "—")}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {rodapeHasContent(rodape) ? (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.06)] px-3 py-2 text-xs text-[hsl(var(--foreground))]">
          <p className="font-semibold text-[hsl(var(--muted-foreground))]">Assinatura / identificação</p>
          <p className="mt-1">
            <span className="text-[hsl(var(--muted-foreground))]">Nome: </span>
            {rodape.nome.trim() || "—"}
          </p>
          <p>
            <span className="text-[hsl(var(--muted-foreground))]">Posto / graduação: </span>
            {rodape.postoGraduacao.trim() || "—"}
          </p>
          <p>
            <span className="text-[hsl(var(--muted-foreground))]">Função: </span>
            {rodape.funcao.trim() || "—"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
