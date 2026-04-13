import { useEffect, useState } from "react";

/** Estado persistido da aba Vistoria — Situação das VTR (localStorage). */

export type ChecklistKey =
  | "nivelOleo"
  | "agua"
  | "fluidosFreioDirecao"
  | "calibragemEstadoPneus"
  | "eletricaLuzes"
  | "sireneLuzesSom"
  | "documentacao"
  | "trianguloMacacoChaveRoda"
  | "limpezaInternaExterna"
  | "lanternagemGeral"
  | "outros";

export type VistoriaChecklist = Record<ChecklistKey, "OK" | "Alterações" | "">;
export type VistoriaChecklistNotes = Record<ChecklistKey, string>;

export type VistoriaInspection = {
  id: string;
  motorista: string;
  viatura: string;
  inspectionDate: string;
  viaturaNaOficina: "Sim" | "Não";
  checklist: VistoriaChecklist;
  checklistNotes: VistoriaChecklistNotes;
  createdAt: number;
};

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

export const INSPECTIONS_STORAGE_KEY = "sot_vistoria_inspections_v1";
export const RESOLVED_ISSUES_STORAGE_KEY = "sot_vistoria_resolved_issues_v1";
export const ISSUE_CONTROLS_STORAGE_KEY = "sot_vistoria_issue_controls_v1";

export const CHECKLIST_ITEM_LABELS: Record<ChecklistKey, string> = {
  nivelOleo: "Nível do Óleo",
  agua: "Água",
  fluidosFreioDirecao: "Fluídos de Freio e Direção",
  calibragemEstadoPneus: "Calibragem e estado dos Pneus",
  eletricaLuzes: "Elétrica e Luzes",
  sireneLuzesSom: "Sirene (Luzes e Som)",
  documentacao: "Documentação",
  trianguloMacacoChaveRoda: "Triângulo, Macaco e Chave de Roda",
  limpezaInternaExterna: "Limpeza Interna e Externa",
  lanternagemGeral: "Lanternagem Geral",
  outros: "Outros",
};

const CHECKLIST_KEYS = Object.keys(CHECKLIST_ITEM_LABELS) as ChecklistKey[];

function emptyChecklist(): VistoriaChecklist {
  return {
    nivelOleo: "",
    agua: "",
    fluidosFreioDirecao: "",
    calibragemEstadoPneus: "",
    eletricaLuzes: "",
    sireneLuzesSom: "",
    documentacao: "",
    trianguloMacacoChaveRoda: "",
    limpezaInternaExterna: "",
    lanternagemGeral: "",
    outros: "",
  };
}

function emptyChecklistNotes(): VistoriaChecklistNotes {
  const o: Record<string, string> = {};
  for (const k of CHECKLIST_KEYS) o[k] = "";
  return o as VistoriaChecklistNotes;
}

function isoDateFromCreated(createdAt: number): string {
  const d = new Date(createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function normalizeViaturaKey(v: string): string {
  return v.trim().toLowerCase();
}

function readInspections(): VistoriaInspection[] {
  try {
    const raw = localStorage.getItem(INSPECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VistoriaInspection[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.motorista === "string" &&
          typeof item.viatura === "string" &&
          (item.viaturaNaOficina === "Sim" || item.viaturaNaOficina === "Não"),
      )
      .map((item) => ({
        ...item,
        inspectionDate:
          typeof item.inspectionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.inspectionDate)
            ? item.inspectionDate
            : isoDateFromCreated(item.createdAt || Date.now()),
        checklist: { ...emptyChecklist(), ...(item.checklist ?? {}) },
        checklistNotes: { ...emptyChecklistNotes(), ...(item.checklistNotes ?? {}) },
      }));
  } catch {
    return [];
  }
}

function readResolvedIssues(): ResolvedIssue[] {
  try {
    const raw = localStorage.getItem(RESOLVED_ISSUES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ResolvedIssue[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.inspectionId === "string" &&
        typeof item.itemKey === "string" &&
        typeof item.resolvedAt === "number",
    );
  } catch {
    return [];
  }
}

function readIssueControls(): IssueControl[] {
  try {
    const raw = localStorage.getItem(ISSUE_CONTROLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IssueControl[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.inspectionId === "string" &&
        typeof item.itemKey === "string" &&
        typeof item.problemMarked === "boolean" &&
        typeof item.priorityMarked === "boolean" &&
        typeof item.printMarked === "boolean",
    );
  } catch {
    return [];
  }
}

function latestInspectionByVehicle(inspections: VistoriaInspection[]): Map<string, VistoriaInspection> {
  const map = new Map<string, VistoriaInspection>();
  for (const inspection of inspections) {
    const key = normalizeViaturaKey(inspection.viatura);
    if (!key) continue;
    const current = map.get(key);
    if (!current || inspection.createdAt > current.createdAt) map.set(key, inspection);
  }
  return map;
}

export type ProblemaMarcadoItem = {
  inspectionId: string;
  viatura: string;
  motorista: string;
  inspectionDate: string;
  itemKey: ChecklistKey;
  itemLabel: string;
  anotacao: string;
};

/** Itens pendentes (Alterações não resolvidos) com “Marcar Problema” ativo (padrão igual à tabela: marcado se não houver controle). */
export function getProblemasMarcadosSnapshot(): {
  viaturasComProblema: Set<string>;
  porViatura: Map<string, ProblemaMarcadoItem[]>;
} {
  const inspections = readInspections();
  const resolvedIssues = readResolvedIssues();
  const issueControls = readIssueControls();

  const resolvedSet = new Set(resolvedIssues.map((r) => `${r.inspectionId}:${r.itemKey}`));
  const controlMap = new Map<string, IssueControl>();
  for (const c of issueControls) controlMap.set(`${c.inspectionId}:${c.itemKey}`, c);

  const latest = latestInspectionByVehicle(inspections);
  const porViatura = new Map<string, ProblemaMarcadoItem[]>();
  const viaturasComProblema = new Set<string>();

  for (const inspection of latest.values()) {
    const vKey = normalizeViaturaKey(inspection.viatura);
    if (!vKey) continue;

    for (const key of CHECKLIST_KEYS) {
      if (inspection.checklist[key] !== "Alterações") continue;
      if (resolvedSet.has(`${inspection.id}:${key}`)) continue;

      const control = controlMap.get(`${inspection.id}:${key}`);
      const problemMarked = control?.problemMarked ?? true;
      if (!problemMarked) continue;

      const item: ProblemaMarcadoItem = {
        inspectionId: inspection.id,
        viatura: inspection.viatura.trim(),
        motorista: inspection.motorista.trim(),
        inspectionDate: inspection.inspectionDate,
        itemKey: key,
        itemLabel: CHECKLIST_ITEM_LABELS[key],
        anotacao: (inspection.checklistNotes[key] ?? "").trim(),
      };

      viaturasComProblema.add(vKey);
      if (!porViatura.has(vKey)) porViatura.set(vKey, []);
      porViatura.get(vKey)!.push(item);
    }
  }

  for (const [, list] of porViatura) {
    list.sort((a, b) => a.itemLabel.localeCompare(b.itemLabel, "pt-BR"));
  }

  return { viaturasComProblema, porViatura };
}

/** Atualiza quando outra aba grava no localStorage ou periodicamente (mesma aba). */
export function useVistoriaProblemasMarcadosRefresh(): {
  viaturasComProblema: Set<string>;
  porViatura: Map<string, ProblemaMarcadoItem[]>;
} {
  const [snap, setSnap] = useState(() => getProblemasMarcadosSnapshot());
  useEffect(() => {
    const refresh = () => setSnap(getProblemasMarcadosSnapshot());
    const id = window.setInterval(refresh, 2000);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return snap;
}
