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
  loadDesktopAccessSession,
  normalizeAccessEmail,
  normalizeAcessoSistemaDoc,
  saveDesktopAccessSession,
  suggestDesktopEmails,
  type AcessoSistemaDoc,
  type DesktopAccessSession,
} from "../lib/sotDesktopAccess";

const IDLE_MS = 10 * 60 * 1000;

type SotDesktopAccessContextValue = {
  ready: boolean;
  loadError: string;
  doc: AcessoSistemaDoc;
  session: DesktopAccessSession | null;
  locked: boolean;
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
  const [session, setSession] = useState<DesktopAccessSession | null>(() =>
    enabled ? loadDesktopAccessSession() : null,
  );
  const [locked, setLocked] = useState(false);
  const docRef = useRef(doc);
  docRef.current = doc;

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
            setLocked(false);
            return null;
          }
          if (pessoa.nomeGuerra === current.nomeGuerra) return current;
          const updated = { email: current.email, nomeGuerra: pessoa.nomeGuerra };
          saveDesktopAccessSession(updated);
          return updated;
        });
      },
      (err) => {
        setLoadError(err.message || "Não foi possível carregar os e-mails autorizados.");
        setReady(true);
      },
    );
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !session || locked) return;
    let timer = window.setTimeout(() => setLocked(true), IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLocked(true), IDLE_MS);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    for (const eventName of events) window.addEventListener(eventName, bump, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const eventName of events) window.removeEventListener(eventName, bump);
    };
  }, [enabled, session, locked]);

  const persist = useCallback(async (next: AcessoSistemaDoc) => {
    await setSotStateDoc(SOT_STATE_DOC.acessoSistema, next);
    setDoc(next);
  }, []);

  const openSession = useCallback((email: string, nomeGuerra: string) => {
    const next = { email: normalizeAccessEmail(email), nomeGuerra: nomeGuerra.trim() };
    saveDesktopAccessSession(next);
    setSession(next);
    setLocked(false);
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
      locked,
      isGestor: Boolean(email && doc.gestorEmail && email === doc.gestorEmail),
      nomeGuerraAtual: session && !locked ? session.nomeGuerra : "",
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
    locked,
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
