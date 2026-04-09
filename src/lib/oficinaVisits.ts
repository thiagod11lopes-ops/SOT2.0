import { isCompleteDatePtBr, isoDateToPtBr } from "./dateFormat";

/** Registro de entrada/saída da viatura na oficina. */
export type RegistroOficina = {
  id: string;
  /** Data de entrada (dd/mm/aaaa). */
  dataEntrada: string;
  /** Data de saída (dd/mm/aaaa); vazio se ainda na oficina. */
  dataSaida: string;
  /** Serviços / manutenção realizada. */
  manutencao: string;
};

export const OFICINA_STORAGE_KEY = "sot-oficina-v1";

export type MapaOficinaPorViatura = Record<string, RegistroOficina[]>;

/** Converte valor legado (yyyy-mm-dd) para o formato exibido dd/mm/aaaa. */
export function migrarCampoDataOficinaParaPtBr(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return isoDateToPtBr(t);
  return t;
}

export function migrarRegistroOficina(r: RegistroOficina): RegistroOficina {
  return {
    ...r,
    dataEntrada: migrarCampoDataOficinaParaPtBr(r.dataEntrada),
    dataSaida: migrarCampoDataOficinaParaPtBr(r.dataSaida),
  };
}

export function normalizarMapaOficinaCarregado(raw: unknown): MapaOficinaPorViatura {
  if (!raw || typeof raw !== "object") return {};
  const out: MapaOficinaPorViatura = {};
  for (const [placa, arr] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    out[placa] = arr.map((item) => migrarRegistroOficina(item as RegistroOficina));
  }
  return out;
}

/** União por placa: visitas locais prevalecem se a chave existe em `local`. */
export function mergeMapaOficina(
  local: MapaOficinaPorViatura,
  remote: MapaOficinaPorViatura,
): MapaOficinaPorViatura {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: MapaOficinaPorViatura = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(local, k)) {
      out[k] = local[k];
    } else {
      out[k] = remote[k];
    }
  }
  return out;
}

/**
 * Funde listas de visitas pelo mesmo `id`: campos do registo **local** prevalecem sobre o remoto.
 * Evita que um snapshot do Firestore (ainda sem o último campo, ex. data de saída) apague edição recente.
 */
export function mergeVisitasPorIdPreferLocal(
  localList: RegistroOficina[] | undefined,
  remoteList: RegistroOficina[] | undefined,
): RegistroOficina[] {
  const loc = localList ?? [];
  const rem = remoteList ?? [];
  if (loc.length === 0 && rem.length === 0) return [];
  if (loc.length === 0) return rem.map((v) => migrarRegistroOficina(v));
  if (rem.length === 0) return loc.map((v) => migrarRegistroOficina(v));

  const byId = new Map<string, RegistroOficina>();
  for (const v of rem) {
    byId.set(v.id, migrarRegistroOficina(v));
  }
  for (const v of loc) {
    const r = byId.get(v.id);
    const lv = migrarRegistroOficina(v);
    byId.set(v.id, r ? { ...r, ...lv } : lv);
  }

  const order: string[] = [];
  for (const v of loc) {
    if (!order.includes(v.id)) order.push(v.id);
  }
  for (const v of rem) {
    if (!order.includes(v.id)) order.push(v.id);
  }
  return order.map((id) => byId.get(id)!);
}

/** Merge por placa com fusão por id de visita (local ganha em conflito de campos). */
export function mergeMapaOficinaProfundo(
  local: MapaOficinaPorViatura,
  remote: MapaOficinaPorViatura,
): MapaOficinaPorViatura {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: MapaOficinaPorViatura = {};
  for (const k of keys) {
    out[k] = mergeVisitasPorIdPreferLocal(local[k], remote[k]);
  }
  return out;
}

export function mapaOficinaIgual(a: MapaOficinaPorViatura, b: MapaOficinaPorViatura): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (JSON.stringify(a[k] ?? []) !== JSON.stringify(b[k] ?? [])) return false;
  }
  return true;
}

/**
 * Registro ainda “aberto” na oficina: entrada informada e data de saída ainda não completa (dd/mm/aaaa).
 * Só com data de saída completa a viatura deixa de aparecer no card Viaturas na Oficina (página principal).
 */
function visitaAbertaNaOficina(v: RegistroOficina): boolean {
  const ent = String(v.dataEntrada ?? "").trim();
  const sai = String(v.dataSaida ?? "").trim();
  if (!ent) return false;
  if (isCompleteDatePtBr(sai)) return false;
  return true;
}

/** Há pelo menos uma visita com entrada e sem data de saída completa → viatura na oficina. */
export function viaturaEstaNaOficina(visitas: RegistroOficina[] | undefined): boolean {
  if (!visitas?.length) return false;
  return visitas.some(visitaAbertaNaOficina);
}
