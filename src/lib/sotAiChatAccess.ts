const SESSION_KEY = "sot-ai-chat-unlocked";

const CHAT_PASSWORD = import.meta.env.VITE_SOT_AI_CHAT_PASSWORD?.trim() ?? "";

export function isSotAiChatPasswordRequired(): boolean {
  return CHAT_PASSWORD.length > 0;
}

export function isSotAiChatUnlocked(): boolean {
  if (!isSotAiChatPasswordRequired()) return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function verifySotAiChatPassword(attempt: string): boolean {
  if (!isSotAiChatPasswordRequired()) return true;
  return attempt.trim() === CHAT_PASSWORD;
}

export function unlockSotAiChatSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function lockSotAiChatSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
