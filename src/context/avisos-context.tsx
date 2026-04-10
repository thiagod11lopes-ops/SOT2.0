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
import { getCurrentDatePtBr } from "../lib/dateFormat";
import {
  avisoGeralExpiradoParaRemocaoAutomatica,
  avisoGeralVisivelNoDia,
} from "../lib/avisoGeralSchedule";
import { useAlarmDismiss } from "./alarm-dismiss-context";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import type { AvisoGeralItem } from "../types/aviso-geral";
import { parseHhMm } from "../lib/timeInput";
import { useSyncPreference } from "./sync-preference-context";

export const AVISOS_STORAGE_KEY = "sot-avisos-v1";

export type { AvisoGeralItem } from "../types/aviso-geral";

export type AlarmeDiarioItem = {
  id: string;
  nome: string;
  hora: string;
  ativo: boolean;
};

/** Rascunho do formulário «Incluir novo aviso» (persistido para não perder ao mudar de aba ou atualizar). */
export type AvisoGeralDraftNovo = {
  texto: string;
  dataInicio: string;
  dataFim: string;
};

/** Edição em curso na tabela de avisos gerais (persistido). */
export type AvisoGeralDraftEdicao = {
  id: string;
  texto: string;
  dataInicio: string;
  dataFim: string;
};

/** Rascunho do formulário «novo alarme» e edição em linha (persistido). */
export type AlarmDiarioDraftEdicao = {
  id: string;
  nome: string;
  hora: string;
};

export type AvisosPersistedState = {
  avisoPrincipal: string;
  fainasTexto: string;
  avisosGeraisItens: AvisoGeralItem[];
  alarmesDiarios: AlarmeDiarioItem[];
  avisosGeraisDraftNovo: AvisoGeralDraftNovo;
  avisosGeraisDraftEdicao: AvisoGeralDraftEdicao | null;
  alarmDiarioDraftNovo: { nome: string; hora: string };
  alarmDiarioDraftEdicao: AlarmDiarioDraftEdicao | null;
};

const defaultState: AvisosPersistedState = {
  avisoPrincipal: "",
  fainasTexto: "",
  avisosGeraisItens: [],
  alarmesDiarios: [],
  avisosGeraisDraftNovo: { texto: "", dataInicio: "", dataFim: "" },
  avisosGeraisDraftEdicao: null,
  alarmDiarioDraftNovo: { nome: "", hora: "" },
  alarmDiarioDraftEdicao: null,
};

type AvisosPersistedDoc = AvisosPersistedState & {
  /** IDs removidos globalmente (propagam para todas as máquinas via Firebase + IDB). */
  deletedAlarmIds: string[];
};

const defaultDoc: AvisosPersistedDoc = {
  ...defaultState,
  deletedAlarmIds: [],
};

const LEGACY_ALARM_TOMBSTONE_STORAGE_KEY = "sot-avisos-alarmes-excluidos-v1";

function normalizeDeletedAlarmIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string" || !x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

type AvisosContextValue = AvisosPersistedState & {
  setAvisoPrincipal: (v: string) => void;
  setFainasTexto: (v: string) => void;
  setAvisosGeraisItens: (items: AvisoGeralItem[] | ((prev: AvisoGeralItem[]) => AvisoGeralItem[])) => void;
  setAvisosGeraisDraftNovo: (
    v: AvisoGeralDraftNovo | ((prev: AvisoGeralDraftNovo) => AvisoGeralDraftNovo),
  ) => void;
  setAvisosGeraisDraftEdicao: (
    v: AvisoGeralDraftEdicao | null | ((prev: AvisoGeralDraftEdicao | null) => AvisoGeralDraftEdicao | null),
  ) => void;
  setAlarmDiarioDraftNovo: (
    v: { nome: string; hora: string } | ((prev: { nome: string; hora: string }) => { nome: string; hora: string }),
  ) => void;
  setAlarmDiarioDraftEdicao: (
    v: AlarmDiarioDraftEdicao | null | ((prev: AlarmDiarioDraftEdicao | null) => AlarmDiarioDraftEdicao | null),
  ) => void;
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

function normalizeAvisoGeralDraftNovo(raw: unknown): AvisoGeralDraftNovo {
  if (!raw || typeof raw !== "object") return { ...defaultState.avisosGeraisDraftNovo };
  const o = raw as Record<string, unknown>;
  return {
    texto: typeof o.texto === "string" ? o.texto : "",
    dataInicio: typeof o.dataInicio === "string" ? o.dataInicio : "",
    dataFim: typeof o.dataFim === "string" ? o.dataFim : "",
  };
}

function normalizeAvisoGeralDraftEdicao(raw: unknown): AvisoGeralDraftEdicao | null {
  if (raw === null || raw === undefined) return null;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  return {
    id: o.id,
    texto: typeof o.texto === "string" ? o.texto : "",
    dataInicio: typeof o.dataInicio === "string" ? o.dataInicio : "",
    dataFim: typeof o.dataFim === "string" ? o.dataFim : "",
  };
}

/** Primeira abertura: data inicial pré-preenchida com hoje (igual ao comportamento antigo em memória). */
function hydrateDraftNovoSeTotalmenteVazio(novo: AvisoGeralDraftNovo): AvisoGeralDraftNovo {
  if (novo.texto === "" && novo.dataInicio === "" && novo.dataFim === "") {
    return { ...novo, dataInicio: getCurrentDatePtBr() };
  }
  return novo;
}

function normalizeAlarmDiarioDraftNovo(raw: unknown): { nome: string; hora: string } {
  if (!raw || typeof raw !== "object") return { ...defaultState.alarmDiarioDraftNovo };
  const o = raw as Record<string, unknown>;
  return {
    nome: typeof o.nome === "string" ? o.nome : "",
    hora: typeof o.hora === "string" ? o.hora : "",
  };
}

function normalizeAlarmDiarioDraftEdicao(raw: unknown): AlarmDiarioDraftEdicao | null {
  if (raw === null || raw === undefined) return null;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  return {
    id: o.id,
    nome: typeof o.nome === "string" ? o.nome : "",
    hora: typeof o.hora === "string" ? o.hora : "",
  };
}

/** Documento sem dados úteis (snapshot vazio do Firestore antes do primeiro upload). */
function isAvisosDocEffectivelyEmpty(d: AvisosPersistedDoc): boolean {
  if (d.deletedAlarmIds.length > 0) return false;
  if (d.avisoPrincipal.trim()) return false;
  if (d.fainasTexto.trim()) return false;
  if (d.avisosGeraisItens.length > 0) return false;
  if (d.alarmesDiarios.length > 0) return false;
  const ag = d.avisosGeraisDraftNovo;
  if (ag.texto.trim() || ag.dataInicio.trim() || ag.dataFim.trim()) return false;
  if (d.avisosGeraisDraftEdicao !== null) return false;
  if (d.alarmDiarioDraftNovo.nome.trim() || d.alarmDiarioDraftNovo.hora.trim()) return false;
  if (d.alarmDiarioDraftEdicao !== null) return false;
  return true;
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

function normalizeStored(raw: unknown): AvisosPersistedDoc {
  if (!raw || typeof raw !== "object") return { ...defaultDoc };
  const o = raw as Record<string, unknown>;
  const deletedAlarmIds = normalizeDeletedAlarmIds(o.deletedAlarmIds);
  let alarmesDiarios = normalizeAlarmesFromArray(o.alarmesDiarios);
  if (alarmesDiarios.length === 0) {
    alarmesDiarios = migrateLegacySingleAlarm(o);
  }
  if (deletedAlarmIds.length > 0) {
    const deletedSet = new Set(deletedAlarmIds);
    alarmesDiarios = alarmesDiarios.filter((a) => !deletedSet.has(a.id));
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
    deletedAlarmIds,
    avisosGeraisDraftNovo: normalizeAvisoGeralDraftNovo(o.avisosGeraisDraftNovo),
    avisosGeraisDraftEdicao: normalizeAvisoGeralDraftEdicao(o.avisosGeraisDraftEdicao),
    alarmDiarioDraftNovo: normalizeAlarmDiarioDraftNovo(o.alarmDiarioDraftNovo),
    alarmDiarioDraftEdicao: normalizeAlarmDiarioDraftEdicao(o.alarmDiarioDraftEdicao),
  };
}

/**
 * Funde estado local com snapshot remoto: textos usam local se não estiverem vazios (evita apagar texto por snapshot
 * atrasado); caso contrário usa o remoto (ex.: primeira sincronização com IDB vazio).
 */
function normalizeFromCloudPayload(payload: unknown | null): AvisosPersistedDoc {
  if (payload === null) return { ...defaultDoc };
  return normalizeStored(payload);
}

const SUPPRESS_REMOTE_MS = 5000;

export function AvisosProvider({ children }: { children: ReactNode }) {
  const { clearDismissForAlarm } = useAlarmDismiss();
  const [avisoPrincipal, setAvisoPrincipalState] = useState("");
  const [fainasTexto, setFainasTextoState] = useState("");
  const [avisosGeraisItens, setAvisosGeraisItensState] = useState<AvisoGeralItem[]>([]);
  const [alarmesDiarios, setAlarmesDiariosState] = useState<AlarmeDiarioItem[]>([]);
  const [avisosGeraisDraftNovo, setAvisosGeraisDraftNovoState] = useState<AvisoGeralDraftNovo>(
    defaultState.avisosGeraisDraftNovo,
  );
  const [avisosGeraisDraftEdicao, setAvisosGeraisDraftEdicaoState] = useState<AvisoGeralDraftEdicao | null>(null);
  const [alarmDiarioDraftNovo, setAlarmDiarioDraftNovoState] = useState(defaultState.alarmDiarioDraftNovo);
  const [alarmDiarioDraftEdicao, setAlarmDiarioDraftEdicaoState] = useState<AlarmDiarioDraftEdicao | null>(null);
  const [persistReady, setPersistReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const stateRef = useRef<AvisosPersistedDoc>(defaultDoc);
  const deletedAlarmIdsRef = useRef<Set<string>>(new Set());
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  /** Atualiza o filtro por data ao mudar o dia (relógio). */
  const [agendaDiaTick, setAgendaDiaTick] = useState(0);

  stateRef.current = {
    avisoPrincipal,
    fainasTexto,
    avisosGeraisItens,
    alarmesDiarios,
    deletedAlarmIds: [...deletedAlarmIdsRef.current],
    avisosGeraisDraftNovo,
    avisosGeraisDraftEdicao,
    alarmDiarioDraftNovo,
    alarmDiarioDraftEdicao,
  };

  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_ALARM_TOMBSTONE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setAgendaDiaTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /** Sempre hidrata do IndexedDB (também com Firebase) para recuperar dados após F5 antes do snapshot remoto. */
  useEffect(() => {
    void idbGetJson<unknown>(AVISOS_STORAGE_KEY)
      .then((raw) => {
        const n = normalizeStored(raw);
        deletedAlarmIdsRef.current = new Set(n.deletedAlarmIds);
        const draftNovo = hydrateDraftNovoSeTotalmenteVazio(n.avisosGeraisDraftNovo);
        stateRef.current = { ...n, avisosGeraisDraftNovo: draftNovo };
        setAvisoPrincipalState(n.avisoPrincipal);
        setFainasTextoState(n.fainasTexto);
        setAvisosGeraisItensState(n.avisosGeraisItens);
        setAlarmesDiariosState(n.alarmesDiarios);
        setAvisosGeraisDraftNovoState(draftNovo);
        setAvisosGeraisDraftEdicaoState(n.avisosGeraisDraftEdicao);
        setAlarmDiarioDraftNovoState(n.alarmDiarioDraftNovo);
        setAlarmDiarioDraftEdicaoState(n.alarmDiarioDraftEdicao);
      })
      .finally(() => setPersistReady(true));
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    const payload: AvisosPersistedDoc = {
      avisoPrincipal,
      fainasTexto,
      avisosGeraisItens,
      alarmesDiarios,
      deletedAlarmIds: [...deletedAlarmIdsRef.current],
      avisosGeraisDraftNovo,
      avisosGeraisDraftEdicao,
      alarmDiarioDraftNovo,
      alarmDiarioDraftEdicao,
    };
    void idbSetJson(AVISOS_STORAGE_KEY, payload, { maxAttempts: 6 });
  }, [
    persistReady,
    avisoPrincipal,
    fainasTexto,
    avisosGeraisItens,
    alarmesDiarios,
    avisosGeraisDraftNovo,
    avisosGeraisDraftEdicao,
    alarmDiarioDraftNovo,
    alarmDiarioDraftEdicao,
  ]);

  useEffect(() => {
    const flush = () => {
      if (!persistReady) return;
      void idbSetJson(AVISOS_STORAGE_KEY, stateRef.current, { maxAttempts: 6 });
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [persistReady]);

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
              if (Date.now() < suppressRemoteUntilRef.current) {
                return;
              }
              const incoming = normalizeFromCloudPayload(payload);
              /** Evita apagar dados ainda não enviados ao Firestore (snapshot vazio/lag). */
              if (isAvisosDocEffectivelyEmpty(incoming) && !isAvisosDocEffectivelyEmpty(stateRef.current)) {
                return;
              }
              applyingRemoteRef.current = true;
              deletedAlarmIdsRef.current = new Set(incoming.deletedAlarmIds);
              const draftNovo = hydrateDraftNovoSeTotalmenteVazio(incoming.avisosGeraisDraftNovo);
              const merged = { ...incoming, avisosGeraisDraftNovo: draftNovo };
              stateRef.current = merged;
              setAvisoPrincipalState(incoming.avisoPrincipal);
              setFainasTextoState(incoming.fainasTexto);
              setAvisosGeraisItensState(incoming.avisosGeraisItens);
              setAlarmesDiariosState(incoming.alarmesDiarios);
              setAvisosGeraisDraftNovoState(draftNovo);
              setAvisosGeraisDraftEdicaoState(incoming.avisosGeraisDraftEdicao);
              setAlarmDiarioDraftNovoState(incoming.alarmDiarioDraftNovo);
              setAlarmDiarioDraftEdicaoState(incoming.alarmDiarioDraftEdicao);
              void idbSetJson(AVISOS_STORAGE_KEY, merged, { maxAttempts: 6 });
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
    const payload: AvisosPersistedDoc = {
      avisoPrincipal,
      fainasTexto,
      avisosGeraisItens,
      alarmesDiarios,
      deletedAlarmIds: [...deletedAlarmIdsRef.current],
      avisosGeraisDraftNovo,
      avisosGeraisDraftEdicao,
      alarmDiarioDraftNovo,
      alarmDiarioDraftEdicao,
    };
    const t = window.setTimeout(() => {
      void setSotStateDocWithRetry(SOT_STATE_DOC.avisos, payload).catch((e) => {
        console.error("[SOT] Gravar avisos na nuvem:", e);
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    persistReady,
    useCloud,
    avisoPrincipal,
    fainasTexto,
    avisosGeraisItens,
    alarmesDiarios,
    avisosGeraisDraftNovo,
    avisosGeraisDraftEdicao,
    alarmDiarioDraftNovo,
    alarmDiarioDraftEdicao,
  ]);

  /** Remove avisos com data final já ultrapassada (inclui após meia-noite). */
  useEffect(() => {
    if (!persistReady) return;
    setAvisosGeraisItensState((prev) => {
      const hoje = new Date();
      const next = prev.filter((it) => !avisoGeralExpiradoParaRemocaoAutomatica(it, hoje));
      if (next.length === prev.length) return prev;
      queueMicrotask(() => bumpLocalMutation());
      return next;
    });
  }, [persistReady, agendaDiaTick, avisosGeraisItens, bumpLocalMutation]);

  const setAvisoPrincipal = useCallback(
    (v: string) => {
      bumpLocalMutation();
      setAvisoPrincipalState(v);
    },
    [bumpLocalMutation],
  );

  const setFainasTexto = useCallback(
    (v: string) => {
      bumpLocalMutation();
      setFainasTextoState(v);
    },
    [bumpLocalMutation],
  );

  const setAvisosGeraisItens = useCallback(
    (v: AvisoGeralItem[] | ((prev: AvisoGeralItem[]) => AvisoGeralItem[])) => {
      bumpLocalMutation();
      setAvisosGeraisItensState(v);
    },
    [bumpLocalMutation],
  );

  const setAvisosGeraisDraftNovo = useCallback(
    (v: AvisoGeralDraftNovo | ((prev: AvisoGeralDraftNovo) => AvisoGeralDraftNovo)) => {
      bumpLocalMutation();
      setAvisosGeraisDraftNovoState(v);
    },
    [bumpLocalMutation],
  );

  const setAvisosGeraisDraftEdicao = useCallback(
    (
      v:
        | AvisoGeralDraftEdicao
        | null
        | ((prev: AvisoGeralDraftEdicao | null) => AvisoGeralDraftEdicao | null),
    ) => {
      bumpLocalMutation();
      setAvisosGeraisDraftEdicaoState(v);
    },
    [bumpLocalMutation],
  );

  const setAlarmDiarioDraftNovo = useCallback(
    (v: { nome: string; hora: string } | ((prev: { nome: string; hora: string }) => { nome: string; hora: string })) => {
      bumpLocalMutation();
      setAlarmDiarioDraftNovoState(v);
    },
    [bumpLocalMutation],
  );

  const setAlarmDiarioDraftEdicao = useCallback(
    (
      v:
        | AlarmDiarioDraftEdicao
        | null
        | ((prev: AlarmDiarioDraftEdicao | null) => AlarmDiarioDraftEdicao | null),
    ) => {
      bumpLocalMutation();
      setAlarmDiarioDraftEdicaoState(v);
    },
    [bumpLocalMutation],
  );

  const addAlarmeDiario = useCallback(
    (nome: string, hora: string) => {
      const n = nome.trim();
      if (!n || parseHhMm(hora) === null) return;
      bumpLocalMutation();
      setAlarmesDiariosState((prev) => {
        const id = newId();
        deletedAlarmIdsRef.current.delete(id);
        const next = [...prev, { id, nome: n, hora, ativo: true }];
        stateRef.current = {
          ...stateRef.current,
          alarmesDiarios: next,
          deletedAlarmIds: [...deletedAlarmIdsRef.current],
        };
        return next;
      });
    },
    [bumpLocalMutation],
  );

  const updateAlarmeDiario = useCallback(
    (id: string, patch: Partial<Pick<AlarmeDiarioItem, "nome" | "hora" | "ativo">>) => {
      if (patch.hora !== undefined && parseHhMm(patch.hora) === null) return;
      bumpLocalMutation();
      setAlarmesDiariosState((prev) => {
        const next = prev.map((a) => {
          if (a.id !== id) return a;
          const row: AlarmeDiarioItem = { ...a, ...patch };
          if (patch.nome !== undefined) row.nome = patch.nome.trim();
          return row;
        });
        stateRef.current = {
          ...stateRef.current,
          alarmesDiarios: next,
          deletedAlarmIds: [...deletedAlarmIdsRef.current],
        };
        return next;
      });
    },
    [bumpLocalMutation],
  );

  const removeAlarmeDiario = useCallback(
    (id: string) => {
      bumpLocalMutation();
      clearDismissForAlarm(id);
      setAlarmesDiariosState((prev) => {
        const next = prev.filter((a) => a.id !== id);
        deletedAlarmIdsRef.current.add(id);
        stateRef.current = {
          ...stateRef.current,
          alarmesDiarios: next,
          deletedAlarmIds: [...deletedAlarmIdsRef.current],
        };
        return next;
      });
    },
    [bumpLocalMutation, clearDismissForAlarm],
  );

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
    const fromTable = avisosGeraisItens
      .filter((it) => avisoGeralVisivelNoDia(it, hoje))
      .map((it) => it.texto.trim())
      .filter(Boolean);

    /** Rascunho «Incluir novo aviso» com o mesmo critério de datas do telão (antes de clicar em Adicionar). */
    const draft = avisosGeraisDraftNovo;
    const draftAsItem: AvisoGeralItem = {
      id: "__draft__",
      texto: draft.texto,
      dataInicio: draft.dataInicio,
      dataFim: draft.dataFim,
    };
    const draftLinha =
      draft.texto.trim() && avisoGeralVisivelNoDia(draftAsItem, hoje) ? draft.texto.trim() : null;

    if (!draftLinha) return fromTable;
    if (fromTable.includes(draftLinha)) return fromTable;
    return [...fromTable, draftLinha];
  }, [avisosGeraisItens, agendaDiaTick, avisosGeraisDraftNovo]);

  const value = useMemo(
    () => ({
      avisoPrincipal,
      fainasTexto,
      avisosGeraisItens,
      alarmesDiarios,
      avisosGeraisDraftNovo,
      avisosGeraisDraftEdicao,
      alarmDiarioDraftNovo,
      alarmDiarioDraftEdicao,
      setAvisoPrincipal,
      setFainasTexto,
      setAvisosGeraisItens,
      setAvisosGeraisDraftNovo,
      setAvisosGeraisDraftEdicao,
      setAlarmDiarioDraftNovo,
      setAlarmDiarioDraftEdicao,
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
      avisosGeraisDraftNovo,
      avisosGeraisDraftEdicao,
      alarmDiarioDraftNovo,
      alarmDiarioDraftEdicao,
      setAvisoPrincipal,
      setFainasTexto,
      setAvisosGeraisItens,
      setAvisosGeraisDraftNovo,
      setAvisosGeraisDraftEdicao,
      setAlarmDiarioDraftNovo,
      setAlarmDiarioDraftEdicao,
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
