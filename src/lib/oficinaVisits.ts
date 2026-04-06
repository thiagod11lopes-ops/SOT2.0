import { isoDateToPtBr } from "./dateFormat";

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

export function mapaOficinaIgual(a: MapaOficinaPorViatura, b: MapaOficinaPorViatura): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (JSON.stringify(a[k] ?? []) !== JSON.stringify(b[k] ?? [])) return false;
  }
  return true;
}

/** Há entrada sem saída → viatura considerada na oficina. */
export function viaturaEstaNaOficina(visitas: RegistroOficina[] | undefined): boolean {
  if (!visitas?.length) return false;
  return visitas.some(
    (v) => Boolean(v.dataEntrada?.trim()) && !String(v.dataSaida ?? "").trim(),
  );
}
