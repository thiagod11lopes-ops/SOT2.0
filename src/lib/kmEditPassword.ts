const STORAGE_KEY = "sot_km_edit_password_v1";
const SESSION_UNLOCK_KEY = "sot_km_edit_unlocked_session_v1";

/** Valor inicial até o utilizador definir outra em Configurações. */
export const DEFAULT_KM_EDIT_PASSWORD = "1234";

export function getStoredKmEditPassword(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Senha usada para validar: armazenada ou padrão se nunca foi gravada. */
export function getEffectiveKmEditPassword(): string {
  const s = getStoredKmEditPassword();
  if (s !== null && s.length > 0) return s;
  return DEFAULT_KM_EDIT_PASSWORD;
}

export function setKmEditPassword(plain: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, plain);
  } catch {
    /* ignore */
  }
}

export function isKmEditSessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setKmEditSessionUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
    else sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

export function verifyKmEditPassword(attempt: string): boolean {
  return attempt === getEffectiveKmEditPassword();
}

/** Chamar após alterar a senha em Configurações para os separadores de saídas voltarem a pedir código. */
export function notifyKmEditPasswordChangedExternally(): void {
  setKmEditSessionUnlocked(false);
  try {
    window.dispatchEvent(new CustomEvent("sot-km-edit-password-changed"));
  } catch {
    /* ignore */
  }
}
