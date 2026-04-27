import { listMotoristasComServicoOuRotinaNoDia } from "./detalheServicoDayMarkers";
import type { DetalheServicoBundle } from "./detalheServicoBundle";
import {
  normalizeDriverKey,
  resolveViaturasParaMotoristaEscala,
  type VistoriaAssignment,
  type VistoriaInspection,
} from "./vistoriaInspectionShared";

/** Mesma lógica da aba Vistoriar (modal «Motoristas com S…»): cor do dia pela vistoria na data + viatura. */
export type VistoriaCalendarDayTint = "neutral" | "green" | "orange" | "red";

export function buildViaturasPorMotoristaMap(
  assignments: readonly VistoriaAssignment[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const a of assignments) {
    const key = normalizeDriverKey(a.motorista);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a.viatura);
  }
  for (const [key, viaturasMotorista] of map.entries()) {
    map.set(
      key,
      [...new Set(viaturasMotorista.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    );
  }
  return map;
}

export function getVistoriaCalendarDayTintForIso(
  iso: string,
  bundle: DetalheServicoBundle | null,
  viaturasPorMotorista: ReadonlyMap<string, string[]>,
  inspections: readonly VistoriaInspection[],
): VistoriaCalendarDayTint {
  if (!bundle) return "neutral";
  const marcados = listMotoristasComServicoOuRotinaNoDia(bundle, iso);
  const motoristasComSMap = new Map<string, string>();
  for (const row of marcados) {
    if (!row.servico) continue;
    const name = row.motorista.trim();
    if (!name) continue;
    const nk = normalizeDriverKey(name);
    if (!nk) continue;
    if (!motoristasComSMap.has(nk)) motoristasComSMap.set(nk, name);
  }
  const relevant = [...motoristasComSMap.values()].filter(
    (name) => resolveViaturasParaMotoristaEscala(name, viaturasPorMotorista).length > 0,
  );
  if (relevant.length === 0) return "neutral";

  let totalPlacas = 0;
  let placasVistoriadas = 0;
  for (const motorista of relevant) {
    const vtrs = resolveViaturasParaMotoristaEscala(motorista, viaturasPorMotorista);
    for (const v of vtrs) {
      totalPlacas++;
      const ok = inspections.some(
        (i) => i.inspectionDate === iso && i.viatura.trim() === v.trim(),
      );
      if (ok) placasVistoriadas++;
    }
  }

  if (totalPlacas === 0) return "neutral";
  if (placasVistoriadas === 0) return "red";
  if (placasVistoriadas === totalPlacas) return "green";
  return "orange";
}

/**
 * Vistorias de um único dia que contam para o calendário (escala «S» + viatura sob responsabilidade).
 */
export function collectInspectionIdsMatchingCalendarForIso(
  inspections: readonly VistoriaInspection[],
  bundle: DetalheServicoBundle,
  viaturasPorMotorista: ReadonlyMap<string, string[]>,
  iso: string,
): string[] {
  const marcados = listMotoristasComServicoOuRotinaNoDia(bundle, iso);
  const motoristasComSMap = new Map<string, string>();
  for (const row of marcados) {
    if (!row.servico) continue;
    const name = row.motorista.trim();
    if (!name) continue;
    const nk = normalizeDriverKey(name);
    if (!nk) continue;
    if (!motoristasComSMap.has(nk)) motoristasComSMap.set(nk, name);
  }
  const relevant = [...motoristasComSMap.values()].filter(
    (name) => resolveViaturasParaMotoristaEscala(name, viaturasPorMotorista).length > 0,
  );
  const ids: string[] = [];
  for (const ins of inspections) {
    if (ins.inspectionDate !== iso) continue;
    let counted = false;
    for (const motorista of relevant) {
      const vtrs = resolveViaturasParaMotoristaEscala(motorista, viaturasPorMotorista);
      if (vtrs.some((v) => v.trim() === ins.viatura.trim())) {
        counted = true;
        break;
      }
    }
    if (counted) ids.push(ins.id);
  }
  return ids;
}

/**
 * União das vistorias do calendário para as datas ISO escolhidas (ex.: vários dias verdes/laranjas/vermelhos).
 */
export function collectInspectionIdsForSelectedCalendarDates(
  inspections: readonly VistoriaInspection[],
  bundle: DetalheServicoBundle | null,
  assignments: readonly VistoriaAssignment[],
  selectedIsos: readonly string[],
): string[] {
  if (!bundle || selectedIsos.length === 0) return [];
  const viaturasPorMotorista = buildViaturasPorMotoristaMap(assignments);
  const idSet = new Set<string>();
  for (const iso of selectedIsos) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    for (const id of collectInspectionIdsMatchingCalendarForIso(
      inspections,
      bundle,
      viaturasPorMotorista,
      iso,
    )) {
      idSet.add(id);
    }
  }
  return [...idSet];
}

/**
 * IDs de vistorias a remover para «reabrir» dias atualmente verdes (permite nova vistoria no mesmo dia).
 * Só entram registos que contam para o cálculo do calendário (escala «S» + vínculo viatura).
 */
export function collectInspectionIdsToClearGreenDays(
  inspections: readonly VistoriaInspection[],
  bundle: DetalheServicoBundle | null,
  assignments: readonly VistoriaAssignment[],
): string[] {
  if (!bundle) return [];
  const viaturasPorMotorista = buildViaturasPorMotoristaMap(assignments);
  const dates = new Set(inspections.map((i) => i.inspectionDate));
  const greenIsos = [...dates].filter(
    (iso) => getVistoriaCalendarDayTintForIso(iso, bundle, viaturasPorMotorista, inspections) === "green",
  );
  return collectInspectionIdsForSelectedCalendarDates(inspections, bundle, assignments, greenIsos);
}
