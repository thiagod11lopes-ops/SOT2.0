import { collection, doc, getDoc, getDocs, getFirestore } from "firebase/firestore";
import { ensureFirebaseAuth } from "./auth";
import { getFirebaseApp, isFirebaseConfigured } from "./config";
import { SOT_STATE_DOC, type SotStateDocId } from "./sotStateFirestore";
import { normalizeDepartureRows } from "../normalizeDepartures";
import { idbSetJson } from "../indexedDb";
import { CUSTOM_LOCATIONS_STORAGE_KEY } from "../customLocationsStorage";
import type { DepartureRecord } from "../../types/departure";
import { RDV_LOCAL_STORAGE_KEY } from "../relatorioDiarioViaturasStorage";

const DEPARTURES_IDB_KEY = "sot-departures-v1";
const CATALOG_IDB_KEY = "sot-catalog-items-v1";
const AVISOS_IDB_KEY = "sot-avisos-v1";
const LIMPEZA_IDB_KEY = "sot-limpeza-pendente-v1";
const OFICINA_IDB_KEY = "sot-oficina-v1";
const OIL_IDB_KEY = "sot-oil-maintenance-v1";
const ESCALA_IDB_KEY = "sot-escala-pao-v2";
const INTEGRANTES_IDB_KEY = "sot-escala-pao-integrantes-v1";
const MOTORISTA_PAO_IDB_KEY = "sot-motorista-pao-v1";
const APPEARANCE_IDB_KEY = "sot-appearance";
const REPORT_EMAIL_IDB_KEY = "sot_departures_report_email";
const ALARM_DISMISS_IDB_KEY = "sot-alarm-dismiss-v2";
const DETALHE_SERVICO_IDB_KEY = "sot-detalhe-servico-bundle-v2";

export type FirebaseFullBackup = {
  type: "sot_full_backup";
  version: 1;
  exportedAt: string;
  source: "firebase";
  projectId: string;
  departures: DepartureRecord[];
  sotState: Partial<Record<SotStateDocId, unknown>>;
};

export type BackupPreviewItem = {
  aba: string;
  descricao: string;
  quantidade: number;
};

function toDepartureRecord(id: string, data: Record<string, unknown>): DepartureRecord | null {
  const tipo = data.tipo;
  if (tipo !== "Administrativa" && tipo !== "Ambulância") return null;
  const createdAt = typeof data.createdAt === "number" ? data.createdAt : 0;
  return {
    id,
    createdAt,
    version: typeof data.version === "number" ? data.version : 0,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : createdAt,
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
    tipoSaidaInterHospitalar: data.tipoSaidaInterHospitalar === true,
    tipoSaidaAlta: data.tipoSaidaAlta === true,
    tipoSaidaOutros: data.tipoSaidaOutros === true,
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

export async function exportFullBackupFromFirebase(): Promise<FirebaseFullBackup> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não está configurado neste build.");
  await ensureFirebaseAuth();
  const db = getFirestore(getFirebaseApp());

  const departuresSnap = await getDocs(collection(db, "departures"));
  const departuresRaw: DepartureRecord[] = [];
  departuresSnap.forEach((d) => {
    const row = toDepartureRecord(d.id, d.data() as Record<string, unknown>);
    if (row) departuresRaw.push(row);
  });
  const departures = normalizeDepartureRows(departuresRaw);

  const sotState: Partial<Record<SotStateDocId, unknown>> = {};
  for (const docId of Object.values(SOT_STATE_DOC)) {
    const snap = await getDoc(doc(db, "sot_state", docId));
    if (!snap.exists()) continue;
    const data = snap.data();
    sotState[docId] =
      data && typeof data === "object" && "payload" in data ? (data as { payload: unknown }).payload : null;
  }

  return {
    type: "sot_full_backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "firebase",
    projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? ""),
    departures,
    sotState,
  };
}

function toRecordMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function restoreFullBackupToLocal(backup: FirebaseFullBackup): Promise<void> {
  const sot = backup.sotState ?? {};
  await idbSetJson(DEPARTURES_IDB_KEY, backup.departures ?? [], { maxAttempts: 6 });
  await idbSetJson(CATALOG_IDB_KEY, sot.catalog ?? {}, { maxAttempts: 6 });
  await idbSetJson(AVISOS_IDB_KEY, sot.avisos ?? {}, { maxAttempts: 6 });
  await idbSetJson(LIMPEZA_IDB_KEY, sot.limpezaPendente ?? [], { maxAttempts: 6 });
  await idbSetJson(OFICINA_IDB_KEY, sot.oficina ?? {}, { maxAttempts: 6 });
  await idbSetJson(OIL_IDB_KEY, sot.oilMaintenance ?? {}, { maxAttempts: 6 });
  await idbSetJson(CUSTOM_LOCATIONS_STORAGE_KEY, sot.customLocations ?? {}, { maxAttempts: 6 });

  const escalaBundle = toRecordMap(sot.escalaPaoBundle);
  await idbSetJson(ESCALA_IDB_KEY, toRecordMap(escalaBundle.escala), { maxAttempts: 6 });
  await idbSetJson(
    INTEGRANTES_IDB_KEY,
    Array.isArray(escalaBundle.integrantes) ? escalaBundle.integrantes : [],
    { maxAttempts: 6 },
  );

  const motoristaPao = toRecordMap(sot.motoristaPao);
  await idbSetJson(MOTORISTA_PAO_IDB_KEY, String(motoristaPao.nome ?? ""), { maxAttempts: 6 });

  const appearance = toRecordMap(sot.appearance);
  await idbSetJson(APPEARANCE_IDB_KEY, String(appearance.mode ?? "original"), { maxAttempts: 6 });

  const reportEmail = toRecordMap(sot.departuresReportEmail);
  await idbSetJson(REPORT_EMAIL_IDB_KEY, String(reportEmail.email ?? ""), { maxAttempts: 6 });

  await idbSetJson(ALARM_DISMISS_IDB_KEY, sot.alarmDismiss ?? {}, { maxAttempts: 6 });
  await idbSetJson(DETALHE_SERVICO_IDB_KEY, sot.detalheServico ?? {}, { maxAttempts: 6 });

  const rdvByDate = sot.rdvByDate;
  if (rdvByDate && typeof rdvByDate === "object") {
    try {
      localStorage.setItem(RDV_LOCAL_STORAGE_KEY, JSON.stringify(rdvByDate));
    } catch {
      /* ignore */
    }
  }
}

export function parseFullBackupJson(raw: unknown): FirebaseFullBackup {
  if (!raw || typeof raw !== "object") throw new Error("Arquivo inválido.");
  const o = raw as Record<string, unknown>;
  if (o.type !== "sot_full_backup" || o.version !== 1) {
    throw new Error("Formato de backup não reconhecido.");
  }
  return o as FirebaseFullBackup;
}

export function buildBackupPreviewItems(backup: FirebaseFullBackup): BackupPreviewItem[] {
  const sot = backup.sotState ?? {};
  const catalog = toRecordMap(sot.catalog);
  const avisos = toRecordMap(sot.avisos);
  const oficina = toRecordMap(sot.oficina);
  const oil = toRecordMap(sot.oilMaintenance);
  const customLocations = toRecordMap(sot.customLocations);
  const escalaBundle = toRecordMap(sot.escalaPaoBundle);
  const detalheServico = toRecordMap(sot.detalheServico);
  const rdvByDate = toRecordMap(sot.rdvByDate);

  const catalogTotal = [
    "setores",
    "responsaveis",
    "oms",
    "hospitais",
    "motoristas",
    "viaturasAdministrativas",
    "ambulancias",
  ].reduce((acc, key) => acc + (Array.isArray(catalog[key]) ? catalog[key].length : 0), 0);

  const avisosTotal =
    (Array.isArray(avisos.avisosGeraisItens) ? avisos.avisosGeraisItens.length : 0) +
    (Array.isArray(avisos.alarmesDiarios) ? avisos.alarmesDiarios.length : 0);

  const escalaTotal =
    Object.keys(toRecordMap(escalaBundle.escala)).length +
    (Array.isArray(escalaBundle.integrantes) ? escalaBundle.integrantes.length : 0);

  const detalheTotal =
    Object.keys(toRecordMap(detalheServico.sheets)).length +
    Object.keys(toRecordMap(detalheServico.rodapes)).length +
    Object.keys(toRecordMap(detalheServico.columnGrayByMonth)).length;

  const rdvDiasTotal = Object.keys(rdvByDate).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).length;

  return [
    { aba: "Cadastrar Saída / Listas", descricao: "Saídas completas (coleção departures)", quantidade: backup.departures.length },
    { aba: "Frota e Pessoal", descricao: "Catálogos (motoristas, viaturas, setores, etc.)", quantidade: catalogTotal },
    { aba: "Avisos", descricao: "Avisos gerais e alarmes diários", quantidade: avisosTotal },
    { aba: "Vistoria", descricao: "Viaturas na oficina", quantidade: Object.keys(oficina).length },
    { aba: "Vistoria", descricao: "Troca de óleo", quantidade: Object.keys(oil).length },
    { aba: "Cadastrar Saída", descricao: "Cidades e bairros extras", quantidade: Object.keys(customLocations).length },
    { aba: "Escala do Pão", descricao: "Escala e integrantes", quantidade: escalaTotal },
    { aba: "Cabeçalho", descricao: "Motorista do pão", quantidade: Object.keys(toRecordMap(sot.motoristaPao)).length },
    { aba: "Configurações", descricao: "Aparência e e-mail do relatório", quantidade: Object.keys(toRecordMap(sot.appearance)).length + Object.keys(toRecordMap(sot.departuresReportEmail)).length },
    { aba: "Avisos", descricao: "Dismiss de alarmes", quantidade: Object.keys(toRecordMap(sot.alarmDismiss)).length },
    { aba: "Detalhe de Serviço", descricao: "Planilhas, rodapés e colunas cinza", quantidade: detalheTotal },
    { aba: "Carro quebrado / RDV", descricao: "Relatórios diários por data", quantidade: rdvDiasTotal },
  ];
}
