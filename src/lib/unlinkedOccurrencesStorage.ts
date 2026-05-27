import { idbGetJson, idbSetJson } from "./indexedDb";
import type { UnlinkedDepartureOccurrence, UnlinkedOccurrencesDoc } from "../types/unlinkedOccurrence";

const IDB_KEY = "sot-unlinked-occurrences-v1";

export function normalizeUnlinkedOccurrencesDoc(raw: unknown): UnlinkedOccurrencesDoc {
  if (!raw || typeof raw !== "object") return { items: [] };
  const itemsRaw = (raw as UnlinkedOccurrencesDoc).items;
  if (!Array.isArray(itemsRaw)) return { items: [] };
  const items: UnlinkedDepartureOccurrence[] = [];
  for (const entry of itemsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Partial<UnlinkedDepartureOccurrence>;
    const texto = typeof o.texto === "string" ? o.texto.trim() : "";
    const dataSaidaFixed = typeof o.dataSaida === "string" ? o.dataSaida.trim() : "";
    if (!texto || !dataSaidaFixed) continue;
    if (o.tipo !== "Administrativa" && o.tipo !== "Ambulância") continue;
    items.push({
      id: typeof o.id === "string" && o.id.trim() ? o.id : `uo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dataSaida: dataSaidaFixed,
      tipo: o.tipo,
      texto,
      createdAt: typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : Date.now(),
    });
  }
  return { items };
}

export async function loadUnlinkedOccurrencesFromIdb(): Promise<UnlinkedOccurrencesDoc> {
  const raw = await idbGetJson<unknown>(IDB_KEY);
  return normalizeUnlinkedOccurrencesDoc(raw);
}

export async function saveUnlinkedOccurrencesToIdb(doc: UnlinkedOccurrencesDoc): Promise<void> {
  await idbSetJson(IDB_KEY, doc);
}

export function newUnlinkedOccurrenceId(): string {
  return `uo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
