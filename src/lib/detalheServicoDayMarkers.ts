import type { DetalheServicoBundle } from "./detalheServicoBundle";

const KEY_MOTORISTA = "motorista";

export type DetalheServicoMotoristaMarcacao = {
  motorista: string;
  /** Token «S» (Serviço) na célula do dia. */
  servico: boolean;
  /** Token «RO» (Rotina) na célula do dia. */
  rotina: boolean;
};

/**
 * Motoristas da grelha «Detalhe de Serviço» com «S» e/ou «RO» no dia `isoDate` (YYYY-MM-DD).
 * Alinhado à regra de tokens em `detalhe-servico-sheet.tsx`.
 */
export function listMotoristasComServicoOuRotinaNoDia(
  bundle: DetalheServicoBundle,
  isoDate: string,
): DetalheServicoMotoristaMarcacao[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return [];
  const monthKey = isoDate.slice(0, 7);
  const sheet = bundle.sheets[monthKey];
  if (!sheet || !Array.isArray(sheet.rows)) return [];

  const out: DetalheServicoMotoristaMarcacao[] = [];
  for (const rowId of sheet.rows) {
    const rowCells = sheet.cells[rowId] ?? {};
    const motorista = String(rowCells[KEY_MOTORISTA] ?? "").trim() || "—";
    const raw = String(rowCells[isoDate] ?? "").trim();
    const tokens = raw
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    const servico = tokens.some((t) => t === "S");
    const rotina = tokens.some((t) => t === "RO");
    if (servico || rotina) {
      out.push({ motorista, servico, rotina });
    }
  }
  out.sort((a, b) => a.motorista.localeCompare(b.motorista, "pt-PT"));
  return out;
}
