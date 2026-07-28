import { normalizeDriverKey } from "./vistoriaInspectionShared";

/** Chave normalizada do nome antigo → nome atual de exibição no catálogo. */
export type MotoristaAliasesMap = Record<string, string>;

export function emptyMotoristaAliases(): MotoristaAliasesMap {
  return {};
}

export function normalizeMotoristaAliases(raw: unknown): MotoristaAliasesMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MotoristaAliasesMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const key = normalizeDriverKey(k) || k.trim().toLowerCase();
    const val = v.trim();
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
}

export function mergeMotoristaAliases(a: MotoristaAliasesMap, b: MotoristaAliasesMap): MotoristaAliasesMap {
  return { ...a, ...b };
}

/**
 * Regista rename: nomes antigos (e aliases que apontavam para o antigo) passam a apontar para o novo.
 */
export function registerMotoristaRename(
  aliases: MotoristaAliasesMap,
  oldName: string,
  newName: string,
): MotoristaAliasesMap {
  const oldKey = normalizeDriverKey(oldName);
  const nextName = newName.trim();
  if (!oldKey || !nextName) return aliases;

  const next: MotoristaAliasesMap = { ...aliases };
  next[oldKey] = nextName;

  for (const [k, v] of Object.entries(aliases)) {
    if (normalizeDriverKey(v) === oldKey || v.trim() === oldName.trim()) {
      next[k] = nextName;
    }
  }
  return next;
}

/**
 * Resolve um nome histórico para o nome atual do catálogo (via aliases).
 * Campos «A / B» resolvem cada parte.
 */
export function resolveMotoristaNameForStats(
  field: string,
  aliases: MotoristaAliasesMap,
  catalogMotoristas: string[] = [],
): string {
  const raw = typeof field === "string" ? field.trim() : "";
  if (!raw) return raw;

  const sep = raw.includes(" / ") ? " / " : raw.includes("/") ? "/" : null;
  if (sep) {
    return raw
      .split(/\s*\/\s*/)
      .map((part) => resolveSingleMotoristaName(part, aliases, catalogMotoristas))
      .join(sep);
  }
  return resolveSingleMotoristaName(raw, aliases, catalogMotoristas);
}

function resolveSingleMotoristaName(
  name: string,
  aliases: MotoristaAliasesMap,
  catalogMotoristas: string[],
): string {
  let current = name.trim();
  if (!current) return current;

  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const key = normalizeDriverKey(current);
    if (!key || seen.has(key)) break;
    seen.add(key);
    const mapped = aliases[key];
    if (!mapped || normalizeDriverKey(mapped) === key) break;
    current = mapped.trim();
  }

  const match = catalogMotoristas.find((c) => normalizeDriverKey(c) === normalizeDriverKey(current));
  return match ?? current;
}
