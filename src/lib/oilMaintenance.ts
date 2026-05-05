import type { DepartureRecord } from "../types/departure";
import { parseIsoDateToDate } from "./dateFormat";

/** Troca de óleo a cada 10.000 km ou a cada 6 meses (o que ocorrer primeiro). */
export const OLEO_KM_INTERVALO = 10_000;
export const OLEO_MESES_INTERVALO = 6;

/** IndexedDB — mesmo mapa usado em Manutenções (troca de óleo). */
export const OIL_MAINTENANCE_STORAGE_KEY = "sot-oil-maintenance-v1";

/** Dashboard: alerta se faltam menos de N km para o limite de 10.000 km. */
export const OLEO_ALERTA_KM_RESTANTES = 100;
/** Dashboard: alerta se faltam no máximo N dias para o limite de 6 meses após a última troca. */
export const OLEO_ALERTA_DIAS_PRAZO = 7;

export type TrocaOleoRegistro = {
  /** Quilometragem registrada na última troca. */
  ultimaTrocaKm: number;
  /** Data da última troca (yyyy-mm-dd). */
  ultimaTrocaData: string;
};

/** União por placa: valor local prevalece se a chave existe em `local`. */
export function mergeMapaTrocaOleo(
  local: Record<string, TrocaOleoRegistro>,
  remote: Record<string, TrocaOleoRegistro>,
): Record<string, TrocaOleoRegistro> {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: Record<string, TrocaOleoRegistro> = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(local, k)) {
      out[k] = local[k];
    } else {
      out[k] = remote[k];
    }
  }
  return out;
}

export function mapaTrocaOleoIgual(
  a: Record<string, TrocaOleoRegistro>,
  b: Record<string, TrocaOleoRegistro>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const ra = a[k];
    const rb = b[k];
    if (ra === undefined && rb === undefined) continue;
    if (ra === undefined || rb === undefined) return false;
    if (ra.ultimaTrocaKm !== rb.ultimaTrocaKm || ra.ultimaTrocaData !== rb.ultimaTrocaData) return false;
  }
  return true;
}

export function parseKmCampo(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** Maior KM chegada nas saídas (administrativas e ambulância) cuja viatura coincide com a placa. */
export function maiorKmChegadaPorViatura(
  saidas: DepartureRecord[],
  placa: string,
): number | null {
  const alvo = placa.trim().toLowerCase();
  if (!alvo) return null;
  let max: number | null = null;
  for (const s of saidas) {
    if (s.viaturas.trim().toLowerCase() !== alvo) continue;
    const km = parseKmCampo(s.kmChegada);
    if (km === null) continue;
    if (max === null || km > max) max = km;
  }
  return max;
}

export function adicionarMesesIso(dataIso: string, meses: number): string {
  const base = parseIsoDateToDate(dataIso);
  if (!base) return dataIso;
  const out = new Date(base.getFullYear(), base.getMonth() + meses, base.getDate());
  const y = out.getFullYear();
  const m = String(out.getMonth() + 1).padStart(2, "0");
  const d = String(out.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inverso de {@link adicionarMesesIso} — útil ao editar a data limite (troca por tempo) no modal. */
export function subtrairMesesIso(dataIso: string, meses: number): string {
  const base = parseIsoDateToDate(dataIso);
  if (!base) return dataIso;
  const out = new Date(base.getFullYear(), base.getMonth() - meses, base.getDate());
  const y = out.getFullYear();
  const m = String(out.getMonth() + 1).padStart(2, "0");
  const d = String(out.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/** Diferença em dias entre hoje e a data limite (negativo = atrasado). */
export function diasAteDataLimite(dataLimiteIso: string, hoje: Date = new Date()): number {
  const fim = parseIsoDateToDate(dataLimiteIso);
  if (!fim) return 0;
  const ms = 86400000;
  return Math.round((inicioDoDia(fim).getTime() - inicioDoDia(hoje).getTime()) / ms);
}

export type StatusTrocaOleo = {
  temRegistro: boolean;
  atrasado: boolean;
  porKm: boolean;
  porPrazo: boolean;
  kmRestantes: number | null;
  dataLimiteOleoIso: string | null;
  kmLimite: number | null;
  diasAtePrazo: number | null;
};

/** Coluna Status (Manutenções) e PDF quando a troca está atrasada. */
export function rotuloStatusAtrasoTrocaOleo(porKm: boolean, porPrazo: boolean): string {
  if (porKm && porPrazo) return "Quilometragem e tempo de uso do óleo excedidos";
  if (porKm) return "Quilometragem do óleo excedida";
  return "Tempo de uso do óleo excedido";
}

export function statusTrocaOleo(
  kmAtual: number | null,
  registro: TrocaOleoRegistro | undefined,
  agora: Date = new Date(),
): StatusTrocaOleo {
  if (!registro) {
    return {
      temRegistro: false,
      atrasado: false,
      porKm: false,
      porPrazo: false,
      kmRestantes: null,
      dataLimiteOleoIso: null,
      kmLimite: null,
      diasAtePrazo: null,
    };
  }

  const kmLimite = registro.ultimaTrocaKm + OLEO_KM_INTERVALO;
  const dataLimiteOleoIso = adicionarMesesIso(registro.ultimaTrocaData, OLEO_MESES_INTERVALO);

  const porKm =
    kmAtual !== null && kmAtual - registro.ultimaTrocaKm >= OLEO_KM_INTERVALO;
  const fimPrazo = parseIsoDateToDate(dataLimiteOleoIso);
  const porPrazo = fimPrazo ? inicioDoDia(agora) >= inicioDoDia(fimPrazo) : false;
  const atrasado = porKm || porPrazo;

  let kmRestantes: number | null = null;
  if (kmAtual !== null) {
    kmRestantes = Math.max(0, kmLimite - kmAtual);
  }

  // Reaproveita o parse já validado de `fimPrazo` para evitar falso alerta
  // quando a string de data estiver em formato inválido.
  const diasAtePrazo = fimPrazo
    ? Math.round((inicioDoDia(fimPrazo).getTime() - inicioDoDia(agora).getTime()) / 86400000)
    : null;

  return {
    temRegistro: true,
    atrasado,
    porKm,
    porPrazo,
    kmRestantes,
    dataLimiteOleoIso,
    kmLimite,
    diasAtePrazo,
  };
}

/** Viaturas do catálogo (admin + ambulância), ordem preservada, sem duplicar placa. */
export function viaturasCatalogoUnicas(administrativas: string[], ambulancias: string[]): string[] {
  const visto = new Set<string>();
  const out: string[] = [];
  for (const x of [...administrativas, ...ambulancias]) {
    const t = x.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (visto.has(k)) continue;
    visto.add(k);
    out.push(x.trim());
  }
  return out;
}

/** Alerta do dashboard: menos de OLEO_ALERTA_KM_RESTANTES km até o limite, ou até OLEO_ALERTA_DIAS_PRAZO dias no prazo de 6 meses (inclui atraso). */
export function alertaProximaTrocaOleo(st: StatusTrocaOleo): boolean {
  if (!st.temRegistro) return false;
  const porKm = st.kmRestantes !== null && st.kmRestantes < OLEO_ALERTA_KM_RESTANTES;
  const porTempo = st.diasAtePrazo !== null && st.diasAtePrazo <= OLEO_ALERTA_DIAS_PRAZO;
  return porKm || porTempo;
}

export function placasComAlertaTrocaOleo(
  placas: string[],
  departures: DepartureRecord[],
  mapa: Record<string, TrocaOleoRegistro | undefined>,
  agora: Date = new Date(),
): string[] {
  return placas
    .filter((placa) => {
      const kmAtual = maiorKmChegadaPorViatura(departures, placa);
      const st = statusTrocaOleo(kmAtual, mapa[placa], agora);
      return alertaProximaTrocaOleo(st);
    })
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function dataIsoHojeLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
