import type { DepartureType } from "./departure";

export type UnlinkedDepartureOccurrence = {
  id: string;
  dataSaida: string;
  tipo: DepartureType;
  texto: string;
  createdAt: number;
};

export type UnlinkedOccurrencesDoc = {
  items: UnlinkedDepartureOccurrence[];
};

export const NAO_VINCULAR_PLACA_VALUE = "__nao_vincular_placa__";
