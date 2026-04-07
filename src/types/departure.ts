import { parseHhMm } from "../lib/timeInput";

export type DepartureType = "Administrativa" | "Ambulância";

/** Registro completo conforme os campos de Cadastrar Nova Saída. */
export interface DepartureRecord {
  id: string;
  createdAt: number;
  /** Versão do registro para estratégia de concorrência (passos seguintes). */
  version?: number;
  /** Epoch ms da última atualização conhecida. */
  updatedAt?: number;
  /** Identificador do cliente que fez a última atualização conhecida. */
  updatedBy?: string;
  tipo: DepartureType;
  dataPedido: string;
  horaPedido: string;
  dataSaida: string;
  horaSaida: string;
  setor: string;
  ramal: string;
  objetivoSaida: string;
  numeroPassageiros: string;
  responsavelPedido: string;
  om: string;
  viaturas: string;
  motoristas: string;
  hospitalDestino: string;
  /** Ambulância: tipo de saída (vários podem estar marcados). */
  tipoSaidaInterHospitalar: boolean;
  tipoSaidaAlta: boolean;
  tipoSaidaOutros: boolean;
  kmSaida: string;
  kmChegada: string;
  /** Hora de chegada (ambulância) — campo CHEGADA do formulário */
  chegada: string;
  cidade: string;
  bairro: string;
  /** Texto manual (ex.: rubrica) — preenchido no mobile; incluído no PDF das saídas. */
  rubrica: string;
  /** Saída cancelada: permanece na lista, visual opaco/tarja; rubrica costuma guardar o nome do responsável. */
  cancelada: boolean;
  /** Notas de ocorrência (texto livre); exibido abaixo da linha no PDF. */
  ocorrencias: string;
}

const CAMPOS_CADASTRO_SAIDA: readonly Exclude<
  keyof DepartureRecord,
  "id" | "createdAt" | "version" | "updatedAt" | "updatedBy"
>[] = [
  "tipo",
  "dataPedido",
  "horaPedido",
  "dataSaida",
  "horaSaida",
  "setor",
  "ramal",
  "objetivoSaida",
  "numeroPassageiros",
  "responsavelPedido",
  "om",
  "viaturas",
  "motoristas",
  "hospitalDestino",
  "tipoSaidaInterHospitalar",
  "tipoSaidaAlta",
  "tipoSaidaOutros",
  "kmSaida",
  "kmChegada",
  "chegada",
  "cidade",
  "bairro",
  "rubrica",
  "cancelada",
  "ocorrencias",
];

/** Identifica registros com o mesmo conteúdo de cadastro (todos os campos do formulário, exceto id/data). */
export function departureCadastroFingerprint(r: DepartureRecord): string {
  const o: Record<string, string> = {};
  for (const k of CAMPOS_CADASTRO_SAIDA) {
    const v = r[k];
    o[k] = typeof v === "boolean" ? (v ? "1" : "0") : String(v ?? "").trim();
  }
  return JSON.stringify(o);
}

/** Rótulos do tipo de saída (ambulância), ordem fixa. */
export function labelsTipoSaidaAmbulancia(r: DepartureRecord): string[] {
  const out: string[] = [];
  if (r.tipoSaidaInterHospitalar) out.push("Inter-Hospitalar");
  if (r.tipoSaidaAlta) out.push("Alta");
  if (r.tipoSaidaOutros) out.push("Outros");
  return out;
}

/** Texto para exibir o tipo de saída (ambulância); vazio se nenhum marcado. */
export function formatTipoSaidaAmbulancia(r: DepartureRecord): string {
  const labels = labelsTipoSaidaAmbulancia(r);
  return labels.length === 0 ? "" : labels.join(", ");
}

/** Mantém a primeira ocorrência de cada cadastro distinto (ordem de `rows` preservada). */
export function dedupeDeparturesMesmoCadastro(rows: DepartureRecord[]): DepartureRecord[] {
  const seen = new Set<string>();
  const out: DepartureRecord[] = [];
  for (const r of rows) {
    const fp = departureCadastroFingerprint(r);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(r);
  }
  return out;
}

/** Formata lista de destinos (bairros): «A», «A e B», «A, B e C», «A, B, C e D». */
export function formatDestinosListaPt(parts: string[]): string {
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) return "—";
  if (cleaned.length === 1) return cleaned[0]!;
  if (cleaned.length === 2) return `${cleaned[0]} e ${cleaned[1]}`;
  const last = cleaned[cleaned.length - 1]!;
  const head = cleaned.slice(0, -1).join(", ");
  return `${head} e ${last}`;
}

/** Textos não vazios, ordem preservada, sem duplicar ignorando maiúsculas. */
function dedupeTextoListaPreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of values) {
    const t = b.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function horaMergeKey(hora: string): string {
  const p = parseHhMm(hora);
  if (!p) return hora.trim().toLowerCase();
  return `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
}

/** Chave de agrupamento: mesma viatura, motorista, hora de saída e estado cancelada. */
export function mergeGroupKey(r: DepartureRecord): string {
  const v = r.viaturas.trim().toLowerCase();
  const m = r.motoristas.trim().toLowerCase();
  const h = horaMergeKey(r.horaSaida);
  const c = r.cancelada === true ? "1" : "0";
  return `${c}|${v}|${m}|${h}`;
}

export type DepartureListMergeGroup = {
  records: DepartureRecord[];
  /** Primeiro registo na ordem já ordenada da lista. */
  primary: DepartureRecord;
  /** Destinos fundidos para a coluna Destino. */
  destinoDisplay: string;
  /** Setores fundidos (mesmo formato: vírgulas e «e» antes do último). */
  setorDisplay: string;
};

/**
 * Agrupa saídas com a mesma viatura, motorista e horário (e mesmo estado cancelada)
 * para uma única linha na tabela, fundindo bairros e setores.
 */
export function groupDeparturesForListDisplay(rows: DepartureRecord[]): DepartureListMergeGroup[] {
  const order: string[] = [];
  const map = new Map<string, DepartureRecord[]>();

  for (const r of rows) {
    const k = mergeGroupKey(r);
    if (!map.has(k)) {
      order.push(k);
      map.set(k, []);
    }
    map.get(k)!.push(r);
  }

  return order.map((k) => {
    const records = map.get(k)!;
    const primary = records[0]!;
    const dedupedBairros = dedupeTextoListaPreserveOrder(records.map((x) => x.bairro));
    const destinoDisplay = dedupedBairros.length === 0 ? "—" : formatDestinosListaPt(dedupedBairros);
    const dedupedSetores = dedupeTextoListaPreserveOrder(records.map((x) => x.setor));
    const setorDisplay = dedupedSetores.length === 0 ? "—" : formatDestinosListaPt(dedupedSetores);
    return { records, primary, destinoDisplay, setorDisplay };
  });
}

/** Linha resumida para as abas Saídas Administrativas / Ambulância (tabela enxuta). Destino = só bairro. */
export function listRowFromRecord(r: DepartureRecord) {
  const saida = r.horaSaida.trim() || "—";
  const destino = r.bairro.trim() || "—";
  const rawRubrica = String((r as DepartureRecord).rubrica ?? "").trim();
  let rubricaLabel = "—";
  if (rawRubrica) {
    // Evita mostrar data URL enorme — rubrica desenhada é marcada com ✓
    rubricaLabel = /^data:image\//i.test(rawRubrica) ? "✓" : rawRubrica;
  }
  return {
    tipo: r.tipo,
    viatura: r.viaturas.trim() || "—",
    motorista: r.motoristas.trim() || "—",
    saida,
    destino,
    om: r.om.trim() || "—",
    hospital: r.hospitalDestino.trim() || "—",
    kmSaida: r.kmSaida.trim() || "—",
    kmChegada: r.kmChegada.trim() || "—",
    chegada: r.chegada.trim() || "—",
    setor: r.setor.trim() || "—",
    dataSaida: r.dataSaida,
    rubrica: rubricaLabel,
  };
}

function cell(v: string) {
  const t = v?.trim();
  return t && t.length > 0 ? t : "—";
}

/** Exibição de cada campo para a tabela completa (Saídas Cadastradas). */
export function fullRowCells(r: DepartureRecord) {
  return {
    tipo: r.tipo,
    dataPedido: cell(r.dataPedido),
    horaPedido: cell(r.horaPedido),
    dataSaida: cell(r.dataSaida),
    horaSaida: cell(r.horaSaida),
    setor: cell(r.setor),
    ramal: cell(r.ramal),
    objetivoSaida: cell(r.objetivoSaida),
    numeroPassageiros: cell(r.numeroPassageiros),
    responsavelPedido: cell(r.responsavelPedido),
    om: cell(r.om),
    viaturas: cell(r.viaturas),
    motoristas: cell(r.motoristas),
    hospitalDestino: cell(r.hospitalDestino),
    kmSaida: cell(r.kmSaida),
    kmChegada: cell(r.kmChegada),
    chegada: cell(r.chegada),
    cidade: cell(r.cidade),
    bairro: cell(r.bairro),
    rubrica: (() => {
      const t = String(r.rubrica ?? "").trim();
      if (!t) return "—";
      if (/^data:image\//i.test(t)) return "✓";
      return cell(t);
    })(),
    ocorrencias: cell(r.ocorrencias ?? ""),
  };
}
