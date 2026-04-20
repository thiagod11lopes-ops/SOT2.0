/** Tipos, checklist e persistência em localStorage partilhados entre desktop (Vistoria) e vista mobile. */

import { isoDateToPtBr } from "./dateFormat";
import {
  ensureVistoriaCloudStateSyncStarted,
  getVistoriaCloudState,
  isVistoriaCloudStateHydrated,
  updateVistoriaCloudState,
} from "./vistoriaCloudState";

export type VistoriaAssignment = {
  id: string;
  motorista: string;
  viatura: string;
  createdAt: number;
};

export const VIATURA_LOCALIZACAO_OPCOES = ["A Bordo", "Na Oficina", "Destacada"] as const;
export type ViaturaLocalizacao = (typeof VIATURA_LOCALIZACAO_OPCOES)[number];

/** Migra registos antigos (`viaturaNaOficina`: Sim/Não). */
export function migrateLocalizacaoViaturaFromStorage(item: {
  localizacaoViatura?: unknown;
  viaturaNaOficina?: unknown;
}): ViaturaLocalizacao {
  const v = item.localizacaoViatura ?? item.viaturaNaOficina;
  if (v === "A Bordo" || v === "Na Oficina" || v === "Destacada") return v;
  if (v === "Sim") return "Na Oficina";
  if (v === "Não") return "A Bordo";
  return "A Bordo";
}

export function isViaturaLocalizacao(v: unknown): v is ViaturaLocalizacao {
  return v === "A Bordo" || v === "Na Oficina" || v === "Destacada";
}

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
  localizacaoViatura: ViaturaLocalizacao;
  checklist: VistoriaChecklist;
  checklistNotes: VistoriaChecklistNotes;
  createdAt: number;
  /** Rubrica (PNG data URL) — preenchida na vista mobile ao gravar (vistoria normal). */
  rubrica?: string;
  /** Vistoria aberta pelo fluxo «Vistoria administrativa» no mobile. */
  vistoriaAdministrativa?: boolean;
  /** Rubrica do vistoriador quando a vistoria é administrativa (PNG data URL). */
  rubricaAdministrativa?: string;
  /** Gravada na vista mobile (após rubrica e confirmar). Usado para listar na Situação das VTR. */
  origemMobile?: boolean;
  /** Vistoria de origem usada no pré-preenchimento (fluxo administrativo). */
  prefillSourceInspectionId?: string;
  /** Motorista da vistoria comum anterior (exibição na Situação das VTR). */
  prefillMotorista?: string;
  /** Data ISO (yyyy-mm-dd) da vistoria comum anterior. */
  prefillInspectionDate?: string;
  /** Itens em que o administrativo alterou checklist ou observações face ao formulário ao abrir. */
  itensAlteradosAdministracao?: ChecklistKey[];
  /** Por item: texto mantido normal + trecho editado na administrativa (itálico na UI). */
  observacaoSegmentacaoAdmin?: Partial<Record<ChecklistKey, { plain: string; italic: string }>>;
};

export const ASSIGNMENTS_STORAGE_KEY = "sot_vistoria_assignments_v1";
export const INSPECTIONS_STORAGE_KEY = "sot_vistoria_inspections_v1";

type StoredResolvedIssue = { inspectionId?: unknown; itemKey?: unknown };

function readResolvedIssueKeySet(): Set<string> {
  ensureVistoriaCloudStateSyncStarted();
  const parsed = getVistoriaCloudState().resolvedIssues as StoredResolvedIssue[];
  if (!Array.isArray(parsed)) return new Set();
  const set = new Set<string>();
  for (const r of parsed) {
    const inspectionId = typeof r?.inspectionId === "string" ? r.inspectionId : "";
    const itemKey = isChecklistKey(r?.itemKey) ? r.itemKey : "";
    if (inspectionId && itemKey) set.add(`${inspectionId}:${itemKey}`);
  }
  return set;
}

function notifyResolvedIssuesChanged(): void {
  try {
    window.dispatchEvent(new Event("sot-vistoria-resolved-issues-changed"));
  } catch {
    /* ignore */
  }
}

export function appendResolvedIssue(inspectionId: string, itemKey: ChecklistKey): void {
  const id = String(inspectionId ?? "").trim();
  if (!id) return;
  if (!isChecklistKey(itemKey)) return;
  ensureVistoriaCloudStateSyncStarted();
  const key = `${id}:${itemKey}`;
  const prevSet = readResolvedIssueKeySet();
  if (prevSet.has(key)) return;
  void updateVistoriaCloudState((prev) => ({
    ...prev,
    resolvedIssues: [
      ...prev.resolvedIssues,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        inspectionId: id,
        itemKey,
        resolvedAt: Date.now(),
      },
    ],
  }));
  notifyResolvedIssuesChanged();
}

const CHECKLIST_KEY_SET = new Set<ChecklistKey>(
  [
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
  ] as ChecklistKey[],
);

function isChecklistKey(k: unknown): k is ChecklistKey {
  return typeof k === "string" && CHECKLIST_KEY_SET.has(k as ChecklistKey);
}

/** Texto anterior normal + parte editada na administrativa (itálico na UI). */
export function segmentarObservacaoAdmin(snapshotNote: string, finalNote: string): { plain: string; italic: string } {
  const s = String(snapshotNote ?? "");
  const f = String(finalNote ?? "");
  if (f.startsWith(s)) return { plain: s, italic: f.slice(s.length) };
  return { plain: s, italic: f };
}

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

/** Nem OK nem Anotações (`""`) → assume OK em cada chave. */
export function checklistComOkPorDefeito(checklist: VistoriaChecklist): VistoriaChecklist {
  const out: VistoriaChecklist = { ...checklist };
  for (const { key } of CHECKLIST_ITEMS) {
    if (out[key] === "") out[key] = "OK";
  }
  return out;
}

/** Com «Anotações» (`Alterações`) marcado, exige texto em observações do item. Devolve o rótulo do primeiro item em falta ou `null`. */
export function primeiroLabelAnotacoesSemObservacao(
  checklist: VistoriaChecklist,
  notes: VistoriaChecklistNotes,
): string | null {
  for (const { key, label } of CHECKLIST_ITEMS) {
    if (checklist[key] === "Alterações" && !String(notes[key] ?? "").trim()) {
      return label;
    }
  }
  return null;
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

/** Exibe data a partir de `yyyy-mm-dd` sempre como dd/mm/aaaa (igual ao resto do SOT). */
export function formatIsoDatePtBr(iso: string): string {
  const pt = isoDateToPtBr(iso);
  return pt || iso;
}

/**
 * Chave estável para comparar nomes de motorista: minúsculas, sem acento, espaços colapsados.
 * Hífen vira espaço (ex.: «FC-HÉLIO» e «FC HÉLIO» produzem a mesma chave «fc helio»).
 */
export function normalizeDriverKey(name: string): string {
  return name
    .trim()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Tokeniza chave já normalizada; reforça hífen como separador se ainda existir. */
function tokensMotoristaComparacao(nk: string): string[] {
  return nk
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Compara duas chaves já normalizadas (minúsculas, sem acento): nome na escala (Detalhe de Serviço)
 * vs nome no vínculo de vistoria (catálogo), ex. "helio" ↔ "rm1 helio", "silva" ↔ "joao silva".
 */
function motoristaKeysMatchForVistoria(na: string, nb: string): boolean {
  if (!na || !nb) return false;
  if (na === nb) return true;
  const A = tokensMotoristaComparacao(na);
  const B = tokensMotoristaComparacao(nb);
  const [shorter, longer] = A.length <= B.length ? [A, B] : [B, A];
  if (!shorter.length || longer.length < shorter.length) return false;
  let pref = true;
  for (let i = 0; i < shorter.length; i++) {
    if (longer[i] !== shorter[i]) {
      pref = false;
      break;
    }
  }
  if (pref) return true;
  let suf = true;
  for (let i = 0; i < shorter.length; i++) {
    if (longer[longer.length - shorter.length + i] !== shorter[i]) {
      suf = false;
      break;
    }
  }
  if (suf) return true;
  if (shorter.length === 1) return longer.includes(shorter[0]!);
  return false;
}

/** Verifica se dois nomes de motorista (escala, vínculo ou vistoria gravada) referem-se à mesma pessoa. */
export function nomesMotoristaVistoriaEquivalentes(a: string, b: string): boolean {
  return motoristaKeysMatchForVistoria(normalizeDriverKey(a), normalizeDriverKey(b));
}

/**
 * Última vistoria para pré-preencher o formulário — **sempre restrita à mesma viatura**:
 * 1) mesmo motorista e mesma placa; 2) se não houver, a mais recente com a mesma placa (outro motorista).
 * Não reutiliza dados de outra viatura.
 */
export function findLatestInspectionForFormPrefill(
  inspections: VistoriaInspection[],
  motorista: string,
  viatura: string,
): VistoriaInspection | undefined {
  const newest = (list: VistoriaInspection[]): VistoriaInspection | undefined => {
    if (list.length === 0) return undefined;
    return [...list].sort((a, b) => b.createdAt - a.createdAt)[0];
  };

  const vNorm = viatura.trim().toLowerCase();
  if (!vNorm) return undefined;

  const porViatura = inspections.filter((i) => i.viatura.trim().toLowerCase() === vNorm);
  if (porViatura.length === 0) return undefined;

  const sameMotoristaViatura = porViatura.filter((i) =>
    nomesMotoristaVistoriaEquivalentes(i.motorista, motorista),
  );
  const preferida = newest(sameMotoristaViatura);
  if (preferida) return preferida;

  return newest(porViatura);
}

/**
 * Aplica no formulário os itens que aparecem na Situação das VTR (pendências):
 * para a viatura, qualquer motorista, apenas itens com «Alterações» ainda não resolvidos.
 * Isto garante que o formulário abre com todas as observações pendentes visíveis.
 */
export function applySituacaoVtrPendingPrefillForViatura(args: {
  inspections: VistoriaInspection[];
  viatura: string;
  baseChecklist: VistoriaChecklist;
  baseNotes: VistoriaChecklistNotes;
}): { checklist: VistoriaChecklist; notes: VistoriaChecklistNotes } {
  const vNorm = args.viatura.trim().toLowerCase();
  if (!vNorm) return { checklist: args.baseChecklist, notes: args.baseNotes };
  const resolvedSet = readResolvedIssueKeySet();

  const nextChecklist: VistoriaChecklist = { ...args.baseChecklist };
  const nextNotes: VistoriaChecklistNotes = { ...args.baseNotes };

  const porViatura = args.inspections.filter((i) => i.viatura.trim().toLowerCase() === vNorm);
  /** Tira do formulário o eco de itens já marcados «Resolver» na Situação das VTR (o registo na inspeção mantém-se, mas não pré-preenche). */
  for (const ins of porViatura) {
    for (const { key } of CHECKLIST_ITEMS) {
      if (!resolvedSet.has(`${ins.id}:${key}`)) continue;
      nextChecklist[key] = "OK";
      nextNotes[key] = "";
    }
  }

  const relevant = [...porViatura].sort((a, b) => b.createdAt - a.createdAt);

  const filled = new Set<ChecklistKey>();
  for (const ins of relevant) {
    for (const { key } of CHECKLIST_ITEMS) {
      if (filled.has(key)) continue;
      if (ins.checklist[key] !== "Alterações") continue;
      if (resolvedSet.has(`${ins.id}:${key}`)) continue;
      nextChecklist[key] = "Alterações";
      nextNotes[key] = String(ins.checklistNotes[key] ?? "").trim();
      filled.add(key);
    }
  }

  return { checklist: nextChecklist, notes: nextNotes };
}

/**
 * Ao salvar uma vistoria comum, alinha pendências administrativas na Situação das VTR:
 * - se o item deixa de estar em «Alterações» (ex.: OK), resolve todas as pendências administrativas desse item na viatura;
 * - se mantém «Alterações» com o mesmo texto que uma vistoria administrativa pendente, resolve essa(s) linha(s).
 */
export function autoResolveAdministrativeRedundanciesOnCommonSave(args: {
  inspections: VistoriaInspection[];
  viatura: string;
  checklist: VistoriaChecklist;
  notes: VistoriaChecklistNotes;
}): void {
  const vNorm = args.viatura.trim().toLowerCase();
  if (!vNorm) return;
  const resolvedSet = readResolvedIssueKeySet();

  const adminSorted = args.inspections
    .filter((i) => i.vistoriaAdministrativa === true && i.viatura.trim().toLowerCase() === vNorm)
    .sort((a, b) => b.createdAt - a.createdAt);

  for (const { key } of CHECKLIST_ITEMS) {
    if (args.checklist[key] !== "Alterações") {
      /** Item retirado na vistoria comum (ex.: OK): todas as pendências administrativas desse item nesta viatura passam a resolvidas. */
      for (const ins of adminSorted) {
        if (ins.checklist[key] !== "Alterações") continue;
        const k = `${ins.id}:${key}`;
        if (resolvedSet.has(k)) continue;
        appendResolvedIssue(ins.id, key);
        resolvedSet.add(k);
      }
      continue;
    }

    const noteCur = String(args.notes[key] ?? "").trim();
    if (!noteCur) continue;

    for (const ins of adminSorted) {
      if (ins.checklist[key] !== "Alterações") continue;
      const k = `${ins.id}:${key}`;
      if (resolvedSet.has(k)) continue;
      if (String(ins.checklistNotes[key] ?? "").trim() === noteCur) {
        appendResolvedIssue(ins.id, key);
        resolvedSet.add(k);
      }
    }
  }
}

/**
 * Ao salvar uma vistoria administrativa, alinha pendências comuns na Situação das VTR:
 * - se o item deixa de estar em «Alterações» (ex.: OK), resolve todas as pendências comuns desse item na viatura;
 * - se mantém «Alterações» com o mesmo texto que uma vistoria comum pendente, resolve essa(s) linha(s).
 */
export function autoResolveCommonRedundanciesOnAdministrativeSave(args: {
  inspections: VistoriaInspection[];
  viatura: string;
  checklist: VistoriaChecklist;
  notes: VistoriaChecklistNotes;
}): void {
  const vNorm = args.viatura.trim().toLowerCase();
  if (!vNorm) return;
  const resolvedSet = readResolvedIssueKeySet();

  const commonSorted = args.inspections
    .filter((i) => i.vistoriaAdministrativa !== true && i.viatura.trim().toLowerCase() === vNorm)
    .sort((a, b) => b.createdAt - a.createdAt);

  for (const { key } of CHECKLIST_ITEMS) {
    if (args.checklist[key] !== "Alterações") {
      /** Item retirado na vistoria administrativa (ex.: OK): resolve todas as pendências comuns deste item. */
      for (const ins of commonSorted) {
        if (ins.checklist[key] !== "Alterações") continue;
        const k = `${ins.id}:${key}`;
        if (resolvedSet.has(k)) continue;
        appendResolvedIssue(ins.id, key);
        resolvedSet.add(k);
      }
      continue;
    }

    const noteCur = String(args.notes[key] ?? "").trim();
    if (!noteCur) continue;

    for (const ins of commonSorted) {
      if (ins.checklist[key] !== "Alterações") continue;
      const k = `${ins.id}:${key}`;
      if (resolvedSet.has(k)) continue;
      if (String(ins.checklistNotes[key] ?? "").trim() === noteCur) {
        appendResolvedIssue(ins.id, key);
        resolvedSet.add(k);
      }
    }
  }
}

/**
 * Viaturas para o nome exibido na escala, mesmo quando difere do texto do vínculo (ex.: posto + nome).
 */
export function resolveViaturasParaMotoristaEscala(
  escalaMotorista: string,
  viaturasPorMotorista: ReadonlyMap<string, string[]>,
): string[] {
  const nk = normalizeDriverKey(escalaMotorista);
  if (!nk) return [];
  const direct = viaturasPorMotorista.get(nk);
  if (direct && direct.length > 0) return direct;

  const matchedKeys: string[] = [];
  for (const assignNk of viaturasPorMotorista.keys()) {
    const placas = viaturasPorMotorista.get(assignNk);
    if (!placas?.length) continue;
    if (motoristaKeysMatchForVistoria(nk, assignNk)) matchedKeys.push(assignNk);
  }
  if (matchedKeys.length === 0) return [];
  const placasList = matchedKeys.flatMap((k) => viaturasPorMotorista.get(k) ?? []);
  return [...new Set(placasList.map((p) => p.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

export function readVistoriaAssignments(): VistoriaAssignment[] {
  ensureVistoriaCloudStateSyncStarted();
  const parsed = getVistoriaCloudState().assignments;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => item && item.motorista && item.viatura);
}

export function readVistoriaInspections(): VistoriaInspection[] {
  ensureVistoriaCloudStateSyncStarted();
  try {
    const parsed = getVistoriaCloudState().inspections as VistoriaInspection[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.motorista === "string" && typeof item.viatura === "string")
      .map((item) => {
        const localizacaoViatura = migrateLocalizacaoViaturaFromStorage(
          item as { localizacaoViatura?: unknown; viaturaNaOficina?: unknown },
        );
        const createdAtMs = Number((item as { createdAt?: unknown }).createdAt);
        const createdAtSafe = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
        const meta = item as {
          vistoriaAdministrativa?: unknown;
          rubricaAdministrativa?: unknown;
          rubrica?: unknown;
          origemMobile?: unknown;
          prefillSourceInspectionId?: unknown;
          prefillMotorista?: unknown;
          prefillInspectionDate?: unknown;
          itensAlteradosAdministracao?: unknown;
          observacaoSegmentacaoAdmin?: unknown;
        };
        const observacaoSegmentacaoAdmin = (() => {
          const o = meta.observacaoSegmentacaoAdmin;
          if (!o || typeof o !== "object") return undefined;
          const out: Partial<Record<ChecklistKey, { plain: string; italic: string }>> = {};
          for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
            if (!isChecklistKey(k)) continue;
            const seg = v as { plain?: unknown; italic?: unknown };
            out[k] = {
              plain: typeof seg.plain === "string" ? seg.plain : "",
              italic: typeof seg.italic === "string" ? seg.italic : "",
            };
          }
          return Object.keys(out).length ? out : undefined;
        })();
        const itensAlteradosAdministracao = (() => {
          const arr = meta.itensAlteradosAdministracao;
          if (!Array.isArray(arr)) return undefined;
          const keys = arr.filter(isChecklistKey);
          return keys.length ? keys : undefined;
        })();
        return {
          id: String((item as { id?: unknown }).id ?? ""),
          motorista: String((item as { motorista?: unknown }).motorista ?? ""),
          viatura: String((item as { viatura?: unknown }).viatura ?? ""),
          inspectionDate:
            typeof item.inspectionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.inspectionDate)
              ? item.inspectionDate
              : isoDateFromDate(new Date(createdAtSafe)),
          localizacaoViatura,
          checklist: { ...emptyChecklist(), ...(item.checklist ?? {}) },
          checklistNotes: { ...emptyChecklistNotes(), ...(item.checklistNotes ?? {}) },
          createdAt: createdAtSafe,
          rubrica: typeof meta.rubrica === "string" ? meta.rubrica : undefined,
          vistoriaAdministrativa: meta.vistoriaAdministrativa === true ? true : undefined,
          rubricaAdministrativa:
            typeof meta.rubricaAdministrativa === "string" ? meta.rubricaAdministrativa : undefined,
          origemMobile: meta.origemMobile === true ? true : undefined,
          prefillSourceInspectionId:
            typeof meta.prefillSourceInspectionId === "string" ? meta.prefillSourceInspectionId : undefined,
          prefillMotorista: typeof meta.prefillMotorista === "string" ? meta.prefillMotorista : undefined,
          prefillInspectionDate:
            typeof meta.prefillInspectionDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(meta.prefillInspectionDate)
              ? meta.prefillInspectionDate
              : undefined,
          itensAlteradosAdministracao,
          observacaoSegmentacaoAdmin,
        };
      });
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
export async function appendVistoriaInspection(inspection: VistoriaInspection): Promise<void> {
  ensureVistoriaCloudStateSyncStarted();
  if (!isVistoriaCloudStateHydrated()) {
    throw new Error("Vistoria cloud state not hydrated yet.");
  }
  await updateVistoriaCloudState((state) => ({ ...state, inspections: [...state.inspections, inspection] }));
  notifyVistoriaInspectionsChanged();
}
