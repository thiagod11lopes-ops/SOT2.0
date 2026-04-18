import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import {
  isFirebaseOnlyOnlineActive,
  SOT_SYNC_FIREBASE_ONLY_PREF_KEY,
} from "../lib/firebaseOnlyOnlinePolicy";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import type { AvisoGeralItem } from "../types/aviso-geral";
import { localDateKey } from "../lib/dailyAlarmDismiss";
import { parseHhMm } from "../lib/timeInput";
import { useSyncPreference } from "./sync-preference-context";

export const AVISOS_STORAGE_KEY = "sot-avisos-v1";

export type { AvisoGeralItem } from "../types/aviso-geral";

export type AlarmeDiarioItem = {
  id: string;
  nome: string;
  hora: string;
  ativo: boolean;
  /**
   * Data local (YYYY-MM-DD) em que o alarme foi desativado pela página inicial.
   * No dia seguinte, `ativo` volta a `true` e este campo é limpo. `null` = sem pausa automática.
   */
  pausaAteDia?: string | null;
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
  /** Marca temporal da última edição do Aviso principal / faixa laranja (ms); last-write-wins no Firebase. */
  avisoPrincipalUpdatedAt: number;
  fainasTexto: string;
  /** Marca temporal da última edição de Fainas Gerais (ms); usada para last-write-wins entre PCs no Firebase. */
  fainasTextoUpdatedAt: number;
  avisosGeraisItens: AvisoGeralItem[];
  /** Última edição do bloco Avisos gerais (itens + rascunhos); last-write-wins no Firebase. */
  avisosGeraisUpdatedAt: number;
  alarmesDiarios: AlarmeDiarioItem[];
  /** Última edição de alarmes + rascunhos + `deletedAlarmIds`; last-write-wins no Firebase. */
  alarmesDiariosUpdatedAt: number;
  avisosGeraisDraftNovo: AvisoGeralDraftNovo;
  avisosGeraisDraftEdicao: AvisoGeralDraftEdicao | null;
  alarmDiarioDraftNovo: { nome: string; hora: string };
  alarmDiarioDraftEdicao: AlarmDiarioDraftEdicao | null;
};

const defaultState: AvisosPersistedState = {
  avisoPrincipal: "",
  avisoPrincipalUpdatedAt: 0,
  fainasTexto: "",
  fainasTextoUpdatedAt: 0,
  avisosGeraisItens: [],
  avisosGeraisUpdatedAt: 0,
  alarmesDiarios: [],
  alarmesDiariosUpdatedAt: 0,
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
    patch: Partial<Pick<AlarmeDiarioItem, "nome" | "hora" | "ativo" | "pausaAteDia">>,
  ) => void;
  removeAlarmeDiario: (id: string) => void;
  fainasLinhas: string[];
  avisosGeraisLinhas: string[];
};

const AvisosContext = createContext<AvisosContextValue | null>(null);

function newId() {
  return crypto.randomUUID();
}

function pausaAteDiaFromStored(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
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
    const o = item as Record<string, unknown>;
    const pausa = pausaAteDiaFromStored(o.pausaAteDia);
    out.push({
      id: item.id,
      nome: item.nome.trim(),
      hora: item.hora,
      ativo: item.ativo,
      ...(pausa ? { pausaAteDia: pausa } : {}),
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

  const apTsRaw = o.avisoPrincipalUpdatedAt;
  const avisoPrincipalUpdatedAt =
    typeof apTsRaw === "number" && Number.isFinite(apTsRaw) && apTsRaw >= 0 ? apTsRaw : 0;

  const fainasTsRaw = o.fainasTextoUpdatedAt;
  const fainasTextoUpdatedAt =
    typeof fainasTsRaw === "number" && Number.isFinite(fainasTsRaw) && fainasTsRaw >= 0 ? fainasTsRaw : 0;

  const agTsRaw = o.avisosGeraisUpdatedAt;
  const avisosGeraisUpdatedAt =
    typeof agTsRaw === "number" && Number.isFinite(agTsRaw) && agTsRaw >= 0 ? agTsRaw : 0;

  const alTsRaw = o.alarmesDiariosUpdatedAt;
  const alarmesDiariosUpdatedAt =
    typeof alTsRaw === "number" && Number.isFinite(alTsRaw) && alTsRaw >= 0 ? alTsRaw : 0;

  return {
    avisoPrincipal: typeof o.avisoPrincipal === "string" ? o.avisoPrincipal : "",
    avisoPrincipalUpdatedAt,
    fainasTexto: typeof o.fainasTexto === "string" ? o.fainasTexto : "",
    fainasTextoUpdatedAt,
    avisosGeraisItens,
    avisosGeraisUpdatedAt,
    alarmesDiarios,
    alarmesDiariosUpdatedAt,
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

function avisosGeraisSectionVisuallyEmpty(d: AvisosPersistedDoc): boolean {
  if (d.avisosGeraisItens.length > 0) return false;
  const dr = d.avisosGeraisDraftNovo;
  if (dr.texto.trim() || dr.dataInicio.trim() || dr.dataFim.trim()) return false;
  if (d.avisosGeraisDraftEdicao !== null) return false;
  return true;
}

function alarmSectionVisuallyEmpty(d: AvisosPersistedDoc): boolean {
  if (d.alarmesDiarios.length > 0) return false;
  if (d.deletedAlarmIds.length > 0) return false;
  const dr = d.alarmDiarioDraftNovo;
  if (dr.nome.trim() || dr.hora.trim()) return false;
  if (d.alarmDiarioDraftEdicao !== null) return false;
  return true;
}

/**
 * Aviso principal, Fainas, Avisos gerais e Alarme diário: last-write-wins com `*UpdatedAt` (Firebase em tempo real).
 */
function mergeAvisosDocPreferLocalText(local: AvisosPersistedDoc, remote: AvisosPersistedDoc): AvisosPersistedDoc {
  const ltAp = local.avisoPrincipalUpdatedAt ?? 0;
  const rtAp = remote.avisoPrincipalUpdatedAt ?? 0;
  let avisoPrincipal: string;
  let avisoPrincipalUpdatedAt: number;
  if (rtAp > ltAp) {
    avisoPrincipal = remote.avisoPrincipal;
    avisoPrincipalUpdatedAt = rtAp;
  } else if (ltAp > rtAp) {
    avisoPrincipal = local.avisoPrincipal;
    avisoPrincipalUpdatedAt = ltAp;
  } else {
    if (!local.avisoPrincipal.trim() && remote.avisoPrincipal.trim()) {
      avisoPrincipal = remote.avisoPrincipal;
      avisoPrincipalUpdatedAt = rtAp;
    } else {
      avisoPrincipal = local.avisoPrincipal;
      avisoPrincipalUpdatedAt = ltAp;
    }
  }

  const lt = local.fainasTextoUpdatedAt ?? 0;
  const rt = remote.fainasTextoUpdatedAt ?? 0;
  let fainasTexto: string;
  let fainasTextoUpdatedAt: number;
  if (rt > lt) {
    fainasTexto = remote.fainasTexto;
    fainasTextoUpdatedAt = rt;
  } else if (lt > rt) {
    fainasTexto = local.fainasTexto;
    fainasTextoUpdatedAt = lt;
  } else {
    if (!local.fainasTexto.trim() && remote.fainasTexto.trim()) {
      fainasTexto = remote.fainasTexto;
      fainasTextoUpdatedAt = rt;
    } else {
      fainasTexto = local.fainasTexto;
      fainasTextoUpdatedAt = lt;
    }
  }

  const ltAg = local.avisosGeraisUpdatedAt ?? 0;
  const rtAg = remote.avisosGeraisUpdatedAt ?? 0;
  let avisosGeraisItens: AvisoGeralItem[];
  let avisosGeraisDraftNovo: AvisoGeralDraftNovo;
  let avisosGeraisDraftEdicao: AvisoGeralDraftEdicao | null;
  let avisosGeraisUpdatedAt: number;
  if (rtAg > ltAg) {
    avisosGeraisItens = remote.avisosGeraisItens;
    avisosGeraisDraftNovo = remote.avisosGeraisDraftNovo;
    avisosGeraisDraftEdicao = remote.avisosGeraisDraftEdicao;
    avisosGeraisUpdatedAt = rtAg;
  } else if (ltAg > rtAg) {
    avisosGeraisItens = local.avisosGeraisItens;
    avisosGeraisDraftNovo = local.avisosGeraisDraftNovo;
    avisosGeraisDraftEdicao = local.avisosGeraisDraftEdicao;
    avisosGeraisUpdatedAt = ltAg;
  } else if (avisosGeraisSectionVisuallyEmpty(local) && !avisosGeraisSectionVisuallyEmpty(remote)) {
    avisosGeraisItens = remote.avisosGeraisItens;
    avisosGeraisDraftNovo = remote.avisosGeraisDraftNovo;
    avisosGeraisDraftEdicao = remote.avisosGeraisDraftEdicao;
    avisosGeraisUpdatedAt = rtAg;
  } else {
    avisosGeraisItens = local.avisosGeraisItens;
    avisosGeraisDraftNovo = local.avisosGeraisDraftNovo;
    avisosGeraisDraftEdicao = local.avisosGeraisDraftEdicao;
    avisosGeraisUpdatedAt = ltAg;
  }

  const ltAl = local.alarmesDiariosUpdatedAt ?? 0;
  const rtAl = remote.alarmesDiariosUpdatedAt ?? 0;
  let alarmesDiarios: AlarmeDiarioItem[];
  let deletedAlarmIds: string[];
  let alarmDiarioDraftNovo: { nome: string; hora: string };
  let alarmDiarioDraftEdicao: AlarmDiarioDraftEdicao | null;
  let alarmesDiariosUpdatedAt: number;
  if (rtAl > ltAl) {
    alarmesDiarios = remote.alarmesDiarios;
    deletedAlarmIds = remote.deletedAlarmIds;
    alarmDiarioDraftNovo = remote.alarmDiarioDraftNovo;
    alarmDiarioDraftEdicao = remote.alarmDiarioDraftEdicao;
    alarmesDiariosUpdatedAt = rtAl;
  } else if (ltAl > rtAl) {
    alarmesDiarios = local.alarmesDiarios;
    deletedAlarmIds = local.deletedAlarmIds;
    alarmDiarioDraftNovo = local.alarmDiarioDraftNovo;
    alarmDiarioDraftEdicao = local.alarmDiarioDraftEdicao;
    alarmesDiariosUpdatedAt = ltAl;
  } else if (alarmSectionVisuallyEmpty(local) && !alarmSectionVisuallyEmpty(remote)) {
    alarmesDiarios = remote.alarmesDiarios;
    deletedAlarmIds = remote.deletedAlarmIds;
    alarmDiarioDraftNovo = remote.alarmDiarioDraftNovo;
    alarmDiarioDraftEdicao = remote.alarmDiarioDraftEdicao;
    alarmesDiariosUpdatedAt = rtAl;
  } else {
    alarmesDiarios = local.alarmesDiarios;
    deletedAlarmIds = local.deletedAlarmIds;
    alarmDiarioDraftNovo = local.alarmDiarioDraftNovo;
    alarmDiarioDraftEdicao = local.alarmDiarioDraftEdicao;
    alarmesDiariosUpdatedAt = ltAl;
  }

  return {
    ...remote,
    avisoPrincipal,
    avisoPrincipalUpdatedAt,
    fainasTexto,
    fainasTextoUpdatedAt,
    avisosGeraisItens,
    avisosGeraisDraftNovo,
    avisosGeraisDraftEdicao,
    avisosGeraisUpdatedAt,
    alarmesDiarios,
    deletedAlarmIds,
    alarmDiarioDraftNovo,
    alarmDiarioDraftEdicao,
    alarmesDiariosUpdatedAt,
  };
}

function avisosDocEqual(a: AvisosPersistedDoc, b: AvisosPersistedDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function AvisosProvider({ children }: { children: ReactNode }) {
  const { clearDismissForAlarm } = useAlarmDismiss();
  const [avisoPrincipal, setAvisoPrincipalState] = useState("");
  const [avisoPrincipalUpdatedAt, setAvisoPrincipalUpdatedAtState] = useState(0);
  const [fainasTexto, setFainasTextoState] = useState("");
  const [fainasTextoUpdatedAt, setFainasTextoUpdatedAtState] = useState(0);
  const [avisosGeraisItens, setAvisosGeraisItensState] = useState<AvisoGeralItem[]>([]);
  const [avisosGeraisUpdatedAt, setAvisosGeraisUpdatedAtState] = useState(0);
  const [alarmesDiarios, setAlarmesDiariosState] = useState<AlarmeDiarioItem[]>([]);
  const [alarmesDiariosUpdatedAt, setAlarmesDiariosUpdatedAtState] = useState(0);
  const [avisosGeraisDraftNovo, setAvisosGeraisDraftNovoState] = useState<AvisoGeralDraftNovo>(
    defaultState.avisosGeraisDraftNovo,
  );
  const [avisosGeraisDraftEdicao, setAvisosGeraisDraftEdicaoState] = useState<AvisoGeralDraftEdicao | null>(null);
  const [alarmDiarioDraftNovo, setAlarmDiarioDraftNovoState] = useState(defaultState.alarmDiarioDraftNovo);
  const [alarmDiarioDraftEdicao, setAlarmDiarioDraftEdicaoState] = useState<AlarmDiarioDraftEdicao | null>(null);
  const [persistReady, setPersistReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const stateRef = useRef<AvisosPersistedDoc>(defaultDoc);
  const deletedAlarmIdsRef = useRef<Set<string>>(new Set());
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  /**
   * Alinhado a `isFirebaseOnlyOnlineActive()` (mesma regra que `indexedDb.ts`):
   * online + preferência «só Firebase» → Avisos não persiste em IndexedDB.
   */
  const [firebaseOnlyOnlinePolicyTick, setFirebaseOnlyOnlinePolicyTick] = useState(0);
  useEffect(() => {
    const bump = () => setFirebaseOnlyOnlinePolicyTick((n) => n + 1);
    window.addEventListener("online", bump);
    window.addEventListener("offline", bump);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SOT_SYNC_FIREBASE_ONLY_PREF_KEY) bump();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", bump);
      window.removeEventListener("offline", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const persistAvisosToIdb = useMemo(
    () => !isFirebaseOnlyOnlineActive(),
    [firebaseOnlyOnlinePolicyTick, firebaseOnlyEnabled],
  );

  /** Online + Firebase: bloqueia gravar na nuvem até o primeiro snapshot (evita sobrescrever o doc com estado vazio). */
  const remoteAvisosSyncedRef = useRef(true);

  /** Atualiza o filtro por data ao mudar o dia (relógio). */
  const [agendaDiaTick, setAgendaDiaTick] = useState(0);

  stateRef.current = {
    avisoPrincipal,
    avisoPrincipalUpdatedAt,
    fainasTexto,
    fainasTextoUpdatedAt,
    avisosGeraisItens,
    avisosGeraisUpdatedAt,
    alarmesDiarios,
    alarmesDiariosUpdatedAt,
    deletedAlarmIds: [...deletedAlarmIdsRef.current],
    avisosGeraisDraftNovo,
    avisosGeraisDraftEdicao,
    alarmDiarioDraftNovo,
    alarmDiarioDraftEdicao,
  };

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

  const avisosInitialBootstrapDoneRef = useRef(false);

  /**
   * Só na primeira montagem: com Firebase online não lê IndexedDB (só Firestore).
   * Offline ou sem Firebase: hidrata do IndexedDB. Transições online/offline não voltam a ler o IDB (evita sobrescrever estado em memória).
   */
  useEffect(() => {
    if (avisosInitialBootstrapDoneRef.current) return;

    if (!persistAvisosToIdb) {
      avisosInitialBootstrapDoneRef.current = true;
      setPersistReady(true);
      return;
    }

    avisosInitialBootstrapDoneRef.current = true;
    void idbGetJson<unknown>(AVISOS_STORAGE_KEY)
      .then((raw) => {
        const n = normalizeStored(raw);
        deletedAlarmIdsRef.current = new Set(n.deletedAlarmIds);
        const draftNovo = hydrateDraftNovoSeTotalmenteVazio(n.avisosGeraisDraftNovo);
        stateRef.current = { ...n, avisosGeraisDraftNovo: draftNovo };
        setAvisoPrincipalState(n.avisoPrincipal);
        setAvisoPrincipalUpdatedAtState(n.avisoPrincipalUpdatedAt);
        setFainasTextoState(n.fainasTexto);
        setFainasTextoUpdatedAtState(n.fainasTextoUpdatedAt);
        setAvisosGeraisItensState(n.avisosGeraisItens);
        setAvisosGeraisUpdatedAtState(n.avisosGeraisUpdatedAt);
        setAlarmesDiariosState(n.alarmesDiarios);
        setAlarmesDiariosUpdatedAtState(n.alarmesDiariosUpdatedAt);
        setAvisosGeraisDraftNovoState(draftNovo);
        setAvisosGeraisDraftEdicaoState(n.avisosGeraisDraftEdicao);
        setAlarmDiarioDraftNovoState(n.alarmDiarioDraftNovo);
        setAlarmDiarioDraftEdicaoState(n.alarmDiarioDraftEdicao);
      })
      .finally(() => setPersistReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a decisão do primeiro render (persistAvisosToIdb) importa
  }, [persistAvisosToIdb]);

  useLayoutEffect(() => {
    if (!persistReady) return;
    remoteAvisosSyncedRef.current = !(useCloud && isFirebaseOnlyOnlineActive());
  }, [persistReady, useCloud, firebaseOnlyEnabled, firebaseOnlyOnlinePolicyTick]);

  /** Ao voltar a ficar offline, grava o estado atual no IndexedDB uma vez (continuação da sessão). */
  const prevPersistAvisosToIdbRef = useRef(persistAvisosToIdb);
  useEffect(() => {
    if (!persistReady) return;
    if (persistAvisosToIdb && !prevPersistAvisosToIdbRef.current) {
      void idbSetJson(AVISOS_STORAGE_KEY, stateRef.current, { maxAttempts: 6 });
    }
    prevPersistAvisosToIdbRef.current = persistAvisosToIdb;
  }, [persistReady, persistAvisosToIdb]);

  useEffect(() => {
    if (!persistReady || !persistAvisosToIdb) return;
    const payload: AvisosPersistedDoc = {
      avisoPrincipal,
      avisoPrincipalUpdatedAt,
      fainasTexto,
      fainasTextoUpdatedAt,
      avisosGeraisItens,
      avisosGeraisUpdatedAt,
      alarmesDiarios,
      alarmesDiariosUpdatedAt,
      deletedAlarmIds: [...deletedAlarmIdsRef.current],
      avisosGeraisDraftNovo,
      avisosGeraisDraftEdicao,
      alarmDiarioDraftNovo,
      alarmDiarioDraftEdicao,
    };
    void idbSetJson(AVISOS_STORAGE_KEY, payload, { maxAttempts: 6 });
  }, [
    persistReady,
    persistAvisosToIdb,
    avisoPrincipal,
    avisoPrincipalUpdatedAt,
    fainasTexto,
    fainasTextoUpdatedAt,
    avisosGeraisItens,
    avisosGeraisUpdatedAt,
    alarmesDiarios,
    alarmesDiariosUpdatedAt,
    avisosGeraisDraftNovo,
    avisosGeraisDraftEdicao,
    alarmDiarioDraftNovo,
    alarmDiarioDraftEdicao,
  ]);

  useEffect(() => {
    const flush = () => {
      if (!persistReady || !persistAvisosToIdb) return;
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
  }, [persistReady, persistAvisosToIdb]);

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
            if (useCloud && isFirebaseOnlyOnlineActive()) {
              remoteAvisosSyncedRef.current = true;
            }
            void (async () => {
              const incoming = normalizeFromCloudPayload(payload);
              /** Evita apagar dados ainda não enviados ao Firestore (snapshot vazio/lag). */
              if (isAvisosDocEffectivelyEmpty(incoming) && !isAvisosDocEffectivelyEmpty(stateRef.current)) {
                return;
              }
              const mergedIncoming = mergeAvisosDocPreferLocalText(stateRef.current, incoming);
              deletedAlarmIdsRef.current = new Set(mergedIncoming.deletedAlarmIds);
              const draftNovo = hydrateDraftNovoSeTotalmenteVazio(mergedIncoming.avisosGeraisDraftNovo);
              const merged = { ...mergedIncoming, avisosGeraisDraftNovo: draftNovo };
              if (avisosDocEqual(stateRef.current, merged)) {
                return;
              }
              applyingRemoteRef.current = true;
              stateRef.current = merged;
              setAvisoPrincipalState(mergedIncoming.avisoPrincipal);
              setAvisoPrincipalUpdatedAtState(mergedIncoming.avisoPrincipalUpdatedAt);
              setFainasTextoState(mergedIncoming.fainasTexto);
              setFainasTextoUpdatedAtState(mergedIncoming.fainasTextoUpdatedAt);
              setAvisosGeraisItensState(mergedIncoming.avisosGeraisItens);
              setAvisosGeraisUpdatedAtState(mergedIncoming.avisosGeraisUpdatedAt);
              setAlarmesDiariosState(mergedIncoming.alarmesDiarios);
              setAlarmesDiariosUpdatedAtState(mergedIncoming.alarmesDiariosUpdatedAt);
              setAvisosGeraisDraftNovoState(draftNovo);
              setAvisosGeraisDraftEdicaoState(mergedIncoming.avisosGeraisDraftEdicao);
              setAlarmDiarioDraftNovoState(mergedIncoming.alarmDiarioDraftNovo);
              setAlarmDiarioDraftEdicaoState(mergedIncoming.alarmDiarioDraftEdicao);
              if (persistAvisosToIdb) {
                void idbSetJson(AVISOS_STORAGE_KEY, merged, { maxAttempts: 6 });
              }
            })();
          },
          (err) => console.error("[SOT] Firestore avisos:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (avisos):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [persistReady, useCloud, firebaseOnlyEnabled, firebaseOnlyOnlinePolicyTick, persistAvisosToIdb]);

  useEffect(() => {
    if (!persistReady || !useCloud) return;
    if (isFirebaseOnlyOnlineActive() && !remoteAvisosSyncedRef.current) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const payload: AvisosPersistedDoc = {
      avisoPrincipal,
      avisoPrincipalUpdatedAt,
      fainasTexto,
      fainasTextoUpdatedAt,
      avisosGeraisItens,
      avisosGeraisUpdatedAt,
      alarmesDiarios,
      alarmesDiariosUpdatedAt,
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
    }, 200);
    return () => window.clearTimeout(t);
  }, [
    persistReady,
    useCloud,
    firebaseOnlyEnabled,
    firebaseOnlyOnlinePolicyTick,
    avisoPrincipal,
    avisoPrincipalUpdatedAt,
    fainasTexto,
    fainasTextoUpdatedAt,
    avisosGeraisItens,
    avisosGeraisUpdatedAt,
    alarmesDiarios,
    alarmesDiariosUpdatedAt,
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
      queueMicrotask(() => setAvisosGeraisUpdatedAtState(Date.now()));
      return next;
    });
  }, [persistReady, agendaDiaTick, avisosGeraisItens]);

  /** Reativa alarmes desligados na página inicial quando entra um novo dia local. */
  useEffect(() => {
    if (!persistReady) return;
    setAlarmesDiariosState((prev) => {
      const hoje = localDateKey(new Date());
      let changed = false;
      const next = prev.map((a) => {
        if (!a.pausaAteDia || a.ativo) return a;
        if (hoje > a.pausaAteDia) {
          changed = true;
          return { ...a, ativo: true, pausaAteDia: null };
        }
        return a;
      });
      if (!changed) return prev;
      queueMicrotask(() => setAlarmesDiariosUpdatedAtState(Date.now()));
      stateRef.current = {
        ...stateRef.current,
        alarmesDiarios: next,
        deletedAlarmIds: [...deletedAlarmIdsRef.current],
      };
      return next;
    });
  }, [persistReady, agendaDiaTick]);

  const setAvisoPrincipal = useCallback((v: string) => {
    setAvisoPrincipalUpdatedAtState(Date.now());
    setAvisoPrincipalState(v);
  }, []);

  const setFainasTexto = useCallback((v: string) => {
    const ts = Date.now();
    setFainasTextoUpdatedAtState(ts);
    setFainasTextoState(v);
  }, []);

  const setAvisosGeraisItens = useCallback(
    (v: AvisoGeralItem[] | ((prev: AvisoGeralItem[]) => AvisoGeralItem[])) => {
      setAvisosGeraisUpdatedAtState(Date.now());
      setAvisosGeraisItensState(v);
    },
    [],
  );

  const setAvisosGeraisDraftNovo = useCallback(
    (v: AvisoGeralDraftNovo | ((prev: AvisoGeralDraftNovo) => AvisoGeralDraftNovo)) => {
      setAvisosGeraisUpdatedAtState(Date.now());
      setAvisosGeraisDraftNovoState(v);
    },
    [],
  );

  const setAvisosGeraisDraftEdicao = useCallback(
    (
      v:
        | AvisoGeralDraftEdicao
        | null
        | ((prev: AvisoGeralDraftEdicao | null) => AvisoGeralDraftEdicao | null),
    ) => {
      setAvisosGeraisUpdatedAtState(Date.now());
      setAvisosGeraisDraftEdicaoState(v);
    },
    [],
  );

  const setAlarmDiarioDraftNovo = useCallback(
    (v: { nome: string; hora: string } | ((prev: { nome: string; hora: string }) => { nome: string; hora: string })) => {
      setAlarmesDiariosUpdatedAtState(Date.now());
      setAlarmDiarioDraftNovoState(v);
    },
    [],
  );

  const setAlarmDiarioDraftEdicao = useCallback(
    (
      v:
        | AlarmDiarioDraftEdicao
        | null
        | ((prev: AlarmDiarioDraftEdicao | null) => AlarmDiarioDraftEdicao | null),
    ) => {
      setAlarmesDiariosUpdatedAtState(Date.now());
      setAlarmDiarioDraftEdicaoState(v);
    },
    [],
  );

  const addAlarmeDiario = useCallback(
    (nome: string, hora: string) => {
      const n = nome.trim();
      if (!n || parseHhMm(hora) === null) return;
      setAlarmesDiariosUpdatedAtState(Date.now());
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
    [],
  );

  const updateAlarmeDiario = useCallback(
    (id: string, patch: Partial<Pick<AlarmeDiarioItem, "nome" | "hora" | "ativo" | "pausaAteDia">>) => {
      if (patch.hora !== undefined && parseHhMm(patch.hora) === null) return;
      setAlarmesDiariosUpdatedAtState(Date.now());
      setAlarmesDiariosState((prev) => {
        const next = prev.map((a) => {
          if (a.id !== id) return a;
          const row: AlarmeDiarioItem = { ...a, ...patch };
          if (patch.nome !== undefined) row.nome = patch.nome.trim();
          if (patch.pausaAteDia !== undefined && patch.pausaAteDia !== null) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.pausaAteDia)) {
              row.pausaAteDia = null;
            }
          }
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
    [],
  );

  const removeAlarmeDiario = useCallback(
    (id: string) => {
      setAlarmesDiariosUpdatedAtState(Date.now());
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
    [clearDismissForAlarm],
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
      avisoPrincipalUpdatedAt,
      fainasTexto,
      fainasTextoUpdatedAt,
      avisosGeraisItens,
      avisosGeraisUpdatedAt,
      alarmesDiarios,
      alarmesDiariosUpdatedAt,
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
      avisoPrincipalUpdatedAt,
      fainasTexto,
      fainasTextoUpdatedAt,
      avisosGeraisItens,
      avisosGeraisUpdatedAt,
      alarmesDiarios,
      alarmesDiariosUpdatedAt,
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
