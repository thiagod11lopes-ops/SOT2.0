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
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import { useSyncPreference } from "./sync-preference-context";

export const LIMPEZA_PENDENTE_STORAGE_KEY = "sot-limpeza-pendente-v1";
const SUPPRESS_REMOTE_MS = 5000;

type LimpezaPendenteContextValue = {
  /** Placas marcadas para limpeza, ordenadas. */
  placas: string[];
  setPendente: (placa: string, pendente: boolean) => void;
  isPendente: (placa: string) => boolean;
};

const LimpezaPendenteContext = createContext<LimpezaPendenteContextValue | null>(null);

function placasArrayToSet(raw: unknown): Set<string> {
  const loaded = new Set<string>();
  if (Array.isArray(raw)) {
    for (const p of raw) {
      const t = typeof p === "string" ? p.trim() : "";
      if (t) loaded.add(t);
    }
  }
  return loaded;
}

export function LimpezaPendenteProvider({ children }: { children: ReactNode }) {
  const [placasSet, setPlacasSet] = useState<Set<string>>(new Set());
  const hydratedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    void idbGetJson<unknown>(LIMPEZA_PENDENTE_STORAGE_KEY)
      .then((raw) => {
        const loaded = placasArrayToSet(raw);
        setPlacasSet((prev) => {
          const merged = new Set(loaded);
          for (const p of prev) merged.add(p);
          return merged;
        });
      })
      .finally(() => {
        hydratedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.limpezaPendente,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                // Firebase como fonte da verdade: não promover local->nuvem no bootstrap.
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) return;
              applyingRemoteRef.current = true;
              const next = placasArrayToSet(payload);
              setPlacasSet(next);
              hydratedRef.current = true;
              void idbSetJson(
                LIMPEZA_PENDENTE_STORAGE_KEY,
                Array.from(next).sort((a, b) => a.localeCompare(b, "pt-BR")),
              );
            })();
          },
          (err) => console.error("[SOT] Firestore limpeza pendente:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (limpeza):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void idbSetJson(
      LIMPEZA_PENDENTE_STORAGE_KEY,
      Array.from(placasSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
    );
  }, [placasSet]);

  useEffect(() => {
    if (!hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const sorted = Array.from(placasSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
    void setSotStateDocWithRetry(SOT_STATE_DOC.limpezaPendente, sorted).catch((e) => {
      console.error("[SOT] Gravar limpeza pendente na nuvem:", e);
    });
  }, [placasSet, useCloud]);

  const setPendente = useCallback((placa: string, pendente: boolean) => {
    const t = placa.trim();
    if (!t) return;
    bumpLocalMutation();
    setPlacasSet((prev) => {
      const next = new Set(prev);
      const existing = [...next].find((p) => p.toLowerCase() === t.toLowerCase());
      if (pendente) {
        next.add(existing ?? t);
      } else if (existing) {
        next.delete(existing);
      }
      return next;
    });
  }, [bumpLocalMutation]);

  const isPendente = useCallback(
    (placa: string) => {
      const t = placa.trim().toLowerCase();
      return [...placasSet].some((p) => p.toLowerCase() === t);
    },
    [placasSet],
  );

  const placas = useMemo(
    () => Array.from(placasSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [placasSet],
  );

  const value = useMemo(
    () => ({ placas, setPendente, isPendente }),
    [placas, setPendente, isPendente],
  );

  return (
    <LimpezaPendenteContext.Provider value={value}>{children}</LimpezaPendenteContext.Provider>
  );
}

export function useLimpezaPendente() {
  const ctx = useContext(LimpezaPendenteContext);
  if (!ctx) {
    throw new Error("useLimpezaPendente deve ser usado dentro de LimpezaPendenteProvider");
  }
  return ctx;
}
