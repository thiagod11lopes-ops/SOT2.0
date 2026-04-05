import { Lock, Unlock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function monthInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthInput(value: string): { year: number; monthIndex: number } {
  const [y, m] = value.split("-").map(Number);
  return { year: y, monthIndex: (m || 1) - 1 };
}

type DayMeta = {
  day: number;
  date: Date;
  isWeekend: boolean;
};

function letraDiaSemana(date: Date): string {
  const nome = date.toLocaleDateString("pt-PT", { weekday: "long" });
  const first = nome.charAt(0);
  return first.toLocaleUpperCase("pt-PT");
}

function buildMonthDays(year: number, monthIndex: number): DayMeta[] {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const out: DayMeta[] = [];
  for (let day = 1; day <= last; day++) {
    const date = new Date(year, monthIndex, day);
    const wd = date.getDay();
    out.push({
      day,
      date,
      isWeekend: wd === 0 || wd === 6,
    });
  }
  return out;
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const KEY_MOTORISTA = "motorista";
const KEY_CARGA_HORARIA = "cargaHoraria";
const KEY_NUM_SERVICOS = "numServicos";
const KEY_NUM_ROTINAS = "numRotinas";

const COLUNAS_EXTRAS_EDICAO = [
  { key: KEY_CARGA_HORARIA, titulo: "Carga Horária" },
  { key: KEY_NUM_SERVICOS, titulo: "Nº de Serviços" },
  { key: KEY_NUM_ROTINAS, titulo: "Nº de Rotinas" },
] as const;

/** Contagem automática de carga horária quando o motorista contém RM1: cada S nos dias = 24h, cada RO = 8h. */
function isMotoristaRM1(motorista: string): boolean {
  return motorista.toUpperCase().includes("RM1");
}

/** Conta tokens «S» e «RO» nas células dos dias (mês atual); horas = 24×S + 8×RO. */
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

const LIMITE_CARGA_HORAS_ALERTA = 160;

function parseHorasCargaTexto(s: string): number | null {
  const m = s.trim().match(/[\d.,]+/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

type SheetSnapshot = {
  rows: string[];
  cells: Record<string, Record<string, string>>;
};

function cloneSheet(s: SheetSnapshot): SheetSnapshot {
  return { rows: [...s.rows], cells: structuredClone(s.cells) };
}

type RowContextMenu =
  | { x: number; y: number; kind: "row"; rowIndex: number }
  | { x: number; y: number; kind: "empty" };

/** Identificador de coluna para fundo cinza manual (mesmo tom dos fins de semana: neutral-200). */
type ColumnContextMenu = { x: number; y: number; columnKey: string };

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function DetalheServicoSheet() {
  const [monthYear, setMonthYear] = useState(() => monthInputValue(new Date()));
  const [sheet, setSheet] = useState<SheetSnapshot>(() => ({
    rows: [newRowId()],
    cells: {},
  }));
  const [, setUndoStack] = useState<SheetSnapshot[]>([]);
  const [menu, setMenu] = useState<RowContextMenu | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnContextMenu | null>(null);
  /** Chaves: `motorista`, data `YYYY-MM-DD`, ou chaves das colunas extra (cargaHoraria, …). */
  const [columnGray, setColumnGray] = useState<Record<string, boolean>>({});
  const [tableEditable, setTableEditable] = useState(false);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const tableEditableRef = useRef(tableEditable);
  tableEditableRef.current = tableEditable;
  const cellEditBeforeRef = useRef<SheetSnapshot | null>(null);
  const tableInputsRootRef = useRef<HTMLDivElement>(null);

  const { year, monthIndex } = useMemo(() => parseMonthInput(monthYear), [monthYear]);
  const days = useMemo(() => buildMonthDays(year, monthIndex), [year, monthIndex]);

  const closeMenu = useCallback(() => setMenu(null), []);
  const closeColumnMenu = useCallback(() => setColumnMenu(null), []);

  const toggleColumnGray = useCallback(
    (columnKey: string) => {
      setColumnGray((prev) => {
        const next = { ...prev };
        if (next[columnKey]) delete next[columnKey];
        else next[columnKey] = true;
        return next;
      });
      closeColumnMenu();
    },
    [closeColumnMenu],
  );

  const clearCellEditSnapshot = useCallback(() => {
    cellEditBeforeRef.current = null;
  }, []);

  const addRowAbove = useCallback(
    (index: number) => {
      clearCellEditSnapshot();
      const id = newRowId();
      setSheet((prev) => {
        setUndoStack((u) => [...u, cloneSheet(prev)]);
        const rows = [...prev.rows];
        rows.splice(index, 0, id);
        return { rows, cells: { ...prev.cells, [id]: {} } };
      });
      closeMenu();
    },
    [closeMenu, clearCellEditSnapshot],
  );

  const addRowBelow = useCallback(
    (index: number) => {
      clearCellEditSnapshot();
      const id = newRowId();
      setSheet((prev) => {
        setUndoStack((u) => [...u, cloneSheet(prev)]);
        const rows = [...prev.rows];
        rows.splice(index + 1, 0, id);
        return { rows, cells: { ...prev.cells, [id]: {} } };
      });
      closeMenu();
    },
    [closeMenu, clearCellEditSnapshot],
  );

  const deleteRow = useCallback(
    (index: number) => {
      clearCellEditSnapshot();
      setSheet((prev) => {
        if (prev.rows.length === 0) return prev;
        setUndoStack((u) => [...u, cloneSheet(prev)]);
        const rowId = prev.rows[index]!;
        const rows = prev.rows.filter((_, i) => i !== index);
        const { [rowId]: _removed, ...cells } = prev.cells;
        return { rows, cells };
      });
      closeMenu();
    },
    [closeMenu, clearCellEditSnapshot],
  );

  const addFirstRow = useCallback(() => {
    clearCellEditSnapshot();
    const id = newRowId();
    setSheet((prev) => {
      setUndoStack((u) => [...u, cloneSheet(prev)]);
      return { rows: [...prev.rows, id], cells: { ...prev.cells, [id]: {} } };
    });
    closeMenu();
  }, [closeMenu, clearCellEditSnapshot]);

  const undo = useCallback(() => {
    clearCellEditSnapshot();
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1]!;
      setSheet(previous);
      return stack.slice(0, -1);
    });
    setMenu(null);
  }, [clearCellEditSnapshot]);

  const setCellValue = useCallback((rowId: string, key: string, value: string) => {
    setSheet((prev) => ({
      ...prev,
      cells: {
        ...prev.cells,
        [rowId]: { ...(prev.cells[rowId] ?? {}), [key]: value },
      },
    }));
  }, []);

  const onCellFocus = useCallback(() => {
    cellEditBeforeRef.current = cloneSheet(sheetRef.current);
  }, []);

  const onCellBlur = useCallback((rowId: string, key: string, value: string) => {
    const before = cellEditBeforeRef.current;
    cellEditBeforeRef.current = null;
    if (!before) return;
    const prevVal = before.cells[rowId]?.[key] ?? "";
    if (prevVal === value) return;
    setUndoStack((u) => [...u, before]);
  }, []);

  /** colIndex 0 = Motorista; 1..days.length = dias; se edição ativa: +1,+2,+3 = carga horária, nº serviços, nº rotinas */
  const focusSheetCell = useCallback((rowIndex: number, colIndex: number) => {
    requestAnimationFrame(() => {
      const root = tableInputsRootRef.current;
      if (!root) return;
      const el = root.querySelector<HTMLInputElement>(
        `input[data-det-sheet-row="${rowIndex}"][data-det-sheet-col="${colIndex}"]`,
      );
      el?.focus();
    });
  }, []);

  const onSheetCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const maxCol = tableEditableRef.current ? days.length + 3 : days.length;
      const maxRow = sheetRef.current.rows.length - 1;
      let nextR = rowIndex;
      let nextC = colIndex;
      switch (e.key) {
        case "ArrowRight":
          if (colIndex >= maxCol) return;
          e.preventDefault();
          nextC = colIndex + 1;
          break;
        case "ArrowLeft":
          if (colIndex <= 0) return;
          e.preventDefault();
          nextC = colIndex - 1;
          break;
        case "ArrowDown":
          if (rowIndex >= maxRow) return;
          e.preventDefault();
          nextR = rowIndex + 1;
          break;
        case "ArrowUp":
          if (rowIndex <= 0) return;
          e.preventDefault();
          nextR = rowIndex - 1;
          break;
        default:
          return;
      }
      focusSheetCell(nextR, nextC);
    },
    [days.length, focusSheetCell],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key !== "z" && e.key !== "Z") return;
      if (e.shiftKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  useEffect(() => {
    if (!menu && !columnMenu) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      const rowEl = document.getElementById("detalhe-servico-row-menu");
      const colEl = document.getElementById("detalhe-servico-column-menu");
      if (rowEl?.contains(t) || colEl?.contains(t)) return;
      closeMenu();
      closeColumnMenu();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeMenu();
        closeColumnMenu();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [menu, columnMenu, closeMenu, closeColumnMenu]);

  function openRowMenu(e: React.MouseEvent, rowIndex: number) {
    e.preventDefault();
    setColumnMenu(null);
    setMenu({ x: e.clientX, y: e.clientY, kind: "row", rowIndex });
  }

  function openEmptyMenu(e: React.MouseEvent) {
    e.preventDefault();
    setColumnMenu(null);
    setMenu({ x: e.clientX, y: e.clientY, kind: "empty" });
  }

  function openColumnMenu(e: React.MouseEvent, columnKey: string) {
    e.preventDefault();
    e.stopPropagation();
    setMenu(null);
    setColumnMenu({ x: e.clientX, y: e.clientY, columnKey });
  }

  const menuPosition = menu
    ? {
        left: Math.min(menu.x, typeof window !== "undefined" ? window.innerWidth - 200 : menu.x),
        top: Math.min(menu.y, typeof window !== "undefined" ? window.innerHeight - 120 : menu.y),
      }
    : null;

  const columnMenuPosition = columnMenu
    ? {
        left: Math.min(
          columnMenu.x,
          typeof window !== "undefined" ? window.innerWidth - 220 : columnMenu.x,
        ),
        top: Math.min(
          columnMenu.y,
          typeof window !== "undefined" ? window.innerHeight - 80 : columnMenu.y,
        ),
      }
    : null;

  const inputClass =
    "box-border w-full min-w-0 max-w-full bg-transparent px-0 py-px text-[inherit] leading-tight outline-none ring-0 placeholder:text-[hsl(var(--muted-foreground))] focus:ring-0";

  const inputClassDay = `${inputClass} text-center`;
  const inputLockedClass = "cursor-default";

  const { rows, cells } = sheet;

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="detalhe-servico-mes-ano">
            Mês e ano
          </label>
          <input
            id="detalhe-servico-mes-ano"
            type="month"
            value={monthYear}
            onChange={(e) => setMonthYear(e.target.value)}
            className="h-10 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          />
        </div>
      </div>

      <div className="w-full min-w-0 pb-1">
        <div className="h-fit w-full max-w-none border border-neutral-300/90 bg-white p-[0.75em] shadow-[0_2px_12px_rgba(0,0,0,0.1)] sm:p-[1em]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--border))]/70 pb-2">
            <span className="text-sm font-medium text-[hsl(var(--foreground))]" id="detalhe-servico-edicao-label">
              {tableEditable ? "Edição ativa" : "Edição bloqueada"}
            </span>
            <div className="flex items-center gap-2">
              {tableEditable ? (
                <Unlock className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
              ) : (
                <Lock className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
              )}
              <button
                type="button"
                id="detalhe-servico-edicao-toggle"
                role="switch"
                aria-checked={tableEditable}
                aria-labelledby="detalhe-servico-edicao-label"
                className={`relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full border px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 ${
                  tableEditable
                    ? "border-emerald-600/45 bg-emerald-500/20"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                }`}
                onClick={() => setTableEditable((v) => !v)}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    tableEditable ? "translate-x-[1.125rem]" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
          <div ref={tableInputsRootRef} className="w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-0 border-collapse text-left text-[11px] leading-tight sm:text-xs">
              <thead>
                <tr>
                  <th
                    scope="col"
                    onContextMenu={(e) => openColumnMenu(e, KEY_MOTORISTA)}
                    className={`sticky left-0 z-[2] min-w-[6rem] cursor-context-menu whitespace-nowrap border border-[hsl(var(--border))] px-[0.5em] py-[0.2em] text-left align-middle font-semibold text-[hsl(var(--foreground))] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] ${
                      columnGray[KEY_MOTORISTA] ? "bg-neutral-200" : "bg-white"
                    }`}
                  >
                    Motorista
                  </th>
                  {days.map(({ day, date, isWeekend }) => {
                    const dkHead = dateKey(year, monthIndex, day);
                    const headDayGray = columnGray[dkHead] || isWeekend;
                    return (
                    <th
                      key={day}
                      scope="col"
                      onContextMenu={(e) => openColumnMenu(e, dkHead)}
                      className={`cursor-context-menu border border-[hsl(var(--border))] px-[0.35em] py-[0.2em] text-center align-middle font-medium ${
                        headDayGray ? "bg-neutral-200 text-[hsl(var(--foreground))]" : "bg-white"
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
                  {tableEditable &&
                    COLUNAS_EXTRAS_EDICAO.map(({ key, titulo }) => (
                      <th
                        key={key}
                        scope="col"
                        onContextMenu={(e) => openColumnMenu(e, key)}
                        title={
                          key === KEY_CARGA_HORARIA
                            ? "Com «RM1» no motorista: total = 24h por «S» e 8h por «RO» nas células dos dias (mês atual)."
                            : key === KEY_NUM_SERVICOS
                              ? "Contagem automática de «S» nas células dos dias (mês atual)."
                              : key === KEY_NUM_ROTINAS
                                ? "Contagem automática de «RO» nas células dos dias (mês atual)."
                                : undefined
                        }
                        className={`min-w-[4.5rem] max-w-[6rem] cursor-context-menu whitespace-normal border border-[hsl(var(--border))] px-[0.35em] py-[0.2em] text-center align-middle text-[10px] font-semibold leading-tight text-[hsl(var(--foreground))] sm:text-[11px] ${
                          columnGray[key] ? "bg-neutral-200" : "bg-[hsl(var(--muted)/0.25)]"
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
                      colSpan={days.length + 1 + (tableEditable ? COLUNAS_EXTRAS_EDICAO.length : 0)}
                      className="cursor-default border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.06)] px-[0.5em] py-[0.35em] text-center text-[hsl(var(--muted-foreground))]"
                      onContextMenu={openEmptyMenu}
                    >
                      Sem linhas — botão direito para adicionar
                    </td>
                  </tr>
                ) : (
                  rows.map((rowId, rowIndex) => (
                    <tr key={rowId} onContextMenu={(e) => openRowMenu(e, rowIndex)}>
                      <td
                        className={`sticky left-0 z-[1] min-w-[6rem] max-w-[14rem] border border-[hsl(var(--border))] px-[0.35em] py-[0.15em] align-middle shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] ${
                          !tableEditable
                            ? columnGray[KEY_MOTORISTA]
                              ? "bg-neutral-300/80"
                              : "bg-[hsl(var(--muted)/0.12)]"
                            : columnGray[KEY_MOTORISTA]
                              ? "bg-neutral-200"
                              : "bg-white"
                        }`}
                      >
                        <input
                          type="text"
                          name={`motorista-${rowId}`}
                          autoComplete="off"
                          placeholder="—"
                          readOnly={!tableEditable}
                          className={`${inputClass} ${!tableEditable ? inputLockedClass : ""}`}
                          data-det-sheet-row={rowIndex}
                          data-det-sheet-col={0}
                          value={cells[rowId]?.[KEY_MOTORISTA] ?? ""}
                          onChange={(e) => setCellValue(rowId, KEY_MOTORISTA, e.target.value)}
                          onFocus={onCellFocus}
                          onBlur={(e) => onCellBlur(rowId, KEY_MOTORISTA, e.target.value)}
                          onKeyDown={(e) => onSheetCellKeyDown(e, rowIndex, 0)}
                        />
                      </td>
                      {days.map(({ day, isWeekend }, dayColIndex) => {
                        const dk = dateKey(year, monthIndex, day);
                        const colIndex = dayColIndex + 1;
                        const dayColGray = columnGray[dk] || isWeekend;
                        return (
                          <td
                            key={dk}
                            className={`min-w-[2rem] max-w-[4.5rem] border border-[hsl(var(--border))] px-[0.25em] py-[0.15em] text-center align-middle ${
                              !tableEditable
                                ? columnGray[dk] || isWeekend
                                  ? "bg-neutral-300/80"
                                  : "bg-[hsl(var(--muted)/0.12)]"
                                : dayColGray
                                  ? "bg-neutral-200"
                                  : "bg-white"
                            }`}
                          >
                            <input
                              type="text"
                              name={`dia-${rowId}-${dk}`}
                              autoComplete="off"
                              readOnly={!tableEditable}
                              className={`${inputClassDay} ${!tableEditable ? inputLockedClass : ""}`}
                              data-det-sheet-row={rowIndex}
                              data-det-sheet-col={colIndex}
                              value={cells[rowId]?.[dk] ?? ""}
                              onChange={(e) => setCellValue(rowId, dk, e.target.value)}
                              onFocus={onCellFocus}
                              onBlur={(e) => onCellBlur(rowId, dk, e.target.value)}
                              onKeyDown={(e) => onSheetCellKeyDown(e, rowIndex, colIndex)}
                            />
                          </td>
                        );
                      })}
                      {tableEditable &&
                        COLUNAS_EXTRAS_EDICAO.map(({ key: cellKey }, extraIdx) => {
                          const colIndex = days.length + 1 + extraIdx;
                          const motoristaVal = cells[rowId]?.[KEY_MOTORISTA] ?? "";
                          const rm1 = isMotoristaRM1(motoristaVal);
                          const tally = tallyDayCellTokens(
                            cells[rowId] ?? {},
                            year,
                            monthIndex,
                            days,
                          );
                          const cargaReadOnly = cellKey === KEY_CARGA_HORARIA && rm1;
                          const servRotReadOnly =
                            cellKey === KEY_NUM_SERVICOS || cellKey === KEY_NUM_ROTINAS;
                          const autoReadOnly = cargaReadOnly || servRotReadOnly;
                          let displayValue = cells[rowId]?.[cellKey] ?? "";
                          if (cellKey === KEY_CARGA_HORARIA && rm1) {
                            displayValue = String(tally.horas);
                          } else if (cellKey === KEY_NUM_SERVICOS) {
                            displayValue = String(tally.s);
                          } else if (cellKey === KEY_NUM_ROTINAS) {
                            displayValue = String(tally.ro);
                          }
                          const inputReadOnly = !tableEditable || autoReadOnly;
                          const horasCargaNum =
                            cellKey === KEY_CARGA_HORARIA
                              ? rm1
                                ? tally.horas
                                : parseHorasCargaTexto(cells[rowId]?.[KEY_CARGA_HORARIA] ?? "")
                              : null;
                          const cargaExcedeLimite =
                            cellKey === KEY_CARGA_HORARIA &&
                            horasCargaNum !== null &&
                            horasCargaNum > LIMITE_CARGA_HORAS_ALERTA;
                          const titleAuto =
                            cellKey === KEY_CARGA_HORARIA && rm1
                              ? `Calculado: 24h × «S» + 8h × «RO» (células dos dias)${cargaExcedeLimite ? ` — acima de ${LIMITE_CARGA_HORAS_ALERTA}h` : ""}`
                              : cellKey === KEY_CARGA_HORARIA && !rm1 && cargaExcedeLimite
                                ? `Valor acima de ${LIMITE_CARGA_HORAS_ALERTA} horas`
                                : cellKey === KEY_NUM_SERVICOS
                                  ? "Contagem de «S» nas células dos dias"
                                  : cellKey === KEY_NUM_ROTINAS
                                    ? "Contagem de «RO» nas células dos dias"
                                    : undefined;
                          return (
                            <td
                              key={cellKey}
                              className={`min-w-[4rem] max-w-[6rem] border px-[0.3em] py-[0.15em] text-center align-middle ${
                                cargaExcedeLimite
                                  ? "border-red-400/80 bg-red-100 dark:border-red-800/80 dark:bg-red-950/45"
                                  : columnGray[cellKey]
                                    ? "border-[hsl(var(--border))] bg-neutral-200 dark:bg-neutral-700/35"
                                    : autoReadOnly
                                      ? "border-[hsl(var(--border))] bg-emerald-50/90 dark:bg-emerald-950/25"
                                      : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.18)]"
                              }`}
                            >
                              <input
                                type="text"
                                name={`extra-${rowId}-${cellKey}`}
                                autoComplete="off"
                                readOnly={inputReadOnly}
                                title={titleAuto}
                                className={`${inputClassDay} ${inputReadOnly ? inputLockedClass : ""} ${
                                  cargaExcedeLimite ? "text-red-900 dark:text-red-100" : ""
                                }`}
                                data-det-sheet-row={rowIndex}
                                data-det-sheet-col={colIndex}
                                value={displayValue}
                                onChange={
                                  autoReadOnly
                                    ? () => {}
                                    : (e) => setCellValue(rowId, cellKey, e.target.value)
                                }
                                onFocus={onCellFocus}
                                onBlur={(e) => {
                                  if (autoReadOnly) return;
                                  onCellBlur(rowId, cellKey, e.target.value);
                                }}
                                onKeyDown={(e) => onSheetCellKeyDown(e, rowIndex, colIndex)}
                              />
                            </td>
                          );
                        })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {menu &&
        menuPosition &&
        createPortal(
          <div
            id="detalhe-servico-row-menu"
            role="menu"
            className="fixed z-[200] min-w-[11rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1 text-sm text-[hsl(var(--foreground))] shadow-lg"
            style={{ left: menuPosition.left, top: menuPosition.top }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {menu.kind === "empty" ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))]"
                onClick={() => addFirstRow()}
              >
                Adicionar linha
              </button>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))]"
                  onClick={() => addRowAbove(menu.rowIndex)}
                >
                  Adicionar linha acima
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))]"
                  onClick={() => addRowBelow(menu.rowIndex)}
                >
                  Adicionar linha abaixo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-red-700 hover:bg-red-50"
                  onClick={() => deleteRow(menu.rowIndex)}
                >
                  Excluir linha
                </button>
              </>
            )}
          </div>,
          document.body,
        )}

      {columnMenu &&
        columnMenuPosition &&
        createPortal(
          <div
            id="detalhe-servico-column-menu"
            role="menu"
            className="fixed z-[200] min-w-[11rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1 text-sm text-[hsl(var(--foreground))] shadow-lg"
            style={{ left: columnMenuPosition.left, top: columnMenuPosition.top }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))]"
              onClick={() => toggleColumnGray(columnMenu.columnKey)}
            >
              {columnGray[columnMenu.columnKey]
                ? "Remover cinza da coluna"
                : "Deixar coluna cinza"}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
