import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { ensureFirebaseAuth } from "./auth";
import { getFirebaseApp } from "./config";
import { getSyncClientId } from "./clientIdentity";
import { normalizeDepartureRows } from "../normalizeDepartures";
import type { DepartureRecord } from "../../types/departure";

const COLLECTION = "departures";
const BATCH_MAX = 450;

export class DepartureVersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DepartureVersionConflictError";
  }
}

export function isDepartureVersionConflictError(err: unknown): err is DepartureVersionConflictError {
  return err instanceof DepartureVersionConflictError;
}

function departureToDoc(r: DepartureRecord): Record<string, unknown> {
  const now = Date.now();
  return {
    version: typeof r.version === "number" && Number.isFinite(r.version) ? Math.max(0, Math.trunc(r.version)) : 0,
    updatedAt:
      typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? Math.max(0, Math.trunc(r.updatedAt)) : now,
    updatedBy: typeof r.updatedBy === "string" && r.updatedBy.trim() ? r.updatedBy.trim() : getSyncClientId(),
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
    tipoSaidaInterHospitalar: r.tipoSaidaInterHospitalar === true,
    tipoSaidaAlta: r.tipoSaidaAlta === true,
    tipoSaidaOutros: r.tipoSaidaOutros === true,
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

function buildDepartureUpdatePatch(
  current: DepartureRecord,
  next: DepartureRecord,
): Record<string, unknown> {
  const currentDoc = departureToDoc(current);
  const nextDoc = departureToDoc(next);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(nextDoc)) {
    // `createdAt` é estável por registro; não atualizar em edits.
    if (key === "createdAt") continue;
    if (!Object.is(currentDoc[key], nextDoc[key])) {
      patch[key] = nextDoc[key];
    }
  }
  return patch;
}

function docToDeparture(d: QueryDocumentSnapshot<DocumentData>): DepartureRecord | null {
  const data = d.data();
  const tipo = data.tipo;
  if (tipo !== "Administrativa" && tipo !== "Ambulância") return null;
  const amb = tipo === "Ambulância";
  const createdRaw = data.createdAt;
  const createdAt =
    typeof createdRaw === "number"
      ? createdRaw
      : createdRaw instanceof Timestamp
        ? createdRaw.toMillis()
        : typeof createdRaw === "object" && createdRaw !== null && "toMillis" in createdRaw
          ? (createdRaw as { toMillis: () => number }).toMillis()
          : 0;
  const updatedAtRaw = data.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "number"
      ? updatedAtRaw
      : updatedAtRaw instanceof Timestamp
        ? updatedAtRaw.toMillis()
        : typeof updatedAtRaw === "object" && updatedAtRaw !== null && "toMillis" in updatedAtRaw
          ? (updatedAtRaw as { toMillis: () => number }).toMillis()
          : createdAt;
  const versionRaw = data.version;
  const version = typeof versionRaw === "number" && Number.isFinite(versionRaw) ? Math.max(0, Math.trunc(versionRaw)) : 0;

  return {
    id: d.id,
    createdAt,
    version,
    updatedAt,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
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
    tipoSaidaInterHospitalar: amb && data.tipoSaidaInterHospitalar === true,
    tipoSaidaAlta: amb && data.tipoSaidaAlta === true,
    tipoSaidaOutros: amb && data.tipoSaidaOutros === true,
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
          if (import.meta.env.DEV && (snap.metadata.fromCache || snap.metadata.hasPendingWrites)) {
            console.debug("[SOT] departures snapshot meta", {
              fromCache: snap.metadata.fromCache,
              hasPendingWrites: snap.metadata.hasPendingWrites,
            });
          }
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

export async function upsertDepartureRecord(
  r: DepartureRecord,
  options?: { expectedBaseVersion?: number },
): Promise<void> {
  await ensureFirebaseAuth();
  const db = getFirestore(getFirebaseApp());
  const ref = doc(db, COLLECTION, r.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const expected = options?.expectedBaseVersion;
    if (!snap.exists()) {
      if (typeof expected === "number" && expected > 0) {
        throw new DepartureVersionConflictError("Registro remoto ausente para a versão base informada.");
      }
      const next: DepartureRecord = {
        ...r,
        version: Math.max(1, typeof r.version === "number" ? r.version : 1),
        updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(),
      };
      tx.set(ref, departureToDoc(next));
      return;
    }
    const current = docToDeparture(snap as QueryDocumentSnapshot<DocumentData>);
    if (!current) {
      throw new Error("Documento de saída inválido no Firestore.");
    }
    const currentVersion = current.version ?? 0;
    if (typeof expected === "number" && expected !== currentVersion) {
      throw new DepartureVersionConflictError(
        `Conflito de versão: esperado ${expected}, remoto ${currentVersion}.`,
      );
    }
    const nextVersion = currentVersion + 1;
    const next: DepartureRecord = {
      ...r,
      version: nextVersion,
      updatedAt: Date.now(),
    };
    const patch = buildDepartureUpdatePatch(current, next);
    if (Object.keys(patch).length === 0) {
      return;
    }
    tx.update(ref, patch);
  });
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
