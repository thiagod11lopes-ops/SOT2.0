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
import {
  avisoGeralExpiradoParaRemocaoAutomatica,
  avisoGeralVisivelNoDia,
} from "../lib/avisoGeralSchedule";
import { useAlarmDismiss } from "./alarm-dismiss-context";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDoc, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import type { AvisoGeralItem } from "../types/aviso-geral";
import { parseHhMm } from "../lib/timeInput";

export const AVISOS_STORAGE_KEY = "sot-avisos-v1";

export type { AvisoGeralItem } from "../types/aviso-geral";

export type AlarmeDiarioItem = {
  id: string;
  nome: string;
  hora: string;
  ativo: boolean;
};

export type AvisosPersistedState = {
  avisoPrincipal: string;
  fainasTexto: string;
  avisosGeraisItens: AvisoGeralItem[];
  alarmesDiarios: AlarmeDiarioItem[];
};

const defaultState: AvisosPersistedState = {
  avisoPrincipal: "",
  fainasTexto: "",
  avisosGeraisItens: [],
  alarmesDiarios: [],
};

type AvisosContextValue = AvisosPersistedState & {
  setAvisoPrincipal: (v: string) => void;
  setFainasTexto: (v: string) => void;
  setAvisosGeraisItens: (items: AvisoGeralItem[] | ((prev: AvisoGeralItem[]) => AvisoGeralItem[])) => void;
  addAlarmeDiario: (nome: string, hora: string) => void;
  updateAlarmeDiario: (
    id: string,
    patch: Partial<Pick<AlarmeDiarioItem, "nome" | "hora" | "ativo">>,
  ) => void;
  removeAlarmeDiario: (id: string) => void;
  fainasLinhas: string[];
  avisosGeraisLinhas: string[];
};

const AvisosContext = createContext<AvisosContextValue | null>(null);

function newId() {
  return crypto.randomUUID();
}

function rowValid(r: unknown): r is AlarmeDiarioItem {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length > 0 &&
    typeof o.nome === "string" &&
    typeof o.hora === "string" &&
    typeof o.ativo === "boolean" &&
    parseHhMm(o.hora) !== null
  );
}

function normalizeAlarmesFromArray(raw: unknown): AlarmeDiarioItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AlarmeDiarioItem[] = [];
  for (const item of raw) {
    if (!rowValid(item)) continue;
    out.push({
      id: item.id,
      nome: item.nome.trim(),
      hora: item.hora,
      ativo: item.ativo,
    });
  }
  return out;
}

function migrateLegacySingleAlarm(o: Record<string, unknown>): AlarmeDiarioItem[] {
  const ativo = o.alarmDiarioAtivo === true;
  const nome = typeof o.alarmDiarioNome === "string" ? o.alarmDiarioNome.trim() : "";
  const hora = typeof o.alarmDiarioHora === "string" ? o.alarmDiarioHora : "";
  if (ativo && nome && parseHhMm(hora)) {
    return [{ id: newId(), nome, hora, ativo: true }];
  }
  return [];
}

function normalizeAvisoGeralItem(raw: unknown): AvisoGeralItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.texto !== "string") return null;
  return {
    id: o.id,
    texto: o.texto,
    dataInicio: typeof o.dataInicio === "string" ? o.dataInicio : "",
    dataFim: typeof o.dataFim === "string" ? o.dataFim : "",
  };
}

function migrateAvisosGeraisFromTextoLegado(texto: string): AvisoGeralItem[] {
  return texto
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((linha) => ({
      id: newId(),
      texto: linha,
      dataInicio: "",
      dataFim: "",
    }));
}

function normalizeStored(raw: unknown): AvisosPersistedState {
  if (!raw || typeof raw !== "object") return { ...defaultState };
  const o = raw as Record<string, unknown>;
  let alarmesDiarios = normalizeAlarmesFromArray(o.alarmesDiarios);
  if (alarmesDiarios.length === 0) {
    alarmesDiarios = migrateLegacySingleAlarm(o);
  }

  let avisosGeraisItens: AvisoGeralItem[] = [];
  if (Array.isArray(o.avisosGeraisItens)) {
    for (const x of o.avisosGeraisItens) {
      const n = normalizeAvisoGeralItem(x);
      if (n) avisosGeraisItens.push(n);
    }
  }
  if (
    avisosGeraisItens.length === 0 &&
    typeof o.avisosGeraisTexto === "string" &&
    o.avisosGeraisTexto.trim()
  ) {
    avisosGeraisItens = migrateAvisosGeraisFromTextoLegado(o.avisosGeraisTexto);
  }

  return {
    avisoPrincipal: typeof o.avisoPrincipal === "string" ? o.avisoPrincipal : "",
    fainasTexto: typeof o.fainasTexto === "string" ? o.fainasTexto : "",
    avisosGeraisItens,
    alarmesDiarios,
  };
}

function isAvisosEmpty(s: AvisosPersistedState): boolean {
  return (
    !s.avisoPrincipal.trim() &&
    !s.fainasTexto.trim() &&
    s.avisosGeraisItens.length === 0 &&
    s.alarmesDiarios.length === 0
  );
}

export function AvisosProvider({ children }: { children: ReactNode }) {
  const { clearDismissForAlarm } = useAlarmDismiss();
  const [avisoPrincipal, setAvisoPrincipalState] = useState("");
  const [fainasTexto, setFainasTextoState] = useState("");
  const [avisosGeraisItens, setAvisosGeraisItensState] = useState<AvisoGeralItem[]>([]);
  const [alarmesDiarios, setAlarmesDiariosState] = useState<AlarmeDiarioItem[]>([]);
  const [persistReady, setPersistReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const useCloud = isFirebaseConfigured();
  /** Atualiza o filtro por data ao mudar o dia (relógio). */
  const [agendaDiaTick, setAgendaDiaTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setAgendaDiaTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void idbGetJson<unknown>(AVISOS_STORAGE_KEY)
      .then((raw) => {
        const n = normalizeStored(raw);
        setAvisoPrincipalState(n.avisoPrincipal);
        setFainasTextoState(n.fainasTexto);
        setAvisosGeraisItensState(n.avisosGeraisItens);
        setAlarmesDiariosState(n.alarmesDiarios);
      })
      .finally(() => setPersistReady(true));
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    const payload: AvisosPersistedState = {
      avisoPrincipal,
      fainasTexto,
      avisosGeraisItens,
      alarmesDiarios,
    };
    void idbSetJson(AVISOS_STORAGE_KEY, payload);
  }, [persistReady, avisoPrincipal, fainasTexto, avisosGeraisItens, alarmesDiarios]);

  useEffect(() => {
    if (!persistReady || !useCloud) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.avisos,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              if (payload === null) {
                const raw = await idbGetJson<unknown>(AVISOS_STORAGE_KEY);
                const n = normalizeStored(raw);
                if (!isAvisosEmpty(n)) {
                  await setSotStateDoc(SOT_STATE_DOC.avisos, n);
                }
                return;
              }
              applyingRemoteRef.current = true;
              const n = normalizeStored(payload);
              setAvisoPrincipalState(n.avisoPrincipal);
              setFainasTextoState(n.fainasTexto);
              setAvisosGeraisItensState(n.avisosGeraisItens);
              setAlarmesDiariosState(n.alarmesDiarios);
              void idbSetJson(AVISOS_STORAGE_KEY, n);
            })();
          },
          (err) => console.error("[SOT] Firestore avisos:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (avisos):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [persistReady, useCloud]);

  useEffect(() => {
    if (!persistReady || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const payload: AvisosPersistedState = {
      avisoPrincipal,
      fainasTexto,
      avisosGeraisItens,
      alarmesDiarios,
    };
    const t = window.setTimeout(() => {
      void setSotStateDoc(SOT_STATE_DOC.avisos, payload).catch((e) => {
        console.error("[SOT] Gravar avisos na nuvem:", e);
      });
    }, 900);
    return () => window.clearTimeout(t);
  }, [persistReady, useCloud, avisoPrincipal, fainasTexto, avisosGeraisItens, alarmesDiarios]);

  /** Remove avisos com data final já ultrapassada (inclui após meia-noite). */
  useEffect(() => {
    if (!persistReady) return;
    setAvisosGeraisItensState((prev) => {
      const hoje = new Date();
      const next = prev.filter((it) => !avisoGeralExpiradoParaRemocaoAutomatica(it, hoje));
      return next.length === prev.length ? prev : next;
    });
  }, [persistReady, agendaDiaTick, avisosGeraisItens]);

  const setAvisoPrincipal = useCallback((v: string) => {
    setAvisoPrincipalState(v);
  }, []);

  const setFainasTexto = useCallback((v: string) => {
    setFainasTextoState(v);
  }, []);

  const setAvisosGeraisItens = useCallback(
    (v: AvisoGeralItem[] | ((prev: AvisoGeralItem[]) => AvisoGeralItem[])) => {
      setAvisosGeraisItensState(v);
    },
    [],
  );

  const addAlarmeDiario = useCallback((nome: string, hora: string) => {
    const n = nome.trim();
    if (!n || parseHhMm(hora) === null) return;
    setAlarmesDiariosState((prev) => [
      ...prev,
      { id: newId(), nome: n, hora, ativo: true },
    ]);
  }, []);

  const updateAlarmeDiario = useCallback(
    (id: string, patch: Partial<Pick<AlarmeDiarioItem, "nome" | "hora" | "ativo">>) => {
      if (patch.hora !== undefined && parseHhMm(patch.hora) === null) return;
      setAlarmesDiariosState((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const next: AlarmeDiarioItem = { ...a, ...patch };
          if (patch.nome !== undefined) next.nome = patch.nome.trim();
          return next;
        }),
      );
      if (patch.nome !== undefined || patch.hora !== undefined) {
        clearDismissForAlarm(id);
      }
    },
    [clearDismissForAlarm],
  );

  const removeAlarmeDiario = useCallback((id: string) => {
    clearDismissForAlarm(id);
    setAlarmesDiariosState((prev) => prev.filter((a) => a.id !== id));
  }, [clearDismissForAlarm]);

  const fainasLinhas = useMemo(
    () =>
      fainasTexto
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [fainasTexto],
  );

  const avisosGeraisLinhas = useMemo(() => {
    void agendaDiaTick;
    const hoje = new Date();
    return avisosGeraisItens
      .filter((it) => avisoGeralVisivelNoDia(it, hoje))
      .map((it) => it.texto.trim())
      .filter(Boolean);
  }, [avisosGeraisItens, agendaDiaTick]);

  const value = useMemo(
    () => ({
      avisoPrincipal,
      fainasTexto,
      avisosGeraisItens,
      alarmesDiarios,
      setAvisoPrincipal,
      setFainasTexto,
      setAvisosGeraisItens,
      addAlarmeDiario,
      updateAlarmeDiario,
      removeAlarmeDiario,
      fainasLinhas,
      avisosGeraisLinhas,
    }),
    [
      avisoPrincipal,
      fainasTexto,
      avisosGeraisItens,
      alarmesDiarios,
      setAvisoPrincipal,
      setFainasTexto,
      setAvisosGeraisItens,
      addAlarmeDiario,
      updateAlarmeDiario,
      removeAlarmeDiario,
      fainasLinhas,
      avisosGeraisLinhas,
    ],
  );

  return <AvisosContext.Provider value={value}>{children}</AvisosContext.Provider>;
}

export function useAvisos() {
  const ctx = useContext(AvisosContext);
  if (!ctx) {
    throw new Error("useAvisos deve ser usado dentro de AvisosProvider");
  }
  return ctx;
}
