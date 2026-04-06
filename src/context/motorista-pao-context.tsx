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
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { loadMotoristaPaoFromIdb, saveMotoristaPaoToIdb } from "../lib/motoristaPaoStorage";

type MotoristaPaoContextValue = {
  /** Nome exibido no cabeçalho (motorista que leva o pão). */
  nome: string;
  setNome: (value: string) => void;
};

const MotoristaPaoContext = createContext<MotoristaPaoContextValue | null>(null);

function normalizeMotoristaPaoDoc(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  return typeof o.nome === "string" ? o.nome : "";
}

export function MotoristaPaoProvider({ children }: { children: ReactNode }) {
  const [nome, setNomeState] = useState("");
  const [idbReady, setIdbReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(true);
  const useCloud = isFirebaseConfigured();

  useEffect(() => {
    void loadMotoristaPaoFromIdb().then((n) => {
      setNomeState(n);
      setIdbReady(true);
    });
  }, []);

  useEffect(() => {
    if (!useCloud || !idbReady) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.motoristaPao,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                const local = (await loadMotoristaPaoFromIdb()).trim();
                if (local) {
                  await setSotStateDoc(SOT_STATE_DOC.motoristaPao, { nome: local });
                }
                return;
              }
              applyingRemoteRef.current = true;
              const n = normalizeMotoristaPaoDoc(payload);
              setNomeState(n);
              void saveMotoristaPaoToIdb(n);
              hydratedRef.current = true;
            })();
          },
          (err) => console.error("[SOT] Firestore motorista pão:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (motorista pão):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, idbReady]);

  useEffect(() => {
    if (!idbReady) return;
    void saveMotoristaPaoToIdb(nome);
  }, [nome, idbReady]);

  useEffect(() => {
    if (!idbReady || !hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDoc(SOT_STATE_DOC.motoristaPao, { nome }).catch((e) => {
      console.error("[SOT] Gravar motorista pão na nuvem:", e);
    });
  }, [nome, useCloud, idbReady]);

  const setNome = useCallback((value: string) => {
    setNomeState(value);
  }, []);

  const value = useMemo(() => ({ nome, setNome }), [nome, setNome]);

  return (
    <MotoristaPaoContext.Provider value={value}>{children}</MotoristaPaoContext.Provider>
  );
}

export function useMotoristaPao() {
  const ctx = useContext(MotoristaPaoContext);
  if (!ctx) {
    throw new Error("useMotoristaPao deve ser usado dentro de MotoristaPaoProvider");
  }
  return ctx;
}
