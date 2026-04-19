import {
  createInitialRdvRows,
  newRdvId,
  type RdvRowAdm,
  type RdvRowAmb,
} from "./relatorioDiarioViaturasModel";
import { SOT_STATE_DOC, setSotStateDocWithRetry } from "./firebase/sotStateFirestore";

export type RdvDayPersisted = {
  v: 1;
  rowsAmb: RdvRowAmb[];
  rowsAdm: RdvRowAdm[];
  assinaturaNome: string;
  efetivoAmb: number;
  efetivoAdm: number;
  resumoUti: number;
  resumoUsb: number;
  /** `true` após «Gerar PDF» com sucesso para esta data. */
  pdfSalvo: boolean;
};

export type RdvDayHydrated = Omit<RdvDayPersisted, "v">;

const STORAGE_KEY = "sot_rdv_by_date_v1";
/** Export para backup / restauro. */
export const RDV_LOCAL_STORAGE_KEY = STORAGE_KEY;

export const RDV_STORAGE_EVENT = "sot-rdv-storage";

let rdvFirebaseSyncActive = false;
let rdvFirebaseMap: Record<string, RdvDayPersisted> = {};
let suppressRemoteUntilMs = 0;
const SUPPRESS_REMOTE_MS = 5000;

function bumpRdvSuppressRemote(): void {
  suppressRemoteUntilMs = Date.now() + SUPPRESS_REMOTE_MS;
}

function isValidRdvDayPersisted(v: unknown): v is RdvDayPersisted {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.v === 1 && Array.isArray(o.rowsAmb) && Array.isArray(o.rowsAdm);
}

function normalizeRdvFirestorePayload(raw: unknown): Record<string, RdvDayPersisted> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, RdvDayPersisted> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    if (!isValidRdvDayPersisted(v)) continue;
    out[k] = v;
  }
  return out;
}

/** Ativado pelo `RdvFirebaseSyncProvider` quando o modo só-Firebase está ligado. */
export function setRdvFirebaseSyncActive(active: boolean): void {
  rdvFirebaseSyncActive = active;
  if (active) {
    rdvFirebaseMap = {};
  } else {
    rdvFirebaseMap = {};
  }
}

/** Snapshot remoto (listener Firestore). */
export function applyRdvFirebaseRemotePayload(payload: unknown | null): void {
  if (!rdvFirebaseSyncActive) return;
  if (Date.now() < suppressRemoteUntilMs) return;
  rdvFirebaseMap = normalizeRdvFirestorePayload(payload);
  window.dispatchEvent(new Event(RDV_STORAGE_EVENT));
}

function readAllLocal(): Record<string, RdvDayPersisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    return p as Record<string, RdvDayPersisted>;
  } catch {
    return {};
  }
}

function readAll(): Record<string, RdvDayPersisted> {
  if (rdvFirebaseSyncActive) {
    return rdvFirebaseMap;
  }
  return readAllLocal();
}

function writeAll(map: Record<string, RdvDayPersisted>): void {
  if (rdvFirebaseSyncActive) {
    rdvFirebaseMap = { ...map };
    bumpRdvSuppressRemote();
    window.dispatchEvent(new Event(RDV_STORAGE_EVENT));
    void setSotStateDocWithRetry(SOT_STATE_DOC.rdvByDate, rdvFirebaseMap).catch((e) => {
      console.error("[SOT] Gravar RDV na nuvem:", e);
    });
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(RDV_STORAGE_EVENT));
}

function defaultHydrated(): RdvDayHydrated {
  const init = createInitialRdvRows();
  return {
    rowsAmb: init.amb,
    rowsAdm: init.adm,
    assinaturaNome: "",
    efetivoAmb: 10,
    efetivoAdm: 14,
    resumoUti: 5,
    resumoUsb: 4,
    pdfSalvo: false,
  };
}

export function loadRdvDay(isoDate: string): RdvDayHydrated {
  const map = readAll();
  const row = map[isoDate];
  if (!row || row.v !== 1) return defaultHydrated();
  return {
    rowsAmb: row.rowsAmb,
    rowsAdm: row.rowsAdm,
    assinaturaNome: row.assinaturaNome ?? "",
    efetivoAmb: row.efetivoAmb ?? 10,
    efetivoAdm: row.efetivoAdm ?? 14,
    resumoUti: row.resumoUti ?? 5,
    resumoUsb: row.resumoUsb ?? 4,
    pdfSalvo: Boolean(row.pdfSalvo),
  };
}

/** Mantém `pdfSalvo` anterior se já existir, salvo quando `forcePdfSalvo` é definido. */
export function persistRdvDraft(
  isoDate: string,
  data: Omit<RdvDayHydrated, "pdfSalvo"> & { pdfSalvo?: boolean },
): void {
  const map = readAll();
  const prev = map[isoDate];
  const pdfSalvo =
    data.pdfSalvo !== undefined ? data.pdfSalvo : prev?.pdfSalvo === true ? true : false;
  map[isoDate] = {
    v: 1,
    rowsAmb: data.rowsAmb,
    rowsAdm: data.rowsAdm,
    assinaturaNome: data.assinaturaNome,
    efetivoAmb: data.efetivoAmb,
    efetivoAdm: data.efetivoAdm,
    resumoUti: data.resumoUti,
    resumoUsb: data.resumoUsb,
    pdfSalvo,
  };
  writeAll(map);
}

/** Grava o relatório atual e marca a data como «SALVO» (PDF gerado). */
export function markRdvPdfSaved(isoDate: string, draft: Omit<RdvDayHydrated, "pdfSalvo">): void {
  persistRdvDraft(isoDate, { ...draft, pdfSalvo: true });
}

export function getPdfSalvoIsoSet(): Set<string> {
  return new Set(
    Object.entries(readAll())
      .filter(([, v]) => v?.v === 1 && v.pdfSalvo)
      .map(([k]) => k),
  );
}

/** `true` se existir relatório gravado para a data (`v === 1`). */
export function hasPersistedRdvDay(isoDate: string): boolean {
  const map = readAll();
  const row = map[isoDate];
  return Boolean(row && row.v === 1);
}

/**
 * Maior data ISO com RDV gravado estritamente anterior a `isoDate`.
 * Usado para pré-preencher um dia pendente (vermelho) a partir do relatório anterior.
 */
export function getLatestPersistedRdvIsoStrictlyBefore(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const map = readAll();
  let best: string | null = null;
  for (const k of Object.keys(map)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const row = map[k];
    if (!row || row.v !== 1) continue;
    if (k >= isoDate) continue;
    if (best === null || k > best) best = k;
  }
  return best;
}

/** Maior data ISO estritamente anterior a `isoDate` com PDF já gerado (base para pré-preencher o dia pendente). */
export function getLatestPersistedRdvIsoWithPdfSalvoStrictlyBefore(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const map = readAll();
  let best: string | null = null;
  for (const k of Object.keys(map)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const row = map[k];
    if (!row || row.v !== 1 || !row.pdfSalvo) continue;
    if (k >= isoDate) continue;
    if (best === null || k > best) best = k;
  }
  return best;
}

export type LoadRdvDayForEditResult = {
  data: RdvDayHydrated;
  /** Preenchido a partir desta data (cópia completa para RDV ainda sem rascunho gravado). */
  filledFromPreviousIso: string | null;
};

/**
 * Carrega o RDV para edição: se estiver pendente (sem PDF salvo), copia o conteúdo do **último**
 * relatório com PDF gerado numa data anterior (ex.: dia 19 pendente ← dia 18 salvo).
 * Não bloqueia por rascunho/replicação já gravado para a data — isso impedia a cópia.
 */
export function loadRdvDayForEdit(isoDate: string): LoadRdvDayForEditResult {
  const snap = loadRdvDay(isoDate);
  if (snap.pdfSalvo) {
    return { data: snap, filledFromPreviousIso: null };
  }
  const sourceIso = getLatestPersistedRdvIsoWithPdfSalvoStrictlyBefore(isoDate);
  if (!sourceIso) {
    return { data: snap, filledFromPreviousIso: null };
  }
  const prev = loadRdvDay(sourceIso);
  const data: RdvDayHydrated = {
    rowsAmb: prev.rowsAmb.map((r) => ({ ...r, id: newRdvId() })),
    rowsAdm: prev.rowsAdm.map((r) => ({ ...r, id: newRdvId() })),
    assinaturaNome: prev.assinaturaNome,
    efetivoAmb: prev.efetivoAmb,
    efetivoAdm: prev.efetivoAdm,
    resumoUti: prev.resumoUti,
    resumoUsb: prev.resumoUsb,
    pdfSalvo: false,
  };
  return { data, filledFromPreviousIso: sourceIso };
}

/**
 * Remove só a marca «PDF gerado» para a data; mantém linhas e restantes campos.
 * Devolve `false` se não existir relatório gravado.
 */
export function clearRdvPdfSalvoKeepData(isoDate: string): boolean {
  const map = readAll();
  const row = map[isoDate];
  if (!row || row.v !== 1) return false;
  map[isoDate] = { ...row, pdfSalvo: false };
  writeAll(map);
  return true;
}

/** Entre todas as datas com RDV gravado (`v === 1`), devolve a ISO `yyyy-mm-dd` maior; `null` se não houver nenhuma. */
export function getLatestPersistedRdvIsoDate(): string | null {
  const map = readAll();
  let best: string | null = null;
  for (const k of Object.keys(map)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const row = map[k];
    if (!row || row.v !== 1) continue;
    if (best === null || k > best) best = k;
  }
  return best;
}

/**
 * Placas «Inoperante» no RDV da **data mais recente** entre os relatórios gravados.
 * Usado em Cadastrar Saída para bloquear viatura (sempre alinhado ao último RDV guardado).
 */
export function getRdvPlacasInoperantesFromLatestPersistedRdv(): Set<string> {
  const iso = getLatestPersistedRdvIsoDate();
  if (!iso) return new Set();
  return getRdvPlacasInoperantesForDate(iso);
}

function cloneRdvDraft(d: Omit<RdvDayHydrated, "pdfSalvo">): Omit<RdvDayHydrated, "pdfSalvo"> {
  return {
    rowsAmb: d.rowsAmb.map((r) => ({ ...r })),
    rowsAdm: d.rowsAdm.map((r) => ({ ...r })),
    assinaturaNome: d.assinaturaNome,
    efetivoAmb: d.efetivoAmb,
    efetivoAdm: d.efetivoAdm,
    resumoUti: d.resumoUti,
    resumoUsb: d.resumoUsb,
  };
}

/**
 * Copia o conteúdo editado do RDV da data `sourceReportIso` para cada data em `targetIsos`
 * (apenas datas estritamente posteriores a `sourceReportIso`). Cada dia guardado fica como rascunho (`pdfSalvo: false`);
 * ao abrir esse dia, o cabeçalho usa a data correta desse relatório.
 */
export function replicateRdvContentToFutureDates(
  sourceReportIso: string,
  targetIsos: string[],
  draft: Omit<RdvDayHydrated, "pdfSalvo">,
): void {
  const cloned = cloneRdvDraft(draft);
  const seen = new Set<string>();
  for (const iso of targetIsos) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    if (iso <= sourceReportIso) continue;
    if (seen.has(iso)) continue;
    seen.add(iso);
    persistRdvDraft(iso, { ...cloned, pdfSalvo: false });
  }
}

export function isoDateFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Placas com situação «Inoperante» no RDV **gravado** para `isoDate` (sem rascunho padrão).
 * Usado em Cadastrar Saída para bloquear viatura.
 */
export function getRdvPlacasInoperantesForDate(isoDate: string): Set<string> {
  const map = readAll();
  const row = map[isoDate];
  if (!row || row.v !== 1) return new Set();
  const out = new Set<string>();
  for (const r of row.rowsAmb) {
    if (r.situacao === "Inoperante" && r.placa.trim()) out.add(r.placa.trim().toLowerCase());
  }
  for (const r of row.rowsAdm) {
    if (r.situacao === "Inoperante" && r.placa.trim()) out.add(r.placa.trim().toLowerCase());
  }
  return out;
}
