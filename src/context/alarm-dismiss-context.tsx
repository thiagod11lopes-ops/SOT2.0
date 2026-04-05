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
import { localDateKey, normalizeAlarmDismissMap } from "../lib/dailyAlarmDismiss";

const LS_KEY = "sot-alarm-dismiss-v2";

function readLocalMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    return normalizeAlarmDismissMap(p);
  } catch {
    return {};
  }
}

function writeLocalMap(map: Record<string, string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
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
  const [map, setMap] = useState<Record<string, string>>(() => readLocalMap());
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
          SOT_STATE_DOC.alarmDismiss,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                const local = readLocalMap();
                if (!isMapEmpty(local)) {
                  await setSotStateDoc(SOT_STATE_DOC.alarmDismiss, local);
                }
                return;
              }
              applyingRemoteRef.current = true;
              const next = normalizeAlarmDismissMap(payload);
              setMap(next);
              writeLocalMap(next);
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
    if (!hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDoc(SOT_STATE_DOC.alarmDismiss, map).catch((e) => {
      console.error("[SOT] Gravar dismiss alarmes na nuvem:", e);
    });
  }, [map, useCloud]);

  const isDismissedTodayForAlarm = useCallback(
    (alarmId: string) => map[alarmId] === localDateKey(new Date()),
    [map],
  );

  const dismissAlarmForToday = useCallback((alarmId: string) => {
    const day = localDateKey(new Date());
    setMap((prev) => {
      const next = { ...prev, [alarmId]: day };
      writeLocalMap(next);
      return next;
    });
  }, []);

  const clearDismissForAlarm = useCallback((alarmId: string) => {
    setMap((prev) => {
      if (prev[alarmId] === undefined) return prev;
      const next = { ...prev };
      delete next[alarmId];
      writeLocalMap(next);
      return next;
    });
  }, []);

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
