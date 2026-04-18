import { FileDown, Lock, Unlock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useCatalogItems } from "../context/catalog-items-context";
import { useSyncPreference } from "../context/sync-preference-context";
import {
  loadDetalheServicoBundleFromIdb,
  saveDetalheServicoBundleToIdb,
  normalizeDetalheServicoBundle,
  emptyRodapeAssinatura,
  emptyDetalheServicoBundle,
  type DetalheServicoBundle,
} from "../lib/detalheServicoBundle";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import {
  downloadDetalheServicoMotoristaPdf,
  type DetalheServicoRodapeAssinatura,
  type DetalheServicoSheetSnapshot,
} from "../lib/generateDetalheServicoMotoristaPdf";
import { Button } from "./ui/button";

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

function cloneSheet(s: DetalheServicoSheetSnapshot): DetalheServicoSheetSnapshot {
  return { rows: [...s.rows], cells: structuredClone(s.cells) };
}

/** Mês civil anterior ao indicado por `YYYY-MM`. */
function getPreviousMonthKey(monthYear: string): string {
  const { year, monthIndex } = parseMonthInput(monthYear);
  const d = new Date(year, monthIndex - 1, 1);
  return monthInputValue(d);
}

function formatMonthYearTitlePt(monthKey: string): string {
  const { year, monthIndex } = parseMonthInput(monthKey);
  const s = new Date(year, monthIndex, 1).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toLocaleUpperCase("pt-PT") + s.slice(1);
}

/** True se a célula tiver «S» ou «RO» (mesma regra da grelha principal). */
function cellContainsWorkToken(raw: string): boolean {
  const tokens = raw
    .trim()
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  return tokens.some((t) => t === "S" || t === "RO");
}

function normalizeLoadedSheet(loaded: DetalheServicoSheetSnapshot | null): DetalheServicoSheetSnapshot {
  if (!loaded || !Array.isArray(loaded.rows)) {
    return { rows: [newRowId()], cells: {} };
  }
  if (loaded.rows.length === 0) {
    return { rows: [newRowId()], cells: {} };
  }
  return { rows: loaded.rows, cells: loaded.cells ?? {} };
}

/** Números dos dias em que esta linha não tem «S» nem «RO» (ordem cronológica). */
function listDiasSemMarcacaoSingleRow(
  snapshot: DetalheServicoSheetSnapshot,
  rowId: string,
  prevYear: number,
  prevMonthIndex: number,
  prevDays: DayMeta[],
): number[] {
  const out: number[] = [];
  for (const { day } of prevDays) {
    const dk = dateKey(prevYear, prevMonthIndex, day);
    const raw = snapshot.cells[rowId]?.[dk] ?? "";
    if (!cellContainsWorkToken(raw)) out.push(day);
  }
  return out;
}

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

/** Opções do select: catálogo da aba Motoristas + valor atual se ainda não estiver na lista. */
function buildMotoristaSelectOptions(catalog: string[], current: string): string[] {
  const list = [...catalog];
  const m = current.trim();
  if (m && !list.some((x) => x.toLowerCase() === m.toLowerCase())) {
    list.unshift(m);
  }
  return list;
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

type RowContextMenu =
  | { x: number; y: number; kind: "row"; rowIndex: number }
  | { x: number; y: number; kind: "empty" }
  | { x: number; y: number; kind: "dias-nao-row"; rowIndex: number }
  | { x: number; y: number; kind: "dias-nao-empty" };

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
  const { items: catalogItems } = useCatalogItems();
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(!useCloud);

  const [bundle, setBundle] = useState<DetalheServicoBundle>(emptyDetalheServicoBundle);
  const [idbReady, setIdbReady] = useState(false);
  const [monthYear, setMonthYear] = useState(() => monthInputValue(new Date()));
  const [, setUndoStack] = useState<DetalheServicoSheetSnapshot[]>([]);
  const [menu, setMenu] = useState<RowContextMenu | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnContextMenu | null>(null);
  const [tableEditable, setTableEditable] = useState(false);

  const monthYearRef = useRef(monthYear);
  monthYearRef.current = monthYear;

  const sheet = useMemo(
    () => normalizeLoadedSheet(bundle.sheets[monthYear] ?? null),
    [bundle, monthYear],
  );

  const rodapeAssinatura = useMemo(
    () => bundle.rodapes[monthYear] ?? emptyRodapeAssinatura(),
    [bundle, monthYear],
  );

  /** Chaves: `motorista`, data `YYYY-MM-DD`, ou chaves das colunas extra (cargaHoraria, …). */
  const columnGray = useMemo(
    () => bundle.columnGrayByMonth[monthYear] ?? {},
    [bundle, monthYear],
  );

  const rodapeAssinaturaRef = useRef(rodapeAssinatura);
  rodapeAssinaturaRef.current = rodapeAssinatura;

  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const tableEditableRef = useRef(tableEditable);
  tableEditableRef.current = tableEditable;
  const cellEditBeforeRef = useRef<DetalheServicoSheetSnapshot | null>(null);
  const tableInputsRootRef = useRef<HTMLDivElement>(null);

  const { year, monthIndex } = useMemo(() => parseMonthInput(monthYear), [monthYear]);
  const days = useMemo(() => buildMonthDays(year, monthIndex), [year, monthIndex]);

  const prevMonthKey = useMemo(() => getPreviousMonthKey(monthYear), [monthYear]);
  const prevMonthKeyRef = useRef(prevMonthKey);
  prevMonthKeyRef.current = prevMonthKey;
  const prevMonthParsed = useMemo(() => parseMonthInput(prevMonthKey), [prevMonthKey]);
  const prevDays = useMemo(
    () => buildMonthDays(prevMonthParsed.year, prevMonthParsed.monthIndex),
    [prevMonthParsed],
  );

  useEffect(() => {
    if (useCloud) {
      // Modo estrito Firebase: ignora hidratação inicial por cache local.
      setIdbReady(true);
      return;
    }
    void loadDetalheServicoBundleFromIdb().then((b) => {
      setBundle(b);
      setIdbReady(true);
      hydratedRef.current = true;
    });
  }, [useCloud]);

  const prevMonthSheet = useMemo(() => {
    const raw = bundle.sheets[prevMonthKey];
    if (!raw) return null;
    if (raw.rows.length === 0) {
      return { rows: [] as string[], cells: raw.cells ?? {} };
    }
    return { rows: [...raw.rows], cells: structuredClone(raw.cells) };
  }, [bundle, prevMonthKey]);

  useEffect(() => {
    if (!useCloud || !idbReady) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.detalheServico,
          (payload) => {
            void (async () => {
              if (payload === null) {
                // Firebase como fonte da verdade: não promover local->nuvem no bootstrap.
                return;
              }
              applyingRemoteRef.current = true;
              const next = normalizeDetalheServicoBundle(payload);
              setBundle(next);
              void saveDetalheServicoBundleToIdb(next);
            })();
          },
          (err) => console.error("[SOT] Firestore detalhe serviço:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (detalhe serviço):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, idbReady]);

  useEffect(() => {
    if (!idbReady) return;
    void saveDetalheServicoBundleToIdb(bundle);
  }, [bundle, idbReady]);

  useEffect(() => {
    if (!useCloud || !hydratedRef.current || !idbReady) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void setSotStateDoc(SOT_STATE_DOC.detalheServico, bundle).catch((e) => {
        console.error("[SOT] Gravar detalhe serviço na nuvem:", e);
      });
    }, 450);
    return () => window.clearTimeout(t);
  }, [bundle, useCloud, idbReady]);

  const setSheet = useCallback((action: SetStateAction<DetalheServicoSheetSnapshot>) => {
    setBundle((b) => {
      const mk = monthYearRef.current;
      const prevSheet = normalizeLoadedSheet(b.sheets[mk] ?? null);
      const next =
        typeof action === "function"
          ? (action as (p: DetalheServicoSheetSnapshot) => DetalheServicoSheetSnapshot)(prevSheet)
          : action;
      return { ...b, version: 1, sheets: { ...b.sheets, [mk]: next } };
    });
  }, []);

  const setRodapeAssinatura = useCallback(
    (action: SetStateAction<DetalheServicoRodapeAssinatura>) => {
      setBundle((b) => {
        const mk = monthYearRef.current;
        const prev = b.rodapes[mk] ?? emptyRodapeAssinatura();
        const next =
          typeof action === "function"
            ? (action as (p: DetalheServicoRodapeAssinatura) => DetalheServicoRodapeAssinatura)(prev)
            : action;
        return { ...b, version: 1, rodapes: { ...b.rodapes, [mk]: next } };
      });
    },
    [],
  );

  const setColumnGray = useCallback((action: SetStateAction<Record<string, boolean>>) => {
    setBundle((b) => {
      const mk = monthYearRef.current;
      const prev = b.columnGrayByMonth[mk] ?? {};
      const next =
        typeof action === "function"
          ? (action as (p: Record<string, boolean>) => Record<string, boolean>)(prev)
          : action;
      return {
        ...b,
        version: 1,
        columnGrayByMonth: { ...b.columnGrayByMonth, [mk]: next },
      };
    });
  }, []);

  const handleMonthYearChange = useCallback((next: string) => {
    setMonthYear(next);
    setUndoStack([]);
  }, []);

  const handleGerarPdfDetalheServico = useCallback(() => {
    const rodape = rodapeAssinaturaRef.current;
    downloadDetalheServicoMotoristaPdf({
      monthYear,
      sheet,
      tableEditable,
      prevMonthSheet,
      columnGray,
      rodapeAssinatura: {
        nome: rodape.nome,
        postoGraduacao: rodape.postoGraduacao,
        funcao: rodape.funcao,
      },
    });
  }, [monthYear, sheet, tableEditable, prevMonthSheet, columnGray]);

  useEffect(() => {
    setUndoStack([]);
  }, [monthYear]);

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
    [closeColumnMenu, setColumnGray],
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
        const { [rowId]: removed, ...cells } = prev.cells;
        void removed;
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

  const addFirstRowDiasNao = useCallback(() => {
    const id = newRowId();
    const next = { rows: [id], cells: { [id]: {} } };
    const pk = prevMonthKeyRef.current;
    setBundle((b) => ({ ...b, version: 1, sheets: { ...b.sheets, [pk]: next } }));
    closeMenu();
  }, [closeMenu]);

  const addRowAboveDiasNao = useCallback(
    (index: number) => {
      const id = newRowId();
      const pk = prevMonthKeyRef.current;
      setBundle((b) => {
        const raw = b.sheets[pk];
        if (!raw || raw.rows.length === 0) {
          const n = { rows: [id], cells: { [id]: {} } };
          return { ...b, version: 1, sheets: { ...b.sheets, [pk]: n } };
        }
        const rows = [...raw.rows];
        rows.splice(index, 0, id);
        const n = { rows, cells: { ...raw.cells, [id]: {} } };
        return { ...b, version: 1, sheets: { ...b.sheets, [pk]: n } };
      });
      closeMenu();
    },
    [closeMenu],
  );

  const addRowBelowDiasNao = useCallback(
    (index: number) => {
      const id = newRowId();
      const pk = prevMonthKeyRef.current;
      setBundle((b) => {
        const raw = b.sheets[pk];
        if (!raw || raw.rows.length === 0) {
          const n = { rows: [id], cells: { [id]: {} } };
          return { ...b, version: 1, sheets: { ...b.sheets, [pk]: n } };
        }
        const rows = [...raw.rows];
        rows.splice(index + 1, 0, id);
        const n = { rows, cells: { ...raw.cells, [id]: {} } };
        return { ...b, version: 1, sheets: { ...b.sheets, [pk]: n } };
      });
      closeMenu();
    },
    [closeMenu],
  );

  const deleteRowDiasNao = useCallback(
    (index: number) => {
      const pk = prevMonthKeyRef.current;
      setBundle((b) => {
        const raw = b.sheets[pk];
        if (!raw || raw.rows.length === 0) return b;
        const rowId = raw.rows[index]!;
        const rows = raw.rows.filter((_, i) => i !== index);
        const { [rowId]: removed, ...cells } = raw.cells;
        void removed;
        const n = { rows, cells };
        return { ...b, version: 1, sheets: { ...b.sheets, [pk]: n } };
      });
      closeMenu();
    },
    [closeMenu],
  );

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
      const el = root.querySelector<HTMLElement>(
        `[data-det-sheet-row="${rowIndex}"][data-det-sheet-col="${colIndex}"]`,
      );
      el?.focus();
    });
  }, []);

  const onSheetCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, rowIndex: number, colIndex: number) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.currentTarget instanceof HTMLSelectElement) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") return;
      }
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

  function openDiasNaoRowMenu(e: React.MouseEvent, rowIndex: number) {
    e.preventDefault();
    setColumnMenu(null);
    setMenu({ x: e.clientX, y: e.clientY, kind: "dias-nao-row", rowIndex });
  }

  function openDiasNaoEmptyMenu(e: React.MouseEvent) {
    e.preventDefault();
    setColumnMenu(null);
    setMenu({ x: e.clientX, y: e.clientY, kind: "dias-nao-empty" });
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

  /** Catálogo Motoristas + nomes já existentes na grelha (evita select vazio antes do IDB/sync). */
  const motoristasCatalogEGrilha = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of catalogItems.motoristas) {
      const t = n.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
    for (const rid of sheet.rows) {
      const v = (sheet.cells[rid]?.[KEY_MOTORISTA] ?? "").trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    out.sort((a, b) => a.localeCompare(b, "pt-PT"));
    return out;
  }, [catalogItems.motoristas, sheet.rows, sheet.cells]);

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={handleGerarPdfDetalheServico}
        >
          <FileDown className="h-4 w-4" aria-hidden />
          Gerar PDF
        </Button>
        <input
          id="detalhe-servico-mes-ano"
          type="month"
          value={monthYear}
          onChange={(e) => handleMonthYearChange(e.target.value)}
          aria-label="Mês e ano"
          className="h-10 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        />
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
                  rows.map((rowId, rowIndex) => {
                    const motoristaVal = cells[rowId]?.[KEY_MOTORISTA] ?? "";
                    const motoristaOpts = buildMotoristaSelectOptions(
                      motoristasCatalogEGrilha,
                      motoristaVal,
                    );
                    const useMotoristaSelect =
                      tableEditable && motoristaOpts.length > 0;
                    return (
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
                        {useMotoristaSelect ? (
                          <select
                            name={`motorista-${rowId}`}
                            aria-label="Motorista"
                            className={`${inputClass} max-w-full cursor-pointer`}
                            data-det-sheet-row={rowIndex}
                            data-det-sheet-col={0}
                            value={motoristaVal}
                            onChange={(e) => setCellValue(rowId, KEY_MOTORISTA, e.target.value)}
                            onFocus={onCellFocus}
                            onBlur={(e) => onCellBlur(rowId, KEY_MOTORISTA, e.target.value)}
                            onKeyDown={(e) => onSheetCellKeyDown(e, rowIndex, 0)}
                          >
                            <option value="">—</option>
                            {motoristaOpts.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            name={`motorista-${rowId}`}
                            autoComplete="off"
                            placeholder="—"
                            readOnly={!tableEditable}
                            className={`${inputClass} ${!tableEditable ? inputLockedClass : ""}`}
                            data-det-sheet-row={rowIndex}
                            data-det-sheet-col={0}
                            value={motoristaVal}
                            onChange={(e) => setCellValue(rowId, KEY_MOTORISTA, e.target.value)}
                            onFocus={onCellFocus}
                            onBlur={(e) => onCellBlur(rowId, KEY_MOTORISTA, e.target.value)}
                            onKeyDown={(e) => onSheetCellKeyDown(e, rowIndex, 0)}
                          />
                        )}
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 space-y-2 pb-1">
        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
          Dias não trabalhados do mês de {formatMonthYearTitlePt(prevMonthKey)}
        </h3>
        <div className="h-fit w-full max-w-none border border-neutral-300/90 bg-white p-[0.75em] shadow-[0_2px_12px_rgba(0,0,0,0.1)] sm:p-[1em]">
          {!prevMonthSheet ? (
            <p
              className="cursor-default text-sm text-[hsl(var(--muted-foreground))]"
              role="status"
              onContextMenu={openDiasNaoEmptyMenu}
            >
              Não há dados guardados para esse mês. Selecione o mês anterior no seletor acima, preencha a
              grelha e volte ao mês atual — os dados ficam gravados neste dispositivo. Botão direito para
              adicionar linha.
            </p>
          ) : (
            <div className="w-full min-w-0 overflow-x-auto">
              <table className="table-auto w-max max-w-none border-collapse text-left text-[11px] leading-tight sm:text-xs">
                <caption className="sr-only">
                  Dias não trabalhados: cada linha corresponde a uma linha da grelha do mês anterior; cada
                  coluna mostra o número de um dia sem «S» nem «RO» nessa linha.
                </caption>
                <tbody>
                  {prevMonthSheet.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="cursor-default border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.06)] px-[0.5em] py-[0.35em] text-center text-[hsl(var(--muted-foreground))]"
                        onContextMenu={openDiasNaoEmptyMenu}
                      >
                        Sem linhas — botão direito para adicionar
                      </td>
                    </tr>
                  ) : (
                    prevMonthSheet.rows.map((rowId, rowIndex) => {
                      const motoristaNome = prevMonthSheet.cells[rowId]?.[KEY_MOTORISTA] ?? "";
                      const diasSoNumeros = listDiasSemMarcacaoSingleRow(
                        prevMonthSheet,
                        rowId,
                        prevMonthParsed.year,
                        prevMonthParsed.monthIndex,
                        prevDays,
                      );
                      return (
                        <tr key={rowId} onContextMenu={(e) => openDiasNaoRowMenu(e, rowIndex)}>
                          <th
                            scope="row"
                            className="sticky left-0 z-[1] w-auto max-w-[14rem] border border-[hsl(var(--border))] bg-white px-[0.35em] py-[0.15em] text-left align-middle font-normal shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]"
                          >
                            <span
                              className="block max-w-[14rem] truncate whitespace-nowrap"
                              title={motoristaNome || undefined}
                            >
                              {motoristaNome.trim() ? motoristaNome : "—"}
                            </span>
                          </th>
                          {diasSoNumeros.length === 0 ? (
                            <td className="w-auto whitespace-nowrap border border-[hsl(var(--border))] bg-white px-[0.35em] py-[0.15em] text-[hsl(var(--muted-foreground))]">
                              —
                            </td>
                          ) : (
                            diasSoNumeros.map((dayNum) => {
                              const date = new Date(
                                prevMonthParsed.year,
                                prevMonthParsed.monthIndex,
                                dayNum,
                              );
                              const titleDia = date.toLocaleDateString("pt-PT", {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                              });
                              return (
                                <td
                                  key={`${rowId}-${dayNum}`}
                                  className="w-auto whitespace-nowrap border border-[hsl(var(--border))] bg-white px-[0.35em] py-[0.15em] text-center align-middle tabular-nums font-semibold text-[hsl(var(--foreground))]"
                                  title={titleDia}
                                >
                                  {dayNum}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex w-full flex-col items-center border-t border-[hsl(var(--border))]/60 pt-3">
            <div className="w-full max-w-[22rem] space-y-2.5">
              <div>
                <label
                  htmlFor="detalhe-rodape-nome"
                  className="mb-0.5 block text-center text-xs font-medium text-[hsl(var(--muted-foreground))]"
                >
                  Nome
                </label>
                <input
                  id="detalhe-rodape-nome"
                  type="text"
                  name="detalhe-rodape-nome"
                  autoComplete="off"
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-white px-2 py-1.5 text-center text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  value={rodapeAssinatura.nome}
                  onChange={(e) =>
                    setRodapeAssinatura((p) => ({ ...p, nome: e.target.value }))
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="detalhe-rodape-posto"
                  className="mb-0.5 block text-center text-xs font-medium text-[hsl(var(--muted-foreground))]"
                >
                  Posto/Graduação
                </label>
                <input
                  id="detalhe-rodape-posto"
                  type="text"
                  name="detalhe-rodape-posto"
                  autoComplete="off"
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-white px-2 py-1.5 text-center text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  value={rodapeAssinatura.postoGraduacao}
                  onChange={(e) =>
                    setRodapeAssinatura((p) => ({ ...p, postoGraduacao: e.target.value }))
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="detalhe-rodape-funcao"
                  className="mb-0.5 block text-center text-xs font-medium text-[hsl(var(--muted-foreground))]"
                >
                  Função
                </label>
                <input
                  id="detalhe-rodape-funcao"
                  type="text"
                  name="detalhe-rodape-funcao"
                  autoComplete="off"
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-white px-2 py-1.5 text-center text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  value={rodapeAssinatura.funcao}
                  onChange={(e) =>
                    setRodapeAssinatura((p) => ({ ...p, funcao: e.target.value }))
                  }
                />
              </div>
            </div>
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
            ) : menu.kind === "dias-nao-empty" ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))]"
                onClick={() => addFirstRowDiasNao()}
              >
                Adicionar linha
              </button>
            ) : menu.kind === "dias-nao-row" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))]"
                  onClick={() => addRowAboveDiasNao(menu.rowIndex)}
                >
                  Adicionar linha acima
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))]"
                  onClick={() => addRowBelowDiasNao(menu.rowIndex)}
                >
                  Adicionar linha abaixo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-red-700 hover:bg-red-50"
                  onClick={() => deleteRowDiasNao(menu.rowIndex)}
                >
                  Excluir linha
                </button>
              </>
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
