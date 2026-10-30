const EMAILS_KEY = "sot_desktop_access_emails_v1";
const SESSION_KEY = "sot_desktop_access_session_v1";

export type AcessoPessoa = {
  email: string;
  nomeGuerra: string;
  senhaCriada: boolean;
};

export type AcessoSistemaDoc = {
  gestorEmail: string;
  pessoas: AcessoPessoa[];
};

export type DesktopAccessSession = {
  email: string;
  nomeGuerra: string;
};

export function normalizeAccessEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAccessEmail(value));
}

export function emptyAcessoSistemaDoc(): AcessoSistemaDoc {
  return { gestorEmail: "", pessoas: [] };
}

export function normalizeAcessoSistemaDoc(raw: unknown): AcessoSistemaDoc {
  if (!raw || typeof raw !== "object") return emptyAcessoSistemaDoc();
  const o = raw as Record<string, unknown>;
  const pessoasRaw = Array.isArray(o.pessoas) ? o.pessoas : [];
  const pessoas: AcessoPessoa[] = [];
  for (const item of pessoasRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const email = normalizeAccessEmail(typeof row.email === "string" ? row.email : "");
    const nomeGuerra = typeof row.nomeGuerra === "string" ? row.nomeGuerra.trim() : "";
    if (!email || !nomeGuerra) continue;
    pessoas.push({
      email,
      nomeGuerra,
      senhaCriada: row.senhaCriada === true,
    });
  }
  const gestorEmail = normalizeAccessEmail(typeof o.gestorEmail === "string" ? o.gestorEmail : "");
  return {
    gestorEmail: pessoas.some((p) => p.email === gestorEmail) ? gestorEmail : "",
    pessoas,
  };
}

export function loadRememberedDesktopEmails(): string[] {
  try {
    const raw = localStorage.getItem(EMAILS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeAccessEmail(String(item))).filter(isPlausibleEmail);
  } catch {
    return [];
  }
}

export function rememberDesktopEmail(email: string): void {
  const norm = normalizeAccessEmail(email);
  if (!isPlausibleEmail(norm)) return;
  const next = [norm, ...loadRememberedDesktopEmails().filter((item) => item !== norm)].slice(0, 40);
  try {
    localStorage.setItem(EMAILS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function suggestDesktopEmails(typed: string, extra: string[]): string[] {
  const q = normalizeAccessEmail(typed);
  if (q.length < 3) return [];
  const all = [...new Set([...loadRememberedDesktopEmails(), ...extra.map(normalizeAccessEmail)])];
  return all.filter((email) => email.startsWith(q) && email !== q).slice(0, 6);
}

export function loadDesktopAccessSession(): DesktopAccessSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const email = normalizeAccessEmail(typeof parsed.email === "string" ? parsed.email : "");
    const nomeGuerra = typeof parsed.nomeGuerra === "string" ? parsed.nomeGuerra.trim() : "";
    if (!email || !nomeGuerra) return null;
    return { email, nomeGuerra };
  } catch {
    return null;
  }
}

export function clearDesktopAccessSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function saveDesktopAccessSession(session: DesktopAccessSession): void {
  rememberDesktopEmail(session.email);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function accessAuthErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (code === "auth/operation-not-allowed") {
    return "Ative o login por e-mail e senha no Firebase para concluir o cadastro.";
  }
  if (code === "auth/invalid-email") return "E-mail inválido.";
  if (code === "auth/weak-password") return "A senha precisa ter pelo menos 6 caracteres.";
  if (code === "auth/email-already-in-use") return "Este e-mail já possui senha. Entre com ela.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "E-mail ou senha incorretos.";
  }
  if (code === "auth/too-many-requests") return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  return error instanceof Error ? error.message : "Não foi possível concluir o acesso.";
}
