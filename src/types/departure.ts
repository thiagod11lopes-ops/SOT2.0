export type DepartureType = "Administrativa" | "Ambulância";

/** Registro completo conforme os campos de Cadastrar Nova Saída. */
export interface DepartureRecord {
  id: string;
  createdAt: number;
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
  kmSaida: string;
  kmChegada: string;
  /** Hora de chegada (ambulância) — campo CHEGADA do formulário */
  chegada: string;
  cidade: string;
  bairro: string;
}

/** Linha resumida para as abas Saídas Administrativas / Ambulância (tabela enxuta). Destino = só bairro. */
export function listRowFromRecord(r: DepartureRecord) {
  const saida = r.horaSaida.trim() || "—";
  const destino = r.bairro.trim() || "—";
  return {
    tipo: r.tipo,
    viatura: r.viaturas.trim() || "—",
    motorista: r.motoristas.trim() || "—",
    saida,
    destino,
    om: r.om.trim() || "—",
    kmSaida: r.kmSaida.trim() || "—",
    kmChegada: r.kmChegada.trim() || "—",
    chegada: r.chegada.trim() || "—",
    setor: r.setor.trim() || "—",
    dataSaida: r.dataSaida,
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
  };
}
