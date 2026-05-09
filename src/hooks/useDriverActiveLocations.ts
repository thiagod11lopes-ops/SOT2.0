import { useEffect, useState } from "react";
import type { DocumentData } from "firebase/firestore";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";
import { DRIVER_ACTIVE_LOCATIONS_COLLECTION } from "../lib/driverActiveLocationsFirestore";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "../lib/firebase/config";

export type DriverActivePin = {
  docId: string;
  placa: string;
  lat: number;
  lng: number;
};

function readDocumentTimeMs(data: DocumentData): number | null {
  const u = data.updatedAt as { toMillis?: () => number } | undefined;
  if (u && typeof u.toMillis === "function") return u.toMillis();
  const c = data.capturedAt;
  if (typeof c === "string") {
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

function parseDoc(docId: string, data: DocumentData): DriverActivePin | null {
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  const placa = String(data.placa ?? docId).trim();
  if (!placa || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { docId, placa, lat, lng };
}

export type DriverActiveLocationsState = {
  pins: DriverActivePin[];
  error: string | null;
  /** True até o primeiro snapshot (ou novo arranque após retry). */
  loading: boolean;
  /** Milestone Unix ms do documento mais recente (Firestore `updatedAt` ou fallback `capturedAt`). */
  lastUpdateAtMs: number | null;
  /** Há listener Firestore activo para a coleção. */
  subscribed: boolean;
};

/**
 * Passo 4/5 — escuta **em tempo real** (`onSnapshot`) a coleção `driver_active_locations`.
 * Com `listen: true`, mantém atualização contínua (Firestore listeners, sem polling) mesmo com o mapa fechado.
 *
 * `retryNonce` incrementa para forçar nova subscrição após erro (botão «Tentar novamente»).
 */
export function useDriverActiveLocations(listen: boolean, retryNonce = 0): DriverActiveLocationsState {
  const [pins, setPins] = useState<DriverActivePin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdateAtMs, setLastUpdateAtMs] = useState<number | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!listen || !isFirebaseConfigured()) {
      setPins([]);
      setError(null);
      setLoading(false);
      setLastUpdateAtMs(null);
      setSubscribed(false);
      return;
    }

    let cancelled = false;
    let unsub: (() => void) | undefined;

    setLoading(true);
    setError(null);
    setSubscribed(false);

    void ensureFirebaseAuth()
      .then(() => {
        if (cancelled) return;
        const db = getFirestore(getFirebaseApp());
        unsub = onSnapshot(
          collection(db, DRIVER_ACTIVE_LOCATIONS_COLLECTION),
          (snap) => {
            if (cancelled) return;
            const list: DriverActivePin[] = [];
            let maxTs = 0;
            snap.forEach((d) => {
              const raw = d.data();
              const row = parseDoc(d.id, raw);
              if (row) list.push(row);
              const t = readDocumentTimeMs(raw);
              if (t !== null && t > maxTs) maxTs = t;
            });
            list.sort((a, b) => a.placa.localeCompare(b.placa, "pt-BR"));
            setPins(list);
            setLastUpdateAtMs(maxTs > 0 ? maxTs : null);
            setError(null);
            setLoading(false);
            setSubscribed(true);
          },
          (err) => {
            if (cancelled) return;
            setError(err.message || "Falha ao ler localizações.");
            setLoading(false);
            setSubscribed(false);
          },
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
        setSubscribed(false);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [listen, retryNonce]);

  return { pins, error, loading, lastUpdateAtMs, subscribed };
}
