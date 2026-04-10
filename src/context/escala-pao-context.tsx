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
import {
  type EscalaPaoStored,
  getMotoristaEscalaParaData,
  loadEscalaPaoFromIdb,
  saveEscalaPaoToIdb,
} from "../lib/escalaPaoStorage";
import {
  dedupeIntegrantesOrder,
  loadIntegrantesPaoFromIdb,
  saveIntegrantesPaoToIdb,
} from "../lib/integrantesPaoStorage";
import { useSyncPreference } from "./sync-preference-context";

function normalizeEscalaPaoBundle(raw: unknown): { escala: EscalaPaoStored; integrantes: string[] } {
  if (!raw || typeof raw !== "object") {
    return { escala: {}, integrantes: [] };
  }
  const o = raw as Record<string, unknown>;
  const escalaRaw = o.escala;
  const escala: EscalaPaoStored =
    escalaRaw && typeof escalaRaw === "object" && !Array.isArray(escalaRaw)
      ? { ...(escalaRaw as EscalaPaoStored) }
      : {};
  const integrantes = Array.isArray(o.integrantes)
    ? dedupeIntegrantesOrder(o.integrantes.filter((x): x is string => typeof x === "string"))
    : [];
  return { escala, integrantes };
}

function isEscalaBundleEmpty(e: EscalaPaoStored, integrantes: string[]): boolean {
  return Object.keys(e).length === 0 && integrantes.length === 0;
}

/**
 * União de datas: se a chave existe no estado local (mesmo vazia), prevalece o valor local —
 * evita que um snapshot atrasado apague edições recentes ou distribuições.
 */
function mergeEscalaPaoStored(local: EscalaPaoStored, remote: EscalaPaoStored): EscalaPaoStored {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: EscalaPaoStored = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(local, k)) {
      out[k] = local[k];
    } else {
      out[k] = remote[k];
    }
  }
  return out;
}

function mergeIntegrantesLists(local: string[], remote: string[]): string[] {
  return dedupeIntegrantesOrder([...local, ...remote]);
}

function escalaMapsEqual(a: EscalaPaoStored, b: EscalaPaoStored): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function integrantesSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b.map((x) => x.trim().toLowerCase()).filter(Boolean));
  for (const x of a) {
    const k = x.trim().toLowerCase();
    if (!k) return false;
    if (!setB.has(k)) return false;
  }
  return true;
}

function bundlesEquivalent(
  e1: EscalaPaoStored,
  i1: string[],
  e2: EscalaPaoStored,
  i2: string[],
): boolean {
  return escalaMapsEqual(e1, e2) && integrantesSetsEqual(i1, i2);
}

/** Ignorar snapshots logo após edição local (latência do write no Firestore). */
const SUPPRESS_REMOTE_MS = 5000;

type EscalaPaoContextValue = {
  escala: EscalaPaoStored;
  /** Nomes usados na distribuição e no select do calendário (não vêm da Frota). */
  integrantes: string[];
  setIntegrantes: (next: string[]) => void;
  /** Motorista escalado para a data (vazio em fins de semana ou se não definido). */
  motoristaParaData: (date: Date) => string;
  /** Atualiza um dia (modo editar no calendário). */
  setMotoristaNaData: (dateKey: string, nome: string) => void;
  /** Substitui o mapa completo (ex.: distribuição automática). */
  setEscalaCompleta: (next: EscalaPaoStored) => void;
};

const EscalaPaoContext = createContext<EscalaPaoContextValue | null>(null);

export function EscalaPaoProvider({ children }: { children: ReactNode }) {
  const [escala, setEscala] = useState<EscalaPaoStored>({});
  const [integrantes, setIntegrantesState] = useState<string[]>([]);
  const [idbReady, setIdbReady] = useState(false);
  const escalaRef = useRef(escala);
  const integrantesRef = useRef(integrantes);
  escalaRef.current = escala;
  integrantesRef.current = integrantes;

  const applyingRemoteRef = useRef(false);
  /** `false` até hidratar do IndexedDB — evita enviar `{}` para a nuvem antes da carga local. */
  const hydratedRef = useRef(false);
  const suppressRemoteUntilRef = useRef(0);
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;
  /**
   * Modo Firebase: após o primeiro snapshot do Firestore (estado para o efeito de gravação reagir;
   * só refs fariam o utilizador ficar sem sync quando o doc está ausente e o estado local não muda).
   */
  const [cloudBootstrapDone, setCloudBootstrapDone] = useState(false);

  const bumpLocalMutation = useCallback(() => {
    suppressRemoteUntilRef.current = Date.now() + SUPPRESS_REMOTE_MS;
  }, []);

  useEffect(() => {
    if (useCloud) {
      // Modo estrito Firebase: ignora hidratação inicial por cache local.
      setIdbReady(true);
      return;
    }
    void Promise.all([loadEscalaPaoFromIdb(), loadIntegrantesPaoFromIdb()]).then(([e, i]) => {
      setEscala(e);
      setIntegrantesState(i);
      setIdbReady(true);
      hydratedRef.current = true;
    });
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud || !idbReady) return;
    setCloudBootstrapDone(false);
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.escalaPaoBundle,
          (payload) => {
            if (cancelled) return;
            void (async () => {
              const markCloudBootstrapDone = () => {
                hydratedRef.current = true;
                setCloudBootstrapDone((d) => d || true);
              };

              if (payload === null) {
                markCloudBootstrapDone();
                // Firebase como fonte da verdade: não promover local->nuvem no bootstrap.
                return;
              }
              if (Date.now() < suppressRemoteUntilRef.current) {
                markCloudBootstrapDone();
                return;
              }
              const incoming = normalizeEscalaPaoBundle(payload);
              const prevE = escalaRef.current;
              const prevI = integrantesRef.current;

              if (isEscalaBundleEmpty(incoming.escala, incoming.integrantes) && !isEscalaBundleEmpty(prevE, prevI)) {
                markCloudBootstrapDone();
                return;
              }

              markCloudBootstrapDone();
              applyingRemoteRef.current = true;
              const mergedE = mergeEscalaPaoStored(prevE, incoming.escala);
              const mergedI = mergeIntegrantesLists(prevI, incoming.integrantes);

              if (!bundlesEquivalent(mergedE, mergedI, incoming.escala, incoming.integrantes)) {
                // Em modo Firebase-only, não forçar writeback local após merge do snapshot.
              }

              setEscala(mergedE);
              setIntegrantesState(mergedI);
              void saveEscalaPaoToIdb(mergedE);
              void saveIntegrantesPaoToIdb(mergedI);
            })();
          },
          (err) => console.error("[SOT] Firestore escala pão:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (escala pão):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, idbReady]);

  useEffect(() => {
    if (!idbReady) return;
    void saveEscalaPaoToIdb(escala);
  }, [escala, idbReady]);

  useEffect(() => {
    if (!idbReady) return;
    void saveIntegrantesPaoToIdb(integrantes);
  }, [integrantes, idbReady]);

  useEffect(() => {
    const flush = () => {
      if (!idbReady) return;
      void saveEscalaPaoToIdb(escalaRef.current);
      void saveIntegrantesPaoToIdb(integrantesRef.current);
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
  }, [idbReady]);

  useEffect(() => {
    if (!hydratedRef.current || !cloudBootstrapDone || !useCloud || !idbReady) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void setSotStateDocWithRetry(SOT_STATE_DOC.escalaPaoBundle, {
        escala,
        integrantes,
      }).catch((e) => {
        console.error("[SOT] Gravar escala pão na nuvem:", e);
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [escala, integrantes, useCloud, idbReady, cloudBootstrapDone]);

  const setIntegrantes = useCallback(
    (next: string[]) => {
      bumpLocalMutation();
      const cleaned = dedupeIntegrantesOrder(next);
      setIntegrantesState(cleaned);
    },
    [bumpLocalMutation],
  );

  const motoristaParaData = useCallback(
    (date: Date) => getMotoristaEscalaParaData(escala, date),
    [escala],
  );

  const setMotoristaNaData = useCallback(
    (dateKey: string, nome: string) => {
      bumpLocalMutation();
      setEscala((prev) => {
        const next = { ...prev, [dateKey]: nome };
        return next;
      });
    },
    [bumpLocalMutation],
  );

  const setEscalaCompleta = useCallback(
    (next: EscalaPaoStored) => {
      bumpLocalMutation();
      setEscala(next);
    },
    [bumpLocalMutation],
  );

  const value = useMemo(
    () => ({
      escala,
      integrantes,
      setIntegrantes,
      motoristaParaData,
      setMotoristaNaData,
      setEscalaCompleta,
    }),
    [escala, integrantes, setIntegrantes, motoristaParaData, setMotoristaNaData, setEscalaCompleta],
  );

  return <EscalaPaoContext.Provider value={value}>{children}</EscalaPaoContext.Provider>;
}

export function useEscalaPao() {
  const ctx = useContext(EscalaPaoContext);
  if (!ctx) {
    throw new Error("useEscalaPao deve ser usado dentro de EscalaPaoProvider");
  }
  return ctx;
}
