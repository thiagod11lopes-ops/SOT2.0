import type { DepartureRecord } from "../types/departure";
import { mapSotBackupJsonToDepartures } from "./sotBackupImport";

export type DeparturesExportFile = {
  version: number;
  tipo: "saidas" | "saidas_administrativas";
  exportadoEm: string;
  saidas: DepartureRecord[];
};

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

/** Normaliza objeto importado para DepartureRecord (valores em falta viram string vazia). */
export function normalizeImportedDeparture(raw: Record<string, unknown>): DepartureRecord | null {
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (raw.tipo !== "Administrativa" && raw.tipo !== "Ambulância") return null;
  const createdAt =
    typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();

  return {
    id: raw.id,
    createdAt,
    tipo: raw.tipo,
    dataPedido: str(raw.dataPedido),
    horaPedido: str(raw.horaPedido),
    dataSaida: str(raw.dataSaida),
    horaSaida: str(raw.horaSaida),
    setor: str(raw.setor),
    ramal: str(raw.ramal),
    objetivoSaida: str(raw.objetivoSaida),
    numeroPassageiros: str(raw.numeroPassageiros),
    responsavelPedido: str(raw.responsavelPedido),
    om: str(raw.om),
    viaturas: str(raw.viaturas),
    motoristas: str(raw.motoristas),
    hospitalDestino: str(raw.hospitalDestino),
    kmSaida: str(raw.kmSaida),
    kmChegada: str(raw.kmChegada),
    chegada: str(raw.chegada),
    cidade: str(raw.cidade),
    bairro: str(raw.bairro),
    rubrica: str(raw.rubrica),
    cancelada: raw.cancelada === true,
    ocorrencias: str(raw.ocorrencias),
  };
}

/** Extrai lista de saídas (administrativa + ambulância) de JSON exportado ou array puro. */
export function parseDeparturesFromPlainImportFile(data: unknown): DepartureRecord[] {
  let list: unknown[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object" && "saidas" in data) {
    const s = (data as { saidas?: unknown }).saidas;
    if (Array.isArray(s)) list = s;
  }
  const out: DepartureRecord[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = normalizeImportedDeparture(item as Record<string, unknown>);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Aceita:
 * - dump do sistema / localStorage com `viaturasCadastradas` (string JSON) → todas as saídas reconhecidas;
 * - exportação desta tela com `{ saidas: [...] }` ou array → todas as saídas reconhecidas.
 */
export function parseDeparturesFromImportFile(data: unknown): DepartureRecord[] {
  if (
    data &&
    typeof data === "object" &&
    ("viaturasCadastradas" in data || "saidasAdministrativas" in data || "saidasAmbulancias" in data)
  ) {
    return mapSotBackupJsonToDepartures(data);
  }
  return parseDeparturesFromPlainImportFile(data);
}
