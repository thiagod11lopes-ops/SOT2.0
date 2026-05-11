#!/usr/bin/env node
/**
 * Diagnóstico rápido: lê o estado do OwnTracks + assignments + driver locations.
 * Uso (PowerShell): node scripts/inspect-owntracks-state.mjs
 *
 * Pré-requisito: estar logado com `firebase login` (usa Application Default Credentials).
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = "sot2-8d799";

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

function fmtTs(v) {
  if (!v) return "(nenhum)";
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === "string") return v;
  return String(v);
}

async function main() {
  console.log(`\n=== Projecto: ${PROJECT_ID} ===\n`);

  // 1. Token OwnTracks configurado?
  const cfg = await db.collection("sot_state").doc("owntracks").get();
  const cfgData = cfg.exists ? cfg.data() : {};
  const payload = cfgData?.payload ?? cfgData ?? {};
  console.log("--- sot_state/owntracks ---");
  console.log("Token configurado:", payload.token ? `sim (${String(payload.token).slice(0, 6)}…)` : "NÃO");
  console.log("Bindings:", payload.bindings?.length ?? 0);
  if (payload.bindings?.length) {
    payload.bindings.forEach((b) => console.log(`   · ${b.motorista}`));
  }

  // 2. Assignments activos
  console.log("\n--- motorista_active_assignments ---");
  const assigns = await db.collection("motorista_active_assignments").get();
  if (assigns.empty) {
    console.log("(vazia)");
  } else {
    assigns.forEach((d) => {
      const a = d.data();
      console.log(
        `${d.id}: active=${a.active} placa=${a.placa} departureId=${a.departureId} startedAt=${fmtTs(a.startedAt)} updatedAt=${fmtTs(a.updatedAt)} endedAt=${fmtTs(a.endedAt)}`,
      );
    });
  }

  // 3. driver_active_locations
  console.log("\n--- driver_active_locations ---");
  const locs = await db.collection("driver_active_locations").get();
  if (locs.empty) {
    console.log("(vazia)");
  } else {
    locs.forEach((d) => {
      const l = d.data();
      console.log(
        `${d.id}: placa=${l.placa} updatedAt=${fmtTs(l.updatedAt)} capturedAt=${fmtTs(l.capturedAt)} updatedByUid=${l.updatedByUid} departureId=${l.departureId}`,
      );
    });
  }

  console.log("");
}

main().catch((e) => {
  console.error("Falhou:", e);
  process.exit(1);
});
