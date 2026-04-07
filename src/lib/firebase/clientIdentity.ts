const CLIENT_ID_KEY = "sot_sync_client_id_v1";

function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * ID estável por navegador/dispositivo para rastrear origem das gravações.
 */
export function getSyncClientId(): string {
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY)?.trim();
    if (stored) return stored;
    const created = newClientId();
    localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return newClientId();
  }
}
