import type { DepartureRecord, DepartureType } from "../types/departure";

/** Converte YYYY-MM-DD ou já dd/mm/aaaa para dd/mm/aaaa. */
export function isoOrPtDateToPtBr(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

function normalizeTipo(v: unknown): DepartureType {
  if (v === "Ambulância" || v === "Administrativa") return v;
  return "Administrativa";
}

/** Heurística: linhas de frota/cadastro de viatura no mesmo array (têm placa/operante e sem datas de saída). */
function isDepartureBackupRow(raw: Record<string, unknown>): boolean {
  if (raw.tipo !== "Administrativa" && raw.tipo !== "Ambulância") return false;
  if (
    raw.placa != null &&
    typeof raw.operante === "boolean" &&
    !raw.dataSaida &&
    !raw.dataPedido
  ) {
    return false;
  }
  return !!(raw.dataSaida || raw.dataPedido || raw.data);
}

/**
 * Converte um item do backup (`viaturasCadastradas` do localStorage legado) em `DepartureRecord`.
 */
export function mapBackupRowToDepartureRecord(raw: Record<string, unknown>): DepartureRecord | null {
  if (!isDepartureBackupRow(raw)) return null;

  const id = str(raw.id);
  if (!id) return null;

  const updatedAt = str(raw.updatedAt);
  const createdAt = Number.isFinite(Date.parse(updatedAt)) ? Date.parse(updatedAt) : Date.now();

  const tipo = normalizeTipo(raw.tipo);
  const dataPedido = isoOrPtDateToPtBr(raw.dataPedido);
  const dataSaida = isoOrPtDateToPtBr(raw.dataSaida ?? raw.data);
  const horaPedido = str(raw.horaPedido);
  const horaSaida = str(raw.horaSaida || raw.saida || raw.horario);
  const destino = str(raw.destino);
  const cidade = str(raw.cidade) || destino;
  const bairro = str(raw.bairro);

  return {
    id,
    createdAt,
    tipo,
    dataPedido,
    horaPedido,
    dataSaida,
    horaSaida,
    setor: str(raw.setor),
    ramal: str(raw.ramal),
    objetivoSaida: str(raw.objetivo || raw.motivo),
    numeroPassageiros: str(raw.numPassageiros),
    responsavelPedido: str(raw.responsavelPedido),
    om: str(raw.om),
    viaturas: str(raw.viatura || raw.viatura_id),
    motoristas: str(raw.motorista || raw.motorista_id),
    hospitalDestino: str(raw.hospital),
    kmSaida: str(raw.kmSaida),
    kmChegada: str(raw.kmChegada),
    chegada: str(raw.chegada),
    cidade,
    bairro,
    rubrica: str(raw.rubrica),
  };
}

function parseStringifiedJsonArray(o: Record<string, unknown>, key: string): unknown[] {
  const encoded = o[key];
  if (typeof encoded !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(encoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Extrai e mapeia saídas a partir do JSON exportado do SOT (dump de localStorage).
 * Lê, quando existirem (strings JSON com array):
 * `viaturasCadastradas` (legado), `saidasAdministrativas`, `saidasAmbulancias`.
 * Remove duplicatas por `id` (primeira ocorrência vence).
 */
export function mapSotBackupJsonToDepartures(backup: unknown): DepartureRecord[] {
  if (!backup || typeof backup !== "object") return [];
  const o = backup as Record<string, unknown>;
  const chunks: unknown[][] = [];
  for (const key of ["viaturasCadastradas", "saidasAdministrativas", "saidasAmbulancias"] as const) {
    const arr = parseStringifiedJsonArray(o, key);
    if (arr.length > 0) chunks.push(arr);
  }
  const seen = new Set<string>();
  const out: DepartureRecord[] = [];
  for (const parsed of chunks) {
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      if (raw.deletedAt && !raw.dataPedido && !raw.dataSaida && !raw.data) continue;
      const row = mapBackupRowToDepartureRecord(raw);
      if (!row) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}
