import {
  doc,
  getDocFromServer,
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
  viaturasInoperantes: "viaturasInoperantes",
  oficina: "oficina",
  oilMaintenance: "oilMaintenance",
  customLocations: "customLocations",
  escalaPaoBundle: "escalaPaoBundle",
  motoristaPao: "motoristaPao",
  appearance: "appearance",
  departuresReportEmail: "departuresReportEmail",
  alarmDismiss: "alarmDismiss",
  /** Configuração global dos alarmes mobile para envio push pelo backend. */
  alarmesConfig: "alarmesConfig",
  /** Grelha Detalhe de Serviço (por mês), rodapés e cinzas de coluna — espelho em `localStorage`. */
  detalheServico: "detalheServico",
  /** Estado completo da aba Vistoria (responsabilidades, inspeções e pendências). */
  vistoria: "vistoria",
  /** Relatório Diário de Viaturas (carro-quebrado): mapa ISO data → relatório gravado. */
  rdvByDate: "rdvByDate",
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
  options?: { ignoreCachedSnapshotWhenOnline?: boolean },
): Unsubscribe {
  let unsub: Unsubscribe | undefined;
  let cancelled = false;
  let hasDeliveredServerSnapshot = false;
  let serverBackfillInFlight = false;
  void ensureFirebaseAuth()
    .then(() => {
      if (cancelled) return;
      unsub = onSnapshot(
        docRef(docId),
        (snap) => {
          const ignoreCachedOnline =
            options?.ignoreCachedSnapshotWhenOnline === true &&
            typeof navigator !== "undefined" &&
            navigator.onLine &&
            snap.metadata.fromCache &&
            !snap.metadata.hasPendingWrites;
          if (ignoreCachedOnline) {
            if (!hasDeliveredServerSnapshot && !serverBackfillInFlight) {
              serverBackfillInFlight = true;
              void getDocFromServer(docRef(docId))
                .then((serverSnap) => {
                  if (cancelled) return;
                  hasDeliveredServerSnapshot = true;
                  if (!serverSnap.exists()) {
                    onPayload(null);
                    return;
                  }
                  const data = serverSnap.data();
                  const p =
                    data && typeof data === "object" && "payload" in data
                      ? (data as { payload: unknown }).payload
                      : null;
                  onPayload(p ?? null);
                })
                .catch((err) => {
                  if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
                })
                .finally(() => {
                  serverBackfillInFlight = false;
                });
            }
            return;
          }
          if (!snap.metadata.fromCache) {
            hasDeliveredServerSnapshot = true;
          }
          if (import.meta.env.DEV && (snap.metadata.fromCache || snap.metadata.hasPendingWrites)) {
            console.debug("[SOT] sot_state snapshot meta", docId, {
              fromCache: snap.metadata.fromCache,
              hasPendingWrites: snap.metadata.hasPendingWrites,
            });
          }
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

export async function readSotStateDocFromServer(docId: SotStateDocId): Promise<unknown | null> {
  await ensureFirebaseAuth();
  const snap = await getDocFromServer(docRef(docId));
  if (!snap.exists()) return null;
  const data = snap.data();
  const payload = data && typeof data === "object" && "payload" in data ? (data as { payload?: unknown }).payload : null;
  return payload ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFirestoreError(err: unknown): boolean {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
  return (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("resource-exhausted") ||
    code.includes("aborted") ||
    code.includes("network") ||
    code === "auth/network-request-failed"
  );
}

/**
 * Gravação com novas tentativas — falhas transitórias de rede/Firestore são comuns em campo.
 */
export async function setSotStateDocWithRetry(
  docId: SotStateDocId,
  payload: unknown,
  options?: { maxAttempts?: number },
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 4;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await setSotStateDoc(docId, payload);
      return;
    } catch (e) {
      lastError = e;
      const retry = attempt < maxAttempts && isRetryableFirestoreError(e);
      console.warn(`[SOT] Firestore write ${docId} tentativa ${attempt}/${maxAttempts}`, e);
      if (!retry) break;
      await sleep(250 * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
