/** Utilitários puros; o estado persistido está em `AlarmDismissProvider` (+ Firestore). */

/** ID fixo para o alarme de pendências de vistoria (aba Avisos) na página principal. */
export const VISTORIA_NOTIFICACAO_ALARM_ID = "sot-vistoria-notif-pendencias";

export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function normalizeAlarmDismissMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && k.trim() && typeof v === "string") out[k] = v;
  }
  return out;
}
