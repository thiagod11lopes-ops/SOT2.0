import { idbGetJson, idbSetJson } from "./indexedDb";
import { isFirebaseOnlyOnlineActive } from "./firebaseOnlyOnlinePolicy";

const IDB_KEY = "sot-motorista-pao-v1";
const LEGACY_LS_KEY = "sot-motorista-pao-v1";

function readLegacyLocalStorage(): string {
  if (isFirebaseOnlyOnlineActive()) return "";
  try {
    if (typeof localStorage === "undefined") return "";
    const v = localStorage.getItem(LEGACY_LS_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function clearLegacyLocalStorage(): void {
  if (isFirebaseOnlyOnlineActive()) return;
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadMotoristaPaoFromIdb(): Promise<string> {
  const v = await idbGetJson<string>(IDB_KEY);
  if (typeof v === "string") return v;
  const leg = readLegacyLocalStorage();
  if (leg) {
    await idbSetJson(IDB_KEY, leg);
    clearLegacyLocalStorage();
    return leg;
  }
  return "";
}

export async function saveMotoristaPaoToIdb(value: string): Promise<void> {
  await idbSetJson(IDB_KEY, value);
}
