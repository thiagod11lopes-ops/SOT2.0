/** Tipos, checklist e persistência em localStorage partilhados entre desktop (Vistoria) e vista mobile. */

export type VistoriaAssignment = {
  id: string;
  motorista: string;
  viatura: string;
  createdAt: number;
};

export type InspectionAnswer = "Sim" | "Não";
export type ChecklistAnswer = "OK" | "Alterações";
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

export type VistoriaChecklist = Record<ChecklistKey, ChecklistAnswer | "">;
export type VistoriaChecklistNotes = Record<ChecklistKey, string>;

export type VistoriaInspection = {
  id: string;
  motorista: string;
  viatura: string;
  inspectionDate: string;
  viaturaNaOficina: InspectionAnswer;
  checklist: VistoriaChecklist;
  checklistNotes: VistoriaChecklistNotes;
  createdAt: number;
  /** Rubrica (PNG data URL) — preenchida na vista mobile ao gravar. */
  rubrica?: string;
};

export const ASSIGNMENTS_STORAGE_KEY = "sot_vistoria_assignments_v1";
export const INSPECTIONS_STORAGE_KEY = "sot_vistoria_inspections_v1";

export const CHECKLIST_ITEMS: { key: ChecklistKey; label: string }[] = [
  { key: "nivelOleo", label: "Nível do Óleo" },
  { key: "agua", label: "Água" },
  { key: "fluidosFreioDirecao", label: "Fluídos de Freio e Direção" },
  { key: "calibragemEstadoPneus", label: "Calibragem e estado dos Pneus" },
  { key: "eletricaLuzes", label: "Elétrica e Luzes" },
  { key: "sireneLuzesSom", label: "Sirene (Luzes e Som)" },
  { key: "documentacao", label: "Documentação" },
  { key: "trianguloMacacoChaveRoda", label: "Triângulo, Macaco e Chave de Roda" },
  { key: "limpezaInternaExterna", label: "Limpeza Interna e Externa" },
  { key: "lanternagemGeral", label: "Lanternagem Geral" },
  { key: "outros", label: "Outros" },
];

export function emptyChecklist(): VistoriaChecklist {
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

export function emptyChecklistNotes(): VistoriaChecklistNotes {
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

export function isoDateFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseIsoDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function formatIsoDatePtBr(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("pt-BR");
}

export function normalizeDriverKey(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function readVistoriaAssignments(): VistoriaAssignment[] {
  try {
    const raw = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VistoriaAssignment[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.motorista && item.viatura);
  } catch {
    return [];
  }
}

export function readVistoriaInspections(): VistoriaInspection[] {
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
            : isoDateFromDate(new Date(item.createdAt || Date.now())),
        checklist: { ...emptyChecklist(), ...(item.checklist ?? {}) },
        checklistNotes: { ...emptyChecklistNotes(), ...(item.checklistNotes ?? {}) },
        rubrica: typeof item.rubrica === "string" ? item.rubrica : undefined,
      }));
  } catch {
    return [];
  }
}

function notifyVistoriaInspectionsChanged(): void {
  try {
    window.dispatchEvent(new Event("sot-vistoria-inspections-changed"));
  } catch {
    /* ignore */
  }
}

/** Acrescenta uma vistoria (ex.: vista mobile) mantendo o mesmo formato que o desktop grava em massa. */
export function appendVistoriaInspection(inspection: VistoriaInspection): void {
  const prev = readVistoriaInspections();
  try {
    localStorage.setItem(INSPECTIONS_STORAGE_KEY, JSON.stringify([...prev, inspection]));
    notifyVistoriaInspectionsChanged();
  } catch {
    /* ignore */
  }
}
