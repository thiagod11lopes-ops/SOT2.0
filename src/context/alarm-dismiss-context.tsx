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
import { localDateKey, normalizeAlarmDismissMap } from "../lib/dailyAlarmDismiss";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";

const IDB_KEY = "sot-alarm-dismiss-v2";
const LEGACY_LS_KEY = "sot-alarm-dismiss-v2";
const SUPPRESS_REMOTE_MS = 5000;

async function loadDismissMapFromIdb(): Promise<Record<string, string>> {
  const v = await idbGetJson<unknown>(IDB_KEY);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return normalizeAlarmDismissMap(v);
  }
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as unknown;
      const m = normalizeAlarmDismissMap(p);
      await idbSetJson(IDB_KEY, m);
      localStorage.removeItem(LEGACY_LS_KEY);
      return m;
    }
  } catch {
    /* ignore */
  }
  return {};
}

async function saveDismissMapToIdb(map: Record<string, string>): Promise<void> {
  await idbSetJson(IDB_KEY, map);
}

function isMapEmpty(m: Record<string, string>): boolean {
  return Object.keys(m).length === 0;
}

type AlarmDismissContextValue = {
  isDismissedTodayForAlarm: (alarmId: string) => boolean;
  dismissAlarmForToday: (alarmId: string) => void;
  clearDismissForAlarm: (alarmId: string) => void;
};

const AlarmDismissContext = createContext<AlarmDismissContextValue | null>(null);

export function AlarmDismissProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Record<string, string>>({});
  const [idbReady, setIdbReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(true);
  const suppressRemoteUntilRef = useRef(0);
  const useCloud = isFirebaseConfigured();
  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    void loadDismissMapFromIdb().then((m) => {
      setMap(m);
      setIdbReady(true);
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
          SOT_STATE_DOC.alarmDismiss,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                const local = await loadDismissMapFromIdb();
                if (!isMapEmpty(local)) {
                  await setSotStateDocWithRetry(SOT_STATE_DOC.alarmDismiss, local);
                }
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) return;
              applyingRemoteRef.current = true;
              const next = normalizeAlarmDismissMap(payload);
              setMap(next);
              void saveDismissMapToIdb(next);
              hydratedRef.current = true;
            })();
          },
          (err) => console.error("[SOT] Firestore dismiss alarmes:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (dismiss alarmes):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud]);

  useEffect(() => {
    if (!idbReady) return;
    void saveDismissMapToIdb(map);
  }, [map, idbReady]);

  useEffect(() => {
    if (!idbReady || !hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDocWithRetry(SOT_STATE_DOC.alarmDismiss, map).catch((e) => {
      console.error("[SOT] Gravar dismiss alarmes na nuvem:", e);
    });
  }, [map, useCloud, idbReady]);

  const isDismissedTodayForAlarm = useCallback(
    (alarmId: string) => map[alarmId] === localDateKey(new Date()),
    [map],
  );

  const dismissAlarmForToday = useCallback((alarmId: string) => {
    bumpLocalMutation();
    const day = localDateKey(new Date());
    setMap((prev) => {
      const next = { ...prev, [alarmId]: day };
      return next;
    });
  }, [bumpLocalMutation]);

  const clearDismissForAlarm = useCallback((alarmId: string) => {
    bumpLocalMutation();
    setMap((prev) => {
      if (prev[alarmId] === undefined) return prev;
      const next = { ...prev };
      delete next[alarmId];
      return next;
    });
  }, [bumpLocalMutation]);

  const value = useMemo(
    () => ({
      isDismissedTodayForAlarm,
      dismissAlarmForToday,
      clearDismissForAlarm,
    }),
    [isDismissedTodayForAlarm, dismissAlarmForToday, clearDismissForAlarm],
  );

  return (
    <AlarmDismissContext.Provider value={value}>{children}</AlarmDismissContext.Provider>
  );
}

export function useAlarmDismiss() {
  const ctx = useContext(AlarmDismissContext);
  if (!ctx) {
    throw new Error("useAlarmDismiss deve ser usado dentro de AlarmDismissProvider");
  }
  return ctx;
}
