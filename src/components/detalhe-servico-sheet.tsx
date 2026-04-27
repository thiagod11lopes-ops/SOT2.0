import { AlertTriangle, FileDown, Lock, Unlock } from "lucide-react";
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
  type DetalheServicoFeriasPeriodo,
} from "../lib/detalheServicoBundle";
import { DetalheServicoFeriasModal, type FeriasDraftByMotorKey } from "./detalhe-servico-ferias-modal";
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

const CROSSED_TOKEN_PREFIX = "__X__";
type DayCellToken = { token: string; crossed: boolean };

function parseDayCellTokens(raw: string): DayCellToken[] {
  return raw
    .trim()
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const up = t.toUpperCase();
      if (up.startsWith(CROSSED_TOKEN_PREFIX)) {
        return { token: up.slice(CROSSED_TOKEN_PREFIX.length), crossed: true };
      }
      return { token: up, crossed: false };
    });
}

function stripCrossedPrefixToken(raw: string): string {
  return parseDayCellTokens(raw)
    .map((t) => t.token)
    .join(" ");
}

function toggleCrossedSingleServicoToken(raw: string): string | null {
  const tokens = parseDayCellTokens(raw);
  if (tokens.length !== 1) return null;
  const only = tokens[0]!;
  if (only.token !== "S" && only.token !== "RO") return null;
  return only.crossed ? only.token : `${CROSSED_TOKEN_PREFIX}${only.token}`;
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
  return parseDayCellTokens(raw).some((t) => !t.crossed && (t.token === "S" || t.token === "RO"));
}

/** True se a célula tiver token «S». */
function cellContainsServicoToken(raw: string): boolean {
  return parseDayCellTokens(raw).some((t) => !t.crossed && t.token === "S");
}

/** Remove tokens «RO» de um valor de célula, preservando os demais. */
function stripRoTokens(raw: string): string {
  return parseDayCellTokens(raw)
    .filter((t) => t.token !== "RO")
    .map((t) => t.token)
    .join(" ");
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

/** Cria novo mês herdando apenas a coluna Motorista do mês anterior. */
function buildNewMonthSheetFromPrevious(
  previous: DetalheServicoSheetSnapshot | null | undefined,
): DetalheServicoSheetSnapshot {
  if (!previous || !Array.isArray(previous.rows) || previous.rows.length === 0) {
    return { rows: [newRowId()], cells: {} };
  }
  const rows = previous.rows.map(() => newRowId());
  const cells: Record<string, Record<string, string>> = {};
  previous.rows.forEach((prevRowId, index) => {
    const nextRowId = rows[index]!;
    const motorista = (previous.cells?.[prevRowId]?.[KEY_MOTORISTA] ?? "").trim();
    cells[nextRowId] = motorista ? { [KEY_MOTORISTA]: motorista } : {};
  });
  return { rows, cells };
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

const DAY_CELL_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True se existir célula de dia com «S»/«RO» cancelados pelo X vermelho. */
function sheetHasCrossedServicoDayCells(snapshot: DetalheServicoSheetSnapshot): boolean {
  const skip = new Set<string>([KEY_MOTORISTA, KEY_CARGA_HORARIA, KEY_NUM_SERVICOS, KEY_NUM_ROTINAS]);
  for (const rowId of snapshot.rows) {
    const row = snapshot.cells[rowId];
    if (!row) continue;
    for (const [key, val] of Object.entries(row)) {
      if (skip.has(key)) continue;
      if (!DAY_CELL_KEY_RE.test(key)) continue;
      if (parseDayCellTokens(String(val ?? "")).some((t) => t.crossed)) return true;
    }
  }
  return false;
}

/** Contagem automática de carga horária para RM1/FC: cada S = 24h, cada RO = 8h. */
function isMotoristaCargaHorariaAutomatica(motorista: string): boolean {
  const nome = motorista.toUpperCase().trim();
  return nome.includes("RM1") || /^FC(?:\b|[-\s])/.test(nome);
}

/** Regra da nova escala: somente motoristas cadastrados com "FC" no nome. */
function shouldCountMotoristaDiasNaoTrabalhados(
  motoristaNome: string,
  motoristasCatalogo: string[],
): boolean {
  const nome = motoristaNome.trim();
  if (!nome) return false;
  const nomeNorm = normalizeMotoristaName(nome);
  const isCadastrado = motoristasCatalogo.some((m) => normalizeMotoristaName(m) === nomeNorm);
  if (!isCadastrado) return false;
  return nome.toUpperCase().includes("FC");
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

/** Conta tokens «S» e «RO» nas células dos dias (mês atual); horas = 24×S + 8×RO. Ignora dias em férias. */
function tallyDayCellTokens(
  rowCells: Record<string, string>,
  motoristaDisplay: string,
  year: number,
  monthIndex: number,
  days: DayMeta[],
  feriasForMonth: Record<string, DetalheServicoFeriasPeriodo[]>,
): { s: number; ro: number; horas: number } {
  const feriasPeriods = feriasForMonth[normalizeMotoristaName(motoristaDisplay)];
  let s = 0;
  let ro = 0;
  for (const { day } of days) {
    if (isDayInFeriasPeriods(year, monthIndex, day, feriasPeriods)) continue;
    const dk = dateKey(year, monthIndex, day);
    const raw = (rowCells[dk] ?? "").trim();
    if (!raw) continue;
    const tokens = parseDayCellTokens(raw).filter((t) => !t.crossed).map((t) => t.token);
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

function isMotoristaComIntervaloMinimoObrigatorio(motorista: string): boolean {
  const nome = motorista.toUpperCase();
  return nome.includes("RM1") || nome.includes("FC");
}

function addDays(date: Date, daysToAdd: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysToAdd);
  return d;
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR");
}

function normalizeMotoristaName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function parseIsoDateLocal(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Recorta um período às datas do mês `monthYear` (`YYYY-MM`); devolve `null` se não houver interseção. */
function clipFeriasPeriodToMonth(
  monthYear: string,
  p: DetalheServicoFeriasPeriodo,
): DetalheServicoFeriasPeriodo | null {
  const { year, monthIndex } = parseMonthInput(monthYear);
  const lastD = new Date(year, monthIndex + 1, 0).getDate();
  const a0 = parseIsoDateLocal(p.inicio);
  const b0 = parseIsoDateLocal(p.fim);
  if (!a0 || !b0) return null;
  let a = new Date(a0);
  let b = new Date(b0);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  if (a > b) [a, b] = [b, a];
  const ms = new Date(year, monthIndex, 1);
  const me = new Date(year, monthIndex, lastD);
  ms.setHours(0, 0, 0, 0);
  me.setHours(0, 0, 0, 0);
  if (b < ms || a > me) return null;
  const lo = a < ms ? ms : a;
  const hi = b > me ? me : b;
  return {
    inicio: dateKey(year, monthIndex, lo.getDate()),
    fim: dateKey(year, monthIndex, hi.getDate()),
  };
}

function isDayInFeriasPeriods(
  year: number,
  monthIndex: number,
  day: number,
  periods: DetalheServicoFeriasPeriodo[] | undefined,
): boolean {
  if (!periods?.length) return false;
  const t = new Date(year, monthIndex, day);
  t.setHours(0, 0, 0, 0);
  for (const p of periods) {
    const a = parseIsoDateLocal(p.inicio);
    const b = parseIsoDateLocal(p.fim);
    if (!a || !b) continue;
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    if (a > b) continue;
    if (t >= a && t <= b) return true;
  }
  return false;
}

function findLastWorkedDateInMonthByMotorista(
  snapshot: DetalheServicoSheetSnapshot | null,
  motorista: string,
  year: number,
  monthIndex: number,
  monthDays: DayMeta[],
): Date | null {
  if (!snapshot || !motorista.trim()) return null;
  const motoristaNorm = normalizeMotoristaName(motorista);
  let lastDay: number | null = null;

  for (const rowId of snapshot.rows) {
    const nomeLinha = normalizeMotoristaName(snapshot.cells[rowId]?.[KEY_MOTORISTA] ?? "");
    if (!nomeLinha || nomeLinha !== motoristaNorm) continue;
    for (const { day } of monthDays) {
      const dk = dateKey(year, monthIndex, day);
      if (!cellContainsWorkToken(snapshot.cells[rowId]?.[dk] ?? "")) continue;
      if (lastDay === null || day > lastDay) lastDay = day;
    }
  }

  if (lastDay === null) return null;
  return new Date(year, monthIndex, lastDay);
}

function listDiasSemMarcacaoByMotoristaNoMes(
  snapshot: DetalheServicoSheetSnapshot | null,
  motorista: string,
  year: number,
  monthIndex: number,
  monthDays: DayMeta[],
): number[] {
  if (!snapshot) return [];
  const nome = normalizeMotoristaName(motorista);
  if (!nome) return [];
  const matchingRows = snapshot.rows.filter(
    (rowId) => normalizeMotoristaName(snapshot.cells[rowId]?.[KEY_MOTORISTA] ?? "") === nome,
  );
  if (matchingRows.length === 0) return [];
  const out: number[] = [];
  for (const { day } of monthDays) {
    const dk = dateKey(year, monthIndex, day);
    const hasWorkInAnyRow = matchingRows.some((rowId) => cellContainsWorkToken(snapshot.cells[rowId]?.[dk] ?? ""));
    if (!hasWorkInAnyRow) out.push(day);
  }
  return out;
}

function buildIntervaloMinimoViolationsMap(args: {
  sheet: DetalheServicoSheetSnapshot;
  prevMonthSheet: DetalheServicoSheetSnapshot | null;
  year: number;
  monthIndex: number;
  days: DayMeta[];
  prevYear: number;
  prevMonthIndex: number;
  prevDays: DayMeta[];
}): Record<string, boolean> {
  const { sheet, prevMonthSheet, year, monthIndex, days, prevYear, prevMonthIndex, prevDays } = args;
  const out: Record<string, boolean> = {};
  if (!prevMonthSheet) return out;

  for (const rowId of sheet.rows) {
    const motorista = (sheet.cells[rowId]?.[KEY_MOTORISTA] ?? "").trim();
    if (!isMotoristaComIntervaloMinimoObrigatorio(motorista)) continue;

    const ultimoServicoMesAnterior = findLastWorkedDateInMonthByMotorista(
      prevMonthSheet,
      motorista,
      prevYear,
      prevMonthIndex,
      prevDays,
    );
    if (!ultimoServicoMesAnterior) continue;
    const dataMinimaPermitida = addDays(ultimoServicoMesAnterior, 3);

    for (const { day } of days) {
      const dk = dateKey(year, monthIndex, day);
      const dataCandidata = new Date(year, monthIndex, day);
      dataCandidata.setHours(0, 0, 0, 0);
      if (dataCandidata < dataMinimaPermitida) {
        out[`${rowId}__${dk}`] = true;
      }
    }
  }

  return out;
}

function buildServicosInvalidosPorDiaMap(args: {
  sheet: DetalheServicoSheetSnapshot;
  year: number;
  monthIndex: number;
  days: DayMeta[];
  feriasForMonth: Record<string, DetalheServicoFeriasPeriodo[]>;
}): Record<string, boolean> {
  const { sheet, year, monthIndex, days, feriasForMonth } = args;
  const out: Record<string, boolean> = {};
  for (const { day } of days) {
    const dk = dateKey(year, monthIndex, day);
    let sCount = 0;
    for (const rowId of sheet.rows) {
      const motor = (sheet.cells[rowId]?.[KEY_MOTORISTA] ?? "").trim();
      const periods = feriasForMonth[normalizeMotoristaName(motor)];
      if (isDayInFeriasPeriods(year, monthIndex, day, periods)) continue;
      const raw = sheet.cells[rowId]?.[dk] ?? "";
      if (cellContainsServicoToken(raw)) sCount += 1;
    }
    if (sCount !== 2) out[dk] = true;
  }
  return out;
}

function mergeRemoteBundlePreservingLocalMonths(
  localBundle: DetalheServicoBundle,
  remoteBundle: DetalheServicoBundle,
): DetalheServicoBundle {
  return {
    ...remoteBundle,
    version: 1,
    sheets: { ...localBundle.sheets, ...remoteBundle.sheets },
    rodapes: { ...localBundle.rodapes, ...remoteBundle.rodapes },
    columnGrayByMonth: { ...localBundle.columnGrayByMonth, ...remoteBundle.columnGrayByMonth },
    feriasByMonth: { ...localBundle.feriasByMonth, ...remoteBundle.feriasByMonth },
    originalSheetBeforeFirstXByMonth: {
      ...(localBundle.originalSheetBeforeFirstXByMonth ?? {}),
      ...(remoteBundle.originalSheetBeforeFirstXByMonth ?? {}),
    },
  };
}

type RowContextMenu =
  | { x: number; y: number; kind: "row"; rowIndex: number }
  | { x: number; y: number; kind: "empty" }
  | { x: number; y: number; kind: "dias-nao-row"; rowIndex: number }
  | { x: number; y: number; kind: "dias-nao-empty" };

/** Identificador de coluna para fundo cinza manual (mesmo tom dos fins de semana: neutral-200). */
type ColumnContextMenu = { x: number; y: number; columnKey: string };

type IntervaloMinimoModalState = {
  rowId: string;
  key: string;
  nextValue: string;
  motorista: string;
  dataUltimoServico: Date;
  dataTentativa: Date;
  dataMinimaPermitida: Date;
};

type CloudSyncStatus = "idle" | "syncing" | "synced" | "error";

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
  const [showRoTokens, setShowRoTokens] = useState(true);
  /** `true` = grelha atual (alterações, X vermelho, etc.). `false` = snapshot antes do primeiro X no mês (se existir). */
  const [mostrarAlteracoesAposX, setMostrarAlteracoesAposX] = useState(false);
  const [intervaloModal, setIntervaloModal] = useState<IntervaloMinimoModalState | null>(null);
  const [feriasModalOpen, setFeriasModalOpen] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(useCloud ? "idle" : "synced");
  const [cloudSyncAt, setCloudSyncAt] = useState<Date | null>(null);
  const [awaitingFirstCloudSnapshot, setAwaitingFirstCloudSnapshot] = useState(useCloud);

  const monthYearRef = useRef(monthYear);
  monthYearRef.current = monthYear;
  const viewingOriginalRef = useRef(false);

  const sheetLive = useMemo(
    () => normalizeLoadedSheet(bundle.sheets[monthYear] ?? null),
    [bundle, monthYear],
  );

  const originalBaseline = useMemo(
    () => bundle.originalSheetBeforeFirstXByMonth?.[monthYear] ?? null,
    [bundle, monthYear],
  );

  const displaySheet = useMemo(() => {
    if (mostrarAlteracoesAposX || !originalBaseline) return sheetLive;
    return normalizeLoadedSheet(originalBaseline);
  }, [sheetLive, originalBaseline, mostrarAlteracoesAposX]);

  const viewingOriginal = Boolean(originalBaseline) && !mostrarAlteracoesAposX;

  const rodapeAssinatura = useMemo(
    () => bundle.rodapes[monthYear] ?? emptyRodapeAssinatura(),
    [bundle, monthYear],
  );

  /** Chaves: `motorista`, data `YYYY-MM-DD`, ou chaves das colunas extra (cargaHoraria, …). */
  const columnGray = useMemo(
    () => bundle.columnGrayByMonth[monthYear] ?? {},
    [bundle, monthYear],
  );

  const feriasForMonth = useMemo(
    () => bundle.feriasByMonth[monthYear] ?? {},
    [bundle, monthYear],
  );

  const rodapeAssinaturaRef = useRef(rodapeAssinatura);
  rodapeAssinaturaRef.current = rodapeAssinatura;

  const sheetRef = useRef(sheetLive);
  sheetRef.current = sheetLive;
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;
  const tableEditableRef = useRef(tableEditable);
  tableEditableRef.current = tableEditable;
  viewingOriginalRef.current = viewingOriginal;
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
    setAwaitingFirstCloudSnapshot(useCloud);
    // Mesmo em modo Firebase-only, hidrata do IDB para evitar "sumiço" visual
    // durante a transição até o primeiro snapshot remoto.
    let cancelled = false;
    void loadDetalheServicoBundleFromIdb().then((b) => {
      if (cancelled) return;
      setBundle(b);
      setIdbReady(true);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
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
    setAwaitingFirstCloudSnapshot(true);
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.detalheServico,
          (payload) => {
            void (async () => {
              setAwaitingFirstCloudSnapshot(false);
              if (payload === null) {
                // Firebase como fonte da verdade: não promover local->nuvem no bootstrap.
                return;
              }
              // Evita sobrescrever alterações locais em andamento por snapshot remoto atrasado.
              if (tableEditableRef.current) return;
              applyingRemoteRef.current = true;
              const next = normalizeDetalheServicoBundle(payload);
              const merged = mergeRemoteBundlePreservingLocalMonths(bundleRef.current, next);
              setBundle(merged);
              setCloudSyncStatus("synced");
              setCloudSyncAt(new Date());
              void saveDetalheServicoBundleToIdb(merged);
            })();
          },
          (err) => {
            setAwaitingFirstCloudSnapshot(false);
            setCloudSyncStatus("error");
            console.error("[SOT] Firestore detalhe serviço:", err);
          },
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        setAwaitingFirstCloudSnapshot(false);
        setCloudSyncStatus("error");
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

  const pushBundleToCloud = useCallback(
    async (nextBundle: DetalheServicoBundle) => {
      if (!useCloud || !hydratedRef.current || !idbReady) return;
      setCloudSyncStatus("syncing");
      try {
        await setSotStateDoc(SOT_STATE_DOC.detalheServico, nextBundle);
        setCloudSyncStatus("synced");
        setCloudSyncAt(new Date());
      } catch (e) {
        setCloudSyncStatus("error");
        console.error("[SOT] Gravar detalhe serviço na nuvem:", e);
      }
    },
    [useCloud, idbReady],
  );

  useEffect(() => {
    if (!useCloud || !hydratedRef.current || !idbReady) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    if (tableEditable) {
      void pushBundleToCloud(bundle);
      return;
    }
    const t = window.setTimeout(() => {
      void pushBundleToCloud(bundle);
    }, 450);
    return () => window.clearTimeout(t);
  }, [bundle, useCloud, idbReady, tableEditable, pushBundleToCloud]);

  useEffect(() => {
    if (!useCloud || !idbReady || !hydratedRef.current) return;
    if (tableEditable) return;
    // Ao bloquear a edição, força uma gravação imediata para evitar perda por debounce pendente.
    void pushBundleToCloud(bundle);
  }, [tableEditable, useCloud, idbReady, bundle, pushBundleToCloud]);

  useEffect(() => {
    if (useCloud) return;
    setCloudSyncStatus("synced");
    setCloudSyncAt(null);
    setAwaitingFirstCloudSnapshot(false);
  }, [useCloud]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sot:detalhe-servico-editing", { detail: { editing: tableEditable } }),
    );
    return () => {
      window.dispatchEvent(new CustomEvent("sot:detalhe-servico-editing", { detail: { editing: false } }));
    };
  }, [tableEditable]);

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

  const applyFeriasSave = useCallback((draft: FeriasDraftByMotorKey) => {
    setBundle((b) => {
      const mk = monthYearRef.current;
      const sh = normalizeLoadedSheet(b.sheets[mk] ?? null);
      const { year, monthIndex } = parseMonthInput(mk);
      const lastDay = new Date(year, monthIndex + 1, 0).getDate();

      const nextMonthFerias: Record<string, DetalheServicoFeriasPeriodo[]> = {};
      for (const [k, periods] of Object.entries(draft)) {
        const cleaned: DetalheServicoFeriasPeriodo[] = [];
        for (const p of periods) {
          const c = clipFeriasPeriodToMonth(mk, p);
          if (c) cleaned.push(c);
          if (cleaned.length >= 3) break;
        }
        if (cleaned.length > 0) nextMonthFerias[k] = cleaned;
      }

      const cells = structuredClone(sh.cells);
      for (const rowId of sh.rows) {
        const motor = (sh.cells[rowId]?.[KEY_MOTORISTA] ?? "").trim();
        const motorKey = normalizeMotoristaName(motor);
        const periods = nextMonthFerias[motorKey];
        if (!periods?.length) continue;
        for (let day = 1; day <= lastDay; day++) {
          if (!isDayInFeriasPeriods(year, monthIndex, day, periods)) continue;
          const dk = dateKey(year, monthIndex, day);
          const cur = cells[rowId]?.[dk];
          if (cur === undefined || cur === "") continue;
          const rowCells = { ...(cells[rowId] ?? {}) };
          delete rowCells[dk];
          cells[rowId] = rowCells;
        }
      }

      const nextFeriasByMonth = { ...b.feriasByMonth };
      if (Object.keys(nextMonthFerias).length === 0) {
        delete nextFeriasByMonth[mk];
      } else {
        nextFeriasByMonth[mk] = nextMonthFerias;
      }

      return {
        ...b,
        version: 1,
        sheets: { ...b.sheets, [mk]: { rows: sh.rows, cells } },
        feriasByMonth: nextFeriasByMonth,
      };
    });
    setFeriasModalOpen(false);
  }, []);

  const handleMonthYearChange = useCallback((next: string) => {
    setBundle((b) => {
      if (b.sheets[next]) return b;
      const prevKey = getPreviousMonthKey(next);
      const nextSheet = buildNewMonthSheetFromPrevious(b.sheets[prevKey]);
      const prevRodape = b.rodapes[prevKey] ?? emptyRodapeAssinatura();
      return {
        ...b,
        version: 1,
        sheets: { ...b.sheets, [next]: nextSheet },
        rodapes: { ...b.rodapes, [next]: prevRodape },
      };
    });
    setMonthYear(next);
    setUndoStack([]);
  }, []);

  const handleGerarPdfDetalheServico = useCallback(() => {
    const rodape = rodapeAssinaturaRef.current;
    downloadDetalheServicoMotoristaPdf({
      monthYear,
      sheet: sheetLive,
      tableEditable,
      showRoTokens,
      prevMonthSheet,
      columnGray,
      feriasForMonth,
      rodapeAssinatura: {
        nome: rodape.nome,
        postoGraduacao: rodape.postoGraduacao,
        funcao: rodape.funcao,
      },
    });
  }, [monthYear, sheetLive, tableEditable, showRoTokens, prevMonthSheet, columnGray, feriasForMonth]);

  useEffect(() => {
    setUndoStack([]);
  }, [monthYear]);

  useEffect(() => {
    if (sheetHasCrossedServicoDayCells(sheetLive)) {
      setMostrarAlteracoesAposX(true);
    } else {
      setMostrarAlteracoesAposX(false);
    }
  }, [sheetLive]);

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

  const onDayCellDoubleClickToggleCrossed = useCallback((rowId: string, key: string) => {
    if (!tableEditableRef.current) return;
    if (viewingOriginalRef.current) return;
    setBundle((b) => {
      const mk = monthYearRef.current;
      const prevSheet = normalizeLoadedSheet(b.sheets[mk] ?? null);
      const current = prevSheet.cells[rowId]?.[key] ?? "";
      const toggled = toggleCrossedSingleServicoToken(current);
      if (toggled === null) return b;

      const tokens = parseDayCellTokens(current);
      const only = tokens.length === 1 ? tokens[0] : null;
      const applyingCross =
        Boolean(only) &&
        !only!.crossed &&
        (only!.token === "S" || only!.token === "RO") &&
        toggled.toUpperCase().startsWith(CROSSED_TOKEN_PREFIX);

      let nextOriginal = b.originalSheetBeforeFirstXByMonth;
      if (applyingCross && !nextOriginal?.[mk]) {
        nextOriginal = { ...(nextOriginal ?? {}), [mk]: cloneSheet(prevSheet) };
      }

      const nextCells = {
        ...prevSheet.cells,
        [rowId]: { ...(prevSheet.cells[rowId] ?? {}), [key]: toggled },
      };

      return {
        ...b,
        version: 1,
        sheets: { ...b.sheets, [mk]: { rows: prevSheet.rows, cells: nextCells } },
        ...(nextOriginal !== b.originalSheetBeforeFirstXByMonth
          ? { originalSheetBeforeFirstXByMonth: nextOriginal }
          : {}),
      };
    });
  }, []);

  const handleDayCellChange = useCallback(
    (rowId: string, key: string, day: number, value: string) => {
      const motoristaFerias = (sheetRef.current.cells[rowId]?.[KEY_MOTORISTA] ?? "").trim();
      const feriasP =
        bundleRef.current.feriasByMonth[monthYearRef.current]?.[
          normalizeMotoristaName(motoristaFerias)
        ];
      if (isDayInFeriasPeriods(year, monthIndex, day, feriasP)) return;

      const prevValue = sheetRef.current.cells[rowId]?.[key] ?? "";
      const prevHasWork = cellContainsWorkToken(prevValue);
      const nextHasWork = cellContainsWorkToken(value);
      if (!nextHasWork || prevHasWork) {
        setCellValue(rowId, key, value);
        return;
      }

      const motorista = (sheetRef.current.cells[rowId]?.[KEY_MOTORISTA] ?? "").trim();
      if (!isMotoristaComIntervaloMinimoObrigatorio(motorista)) {
        setCellValue(rowId, key, value);
        return;
      }

      const ultimoServicoMesAnterior = findLastWorkedDateInMonthByMotorista(
        prevMonthSheet,
        motorista,
        prevMonthParsed.year,
        prevMonthParsed.monthIndex,
        prevDays,
      );
      if (!ultimoServicoMesAnterior) {
        setCellValue(rowId, key, value);
        return;
      }

      const dataTentativa = new Date(year, monthIndex, day);
      dataTentativa.setHours(0, 0, 0, 0);
      const dataMinimaPermitida = addDays(ultimoServicoMesAnterior, 3);
      if (dataTentativa >= dataMinimaPermitida) {
        setCellValue(rowId, key, value);
        return;
      }

      setIntervaloModal({
        rowId,
        key,
        nextValue: value,
        motorista,
        dataUltimoServico: ultimoServicoMesAnterior,
        dataTentativa,
        dataMinimaPermitida,
      });
    },
    [
      monthIndex,
      prevDays,
      prevMonthParsed.year,
      prevMonthParsed.monthIndex,
      prevMonthSheet,
      setCellValue,
      year,
    ],
  );

  const closeIntervaloModal = useCallback(() => setIntervaloModal(null), []);
  const confirmIntervaloModal = useCallback(() => {
    if (!intervaloModal) return;
    setCellValue(intervaloModal.rowId, intervaloModal.key, intervaloModal.nextValue);
    setIntervaloModal(null);
  }, [intervaloModal, setCellValue]);

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
    if (viewingOriginal) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setColumnMenu(null);
    setMenu({ x: e.clientX, y: e.clientY, kind: "row", rowIndex });
  }

  function openEmptyMenu(e: React.MouseEvent) {
    if (viewingOriginal) {
      e.preventDefault();
      return;
    }
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
    if (viewingOriginal) {
      e.preventDefault();
      return;
    }
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

  const { rows, cells } = displaySheet;

  /** Catálogo Motoristas + nomes já existentes na grelha (evita select vazio antes do IDB/sync). */
  const motoristasCatalogEGrilha = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of catalogItems.motoristas) {
      const t = n.trim();
      if (!t) continue;
      const k = normalizeMotoristaName(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
    for (const rid of sheetLive.rows) {
      const v = (sheetLive.cells[rid]?.[KEY_MOTORISTA] ?? "").trim();
      if (!v) continue;
      const k = normalizeMotoristaName(v);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    out.sort((a, b) => a.localeCompare(b, "pt-PT"));
    return out;
  }, [catalogItems.motoristas, sheetLive.rows, sheetLive.cells]);

  const motoristasCatalogFerias = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of catalogItems.motoristas) {
      const t = n.trim();
      if (!t) continue;
      const k = normalizeMotoristaName(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
    out.sort((a, b) => a.localeCompare(b, "pt-PT"));
    return out;
  }, [catalogItems.motoristas]);

  const prevMonthRowsForEscala = useMemo(() => {
    if (!prevMonthSheet) return [];
    return prevMonthSheet.rows
      .map((rowId, originalIndex) => ({ rowId, originalIndex }))
      .filter(({ rowId }) =>
        shouldCountMotoristaDiasNaoTrabalhados(
          prevMonthSheet.cells[rowId]?.[KEY_MOTORISTA] ?? "",
          catalogItems.motoristas,
        ),
      );
  }, [prevMonthSheet, catalogItems.motoristas]);

  const diasNaoTrabalhadosRowsAuto = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ motoristaNome: string; diasSoNumeros: number[]; originalIndex: number | null }> = [];

    for (const rowId of sheetLive.rows) {
      const motoristaNome = (sheetLive.cells[rowId]?.[KEY_MOTORISTA] ?? "").trim();
      if (!shouldCountMotoristaDiasNaoTrabalhados(motoristaNome, catalogItems.motoristas)) continue;
      const k = normalizeMotoristaName(motoristaNome);
      if (seen.has(k)) continue;
      seen.add(k);

      const diasSoNumeros = listDiasSemMarcacaoByMotoristaNoMes(
        prevMonthSheet,
        motoristaNome,
        prevMonthParsed.year,
        prevMonthParsed.monthIndex,
        prevDays,
      );
      out.push({ motoristaNome, diasSoNumeros, originalIndex: null });
    }

    if (out.length > 0) return out;

    return prevMonthRowsForEscala.map(({ rowId, originalIndex }) => ({
      motoristaNome: prevMonthSheet?.cells[rowId]?.[KEY_MOTORISTA] ?? "",
      diasSoNumeros: listDiasSemMarcacaoSingleRow(
        prevMonthSheet!,
        rowId,
        prevMonthParsed.year,
        prevMonthParsed.monthIndex,
        prevDays,
      ),
      originalIndex,
    }));
  }, [
    sheetLive.rows,
    sheetLive.cells,
    catalogItems.motoristas,
    prevMonthSheet,
    prevMonthParsed.year,
    prevMonthParsed.monthIndex,
    prevDays,
    prevMonthRowsForEscala,
  ]);

  const intervaloMinimoViolations = useMemo(
    () =>
      buildIntervaloMinimoViolationsMap({
        sheet: sheetLive,
        prevMonthSheet,
        year,
        monthIndex,
        days,
        prevYear: prevMonthParsed.year,
        prevMonthIndex: prevMonthParsed.monthIndex,
        prevDays,
      }),
    [sheetLive, prevMonthSheet, year, monthIndex, days, prevMonthParsed.year, prevMonthParsed.monthIndex, prevDays],
  );

  const lastCalendarDay = days[days.length - 1]?.day ?? 31;

  const servicosInvalidosPorDia = useMemo(
    () =>
      buildServicosInvalidosPorDiaMap({
        sheet: sheetLive,
        year,
        monthIndex,
        days,
        feriasForMonth,
      }),
    [sheetLive, year, monthIndex, days, feriasForMonth],
  );

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => setFeriasModalOpen(true)}
          >
            Escala de Férias
          </Button>
          <span
            className="text-xs text-[hsl(var(--muted-foreground))]"
            id="detalhe-servico-original-toggle-label"
          >
            {originalBaseline
              ? mostrarAlteracoesAposX
                ? "Alterações no Detalhe"
                : "Detalhe original"
              : "Detalhe (sem X ainda)"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={mostrarAlteracoesAposX}
            aria-labelledby="detalhe-servico-original-toggle-label"
            disabled={!originalBaseline}
            title={
              !originalBaseline
                ? "Disponível após o primeiro duplo clique (X) em S ou RO neste mês."
                : mostrarAlteracoesAposX
                  ? "Mostrar o detalhe original (antes do primeiro X)"
                  : "Mostrar alterações no detalhe (com X vermelho)"
            }
            className={`relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full border px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 ${
              mostrarAlteracoesAposX
                ? "border-emerald-600/45 bg-emerald-500/20"
                : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
            } ${!originalBaseline ? "cursor-not-allowed opacity-60" : ""}`}
            onClick={() => setMostrarAlteracoesAposX((v) => !v)}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                mostrarAlteracoesAposX ? "translate-x-[1.125rem]" : "translate-x-0"
              }`}
            />
          </button>
        </div>
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
      </div>

      <div className="w-full min-w-0 pb-1">
        <div className="h-fit w-full max-w-none border border-neutral-300/90 bg-white p-[0.75em] shadow-[0_2px_12px_rgba(0,0,0,0.1)] sm:p-[1em]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--border))]/70 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[hsl(var(--foreground))]" id="detalhe-servico-edicao-label">
                {tableEditable ? "Edição ativa" : "Edição bloqueada"}
              </span>
              {useCloud ? (
                <>
                  {awaitingFirstCloudSnapshot ? (
                    <span
                      className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-100/80 px-2 py-0.5 text-[11px] font-medium text-amber-900"
                      role="status"
                      aria-live="polite"
                    >
                      Aguardando dados do Firebase (exibindo cache local)
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      cloudSyncStatus === "syncing"
                        ? "border-sky-300/70 bg-sky-100 text-sky-800"
                        : cloudSyncStatus === "error"
                          ? "border-red-300/80 bg-red-100 text-red-800"
                          : "border-emerald-300/70 bg-emerald-100 text-emerald-800"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {cloudSyncStatus === "syncing"
                      ? "Sincronizando..."
                      : cloudSyncStatus === "error"
                        ? "Erro de sincronização"
                        : cloudSyncAt
                          ? `Sincronizado às ${cloudSyncAt.toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}`
                          : "Sincronizado"}
                  </span>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[hsl(var(--muted-foreground))]" id="detalhe-servico-ro-toggle-label">
                {showRoTokens ? "RO visivel" : "RO oculto"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showRoTokens}
                aria-labelledby="detalhe-servico-ro-toggle-label"
                title={
                  tableEditable
                    ? "Bloqueie a edição para alternar a visualização de RO."
                    : showRoTokens
                      ? "Ocultar todos os RO da planilha"
                      : "Exibir novamente os RO da planilha"
                }
                disabled={tableEditable}
                className={`relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full border px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 ${
                  showRoTokens
                    ? "border-emerald-600/45 bg-emerald-500/20"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                } ${tableEditable ? "cursor-not-allowed opacity-60" : ""}`}
                onClick={() => setShowRoTokens((v) => !v)}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    showRoTokens ? "translate-x-[1.125rem]" : "translate-x-0"
                  }`}
                />
              </button>
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
                    const daySCountInvalidWhenLocked = !tableEditable && Boolean(servicosInvalidosPorDia[dkHead]);
                    return (
                    <th
                      key={day}
                      scope="col"
                      onContextMenu={(e) => openColumnMenu(e, dkHead)}
                      className={`cursor-context-menu border px-[0.35em] py-[0.2em] text-center align-middle font-medium ${
                        daySCountInvalidWhenLocked
                          ? "detalhe-servico-coluna-alerta border-red-500/90 bg-red-100/80 text-red-900"
                          : headDayGray
                            ? "border-[hsl(var(--border))] bg-neutral-200 text-[hsl(var(--foreground))]"
                            : "border-[hsl(var(--border))] bg-white"
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
                            ? "Com «RM1» ou «FC» no motorista: total = 24h por «S» e 8h por «RO» nas células dos dias (mês atual)."
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
                      tableEditable && motoristaOpts.length > 0 && !viewingOriginal;
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
                            readOnly={!tableEditable || viewingOriginal}
                            className={`${inputClass} ${!tableEditable || viewingOriginal ? inputLockedClass : ""}`}
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
                        const periodsThisMotor =
                          feriasForMonth[normalizeMotoristaName(motoristaVal)];
                        const isFeriasDay = isDayInFeriasPeriods(
                          year,
                          monthIndex,
                          day,
                          periodsThisMotor,
                        );
                        const feriasPrev =
                          day > 1 &&
                          isDayInFeriasPeriods(year, monthIndex, day - 1, periodsThisMotor);
                        const feriasNext =
                          day < lastCalendarDay &&
                          isDayInFeriasPeriods(year, monthIndex, day + 1, periodsThisMotor);
                        let isFeriasLabelDay = false;
                        if (isFeriasDay) {
                          let start = day;
                          let end = day;
                          while (
                            start > 1 &&
                            isDayInFeriasPeriods(year, monthIndex, start - 1, periodsThisMotor)
                          ) {
                            start -= 1;
                          }
                          while (
                            end < lastCalendarDay &&
                            isDayInFeriasPeriods(year, monthIndex, end + 1, periodsThisMotor)
                          ) {
                            end += 1;
                          }
                          const middle = Math.floor((start + end) / 2);
                          isFeriasLabelDay = day === middle;
                        }
                        const feriasBg = !tableEditable ? "bg-neutral-300/80" : "bg-neutral-200";
                        const hasIntervaloViolation =
                          !isFeriasDay &&
                          Boolean(intervaloMinimoViolations[`${rowId}__${dk}`]);
                        const daySCountInvalidWhenLocked = !tableEditable && Boolean(servicosInvalidosPorDia[dk]);
                        return (
                          <td
                            key={dk}
                            className={`relative min-w-[2rem] max-w-[4.5rem] border px-[0.25em] py-[0.15em] text-center align-middle ${
                              isFeriasDay
                                ? `${feriasBg} border-[hsl(var(--border))] ${feriasPrev ? "border-l-0" : ""} ${feriasNext ? "border-r-0" : ""}`
                                : tableEditable && hasIntervaloViolation
                                  ? "border-amber-500/90 bg-amber-50/55 ring-1 ring-inset ring-amber-400/70"
                                  : daySCountInvalidWhenLocked
                                    ? "detalhe-servico-coluna-alerta border-red-500/90 bg-red-100/70"
                                    : !tableEditable
                                      ? columnGray[dk] || isWeekend
                                        ? "border-[hsl(var(--border))] bg-neutral-300/80"
                                        : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)]"
                                      : dayColGray
                                        ? "border-[hsl(var(--border))] bg-neutral-200"
                                        : "border-[hsl(var(--border))] bg-white"
                            }`}
                          >
                            {isFeriasDay ? (
                              <input
                                type="text"
                                name={`dia-${rowId}-${dk}`}
                                autoComplete="off"
                                readOnly
                                aria-label="Férias"
                                title="Férias"
                                className={`${inputClassDay} ${inputLockedClass} placeholder:font-semibold placeholder:text-[hsl(var(--foreground))]/80`}
                                data-det-sheet-row={rowIndex}
                                data-det-sheet-col={colIndex}
                                value=""
                                placeholder={isFeriasLabelDay ? "FÉRIAS" : "\u00a0"}
                                onChange={() => {}}
                                onFocus={onCellFocus}
                                onBlur={() => {}}
                                onKeyDown={(e) => onSheetCellKeyDown(e, rowIndex, colIndex)}
                              />
                            ) : (
                              <input
                                type="text"
                                name={`dia-${rowId}-${dk}`}
                                autoComplete="off"
                                readOnly={!tableEditable || viewingOriginal}
                                className={`${inputClassDay} ${!tableEditable || viewingOriginal ? inputLockedClass : ""}`}
                                data-det-sheet-row={rowIndex}
                                data-det-sheet-col={colIndex}
                                value={
                                  showRoTokens
                                    ? stripCrossedPrefixToken(cells[rowId]?.[dk] ?? "")
                                    : stripRoTokens(stripCrossedPrefixToken(cells[rowId]?.[dk] ?? ""))
                                }
                                onChange={(e) => handleDayCellChange(rowId, dk, day, e.target.value)}
                                onDoubleClick={() => onDayCellDoubleClickToggleCrossed(rowId, dk)}
                                onFocus={onCellFocus}
                                onBlur={(e) => {
                                  const currentRaw = sheetRef.current.cells[rowId]?.[dk] ?? "";
                                  const hasCrossed = parseDayCellTokens(currentRaw).some((t) => t.crossed);
                                  onCellBlur(rowId, dk, hasCrossed ? currentRaw : e.target.value);
                                }}
                                onKeyDown={(e) => onSheetCellKeyDown(e, rowIndex, colIndex)}
                              />
                            )}
                            {(() => {
                              const parsed = parseDayCellTokens(cells[rowId]?.[dk] ?? "");
                              const crossedSingle = parsed.length === 1 && parsed[0]?.crossed;
                              if (!crossedSingle) return null;
                              const crossedToken = parsed[0]!.token;
                              if (!showRoTokens && crossedToken === "RO") return null;
                              return (
                                <span
                                  className="pointer-events-none absolute inset-0 flex items-center justify-center text-[15px] font-bold leading-none text-red-600"
                                  aria-hidden
                                >
                                  X
                                </span>
                              );
                            })()}
                          </td>
                        );
                      })}
                      {tableEditable &&
                        COLUNAS_EXTRAS_EDICAO.map(({ key: cellKey }, extraIdx) => {
                          const colIndex = days.length + 1 + extraIdx;
                          const motoristaVal = cells[rowId]?.[KEY_MOTORISTA] ?? "";
                          const cargaAutoPorMotorista = isMotoristaCargaHorariaAutomatica(motoristaVal);
                          const tally = tallyDayCellTokens(
                            cells[rowId] ?? {},
                            motoristaVal,
                            year,
                            monthIndex,
                            days,
                            feriasForMonth,
                          );
                          const cargaReadOnly =
                            cellKey === KEY_CARGA_HORARIA && cargaAutoPorMotorista;
                          const servRotReadOnly =
                            cellKey === KEY_NUM_SERVICOS || cellKey === KEY_NUM_ROTINAS;
                          const autoReadOnly = cargaReadOnly || servRotReadOnly;
                          let displayValue = cells[rowId]?.[cellKey] ?? "";
                          if (cellKey === KEY_CARGA_HORARIA && cargaAutoPorMotorista) {
                            displayValue = String(tally.horas);
                          } else if (cellKey === KEY_NUM_SERVICOS) {
                            displayValue = String(tally.s);
                          } else if (cellKey === KEY_NUM_ROTINAS) {
                            displayValue = String(tally.ro);
                          }
                          const inputReadOnly = !tableEditable || autoReadOnly || viewingOriginal;
                          const horasCargaNum =
                            cellKey === KEY_CARGA_HORARIA
                              ? cargaAutoPorMotorista
                                ? tally.horas
                                : parseHorasCargaTexto(cells[rowId]?.[KEY_CARGA_HORARIA] ?? "")
                              : null;
                          const cargaExcedeLimite =
                            cellKey === KEY_CARGA_HORARIA &&
                            horasCargaNum !== null &&
                            horasCargaNum > LIMITE_CARGA_HORAS_ALERTA;
                          const titleAuto =
                            cellKey === KEY_CARGA_HORARIA && cargaAutoPorMotorista
                              ? `Calculado: 24h × «S» + 8h × «RO» (células dos dias)${cargaExcedeLimite ? ` — acima de ${LIMITE_CARGA_HORAS_ALERTA}h` : ""}`
                              : cellKey === KEY_CARGA_HORARIA && !cargaAutoPorMotorista && cargaExcedeLimite
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
                  {diasNaoTrabalhadosRowsAuto.length === 0 ? (
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
                    diasNaoTrabalhadosRowsAuto.map(({ motoristaNome, diasSoNumeros, originalIndex }, rowIndex) => {
                      return (
                        <tr
                          key={`${motoristaNome}-${rowIndex}`}
                          onContextMenu={(e) => {
                            if (originalIndex === null) return;
                            openDiasNaoRowMenu(e, originalIndex);
                          }}
                        >
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
                                  key={`${motoristaNome}-${dayNum}`}
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

      <DetalheServicoFeriasModal
        open={feriasModalOpen}
        onOpenChange={setFeriasModalOpen}
        monthYear={monthYear}
        monthTitle={formatMonthYearTitlePt(monthYear)}
        motoristasCatalog={motoristasCatalogFerias}
        feriasForMonth={feriasForMonth}
        onSave={applyFeriasSave}
      />

      {intervaloModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-[3px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detalhe-servico-intervalo-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeIntervaloModal();
            }}
          >
            <div
              className="w-full max-w-xl overflow-hidden rounded-2xl border border-violet-200/60 bg-[hsl(var(--card))] shadow-[0_24px_70px_rgba(10,10,40,0.45)]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/18">
                    <AlertTriangle className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h3 id="detalhe-servico-intervalo-title" className="text-base font-semibold leading-tight">
                      Intervalo minimo de 3 dias nao respeitado
                    </h3>
                    <p className="mt-0.5 text-xs text-white/90">
                      Validacao para motoristas com RM1 ou FC
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 px-5 py-4">
                <p className="text-sm text-[hsl(var(--foreground))]">
                  O motorista <strong>{intervaloModal.motorista}</strong> teve o ultimo <strong>S/RO</strong> em{" "}
                  <strong>{formatDatePtBr(intervaloModal.dataUltimoServico)}</strong> e so pode receber nova
                  marcacao a partir de <strong>{formatDatePtBr(intervaloModal.dataMinimaPermitida)}</strong>.
                </p>
                <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Tentativa atual: <strong>{formatDatePtBr(intervaloModal.dataTentativa)}</strong>. Deseja
                  continuar mesmo assim?
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] px-5 py-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeIntervaloModal}>
                  Cancelar edicao
                </Button>
                <Button
                  type="button"
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700"
                  onClick={confirmIntervaloModal}
                >
                  Continuar mesmo assim
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
