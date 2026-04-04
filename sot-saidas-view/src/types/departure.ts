export type DepartureType = "Administrativa" | "Ambulância";

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
  chegada: string;
  cidade: string;
  bairro: string;
}

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
