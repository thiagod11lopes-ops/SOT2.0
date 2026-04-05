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

const LS_KEY = "sot_departures_report_email";

function readLocal(): string {
  try {
    const v = localStorage.getItem(LS_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function writeLocal(value: string) {
  try {
    localStorage.setItem(LS_KEY, value.trim());
  } catch {
    /* ignore */
  }
}

function normalizePayload(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  return typeof o.email === "string" ? o.email.trim() : "";
}

type Value = {
  email: string;
  setEmail: (value: string) => void;
};

const Ctx = createContext<Value | null>(null);

export function DeparturesReportEmailProvider({ children }: { children: ReactNode }) {
  const [email, setEmailState] = useState(() => readLocal());
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(true);
  const useCloud = isFirebaseConfigured();

  useEffect(() => {
    if (!useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.departuresReportEmail,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                const local = readLocal().trim();
                if (local) {
                  await setSotStateDoc(SOT_STATE_DOC.departuresReportEmail, { email: local });
                }
                return;
              }
              applyingRemoteRef.current = true;
              const next = normalizePayload(payload);
              setEmailState(next);
              writeLocal(next);
              hydratedRef.current = true;
            })();
          },
          (err) => console.error("[SOT] Firestore email relatório saídas:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (email relatório):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    if (!hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDoc(SOT_STATE_DOC.departuresReportEmail, { email: email.trim() }).catch((e) => {
      console.error("[SOT] Gravar email relatório na nuvem:", e);
    });
  }, [email, useCloud]);

  const setEmail = useCallback((value: string) => {
    const t = value.trim();
    setEmailState(t);
    writeLocal(t);
  }, []);

  const value = useMemo(() => ({ email, setEmail }), [email, setEmail]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeparturesReportEmail() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useDeparturesReportEmail deve ser usado dentro de DeparturesReportEmailProvider");
  }
  return ctx;
}
