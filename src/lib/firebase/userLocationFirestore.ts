/**
 * Escrita directa ao Firestore da localização em tempo real do utilizador
 * autenticado. Documento: `user_locations/{uid}` (ver `firestore.rules`).
 *
 * Diferença em relação a `postDriverLocation`:
 *  • `postDriverLocation` vai por uma Cloud Function com Admin SDK e exige
 *    `placa` (caso de uso das viaturas).
 *  • Esta função escreve directamente ao Firestore com a SDK do cliente e
 *    usa o uid do utilizador anónimo como id do documento — caso de uso
 *    genérico de "atualizar o nó de localização do usuário".
 *
 * As regras Firestore garantem que cada utilizador só pode escrever no
 * documento que tem o seu próprio uid.
 */

import { getAuth } from "firebase/auth";
import {
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type FieldValue,
} from "firebase/firestore";
import { ensureFirebaseAuth } from "./auth";
import { getFirebaseApp, isFirebaseConfigured } from "./config";

/** Nome da colecção Firestore. Manter sincronizado com `firestore.rules`. */
export const USER_LOCATIONS_COLLECTION = "user_locations";

export type UserLocationPayload = {
  /** Latitude WGS-84. */
  lat: number;
  /** Longitude WGS-84. */
  lng: number;
  /** Precisão horizontal em metros, quando disponível. */
  accuracy?: number | null;
  /** Rumo em graus (0 = norte). */
  heading?: number | null;
  /** Velocidade em m/s. */
  speed?: number | null;
  /** Altitude em metros (elipsóide WGS-84). */
  altitude?: number | null;
};

type WriteableUserLocationDoc = UserLocationPayload & {
  uid: string;
  /** `serverTimestamp()` — definido sempre pelo cliente. */
  updatedAt: FieldValue;
};

/**
 * Grava (`setDoc` com `merge: true`) a localização actual do utilizador
 * autenticado. Faz `ensureFirebaseAuth()` automaticamente — se ainda não
 * houver sessão, a autenticação anónima é arrancada.
 *
 * Não faz throttle/dedup: o chamador é responsável por decidir a frequência.
 * Para frequências altas (cada tick do `watchPosition`), considera usar
 * `LiveTrackingMap` que aplica throttle por tempo (default 3 s) e distância
 * (default 5 m).
 */
export async function setUserLocation(payload: UserLocationPayload): Promise<string> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase não está configurado neste ambiente — define VITE_FIREBASE_* no .env.",
    );
  }

  await ensureFirebaseAuth();
  const auth = getAuth(getFirebaseApp());
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      "Sem sessão Firebase. Confirma que Authentication → Anonymous está activo no Console.",
    );
  }

  const db = getFirestore(getFirebaseApp());
  const docRef = doc(db, USER_LOCATIONS_COLLECTION, user.uid);

  const data: WriteableUserLocationDoc = {
    uid: user.uid,
    lat: payload.lat,
    lng: payload.lng,
    accuracy: payload.accuracy ?? null,
    heading: payload.heading ?? null,
    speed: payload.speed ?? null,
    altitude: payload.altitude ?? null,
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, data, { merge: true });
  return user.uid;
}
