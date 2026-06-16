const STORAGE_KEY = "sot:siad-form-password-v1";
export const SIAD_FORM_DEFAULT_PASSWORD = "0000";

export function getSiadFormPassword(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && stored.length > 0 ? stored : SIAD_FORM_DEFAULT_PASSWORD;
  } catch {
    return SIAD_FORM_DEFAULT_PASSWORD;
  }
}

export function setSiadFormPassword(password: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, password);
  } catch {
    /* ignore */
  }
}

export function verifySiadFormPassword(candidate: string): boolean {
  return candidate === getSiadFormPassword();
}
