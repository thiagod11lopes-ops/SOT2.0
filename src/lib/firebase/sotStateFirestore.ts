import {
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { ensureFirebaseAuth } from "./auth";
import { getFirebaseApp } from "./config";

const COLLECTION = "sot_state";

/** IDs de documentos em `sot_state` (um doc JSON por área da app). */
export const SOT_STATE_DOC = {
  catalog: "catalog",
  avisos: "avisos",
  limpezaPendente: "limpezaPendente",
  oficina: "oficina",
  oilMaintenance: "oilMaintenance",
  customLocations: "customLocations",
  escalaPaoBundle: "escalaPaoBundle",
  motoristaPao: "motoristaPao",
  appearance: "appearance",
  departuresReportEmail: "departuresReportEmail",
  alarmDismiss: "alarmDismiss",
  /** Grelha Detalhe de Serviço (por mês), rodapés e cinzas de coluna — espelho em `localStorage`. */
  detalheServico: "detalheServico",
} as const;

export type SotStateDocId = (typeof SOT_STATE_DOC)[keyof typeof SOT_STATE_DOC];

function docRef(docId: string) {
  const db = getFirestore(getFirebaseApp());
  return doc(db, COLLECTION, docId);
}

/** Remove `undefined` para o Firestore aceitar o objeto. */
function sanitizePayload(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data));
}

/**
 * Garante login anónimo antes de ler/escrever — evita corridas em que `setSotStateDoc` corre
 * (efeitos após hidratar IndexedDB) antes de `ensureFirebaseAuth` noutro efeito terminar.
 */
export function subscribeSotStateDoc(
  docId: SotStateDocId,
  onPayload: (payload: unknown | null) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  let unsub: Unsubscribe | undefined;
  let cancelled = false;
  void ensureFirebaseAuth()
    .then(() => {
      if (cancelled) return;
      unsub = onSnapshot(
        docRef(docId),
        (snap) => {
          if (!snap.exists()) {
            onPayload(null);
            return;
          }
          const data = snap.data();
          const p =
            data && typeof data === "object" && "payload" in data ? (data as { payload: unknown }).payload : null;
          onPayload(p ?? null);
        },
        (err) => onError(err instanceof Error ? err : new Error(String(err))),
      );
    })
    .catch((err) => {
      if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
    });
  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function setSotStateDoc(docId: SotStateDocId, payload: unknown): Promise<void> {
  await ensureFirebaseAuth();
  await setDoc(docRef(docId), { payload: sanitizePayload(payload) });
}
