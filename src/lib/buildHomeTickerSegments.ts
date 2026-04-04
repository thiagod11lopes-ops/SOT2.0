import type { DepartureRecord } from "../types/departure";
import {
  alertaProximaTrocaOleo,
  maiorKmChegadaPorViatura,
  statusTrocaOleo,
  viaturasCatalogoUnicas,
  type TrocaOleoRegistro,
} from "./oilMaintenance";
import { viaturaEstaNaOficina, type MapaOficinaPorViatura } from "./oficinaVisits";
import {
  frasePendenciaLimpezaViatura,
  fraseProximaTrocaOleo,
  rotuloViaturaPlaca,
} from "./homeTickerStrings";

const SEP = "   •   ";

export type BuildTickerInput = {
  mapaOficina: MapaOficinaPorViatura;
  departures: DepartureRecord[];
  mapaOleo: Record<string, TrocaOleoRegistro | undefined>;
  viaturasAdministrativas: string[];
  ambulancias: string[];
  placasLimpeza: string[];
  fainasLinhas: string[];
  avisosGeraisLinhas: string[];
};

/** Monta os textos do telão em ordem: oficina, óleo, limpeza, fainas; avisos gerais sem prefixo. */
export function buildHomeTickerSegments(input: BuildTickerInput): string[] {
  const out: string[] = [];

  const placasOficina = Object.keys(input.mapaOficina)
    .filter((placa) => viaturaEstaNaOficina(input.mapaOficina[placa]))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  for (const placa of placasOficina) {
    out.push(`OFICINA · Viatura ${placa} em manutenção`);
  }

  const placasCatalogo = viaturasCatalogoUnicas(input.viaturasAdministrativas, input.ambulancias);
  for (const placa of placasCatalogo) {
    const kmAtual = maiorKmChegadaPorViatura(input.departures, placa);
    const st = statusTrocaOleo(kmAtual, input.mapaOleo[placa]);
    if (!alertaProximaTrocaOleo(st)) continue;
    const fr = fraseProximaTrocaOleo(st);
    if (fr === "—") continue;
    out.push(`${rotuloViaturaPlaca(placa)} — ${fr}`);
  }

  for (const placa of input.placasLimpeza) {
    out.push(frasePendenciaLimpezaViatura(placa));
  }

  for (const linha of input.fainasLinhas) {
    const t = linha.trim();
    if (t) out.push(`FAINAS · ${t}`);
  }

  for (const linha of input.avisosGeraisLinhas) {
    const t = linha.trim();
    if (t) out.push(t);
  }

  return out;
}

/** Texto único para o marquee (com separador). */
export function joinTickerSegments(segments: string[]): string {
  if (segments.length === 0) {
    return "Sem informações operacionais no momento — cadastre dados em Frota e Pessoal, Manutenções e Avisos.";
  }
  return segments.join(SEP);
}
