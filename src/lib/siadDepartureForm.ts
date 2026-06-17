import { getCurrentDatePtBr } from "./dateFormat";
import {
  getMetroRioNeighborhoodSuggestions,
  resolveMetroRioCityForNeighborhood,
} from "./metroRioLocations";
import { formatDestinosListaPt, type DepartureRecord } from "../types/departure";

export const SIAD_PASSAGEIRO_POSTOS = [
  "Alte",
  "CMG",
  "CF",
  "CC",
  "CT",
  "1°TEN",
  "2°TEN",
  "GM",
  "SO",
  "1°SG",
  "2°SG",
  "3°SG",
  "CB",
  "MN",
] as const;

export type SiadPassageiroRow = {
  nome: string;
  posto: string;
};

export const EMPTY_SIAD_PASSAGEIRO: SiadPassageiroRow = { nome: "", posto: "" };

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function dedupeTextosPreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

export function dedupeBairrosPreserveOrder(items: string[]): string[] {
  return dedupeTextosPreserveOrder(items);
}

function formatPassageiroComPosto(row: SiadPassageiroRow): string {
  const nome = row.nome.trim();
  const posto = row.posto.trim();
  if (!nome) return "";
  return posto ? `${posto} ${nome}` : nome;
}

export function dedupePassageirosPreserveOrder(items: SiadPassageiroRow[]): SiadPassageiroRow[] {
  const seen = new Set<string>();
  const out: SiadPassageiroRow[] = [];
  for (const item of items) {
    const nome = item.nome.trim();
    if (!nome) continue;
    const posto = item.posto.trim();
    const key = `${posto.toLowerCase()}|${nome.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ nome, posto });
  }
  return out;
}

export function formatSiadObjetivoComPassageiros(passageiros: SiadPassageiroRow[]): string {
  const base = "Atendimento domiciliar";
  const labels = passageiros.map(formatPassageiroComPosto).filter(Boolean);
  if (labels.length === 0) return base;
  return `${base} — Passageiros: ${formatDestinosListaPt(labels)}`;
}

export function parsePassageiroLabelToRow(label: string): SiadPassageiroRow {
  const trimmed = label.trim();
  if (!trimmed) return { ...EMPTY_SIAD_PASSAGEIRO };
  for (const posto of SIAD_PASSAGEIRO_POSTOS) {
    const prefix = `${posto} `;
    if (trimmed.toUpperCase().startsWith(prefix.toUpperCase())) {
      return { posto, nome: trimmed.slice(prefix.length).trim() };
    }
  }
  return { posto: "", nome: trimmed };
}

export function buildSiadQuickDeparturePayload(params: {
  dataSaida: string;
  horaSaida: string;
  endereco: string;
  passageiros: SiadPassageiroRow[];
}): Omit<DepartureRecord, "id" | "createdAt"> {
  const endereco = params.endereco.trim();
  const passageiros = dedupePassageirosPreserveOrder(params.passageiros);
  return {
    tipo: "Administrativa",
    dataPedido: getCurrentDatePtBr(),
    horaPedido: getCurrentTime(),
    dataSaida: params.dataSaida,
    horaSaida: params.horaSaida,
    setor: "SIAD",
    ramal: "",
    objetivoSaida: formatSiadObjetivoComPassageiros(passageiros),
    numeroPassageiros: String(passageiros.length),
    responsavelPedido: "SIAD",
    om: "",
    viaturas: "ASD",
    motoristas: "ASD",
    hospitalDestino: "",
    tipoSaidaInterHospitalar: false,
    tipoSaidaAlta: false,
    tipoSaidaOutros: false,
    kmSaida: "",
    kmChegada: "",
    chegada: "",
    cidade: resolveMetroRioCityForNeighborhood(endereco),
    bairro: endereco,
    rubrica: "",
    cancelada: false,
    ocorrencias: "",
    ocorrenciasRubrica: "",
  };
}

export function getSiadNeighborhoodOptions(): string[] {
  return getMetroRioNeighborhoodSuggestions();
}
