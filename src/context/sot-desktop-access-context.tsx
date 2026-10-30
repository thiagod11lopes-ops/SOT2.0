import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isFirebaseConfigured } from "../lib/firebase/config";
import {
  createDesktopAccessAccount,
  sendDesktopAccessReset,
  signInDesktopAccess,
} from "../lib/firebase/sotDesktopAccessAuth";
import { setSotStateDoc, SOT_STATE_DOC, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import {
  accessAuthErrorMessage,
  emptyAcessoSistemaDoc,
  isPlausibleEmail,
  clearDesktopAccessSession,
  normalizeAccessEmail,
  normalizeAcessoSistemaDoc,
  rememberDesktopEmail,
  suggestDesktopEmails,
  type AcessoSistemaDoc,
  type DesktopAccessSession,
} from "../lib/sotDesktopAccess";

const IDLE_MS = 10 * 60 * 1000;
const PROMPT_MS = 30 * 1000;

type LoginPrompt = "required" | "idle" | null;

type SotDesktopAccessContextValue = {
  ready: boolean;
  loadError: string;
  doc: AcessoSistemaDoc;
  session: DesktopAccessSession | null;
  loginPrompt: LoginPrompt;
  awaitingActivity: boolean;
  idleDeadlineRef: { current: number };
  isGestor: boolean;
  nomeGuerraAtual: string;
  sugestoes: (typed: string) => string[];
  registrarGestor: (email: string, nomeGuerra: string, senha: string) => Promise<void>;
  cadastrarSenha: (email: string, senha: string) => Promise<void>;
  entrar: (email: string, senha: string) => Promise<void>;
  enviarRecuperacao: (email: string) => Promise<void>;
  adicionarEmail: (email: string, nomeGuerra: string) => Promise<void>;
  removerEmail: (email: string) => Promise<void>;
};

const SotDesktopAccessContext = createContext<SotDesktopAccessContextValue | null>(null);

function authCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
}

async function criarOuConfirmarConta(email: string, senha: string): Promise<void> {
  try {
    await createDesktopAccessAccount(email, senha);
  } catch (error) {
    if (authCode(error) !== "auth/email-already-in-use") throw new Error(accessAuthErrorMessage(error));
    try {
      await signInDesktopAccess(email, senha);
    } catch (signInError) {
      throw new Error(accessAuthErrorMessage(signInError));
    }
  }
}

function pessoaPorEmail(doc: AcessoSistemaDoc, email: string) {
  const norm = normalizeAccessEmail(email);
  return doc.pessoas.find((pessoa) => pessoa.email === norm) ?? null;
}

export function SotDesktopAccessProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [doc, setDoc] = useState<AcessoSistemaDoc>(emptyAcessoSistemaDoc);
  const [ready, setReady] = useState(!enabled || !isFirebaseConfigured());
  const [loadError, setLoadError] = useState("");
  const [session, setSession] = useState<DesktopAccessSession | null>(null);
  const [loginPrompt, setLoginPrompt] = useState<LoginPrompt>("required");
  const [awaitingActivity, setAwaitingActivity] = useState(false);
  const idleDeadlineRef = useRef(0);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    clearDesktopAccessSession();
  }, []);

  useEffect(() => {
    if (!enabled || !isFirebaseConfigured()) {
      setReady(true);
      return;
    }
    return subscribeSotStateDoc(
      SOT_STATE_DOC.acessoSistema,
      (payload) => {
        const next = normalizeAcessoSistemaDoc(payload);
        setLoadError("");
        setDoc(next);
        setReady(true);
        setSession((current) => {
          if (!current) return current;
          const pessoa = pessoaPorEmail(next, current.email);
          if (!pessoa) {
            if (!next.gestorEmail) return current;
            clearDesktopAccessSession();
            setAwaitingActivity(false);
            setLoginPrompt("required");
            return null;
          }
          if (pessoa.nomeGuerra === current.nomeGuerra) return current;
          return { email: current.email, nomeGuerra: pessoa.nomeGuerra };
        });
      },
      (err) => {
        setLoadError(err.message || "Não foi possível carregar os e-mails autorizados.");
        setReady(true);
      },
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !session) return;
    idleDeadlineRef.current = Date.now() + IDLE_MS;
    let ended = false;
    const tick = window.setInterval(() => {
      if (Date.now() < idleDeadlineRef.current || ended) return;
      ended = true;
      setSession(null);
      setAwaitingActivity(true);
      setLoginPrompt(null);
    }, 250);
    const bump = () => {
      if (ended) return;
      idleDeadlineRef.current = Date.now() + IDLE_MS;
    };
    let lastMove = 0;
    const onMove = () => {
      const now = Date.now();
      if (now - lastMove < 400) return;
      lastMove = now;
      bump();
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"];
    for (const eventName of events) window.addEventListener(eventName, bump, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.clearInterval(tick);
      for (const eventName of events) window.removeEventListener(eventName, bump);
      window.removeEventListener("pointermove", onMove);
    };
  }, [enabled, session]);

  useEffect(() => {
    if (!enabled || !awaitingActivity || loginPrompt !== null || session) return;
    const open = () => setLoginPrompt("idle");
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"];
    for (const eventName of events) window.addEventListener(eventName, open, { passive: true });
    let lastMove = 0;
    const onMove = () => {
      const now = Date.now();
      if (now - lastMove < 400) return;
      lastMove = now;
      open();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      for (const eventName of events) window.removeEventListener(eventName, open);
      window.removeEventListener("pointermove", onMove);
    };
  }, [enabled, awaitingActivity, loginPrompt, session]);

  useEffect(() => {
    if (loginPrompt !== "idle") return;
    const timer = window.setTimeout(() => setLoginPrompt(null), PROMPT_MS);
    return () => window.clearTimeout(timer);
  }, [loginPrompt]);

  const persist = useCallback(async (next: AcessoSistemaDoc) => {
    await setSotStateDoc(SOT_STATE_DOC.acessoSistema, next);
    setDoc(next);
  }, []);

  const openSession = useCallback((email: string, nomeGuerra: string) => {
    const next = { email: normalizeAccessEmail(email), nomeGuerra: nomeGuerra.trim() };
    rememberDesktopEmail(next.email);
    idleDeadlineRef.current = Date.now() + IDLE_MS;
    setAwaitingActivity(false);
    setLoginPrompt(null);
    setSession(next);
  }, []);

  const registrarGestor = useCallback(
    async (email: string, nomeGuerra: string, senha: string) => {
      const norm = normalizeAccessEmail(email);
      const nome = nomeGuerra.trim();
      if (!isPlausibleEmail(norm)) throw new Error("Informe um e-mail válido.");
      if (!nome) throw new Error("Informe o nome de guerra.");
      if (docRef.current.gestorEmail) throw new Error("O gestor já foi cadastrado.");
      await criarOuConfirmarConta(norm, senha);
      const next: AcessoSistemaDoc = {
        gestorEmail: norm,
        pessoas: [{ email: norm, nomeGuerra: nome, senhaCriada: true }],
      };
      await persist(next);
      openSession(norm, nome);
    },
    [openSession, persist],
  );

  const cadastrarSenha = useCallback(
    async (email: string, senha: string) => {
      const norm = normalizeAccessEmail(email);
      const pessoa = pessoaPorEmail(docRef.current, norm);
      if (!pessoa) throw new Error("Este e-mail não está autorizado.");
      if (pessoa.senhaCriada) throw new Error("Este e-mail já possui senha. Entre com ela.");
      await criarOuConfirmarConta(norm, senha);
      const next: AcessoSistemaDoc = {
        ...docRef.current,
        pessoas: docRef.current.pessoas.map((item) =>
          item.email === norm ? { ...item, senhaCriada: true } : item,
        ),
      };
      await persist(next);
      openSession(norm, pessoa.nomeGuerra);
    },
    [openSession, persist],
  );

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const norm = normalizeAccessEmail(email);
      const pessoa = pessoaPorEmail(docRef.current, norm);
      if (!pessoa || !pessoa.senhaCriada) throw new Error("Este e-mail ainda não tem senha cadastrada.");
      try {
        await signInDesktopAccess(norm, senha);
      } catch (error) {
        throw new Error(accessAuthErrorMessage(error));
      }
      openSession(norm, pessoa.nomeGuerra);
    },
    [openSession],
  );

  const enviarRecuperacao = useCallback(async (email: string) => {
    const norm = normalizeAccessEmail(email);
    const pessoa = pessoaPorEmail(docRef.current, norm);
    if (!pessoa || !pessoa.senhaCriada) throw new Error("Cadastre a senha deste e-mail antes de recuperar o acesso.");
    try {
      await sendDesktopAccessReset(norm);
    } catch (error) {
      throw new Error(accessAuthErrorMessage(error));
    }
  }, []);

  const adicionarEmail = useCallback(
    async (email: string, nomeGuerra: string) => {
      const norm = normalizeAccessEmail(email);
      const nome = nomeGuerra.trim();
      if (!session || normalizeAccessEmail(session.email) !== docRef.current.gestorEmail) {
        throw new Error("Somente o gestor pode autorizar e-mails.");
      }
      if (!isPlausibleEmail(norm)) throw new Error("Informe um e-mail válido.");
      if (!nome) throw new Error("Informe o nome de guerra.");
      if (pessoaPorEmail(docRef.current, norm)) throw new Error("Este e-mail já está autorizado.");
      await persist({
        ...docRef.current,
        pessoas: [...docRef.current.pessoas, { email: norm, nomeGuerra: nome, senhaCriada: false }],
      });
    },
    [persist, session],
  );

  const removerEmail = useCallback(
    async (email: string) => {
      const norm = normalizeAccessEmail(email);
      if (!session || normalizeAccessEmail(session.email) !== docRef.current.gestorEmail) {
        throw new Error("Somente o gestor pode retirar e-mails.");
      }
      if (norm === docRef.current.gestorEmail) throw new Error("O e-mail do gestor não pode ser retirado.");
      await persist({
        ...docRef.current,
        pessoas: docRef.current.pessoas.filter((pessoa) => pessoa.email !== norm),
      });
    },
    [persist, session],
  );

  const sugestoes = useCallback(
    (typed: string) => suggestDesktopEmails(typed, doc.pessoas.map((pessoa) => pessoa.email)),
    [doc.pessoas],
  );

  const value = useMemo<SotDesktopAccessContextValue>(() => {
    const email = session ? normalizeAccessEmail(session.email) : "";
    return {
      ready,
      loadError,
      doc,
      session,
      loginPrompt,
      awaitingActivity,
      idleDeadlineRef,
      isGestor: Boolean(email && doc.gestorEmail && email === doc.gestorEmail),
      nomeGuerraAtual: session?.nomeGuerra ?? "",
      sugestoes,
      registrarGestor,
      cadastrarSenha,
      entrar,
      enviarRecuperacao,
      adicionarEmail,
      removerEmail,
    };
  }, [
    ready,
    loadError,
    doc,
    session,
    loginPrompt,
    awaitingActivity,
    idleDeadlineRef,
    sugestoes,
    registrarGestor,
    cadastrarSenha,
    entrar,
    enviarRecuperacao,
    adicionarEmail,
    removerEmail,
  ]);

  return <SotDesktopAccessContext.Provider value={value}>{children}</SotDesktopAccessContext.Provider>;
}

export function useSotDesktopAccess(): SotDesktopAccessContextValue {
  const ctx = useContext(SotDesktopAccessContext);
  if (!ctx) throw new Error("useSotDesktopAccess fora do provider");
  return ctx;
}
