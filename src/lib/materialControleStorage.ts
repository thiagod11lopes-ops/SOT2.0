import { idbGetJson, idbSetJson } from "./indexedDb";

export const MATERIAL_CONTROLE_IDB_KEY = "sot-material-controle-v1";

export type MaterialItemStatus = "ativo" | "baixa";

export type MaterialItem = {
  id: string;
  nome: string;
  quantidade: number;
  unidade: string;
  observacao: string;
  status: MaterialItemStatus;
  baixaAt: string | null;
  baixaMotivo: string;
  createdAt: string;
  updatedAt: string;
};

export type MaterialPlanilha = {
  id: string;
  nome: string;
  items: MaterialItem[];
  createdAt: string;
  updatedAt: string;
};

export type MaterialControleDoc = {
  planilhas: MaterialPlanilha[];
};

export function emptyMaterialControleDoc(): MaterialControleDoc {
  return { planilhas: [] };
}

export function newMaterialId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeItem(raw: unknown): MaterialItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const nome = typeof o.nome === "string" ? o.nome.trim() : "";
  if (!id || !nome) return null;
  const qty = typeof o.quantidade === "number" && Number.isFinite(o.quantidade) ? Math.max(0, o.quantidade) : 0;
  const status: MaterialItemStatus = o.status === "baixa" ? "baixa" : "ativo";
  const now = new Date().toISOString();
  return {
    id,
    nome,
    quantidade: qty,
    unidade: typeof o.unidade === "string" ? o.unidade.trim() : "",
    observacao: typeof o.observacao === "string" ? o.observacao.trim() : "",
    status,
    baixaAt: typeof o.baixaAt === "string" ? o.baixaAt : null,
    baixaMotivo: typeof o.baixaMotivo === "string" ? o.baixaMotivo.trim() : "",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

function normalizePlanilha(raw: unknown): MaterialPlanilha | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const nome = typeof o.nome === "string" ? o.nome.trim() : "";
  if (!id || !nome) return null;
  const now = new Date().toISOString();
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items = itemsRaw.map(normalizeItem).filter((x): x is MaterialItem => x !== null);
  return {
    id,
    nome,
    items,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function normalizeMaterialControleDoc(raw: unknown): MaterialControleDoc {
  if (!raw || typeof raw !== "object") return emptyMaterialControleDoc();
  const o = raw as Record<string, unknown>;
  const planilhasRaw = Array.isArray(o.planilhas) ? o.planilhas : [];
  const planilhas = planilhasRaw.map(normalizePlanilha).filter((x): x is MaterialPlanilha => x !== null);
  return { planilhas };
}

export function isMaterialControleDocEmpty(doc: MaterialControleDoc): boolean {
  return doc.planilhas.length === 0;
}

export async function loadMaterialControleFromIdb(): Promise<MaterialControleDoc> {
  const raw = await idbGetJson<unknown>(MATERIAL_CONTROLE_IDB_KEY, { allowWhenFirebaseOnlyOnline: true });
  return normalizeMaterialControleDoc(raw);
}

export async function saveMaterialControleToIdb(doc: MaterialControleDoc): Promise<void> {
  await idbSetJson(MATERIAL_CONTROLE_IDB_KEY, doc, { allowWhenFirebaseOnlyOnline: true });
}
