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

function parseDoc(docId: string, data: DocumentData): DriverActivePin | null {
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  const placa = String(data.placa ?? docId).trim();
  if (!placa || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { docId, placa, lat, lng };
}

/**
 * Escuta em tempo real a coleção de localização ativa (Passo 4 / mapa desktop).
 * Quando `listen` é false, não subscreve (poupa leituras Firestore).
 */
export function useDriverActiveLocations(listen: boolean): {
  pins: DriverActivePin[];
  error: string | null;
  loading: boolean;
} {
  const [pins, setPins] = useState<DriverActivePin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!listen || !isFirebaseConfigured()) {
      setPins([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let unsub: (() => void) | undefined;

    setLoading(true);
    setError(null);

    void ensureFirebaseAuth()
      .then(() => {
        if (cancelled) return;
        const db = getFirestore(getFirebaseApp());
        unsub = onSnapshot(
          collection(db, DRIVER_ACTIVE_LOCATIONS_COLLECTION),
          (snap) => {
            if (cancelled) return;
            const list: DriverActivePin[] = [];
            snap.forEach((d) => {
              const row = parseDoc(d.id, d.data());
              if (row) list.push(row);
            });
            list.sort((a, b) => a.placa.localeCompare(b.placa, "pt-BR"));
            setPins(list);
            setError(null);
            setLoading(false);
          },
          (err) => {
            if (cancelled) return;
            setError(err.message || "Falha ao ler localizações.");
            setLoading(false);
          },
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [listen]);

  return { pins, error, loading };
}
