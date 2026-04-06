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
  const applyingRemoteRef = useRef(false);
  const hydratedRef = useRef(true);
  const useCloud = isFirebaseConfigured();

  useEffect(() => {
    void Promise.all([loadEscalaPaoFromIdb(), loadIntegrantesPaoFromIdb()]).then(([e, i]) => {
      setEscala(e);
      setIntegrantesState(i);
      setIdbReady(true);
    });
  }, []);

  useEffect(() => {
    if (!useCloud || !idbReady) return;
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
              if (payload === null) {
                const e = await loadEscalaPaoFromIdb();
                const i = await loadIntegrantesPaoFromIdb();
                if (!isEscalaBundleEmpty(e, i)) {
                  await setSotStateDoc(SOT_STATE_DOC.escalaPaoBundle, { escala: e, integrantes: i });
                }
                return;
              }
              applyingRemoteRef.current = true;
              const { escala: nextE, integrantes: nextI } = normalizeEscalaPaoBundle(payload);
              setEscala(nextE);
              setIntegrantesState(nextI);
              void saveEscalaPaoToIdb(nextE);
              void saveIntegrantesPaoToIdb(nextI);
              hydratedRef.current = true;
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
    if (!hydratedRef.current || !useCloud || !idbReady) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDoc(SOT_STATE_DOC.escalaPaoBundle, { escala, integrantes }).catch((e) => {
      console.error("[SOT] Gravar escala pão na nuvem:", e);
    });
  }, [escala, integrantes, useCloud, idbReady]);

  const setIntegrantes = useCallback((next: string[]) => {
    const cleaned = dedupeIntegrantesOrder(next);
    setIntegrantesState(cleaned);
  }, []);

  const motoristaParaData = useCallback(
    (date: Date) => getMotoristaEscalaParaData(escala, date),
    [escala],
  );

  const setMotoristaNaData = useCallback((dateKey: string, nome: string) => {
    setEscala((prev) => {
      const next = { ...prev, [dateKey]: nome };
      return next;
    });
  }, []);

  const setEscalaCompleta = useCallback((next: EscalaPaoStored) => {
    setEscala(next);
  }, []);

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
