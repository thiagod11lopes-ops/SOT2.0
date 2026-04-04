/** `alarmId` → data local (yyyy-mm-dd) em que o card foi ocultado na página inicial. */
const STORAGE_KEY = "sot-alarm-dismiss-v2";

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    return p as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function isDismissedTodayForAlarm(alarmId: string): boolean {
  return readMap()[alarmId] === localDateKey(new Date());
}

export function dismissAlarmForToday(alarmId: string) {
  const map = readMap();
  map[alarmId] = localDateKey(new Date());
  writeMap(map);
}

/** Ao reeditar nome/hora do alarme, permite alertar de novo no mesmo dia. */
export function clearDismissForAlarm(alarmId: string) {
  const map = readMap();
  if (map[alarmId] === undefined) return;
  delete map[alarmId];
  writeMap(map);
}

export { localDateKey };
