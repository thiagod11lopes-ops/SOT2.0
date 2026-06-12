import type { DepartureRecord } from "../types/departure";

export type DepartureOccurrenceViewEntry = {
  id: string;
  texto: string;
  rubrica?: string;
};

export function occurrenceEntriesFromRecords(records: DepartureRecord[]): DepartureOccurrenceViewEntry[] {
  return records
    .map((rec) => ({
      id: rec.id,
      texto: (rec.ocorrencias ?? "").trim(),
      rubrica: (rec.ocorrenciasRubrica ?? "").trim() || undefined,
    }))
    .filter((entry) => entry.texto.length > 0);
}
