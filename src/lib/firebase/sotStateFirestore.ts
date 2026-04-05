import {
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
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

export function subscribeSotStateDoc(
  docId: SotStateDocId,
  onPayload: (payload: unknown | null) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    docRef(docId),
    (snap) => {
      if (!snap.exists()) {
        onPayload(null);
        return;
      }
      const data = snap.data();
      const p = data && typeof data === "object" && "payload" in data ? (data as { payload: unknown }).payload : null;
      onPayload(p ?? null);
    },
    (err) => onError(err instanceof Error ? err : new Error(String(err))),
  );
}

export async function setSotStateDoc(docId: SotStateDocId, payload: unknown): Promise<void> {
  await setDoc(docRef(docId), { payload: sanitizePayload(payload) });
}
