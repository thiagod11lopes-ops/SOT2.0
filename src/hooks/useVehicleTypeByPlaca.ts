/**
 * Hook somente-leitura que devolve o mapa `placa→tipo de viatura`
 * sincronizado entre Firestore, localStorage e IndexedDB.
 *
 * - Mobile (navigation modal): usa este hook para descobrir a silhueta
 *   correcta da viatura do motorista e das outras viaturas em curso.
 * - Painel de Configurações: usa um padrão de escrita próprio (estado
 *   local + persistência em Firestore via `setSotStateDocWithRetry`),
 *   para evitar conflitos de "echo" entre subscriber e setter da UI.
 *
 * Carregamento:
 *  1. Lê de localStorage imediatamente (síncrono → estado inicial).
 *  2. Em paralelo, hidrata de IndexedDB (mais resiliente que LS em PWA).
 *  3. Subscreve Firestore (`sot_state/vehicleTypeByPlaca`) e mantém vivo.
 *  4. Sempre que recebe payload do Firestore, espelha em IDB + LS.
 */

import { useEffect, useState } from "react";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { idbGetJson, idbSetJson } from "../lib/indexedDb";
import {
  loadVehicleTypeByPlacaFromLocalStorage,
  normalizeVehicleTypeByPlacaPayload,
  persistVehicleTypeByPlacaToLocalStorage,
  VEHICLE_TYPE_BY_PLACA_LS_KEY,
  type VehicleTypeByPlaca,
} from "../lib/vehicleTypeByPlaca";

export function useVehicleTypeByPlaca(): VehicleTypeByPlaca {
  const [map, setMap] = useState<VehicleTypeByPlaca>(() =>
    loadVehicleTypeByPlacaFromLocalStorage(),
  );

  // Hidrata de IndexedDB ao montar (mais resiliente que LS em PWA).
  useEffect(() => {
    let cancelled = false;
    void idbGetJson<VehicleTypeByPlaca>(VEHICLE_TYPE_BY_PLACA_LS_KEY).then((raw) => {
      if (cancelled || !raw) return;
      const norm = normalizeVehicleTypeByPlacaPayload(raw);
      if (Object.keys(norm).length > 0) setMap(norm);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscreve Firestore (fonte canónica) e espelha localmente.
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await ensureFirebaseAuth();
        if (cancelled) return;
        unsub = subscribeSotStateDoc(
          SOT_STATE_DOC.vehicleTypeByPlaca,
          (payload) => {
            if (cancelled) return;
            if (payload === null) return; // sem doc — mantém o que veio do cache local
            const incoming = normalizeVehicleTypeByPlacaPayload(payload);
            setMap(incoming);
            persistVehicleTypeByPlacaToLocalStorage(incoming);
            void idbSetJson(VEHICLE_TYPE_BY_PLACA_LS_KEY, incoming, { maxAttempts: 6 });
          },
          (err) => console.error("[SOT] Firestore vehicleTypeByPlaca:", err),
        );
      } catch (e) {
        console.error("[SOT] Firebase auth (vehicleTypeByPlaca):", e);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return map;
}
