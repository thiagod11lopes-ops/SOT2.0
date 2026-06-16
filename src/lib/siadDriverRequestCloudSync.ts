import { ensureFirebaseAuth } from "./firebase/auth";
import { isFirebaseConfigured } from "./firebase/config";
import {
  SOT_STATE_DOC,
  readSotStateDocFromServer,
  setSotStateDocWithRetry,
  subscribeSotStateDoc,
} from "./firebase/sotStateFirestore";
import {
  applySiadDriverRequestStoreFromRemote,
  mergeSiadDriverRequestStores,
  parseSiadDriverRequestStore,
  readSiadDriverRequestStore,
  setSiadDriverRequestCloudPushListener,
  type SiadDriverRequestStore,
} from "./siadDriverRequest";

const SUPPRESS_REMOTE_MS = 5000;

let useCloudEnabled = false;
let remoteSynced = false;
let applyingRemote = false;
let suppressRemoteUntil = 0;
let pushQueue: Promise<void> = Promise.resolve();
let unsubscribeRemote: (() => void) | undefined;

function storesEqual(a: SiadDriverRequestStore, b: SiadDriverRequestStore): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const rowA = a[key];
    const rowB = b[key];
    if (!rowB) return false;
    if (
      rowA.status !== rowB.status ||
      rowA.requestedAt !== rowB.requestedAt ||
      (rowA.confirmedAt ?? 0) !== (rowB.confirmedAt ?? 0)
    ) {
      return false;
    }
  }
  return true;
}

function enqueueCloudPush(localStore: SiadDriverRequestStore) {
  if (!useCloudEnabled || applyingRemote) return;
  suppressRemoteUntil = Date.now() + SUPPRESS_REMOTE_MS;
  pushQueue = pushQueue
    .then(async () => {
      const remoteRaw = await readSotStateDocFromServer(SOT_STATE_DOC.siadDriverRequest);
      const remoteStore = parseSiadDriverRequestStore(remoteRaw);
      const merged = mergeSiadDriverRequestStores(remoteStore, localStore);
      await setSotStateDocWithRetry(SOT_STATE_DOC.siadDriverRequest, merged);
      const currentLocal = readSiadDriverRequestStore();
      const reconciled = mergeSiadDriverRequestStores(currentLocal, merged);
      if (!storesEqual(currentLocal, reconciled)) {
        applyingRemote = true;
        applySiadDriverRequestStoreFromRemote(reconciled);
        applyingRemote = false;
      }
    })
    .catch((err) => {
      console.error("[SOT] Gravar pedido motorista SIAD na nuvem:", err);
    });
}

function applyRemotePayload(payload: unknown) {
  const pastFirstSync = remoteSynced;
  if (pastFirstSync && Date.now() < suppressRemoteUntil) return;

  const remoteStore = parseSiadDriverRequestStore(payload);
  const localStore = readSiadDriverRequestStore();
  if (storesEqual(localStore, remoteStore)) {
    remoteSynced = true;
    return;
  }

  applyingRemote = true;
  applySiadDriverRequestStoreFromRemote(remoteStore);
  applyingRemote = false;
  remoteSynced = true;
}

function stopCloudSync() {
  unsubscribeRemote?.();
  unsubscribeRemote = undefined;
  setSiadDriverRequestCloudPushListener(null);
  remoteSynced = false;
  useCloudEnabled = false;
  suppressRemoteUntil = 0;
  applyingRemote = false;
}

function startRemoteSubscription() {
  let cancelled = false;
  void ensureFirebaseAuth()
    .then(() => {
      if (cancelled) return;
      unsubscribeRemote = subscribeSotStateDoc(
        SOT_STATE_DOC.siadDriverRequest,
        (payload) => {
          if (cancelled) return;
          applyRemotePayload(payload);
        },
        (err) => console.error("[SOT] Firestore pedido motorista SIAD:", err),
        { ignoreCachedSnapshotWhenOnline: true },
      );
    })
    .catch((err) => {
      console.error("[SOT] Firebase auth (pedido motorista SIAD):", err);
    });

  return () => {
    cancelled = true;
    unsubscribeRemote?.();
    unsubscribeRemote = undefined;
  };
}

/**
 * Sincroniza pedidos de motorista SIAD via Firestore para o modal «SIAD SOLICITADO»
 * aparecer em tempo real em todos os dispositivos com o SOT aberto.
 */
export function ensureSiadDriverRequestCloudSync(useCloud: boolean): () => void {
  stopCloudSync();

  if (!useCloud || !isFirebaseConfigured()) {
    return () => undefined;
  }

  useCloudEnabled = true;
  remoteSynced = false;

  setSiadDriverRequestCloudPushListener(enqueueCloudPush);
  const stopRemote = startRemoteSubscription();

  return () => {
    stopRemote();
    stopCloudSync();
  };
}
