import { useEffect, useState } from "react";
import { idbGetJson } from "../lib/indexedDb";
import { OIL_MAINTENANCE_STORAGE_KEY, type TrocaOleoRegistro } from "../lib/oilMaintenance";

type MapaOleo = Record<string, TrocaOleoRegistro>;

/** Lê o mapa de trocas de óleo (somente leitura; painel Manutenções continua sendo a fonte de escrita). */
export function useOilMaintenanceMap() {
  const [mapa, setMapa] = useState<MapaOleo>({});

  useEffect(() => {
    let cancel = false;
    void idbGetJson<MapaOleo>(OIL_MAINTENANCE_STORAGE_KEY).then((raw) => {
      if (cancel) return;
      setMapa(raw && typeof raw === "object" ? raw : {});
    });
    return () => {
      cancel = true;
    };
  }, []);

  return mapa;
}
