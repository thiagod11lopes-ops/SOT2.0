import { useEffect } from "react";
import { useDepartures } from "../context/departures-context";
import { useSyncPreference } from "../context/sync-preference-context";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { mapSotBackupJsonToDepartures } from "../lib/sotBackupImport";

function seedDeparturesUrl() {
  const base = import.meta.env.BASE_URL;
  const path = "sot_departures_seed.json";
  if (base.endsWith("/")) return `${base}${path}`;
  return `${base}/${path}`;
}

function legacyBackupUrl() {
  const base = import.meta.env.BASE_URL;
  const path = "SOT_Backup_02-04-2026.json";
  if (base.endsWith("/")) return `${base}${path}`;
  return `${base}/${path}`;
}

/**
 * Carrega o backup estático em `public/` e mescla as saídas na lista (ids já existentes são ignorados).
 * Usa AbortController (sem ref "run once") para funcionar corretamente com React Strict Mode.
 */
export function BackupDeparturesLoader() {
  const { mergeDeparturesFromBackup } = useDepartures();
  const { firebaseOnlyEnabled } = useSyncPreference();
  const useCloud = isFirebaseConfigured() && firebaseOnlyEnabled;

  useEffect(() => {
    if (useCloud) {
      // Em modo Firebase-only, não semear saídas a partir de arquivo estático.
      return;
    }
    const ac = new AbortController();
    const signal = ac.signal;

    async function load() {
      for (const url of [seedDeparturesUrl(), legacyBackupUrl()]) {
        try {
          const r = await fetch(url, { signal });
          if (!r.ok) continue;
          const json: unknown = await r.json();
          const rows = mapSotBackupJsonToDepartures(json);
          if (rows.length > 0) mergeDeparturesFromBackup(rows);
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          /* 404 ou rede: opcional */
        }
      }
    }

    void load();
    return () => ac.abort();
  }, [mergeDeparturesFromBackup, useCloud]);

  return null;
}
