import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { ensureFirebaseAuth } from "./auth";
import { getFirebaseApp } from "./config";
import { parseVistoriaRubricaRef } from "../rubricaDrawing";

const COLLECTION = "sot_state";
const DOC_PREFIX = "vistoria_rubrica_v1_";

type RubricaDoc = {
  comumDataUrl?: string;
  administrativaDataUrl?: string;
  updatedAt: number;
};

const cache = new Map<string, string>();

function refDoc(id: string) {
  return doc(getFirestore(getFirebaseApp()), COLLECTION, `${DOC_PREFIX}${id}`);
}

function cacheKey(ref: string): string {
  return ref.trim();
}

export async function saveVistoriaRubricaByInspectionId(args: {
  inspectionId: string;
  kind: "comum" | "administrativa";
  dataUrl: string;
}): Promise<void> {
  const inspectionId = args.inspectionId.trim();
  const dataUrl = args.dataUrl.trim();
  if (!inspectionId || !dataUrl) return;
  await ensureFirebaseAuth();
  const field = args.kind === "administrativa" ? "administrativaDataUrl" : "comumDataUrl";
  await setDoc(refDoc(inspectionId), { [field]: dataUrl, updatedAt: Date.now() } satisfies Partial<RubricaDoc>, {
    merge: true,
  });
}

export async function loadVistoriaRubricaFromRef(refValue: string): Promise<string> {
  const ref = parseVistoriaRubricaRef(refValue);
  if (!ref) return "";
  const ck = cacheKey(refValue);
  if (cache.has(ck)) return cache.get(ck) ?? "";
  await ensureFirebaseAuth();
  const snap = await getDoc(refDoc(ref.inspectionId));
  if (!snap.exists()) {
    cache.set(ck, "");
    return "";
  }
  const data = snap.data() as Partial<RubricaDoc>;
  const raw = ref.kind === "administrativa" ? data.administrativaDataUrl : data.comumDataUrl;
  const out = typeof raw === "string" ? raw.trim() : "";
  cache.set(ck, out);
  return out;
}
