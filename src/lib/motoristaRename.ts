import { normalizeDriverKey } from "./vistoriaInspectionShared";
import type { DetalheServicoBundle, DetalheServicoFeriasPorMes } from "./detalheServicoBundle";
import type { EscalaPaoStored } from "./escalaPaoStorage";
import type { DepartureRecord } from "../types/departure";
import type { VistoriaCloudState } from "./vistoriaCloudState";
import type { UnlinkedOccurrencesDoc } from "../types/unlinkedOccurrence";

export const SOT_MOTORISTA_RENAMED_EVENT = "sot-motorista-renamed";

export type MotoristaRenamedDetail = {
  oldName: string;
  newName: string;
};

export function dispatchMotoristaRenamed(oldName: string, newName: string): void {
  if (typeof window === "undefined") return;
  const o = oldName.trim();
  const n = newName.trim();
  if (!o || !n || normalizeDriverKey(o) === normalizeDriverKey(n)) return;
  window.dispatchEvent(
    new CustomEvent<MotoristaRenamedDetail>(SOT_MOTORISTA_RENAMED_EVENT, {
      detail: { oldName: o, newName: n },
    }),
  );
}

export function subscribeMotoristaRenamed(
  listener: (oldName: string, newName: string) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent<MotoristaRenamedDetail>).detail;
    if (!detail?.oldName || !detail?.newName) return;
    listener(detail.oldName, detail.newName);
  };
  window.addEventListener(SOT_MOTORISTA_RENAMED_EVENT, handler);
  return () => window.removeEventListener(SOT_MOTORISTA_RENAMED_EVENT, handler);
}

export function motoristaNamesMatch(a: string, b: string): boolean {
  const ka = normalizeDriverKey(a);
  const kb = normalizeDriverKey(b);
  return Boolean(ka) && ka === kb;
}

/**
 * Substitui o nome do motorista num campo (nome único ou lista «A / B»).
 */
export function replaceMotoristaNameInField(field: string, oldName: string, newName: string): string {
  const raw = typeof field === "string" ? field : "";
  if (!raw.trim()) return raw;
  if (motoristaNamesMatch(raw, oldName)) return newName;

  const sep = raw.includes(" / ") ? " / " : raw.includes("/") ? "/" : null;
  if (!sep) return raw;

  let changed = false;
  const next = raw.split(/\s*\/\s*/).map((part) => {
    if (motoristaNamesMatch(part, oldName)) {
      changed = true;
      return newName;
    }
    return part;
  });
  return changed ? next.join(sep) : raw;
}

function renameFeriasKeys(
  feriasByMonth: DetalheServicoFeriasPorMes,
  oldName: string,
  newName: string,
): DetalheServicoFeriasPorMes {
  const oldKey = normalizeDriverKey(oldName);
  const newKey = normalizeDriverKey(newName);
  if (!oldKey || oldKey === newKey) return feriasByMonth;

  let changed = false;
  const out: DetalheServicoFeriasPorMes = {};
  for (const [month, byMotorista] of Object.entries(feriasByMonth ?? {})) {
    const nextMonth: Record<string, (typeof byMotorista)[string]> = {};
    for (const [key, periods] of Object.entries(byMotorista ?? {})) {
      if (normalizeDriverKey(key) === oldKey || key === oldName) {
        const existing = nextMonth[newKey] ?? nextMonth[newName];
        if (existing) {
          nextMonth[newName] = [...existing, ...periods];
        } else {
          nextMonth[newName] = periods;
        }
        changed = true;
      } else {
        nextMonth[key] = periods;
      }
    }
    out[month] = nextMonth;
  }
  return changed ? out : feriasByMonth;
}

export function renameMotoristaInDetalheBundle(
  bundle: DetalheServicoBundle,
  oldName: string,
  newName: string,
): DetalheServicoBundle {
  let changed = false;
  const sheets: DetalheServicoBundle["sheets"] = {};
  for (const [month, sheet] of Object.entries(bundle.sheets ?? {})) {
    const cells: Record<string, Record<string, string>> = {};
    for (const rowId of sheet.rows) {
      const row = { ...(sheet.cells[rowId] ?? {}) };
      if (typeof row.motorista === "string") {
        const next = replaceMotoristaNameInField(row.motorista, oldName, newName);
        if (next !== row.motorista) {
          row.motorista = next;
          changed = true;
        }
      }
      cells[rowId] = row;
    }
    sheets[month] = { rows: [...sheet.rows], cells };
  }

  const rodapes: DetalheServicoBundle["rodapes"] = {};
  for (const [month, rodape] of Object.entries(bundle.rodapes ?? {})) {
    const nome = replaceMotoristaNameInField(rodape.nome ?? "", oldName, newName);
    if (nome !== (rodape.nome ?? "")) changed = true;
    rodapes[month] = { ...rodape, nome };
  }

  const portraitByMonth: NonNullable<DetalheServicoBundle["portraitByMonth"]> = {};
  for (const [month, days] of Object.entries(bundle.portraitByMonth ?? {})) {
    const nextDays: (typeof days) = {};
    for (const [day, row] of Object.entries(days)) {
      const motorista1 = replaceMotoristaNameInField(row.motorista1 ?? "", oldName, newName);
      const motorista2 = replaceMotoristaNameInField(row.motorista2 ?? "", oldName, newName);
      const retem = replaceMotoristaNameInField(row.retem ?? "", oldName, newName);
      if (
        motorista1 !== (row.motorista1 ?? "") ||
        motorista2 !== (row.motorista2 ?? "") ||
        retem !== (row.retem ?? "")
      ) {
        changed = true;
      }
      nextDays[day] = { motorista1, motorista2, retem };
    }
    portraitByMonth[month] = nextDays;
  }

  let originalSheetBeforeFirstXByMonth = bundle.originalSheetBeforeFirstXByMonth;
  if (originalSheetBeforeFirstXByMonth) {
    const nextOrig: NonNullable<DetalheServicoBundle["originalSheetBeforeFirstXByMonth"]> = {};
    for (const [month, sheet] of Object.entries(originalSheetBeforeFirstXByMonth)) {
      const cells: Record<string, Record<string, string>> = {};
      for (const rowId of sheet.rows) {
        const row = { ...(sheet.cells[rowId] ?? {}) };
        if (typeof row.motorista === "string") {
          const next = replaceMotoristaNameInField(row.motorista, oldName, newName);
          if (next !== row.motorista) {
            row.motorista = next;
            changed = true;
          }
        }
        cells[rowId] = row;
      }
      nextOrig[month] = { rows: [...sheet.rows], cells };
    }
    originalSheetBeforeFirstXByMonth = nextOrig;
  }

  const feriasByMonth = renameFeriasKeys(bundle.feriasByMonth ?? {}, oldName, newName);
  if (feriasByMonth !== bundle.feriasByMonth) changed = true;

  if (!changed) return bundle;
  return {
    ...bundle,
    sheets,
    rodapes,
    portraitByMonth,
    feriasByMonth,
    ...(originalSheetBeforeFirstXByMonth
      ? { originalSheetBeforeFirstXByMonth }
      : {}),
  };
}

export function renameMotoristaInDepartures(
  rows: DepartureRecord[],
  oldName: string,
  newName: string,
): { next: DepartureRecord[]; changedIds: string[] } {
  const changedIds: string[] = [];
  const next = rows.map((row) => {
    const motoristas = replaceMotoristaNameInField(row.motoristas ?? "", oldName, newName);
    if (motoristas === (row.motoristas ?? "")) return row;
    changedIds.push(row.id);
    return { ...row, motoristas };
  });
  return { next, changedIds };
}

export function renameMotoristaInVistoriaState(
  state: VistoriaCloudState,
  oldName: string,
  newName: string,
): VistoriaCloudState {
  let changed = false;
  const assignments = state.assignments.map((a) => {
    if (!motoristaNamesMatch(a.motorista, oldName)) return a;
    changed = true;
    return { ...a, motorista: newName };
  });
  const inspections = state.inspections.map((i) => {
    if (!motoristaNamesMatch(i.motorista, oldName)) return i;
    changed = true;
    return { ...i, motorista: newName };
  });
  if (!changed) return state;
  return { ...state, assignments, inspections };
}

export function renameMotoristaInEscalaPao(
  escala: EscalaPaoStored,
  integrantes: string[],
  oldName: string,
  newName: string,
): { escala: EscalaPaoStored; integrantes: string[] } {
  let escalaChanged = false;
  const nextEscala: EscalaPaoStored = {};
  for (const [k, v] of Object.entries(escala)) {
    const next = replaceMotoristaNameInField(v ?? "", oldName, newName);
    if (next !== v) escalaChanged = true;
    nextEscala[k] = next;
  }

  let integrantesChanged = false;
  const nextIntegrantes = integrantes.map((name) => {
    if (!motoristaNamesMatch(name, oldName)) return name;
    integrantesChanged = true;
    return newName;
  });
  // dedupe after rename
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of nextIntegrantes) {
    const key = normalizeDriverKey(name);
    if (!key || seen.has(key)) {
      if (key && seen.has(key)) integrantesChanged = true;
      continue;
    }
    seen.add(key);
    deduped.push(name);
  }

  return {
    escala: escalaChanged ? nextEscala : escala,
    integrantes: integrantesChanged ? deduped : integrantes,
  };
}

export function renameMotoristaInUnlinkedDoc(
  doc: UnlinkedOccurrencesDoc,
  oldName: string,
  newName: string,
): UnlinkedOccurrencesDoc {
  let changed = false;
  const items = doc.items.map((item) => {
    if (!item.motorista || !motoristaNamesMatch(item.motorista, oldName)) return item;
    changed = true;
    return { ...item, motorista: newName };
  });
  return changed ? { ...doc, items } : doc;
}
