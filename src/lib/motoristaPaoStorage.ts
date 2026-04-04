const STORAGE_KEY = "sot-motorista-pao-v1";

export function getMotoristaPaoStored(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

export function setMotoristaPaoStored(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}
