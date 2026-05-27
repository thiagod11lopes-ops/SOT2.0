import type { DepartureRecord, DepartureType } from "../types/departure";
import { normalizeLegacyDateToPtBr } from "./dateFormat";
import { primaryPlacaFromViaturasField } from "./viaturaPlaca";

function viaturaMatches(record: DepartureRecord, placa: string): boolean {
  const target = placa.trim().toLowerCase();
  if (!target) return false;
  const field = record.viaturas.trim().toLowerCase();
  if (!field) return false;
  if (field === target) return true;
  if (primaryPlacaFromViaturasField(record.viaturas).trim().toLowerCase() === target) return true;
  return field
    .split(/[,;/]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(target);
}

/** Saídas do dia/tipo com a placa indicada (exclui canceladas). */
export function findDeparturesForOccurrenceLink(args: {
  departures: DepartureRecord[];
  dataSaidaPtBr: string;
  tipo: DepartureType;
  placa: string;
}): DepartureRecord[] {
  const data = normalizeLegacyDateToPtBr(args.dataSaidaPtBr.trim());
  const placa = args.placa.trim();
  if (!data || !placa) return [];
  return args.departures.filter(
    (d) =>
      d.tipo === args.tipo &&
      normalizeLegacyDateToPtBr(d.dataSaida) === data &&
      d.cancelada !== true &&
      viaturaMatches(d, placa),
  );
}
