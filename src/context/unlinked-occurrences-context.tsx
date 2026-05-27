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
      return;
    }
    void loadUnlinkedOccurrencesFromIdb().then((loaded) => {
      setDoc(loaded);
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
          SOT_STATE_DOC.ocorrenciasDesvinculadas,
          (payload) => {
            if (cancelled) return;
            if (payload === null) return;
            if (Date.now() < suppressRemoteUntilRef.current) return;
            applyingRemoteRef.current = true;
            const next = normalizeUnlinkedOccurrencesDoc(payload);
            setDoc(next);
            void saveUnlinkedOccurrencesToIdb(next);
            hydratedRef.current = true;
          },
          (err) => console.error("[SOT] Firestore ocorrências desvinculadas:", err),
          { ignoreCachedSnapshotWhenOnline: true },
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (ocorrências desvinculadas):", e);
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

  useEffect(() => {
    if (!idbReady || !hydratedRef.current || !useCloud) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    void setSotStateDocWithRetry(SOT_STATE_DOC.ocorrenciasDesvinculadas, doc).catch((e) => {
      console.error("[SOT] Gravar ocorrências desvinculadas na nuvem:", e);
    });
  }, [doc, useCloud, idbReady]);

  const addUnlinkedOccurrence = useCallback(
    (args: { dataSaida: string; tipo: DepartureType; texto: string; rubrica?: string }) => {
      const texto = args.texto.trim();
      const dataSaida = args.dataSaida.trim();
      const rubrica = (args.rubrica ?? "").trim();
      if (!texto || !dataSaida) return;
      bumpLocalMutation();
      setDoc((prev) => ({
        items: [
          ...prev.items,
          {
            id: newUnlinkedOccurrenceId(),
            dataSaida,
            tipo: args.tipo,
            texto,
            rubrica,
            createdAt: Date.now(),
          },
        ],
      }));
    },
    [bumpLocalMutation],
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
      addUnlinkedOccurrence,
      entriesForPdf,
    }),
    [doc.items, addUnlinkedOccurrence, entriesForPdf],
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
