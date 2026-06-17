import { useEffect, useMemo } from "react";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { useUnlinkedOccurrences } from "../context/unlinked-occurrences-context";
import { useSyncPreference } from "../context/sync-preference-context";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { useMobileLoadingOverlay } from "../saidas-mobile/mobile-loading-context";

const SYNC_DOMAINS = [
  { key: "departures", label: "Saídas" },
  { key: "catalog", label: "Catálogo" },
  { key: "occurrences", label: "Ocorrências" },
] as const;

/** Calcula progresso de bootstrap Firebase e liga o overlay de sincronização do sistema. */
export function SystemFirebaseSyncBridge() {
  const { cloudDeparturesSync, initialLoadComplete: departuresReady } = useDepartures();
  const { initialLoadComplete: catalogReady } = useCatalogItems();
  const { initialLoadComplete: occurrencesReady } = useUnlinkedOccurrences();
  const { firebaseOnlyEnabled } = useSyncPreference();
  const { setSystemSync } = useMobileLoadingOverlay();

  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  const domainReady = useMemo(
    () => ({
      departures: departuresReady,
      catalog: catalogReady,
      occurrences: occurrencesReady,
    }),
    [departuresReady, catalogReady, occurrencesReady],
  );

  const { progress, label, active } = useMemo(() => {
    const readyCount = SYNC_DOMAINS.filter((d) => domainReady[d.key]).length;
    const bootstrapProgress = Math.round((readyCount / SYNC_DOMAINS.length) * 100);
    const nextPending = SYNC_DOMAINS.find((d) => !domainReady[d.key]);
    const bootstrapPending = useCloud && readyCount < SYNC_DOMAINS.length;
    const cloudConnecting = useCloud && cloudDeparturesSync.status === "connecting";

    if (!bootstrapPending && !cloudConnecting) {
      return { progress: 100, label: "Sincronizado", active: false };
    }

    if (cloudConnecting && readyCount === SYNC_DOMAINS.length) {
      return {
        progress: 92,
        label: "A sincronizar alterações…",
        active: true,
      };
    }

    return {
      progress: bootstrapProgress,
      label: nextPending ? `A carregar ${nextPending.label.toLowerCase()}…` : "A sincronizar…",
      active: true,
    };
  }, [cloudDeparturesSync.status, domainReady, useCloud]);

  useEffect(() => {
    setSystemSync({ active, progress, label });
  }, [active, progress, label, setSystemSync]);

  return null;
}
