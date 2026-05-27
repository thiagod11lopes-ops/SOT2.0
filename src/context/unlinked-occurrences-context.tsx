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
  loadUnlinkedOccurrencesFromIdb,
  normalizeUnlinkedOccurrencesDoc,
  newUnlinkedOccurrenceId,
  saveUnlinkedOccurrencesToIdb,
} from "../lib/unlinkedOccurrencesStorage";
import type { PdfOccurrenceEntry } from "../types/pdfOccurrence";
import type { DepartureType } from "../types/departure";
import { normalizeLegacyDateToPtBr } from "../lib/dateFormat";
import type { UnlinkedDepartureOccurrence, UnlinkedOccurrencesDoc } from "../types/unlinkedOccurrence";
import { useSyncPreference } from "./sync-preference-context";

type UnlinkedOccurrencesContextValue = {
  items: UnlinkedDepartureOccurrence[];
  /** Primeira carga local ou snapshot remoto concluída. */
  initialLoadComplete: boolean;
  addUnlinkedOccurrence: (args: {
    dataSaida: string;
    tipo: DepartureType;
    texto: string;
    rubrica?: string;
  }) => void;
  entriesForPdf: (dataSaida: string, tipo: DepartureType) => PdfOccurrenceEntry[];
};

const UnlinkedOccurrencesContext = createContext<UnlinkedOccurrencesContextValue | null>(null);
const SUPPRESS_REMOTE_MS = 5000;

export function UnlinkedOccurrencesProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<UnlinkedOccurrencesDoc>({ items: [] });
  const [idbReady, setIdbReady] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
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
      setIdbReady(true);
      setInitialLoadComplete(false);
      return;
    }
    setInitialLoadComplete(false);
    void loadUnlinkedOccurrencesFromIdb().then((loaded) => {
      setDoc(loaded);
      setIdbReady(true);
      setInitialLoadComplete(true);
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
          SOT_STATE_DOC.ocorrenciasDesvinculadas,
          (payload) => {
            if (cancelled) return;
            if (payload === null) {
              setInitialLoadComplete(true);
              return;
            }
            if (Date.now() < suppressRemoteUntilRef.current) return;
            applyingRemoteRef.current = true;
            const next = normalizeUnlinkedOccurrencesDoc(payload);
            setDoc(next);
            void saveUnlinkedOccurrencesToIdb(next);
            hydratedRef.current = true;
            setInitialLoadComplete(true);
          },
          (err) => {
            console.error("[SOT] Firestore ocorrências desvinculadas:", err);
            setInitialLoadComplete(true);
          },
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (ocorrências desvinculadas):", e);
        setInitialLoadComplete(true);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [useCloud, idbReady]);

  useEffect(() => {
    if (!idbReady) return;
    void saveUnlinkedOccurrencesToIdb(doc);
  }, [doc, idbReady]);

  // Remover este useEffect pois a gravação é feita diretamente em addUnlinkedOccurrence
  // useEffect(() => {
  //   if (!idbReady || !hydratedRef.current || !useCloud) return;
  //   if (applyingRemoteRef.current) {
  //     applyingRemoteRef.current = false;
  //     return;
  //   }
  //   void setSotStateDocWithRetry(SOT_STATE_DOC.ocorrenciasDesvinculadas, doc).catch((e) => {
  //     console.error("[SOT] Gravar ocorrências desvinculadas na nuvem:", e);
  //   });
  // }, [doc, useCloud, idbReady]);

  const addUnlinkedOccurrence = useCallback(
    (args: {
      dataSaida: string;
      tipo: DepartureType;
      texto: string;
      rubrica?: string;
    }) => {
      const texto = args.texto.trim();
      const dataSaida = args.dataSaida.trim();
      const rubrica = (args.rubrica ?? "").trim();
      if (!texto || !dataSaida) return;

      bumpLocalMutation(); // Sinaliza uma mutação local para potencialmente suprimir o remoto por um tempo

      const newUnlinkedItem = {
        id: newUnlinkedOccurrenceId(),
        dataSaida,
        tipo: args.tipo,
        texto,
        rubrica,
        createdAt: Date.now(),
      };

      setDoc((prev) => {
        const nextDoc = {
          items: [...prev.items, newUnlinkedItem],
        };
        // Chamada explícita para o Firebase aqui
        if (useCloud) {
          console.log("[SOT] Tentando gravar ocorrência desvinculada no Firebase:", nextDoc);
          if (nextDoc.items.length > 0 && nextDoc.items[nextDoc.items.length - 1]?.rubrica) {
            console.log("[SOT] Rubrica enviada (última ocorrência):", nextDoc.items[nextDoc.items.length - 1].rubrica.substring(0, 100) + "..."); // Mostra os primeiros 100 caracteres
            console.log("[SOT] Tamanho total da rubrica enviada:", nextDoc.items[nextDoc.items.length - 1].rubrica.length);
          }
          void setSotStateDocWithRetry(SOT_STATE_DOC.ocorrenciasDesvinculadas, nextDoc).catch((e) => {
            console.error("[SOT] Erro ao gravar ocorrência desvinculada na nuvem:", e);
          });
        } else {
          console.log("[SOT] useCloud é false. Ocorrência desvinculada não gravada no Firebase.");
        }
        return nextDoc;
      });
    },
    [bumpLocalMutation, useCloud],
  );

  const entriesForPdf = useCallback(
    (dataSaida: string, tipo: DepartureType): PdfOccurrenceEntry[] => {
      const d = normalizeLegacyDateToPtBr(dataSaida.trim());
      return doc.items
        .filter((i) => normalizeLegacyDateToPtBr(i.dataSaida) === d && i.tipo === tipo)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((i) => ({
          texto: i.texto.trim(),
          rubrica: i.rubrica.trim() || undefined,
        }))
        .filter((e) => e.texto.length > 0);
    },
    [doc.items],
  );

  const value = useMemo(
    () => ({
      items: doc.items,
      initialLoadComplete,
      addUnlinkedOccurrence,
      entriesForPdf,
    }),
    [doc.items, initialLoadComplete, addUnlinkedOccurrence, entriesForPdf],
  );

  return (
    <UnlinkedOccurrencesContext.Provider value={value}>{children}</UnlinkedOccurrencesContext.Provider>
  );
}

export function useUnlinkedOccurrences(): UnlinkedOccurrencesContextValue {
  const ctx = useContext(UnlinkedOccurrencesContext);
  if (!ctx) {
    throw new Error("useUnlinkedOccurrences deve ser usado dentro de UnlinkedOccurrencesProvider");
  }
  return ctx;
}
