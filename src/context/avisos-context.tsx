import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  avisoGeralExpiradoParaRemocaoAutomatica,
  avisoGeralVisivelNoDia,
} from "../lib/avisoGeralSchedule";
import { clearDismissForAlarm } from "../lib/dailyAlarmDismiss";
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

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisoPrincipal, setAvisoPrincipalState] = useState("");
  const [fainasTexto, setFainasTextoState] = useState("");
  const [avisosGeraisItens, setAvisosGeraisItensState] = useState<AvisoGeralItem[]>([]);
  const [alarmesDiarios, setAlarmesDiariosState] = useState<AlarmeDiarioItem[]>([]);
  const [persistReady, setPersistReady] = useState(false);
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
    [],
  );

  const removeAlarmeDiario = useCallback((id: string) => {
    clearDismissForAlarm(id);
    setAlarmesDiariosState((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const fainasLinhas = useMemo(
    () =>
      fainasTexto
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [fainasTexto],
  );

  const avisosGeraisLinhas = useMemo(() => {
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
