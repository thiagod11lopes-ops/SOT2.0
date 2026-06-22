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
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { loadMotoristaPaoFromIdb, saveMotoristaPaoToIdb } from "../lib/motoristaPaoStorage";
import { useSyncPreference } from "./sync-preference-context";

type MotoristaPaoContextValue = {
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
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const [nome, setNomeState] = useState("");
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(!useCloud);
  const localPromotionAttemptedRef = useRef(false);
  const cloudWriteInFlightRef = useRef(false);
  const pendingNomeRef = useRef<string | null>(null);
  const nomeRef = useRef(nome);
  nomeRef.current = nome;

  useEffect(() => {
    if (useCloud) return;
    let cancelled = false;
    void loadMotoristaPaoFromIdb().then((n) => {
      if (cancelled) return;
      setNomeState(n);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [useCloud]);

  const pushNomeToCloud = useCallback(
    async (nextNome: string) => {
      if (!useCloud || !hydratedRef.current) return;
      pendingNomeRef.current = nextNome;
      if (cloudWriteInFlightRef.current) return;
      cloudWriteInFlightRef.current = true;
      try {
        while (pendingNomeRef.current !== null) {
          const toSend = pendingNomeRef.current;
          pendingNomeRef.current = null;
          try {
            await setSotStateDocWithRetry(SOT_STATE_DOC.motoristaPao, { nome: toSend });
            await saveMotoristaPaoToIdb(toSend);
          } catch (e) {
            console.error("[SOT] Gravar motorista pão na nuvem:", e);
          }
        }
      } finally {
        cloudWriteInFlightRef.current = false;
      }
    },
    [useCloud],
  );

  useEffect(() => {
    if (!useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.motoristaPao,
          (payload) => {
            void (async () => {
              if (cancelled) return;

              if (payload === null) {
                if (!localPromotionAttemptedRef.current) {
                  localPromotionAttemptedRef.current = true;
                  const local = await loadMotoristaPaoFromIdb();
                  if (local.trim()) {
                    try {
                      await setSotStateDocWithRetry(SOT_STATE_DOC.motoristaPao, { nome: local });
                      applyingRemoteRef.current = true;
                      setNomeState(local);
                      await saveMotoristaPaoToIdb(local);
                    } catch (e) {
                      console.error("[SOT] Promover motorista pão local para nuvem:", e);
                    }
                  }
                }
                hydratedRef.current = true;
                return;
              }

              applyingRemoteRef.current = true;
              const n = normalizeMotoristaPaoDoc(payload);
              setNomeState(n);
              await saveMotoristaPaoToIdb(n);
              hydratedRef.current = true;
            })();
          },
          (err) => console.error("[SOT] Firestore motorista pão:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (motorista pão):", e);
        hydratedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud || !hydratedRef.current) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void pushNomeToCloud(nome);
    }, 450);
    return () => window.clearTimeout(t);
  }, [nome, useCloud, pushNomeToCloud]);

  useEffect(() => {
    if (useCloud || !hydratedRef.current) return;
    void saveMotoristaPaoToIdb(nome);
  }, [nome, useCloud]);

  const setNome = useCallback((value: string) => {
    setNomeState(value);
  }, []);

  const value = useMemo(() => ({ nome, setNome }), [nome, setNome]);

  return <MotoristaPaoContext.Provider value={value}>{children}</MotoristaPaoContext.Provider>;
}

export function useMotoristaPao() {
  const ctx = useContext(MotoristaPaoContext);
  if (!ctx) {
    throw new Error("useMotoristaPao deve ser usado dentro de MotoristaPaoProvider");
  }
  return ctx;
}
