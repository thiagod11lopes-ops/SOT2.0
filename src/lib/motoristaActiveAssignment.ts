/**
 * Atribuição activa motorista→placa.
 *
 * Quando o motorista toca "Iniciar Saída" no SOT mobile (Safari iPhone, Chrome Android,
 * ou app nativo Capacitor), gravamos em Firestore `motorista_active_assignments/{slug}`
 * qual é a placa que ele está a conduzir nesta viagem. Quando a saída é finalizada,
 * marcamos a atribuição como inactiva.
 *
 * Isto permite que a Cloud Function `postOwntracksLocation` descubra qual a placa para
 * onde escrever, mesmo que o iPhone esteja bloqueado e o motorista nunca tenha tido a
 * placa "pré-cravada" num QR code.
 */

import { doc, getFirestore, setDoc, serverTimestamp } from "firebase/firestore";
import { ensureFirebaseAuth } from "./firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase/config";
import { slugifyMotoristaName } from "./owntracksConfig";

export const MOTORISTA_ACTIVE_ASSIGNMENTS_COLLECTION = "motorista_active_assignments";

type WriteArgs = {
  motorista: string;
  placa: string;
  departureId?: string;
};

/** Grava (ou actualiza) a atribuição com `active: true`. Erros não fatais — apenas avisam na consola. */
export async function writeMotoristaActiveAssignment(args: WriteArgs): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const slug = slugifyMotoristaName(args.motorista);
  if (!slug) return;
  try {
    await ensureFirebaseAuth();
    const db = getFirestore(getFirebaseApp());
    await setDoc(
      doc(db, MOTORISTA_ACTIVE_ASSIGNMENTS_COLLECTION, slug),
      {
        motorista: args.motorista.trim(),
        placa: args.placa.trim().toUpperCase(),
        departureId: args.departureId ?? "",
        active: true,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn("[SOT] writeMotoristaActiveAssignment falhou:", e);
  }
}

/**
 * Marca a atribuição como inactiva (`active: false`). Mantém o documento para histórico
 * e para a Cloud Function devolver 200 silencioso em vez de 404 se o OwnTracks atrasar.
 */
export async function clearMotoristaActiveAssignment(motorista: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const slug = slugifyMotoristaName(motorista);
  if (!slug) return;
  try {
    await ensureFirebaseAuth();
    const db = getFirestore(getFirebaseApp());
    await setDoc(
      doc(db, MOTORISTA_ACTIVE_ASSIGNMENTS_COLLECTION, slug),
      {
        active: false,
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn("[SOT] clearMotoristaActiveAssignment falhou:", e);
  }
}
