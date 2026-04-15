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

const IDB_KEY = "sot_departures_report_email";
const LEGACY_LS_KEY = "sot_departures_report_email";
const SUPPRESS_REMOTE_MS = 5000;

async function loadEmailFromIdb(): Promise<string> {
  const v = await idbGetJson<unknown>(IDB_KEY);
  if (typeof v === "string") return v.trim();
  try {
    if (typeof localStorage === "undefined") return "";
    const ls = localStorage.getItem(LEGACY_LS_KEY);
    if (typeof ls === "string" && ls.trim()) {
      const t = ls.trim();
      await idbSetJson(IDB_KEY, t);
      localStorage.removeItem(LEGACY_LS_KEY);
      return t;
    }
  } catch {
    /* ignore */
  }
  return "";
}

async function saveEmailToIdb(value: string): Promise<void> {
  await idbSetJson(IDB_KEY, value.trim());
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
  const [email, setEmailState] = useState("");
  const [idbReady, setIdbReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(true);
  const suppressRemoteUntilRef = useRef(0);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    if (useCloud) {
      // Modo estrito Firebase: ignora hidratação inicial por cache local.
      setIdbReady(true);
      return;
    }
    void loadEmailFromIdb().then((e) => {
      setEmailState(e);
      setIdbReady(true);
    });
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud || !idbReady) return;
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
                // Firebase como fonte da verdade: não promover local->nuvem no bootstrap.
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) return;
              applyingRemoteRef.current = true;
              const next = normalizePayload(payload);
              setEmailState(next);
              void saveEmailToIdb(next);
              hydratedRef.current = true;
            })();
          },
          (err) => console.error("[SOT] Firestore email relatório saídas:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (email relatório):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, idbReady]);

  useEffect(() => {
    if (!idbReady) return;
    void saveEmailToIdb(email);
  }, [email, idbReady]);

  useEffect(() => {
    if (!idbReady || !hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDocWithRetry(SOT_STATE_DOC.departuresReportEmail, { email: email.trim() }).catch((e) => {
      console.error("[SOT] Gravar email relatório na nuvem:", e);
    });
  }, [email, useCloud, idbReady]);

  const setEmail = useCallback((value: string) => {
    const t = value.trim();
    bumpLocalMutation();
    setEmailState(t);
  }, [bumpLocalMutation]);

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
