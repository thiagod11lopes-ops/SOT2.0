import {
  SOT_STATE_DOC,
  readSotStateDocFromServer,
  setSotStateDocWithRetry,
  subscribeSotStateDoc,
} from "./firebase/sotStateFirestore";
import type { ChecklistKey, VistoriaAssignment, VistoriaInspection } from "./vistoriaInspectionShared";
import { saveVistoriaRubricaByInspectionId } from "./firebase/vistoriaRubricaFirestore";
import { buildVistoriaRubricaRef, isRubricaImageDataUrl, parseVistoriaRubricaRef } from "./rubricaDrawing";

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
  updatedAt: number;
};

const EVENT_NAME = "sot-vistoria-cloud-changed";

const emptyState: VistoriaCloudState = {
  assignments: [],
  inspections: [],
  resolvedIssues: [],
  issueControls: [],
  priorityOrderKeys: [],
  updatedAt: 0,
};

let cache: VistoriaCloudState = { ...emptyState };
let started = false;
let unsubscribe: (() => void) | null = null;
let hydrated = false;
let rubricaMigrationInFlight = false;

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
    updatedAt: typeof p.updatedAt === "number" && Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
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
  if (next.updatedAt < cache.updatedAt) return;
  cache = next;
  hydrated = true;
  dispatchChange();
}

async function migrateInlineRubricasIfNeeded(snapshot: VistoriaCloudState): Promise<void> {
  if (rubricaMigrationInFlight) return;
  const inlineTargets = snapshot.inspections.filter((ins) => {
    const rubrica = typeof ins.rubrica === "string" ? ins.rubrica.trim() : "";
    const rubricaAdmin = typeof ins.rubricaAdministrativa === "string" ? ins.rubricaAdministrativa.trim() : "";
    const commonIsInlineImage = rubrica.length > 0 && isRubricaImageDataUrl(rubrica) && !parseVistoriaRubricaRef(rubrica);
    const adminIsInlineImage =
      rubricaAdmin.length > 0 && isRubricaImageDataUrl(rubricaAdmin) && !parseVistoriaRubricaRef(rubricaAdmin);
    return commonIsInlineImage || adminIsInlineImage;
  });
  if (inlineTargets.length === 0) return;

  rubricaMigrationInFlight = true;
  try {
    for (const ins of inlineTargets) {
      const id = String(ins.id ?? "").trim();
      if (!id) continue;
      const rubrica = typeof ins.rubrica === "string" ? ins.rubrica.trim() : "";
      const rubricaAdmin = typeof ins.rubricaAdministrativa === "string" ? ins.rubricaAdministrativa.trim() : "";
      if (rubrica && isRubricaImageDataUrl(rubrica) && !parseVistoriaRubricaRef(rubrica)) {
        await saveVistoriaRubricaByInspectionId({ inspectionId: id, kind: "comum", dataUrl: rubrica });
      }
      if (rubricaAdmin && isRubricaImageDataUrl(rubricaAdmin) && !parseVistoriaRubricaRef(rubricaAdmin)) {
        await saveVistoriaRubricaByInspectionId({ inspectionId: id, kind: "administrativa", dataUrl: rubricaAdmin });
      }
    }

    await updateVistoriaCloudState((prev) => {
      let changed = false;
      const nextInspections = prev.inspections.map((ins) => {
        const id = String(ins.id ?? "").trim();
        if (!id) return ins;
        let next = ins;
        const rubrica = typeof ins.rubrica === "string" ? ins.rubrica.trim() : "";
        if (rubrica && isRubricaImageDataUrl(rubrica) && !parseVistoriaRubricaRef(rubrica)) {
          next = { ...next, rubrica: buildVistoriaRubricaRef(id, "comum") };
          changed = true;
        }
        const rubricaAdmin = typeof ins.rubricaAdministrativa === "string" ? ins.rubricaAdministrativa.trim() : "";
        if (rubricaAdmin && isRubricaImageDataUrl(rubricaAdmin) && !parseVistoriaRubricaRef(rubricaAdmin)) {
          next = { ...next, rubricaAdministrativa: buildVistoriaRubricaRef(id, "administrativa") };
          changed = true;
        }
        return next;
      });
      return changed ? { ...prev, inspections: nextInspections } : prev;
    });
  } catch (err) {
    console.warn("[SOT] Vistoria: falha ao migrar rubricas inline para referência", err);
  } finally {
    rubricaMigrationInFlight = false;
  }
}

export function getVistoriaCloudState(): VistoriaCloudState {
  return cache;
}

export function isVistoriaCloudStateHydrated(): boolean {
  return hydrated;
}

export function ensureVistoriaCloudStateSyncStarted(): void {
  if (started) return;
  started = true;
  unsubscribe = subscribeSotStateDoc(
    SOT_STATE_DOC.vistoria,
    (payload) => {
      const next = normalizeCloudPayload(payload);
      setCache(next);
      void migrateInlineRubricasIfNeeded(next);
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

export async function updateVistoriaCloudState(
  updater: (prev: VistoriaCloudState) => VistoriaCloudState,
): Promise<void> {
  let prev = cache;
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const serverPayload = await readSotStateDocFromServer(SOT_STATE_DOC.vistoria);
      const serverState = normalizeCloudPayload(serverPayload);
      if (serverState.updatedAt >= prev.updatedAt) {
        prev = serverState;
        setCache(serverState);
      }
    } catch (err) {
      console.warn("[SOT] Vistoria: falha ao ler estado atual do servidor antes de gravar", err);
    }
  }
  const rawNext = updater(prev);
  const next: VistoriaCloudState = {
    ...rawNext,
    updatedAt: Math.max(Date.now(), Number(rawNext.updatedAt || 0), prev.updatedAt + 1),
  };
  setCache(next);
  try {
    await setSotStateDocWithRetry(SOT_STATE_DOC.vistoria, next);
  } catch (err) {
    setCache(prev);
    console.warn("[SOT] Vistoria: falha ao gravar no Firebase", err);
    throw err;
  }
}
