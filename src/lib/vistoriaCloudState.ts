import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "./firebase/sotStateFirestore";
import type { ChecklistKey, VistoriaAssignment, VistoriaInspection } from "./vistoriaInspectionShared";

export type ResolvedIssue = {
  id: string;
  inspectionId: string;
  itemKey: ChecklistKey;
  resolvedAt: number;
};

export type IssueControl = {
  id: string;
  inspectionId: string;
  itemKey: ChecklistKey;
  problemMarked: boolean;
  priorityMarked: boolean;
  printMarked: boolean;
};

export type VistoriaCloudState = {
  assignments: VistoriaAssignment[];
  inspections: VistoriaInspection[];
  resolvedIssues: ResolvedIssue[];
  issueControls: IssueControl[];
  priorityOrderKeys: string[];
};

const EVENT_NAME = "sot-vistoria-cloud-changed";

const emptyState: VistoriaCloudState = {
  assignments: [],
  inspections: [],
  resolvedIssues: [],
  issueControls: [],
  priorityOrderKeys: [],
};

let cache: VistoriaCloudState = { ...emptyState };
let started = false;
let unsubscribe: (() => void) | null = null;

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x) => typeof x === "string" && x.length > 0) : [];
}

function safeChecklistKey(value: unknown): ChecklistKey | null {
  if (typeof value !== "string") return null;
  const allowed = new Set<string>([
    "nivelOleo",
    "agua",
    "fluidosFreioDirecao",
    "calibragemEstadoPneus",
    "eletricaLuzes",
    "sireneLuzesSom",
    "documentacao",
    "trianguloMacacoChaveRoda",
    "limpezaInternaExterna",
    "lanternagemGeral",
    "outros",
  ]);
  return allowed.has(value) ? (value as ChecklistKey) : null;
}

function normalizeResolvedIssues(value: unknown): ResolvedIssue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const r = row as Record<string, unknown>;
      const itemKey = safeChecklistKey(r.itemKey);
      if (!itemKey || typeof r.inspectionId !== "string") return null;
      return {
        id: typeof r.id === "string" ? r.id : `resolved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        inspectionId: r.inspectionId,
        itemKey,
        resolvedAt: typeof r.resolvedAt === "number" ? r.resolvedAt : Date.now(),
      } satisfies ResolvedIssue;
    })
    .filter((x): x is ResolvedIssue => x !== null);
}

function normalizeIssueControls(value: unknown): IssueControl[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const r = row as Record<string, unknown>;
      const itemKey = safeChecklistKey(r.itemKey);
      if (!itemKey || typeof r.inspectionId !== "string") return null;
      return {
        id: typeof r.id === "string" ? r.id : `control-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        inspectionId: r.inspectionId,
        itemKey,
        problemMarked: r.problemMarked !== false,
        priorityMarked: r.priorityMarked === true,
        printMarked: r.printMarked === true,
      } satisfies IssueControl;
    })
    .filter((x): x is IssueControl => x !== null);
}

function normalizeCloudPayload(payload: unknown): VistoriaCloudState {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return { ...emptyState };
  return {
    assignments: Array.isArray(p.assignments) ? (p.assignments as VistoriaAssignment[]) : [],
    inspections: Array.isArray(p.inspections) ? (p.inspections as VistoriaInspection[]) : [],
    resolvedIssues: normalizeResolvedIssues(p.resolvedIssues),
    issueControls: normalizeIssueControls(p.issueControls),
    priorityOrderKeys: toStringList(p.priorityOrderKeys),
  };
}

function dispatchChange() {
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    /* ignore */
  }
}

function setCache(next: VistoriaCloudState) {
  cache = next;
  dispatchChange();
}

export function getVistoriaCloudState(): VistoriaCloudState {
  return cache;
}

export function ensureVistoriaCloudStateSyncStarted(): void {
  if (started) return;
  started = true;
  unsubscribe = subscribeSotStateDoc(
    SOT_STATE_DOC.vistoria,
    (payload) => {
      setCache(normalizeCloudPayload(payload));
    },
    (err) => {
      console.warn("[SOT] Vistoria: falha ao sincronizar do Firebase", err);
    },
    { ignoreCachedSnapshotWhenOnline: true },
  );
}

export function stopVistoriaCloudStateSync(): void {
  unsubscribe?.();
  unsubscribe = null;
  started = false;
}

export function subscribeVistoriaCloudStateChange(listener: () => void): () => void {
  const wrapped = () => listener();
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}

export function updateVistoriaCloudState(updater: (prev: VistoriaCloudState) => VistoriaCloudState): void {
  const next = updater(cache);
  setCache(next);
  void setSotStateDocWithRetry(SOT_STATE_DOC.vistoria, next).catch((err) => {
    console.warn("[SOT] Vistoria: falha ao gravar no Firebase", err);
  });
}
