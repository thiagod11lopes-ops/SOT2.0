import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { ensureFirebaseAuth } from "./auth";
import { getFirebaseApp } from "./config";
import { normalizeDepartureRows } from "../normalizeDepartures";
import type { DepartureRecord } from "../../types/departure";

const COLLECTION = "departures";
const BATCH_MAX = 450;

function departureToDoc(r: DepartureRecord): Record<string, unknown> {
  return {
    tipo: r.tipo,
    dataPedido: r.dataPedido,
    horaPedido: r.horaPedido,
    dataSaida: r.dataSaida,
    horaSaida: r.horaSaida,
    setor: r.setor,
    ramal: r.ramal,
    objetivoSaida: r.objetivoSaida,
    numeroPassageiros: r.numeroPassageiros,
    responsavelPedido: r.responsavelPedido,
    om: r.om,
    viaturas: r.viaturas,
    motoristas: r.motoristas,
    hospitalDestino: r.hospitalDestino,
    kmSaida: r.kmSaida,
    kmChegada: r.kmChegada,
    chegada: r.chegada,
    cidade: r.cidade,
    bairro: r.bairro,
    rubrica: r.rubrica,
    cancelada: r.cancelada === true,
    ocorrencias: r.ocorrencias ?? "",
    createdAt: r.createdAt,
  };
}

function docToDeparture(d: QueryDocumentSnapshot<DocumentData>): DepartureRecord | null {
  const data = d.data();
  const tipo = data.tipo;
  if (tipo !== "Administrativa" && tipo !== "Ambulância") return null;
  const createdRaw = data.createdAt;
  const createdAt =
    typeof createdRaw === "number"
      ? createdRaw
      : createdRaw instanceof Timestamp
        ? createdRaw.toMillis()
        : typeof createdRaw === "object" && createdRaw !== null && "toMillis" in createdRaw
          ? (createdRaw as { toMillis: () => number }).toMillis()
          : 0;
  return {
    id: d.id,
    createdAt,
    tipo,
    dataPedido: String(data.dataPedido ?? ""),
    horaPedido: String(data.horaPedido ?? ""),
    dataSaida: String(data.dataSaida ?? ""),
    horaSaida: String(data.horaSaida ?? ""),
    setor: String(data.setor ?? ""),
    ramal: String(data.ramal ?? ""),
    objetivoSaida: String(data.objetivoSaida ?? ""),
    numeroPassageiros: String(data.numeroPassageiros ?? ""),
    responsavelPedido: String(data.responsavelPedido ?? ""),
    om: String(data.om ?? ""),
    viaturas: String(data.viaturas ?? ""),
    motoristas: String(data.motoristas ?? ""),
    hospitalDestino: String(data.hospitalDestino ?? ""),
    kmSaida: String(data.kmSaida ?? ""),
    kmChegada: String(data.kmChegada ?? ""),
    chegada: String(data.chegada ?? ""),
    cidade: String(data.cidade ?? ""),
    bairro: String(data.bairro ?? ""),
    rubrica: String(data.rubrica ?? ""),
    cancelada: data.cancelada === true,
    ocorrencias: String(data.ocorrencias ?? ""),
  };
}

export function subscribeDepartures(
  onData: (rows: DepartureRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  let unsub: Unsubscribe | undefined;
  let cancelled = false;
  void ensureFirebaseAuth()
    .then(() => {
      if (cancelled) return;
      const db = getFirestore(getFirebaseApp());
      const q = query(collection(db, COLLECTION));
      unsub = onSnapshot(
        q,
        (snap) => {
          const raw: DepartureRecord[] = [];
          snap.forEach((d) => {
            const row = docToDeparture(d);
            if (row) raw.push(row);
          });
          raw.sort((a, b) => b.createdAt - a.createdAt);
          onData(normalizeDepartureRows(raw));
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

export async function upsertDepartureRecord(r: DepartureRecord): Promise<void> {
  await ensureFirebaseAuth();
  const db = getFirestore(getFirebaseApp());
  await setDoc(doc(db, COLLECTION, r.id), departureToDoc(r));
}

export async function deleteDepartureDocument(id: string): Promise<void> {
  await ensureFirebaseAuth();
  const db = getFirestore(getFirebaseApp());
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function deleteAllDepartureDocuments(): Promise<void> {
  await ensureFirebaseAuth();
  const db = getFirestore(getFirebaseApp());
  const snap = await getDocs(collection(db, COLLECTION));
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + BATCH_MAX)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

export async function batchUpsertDepartures(rows: DepartureRecord[]): Promise<void> {
  if (rows.length === 0) return;
  await ensureFirebaseAuth();
  const db = getFirestore(getFirebaseApp());
  for (let i = 0; i < rows.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    for (const r of rows.slice(i, i + BATCH_MAX)) {
      batch.set(doc(db, COLLECTION, r.id), departureToDoc(r));
    }
    await batch.commit();
  }
}
