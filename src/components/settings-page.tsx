import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useDeparturesReportEmail } from "../context/departures-report-email-context";
import { useDepartures } from "../context/departures-context";
import { useSyncPreference } from "../context/sync-preference-context";
import { useCatalogItems, type CatalogItemsState } from "../context/catalog-items-context";
import {
  loadDetalheServicoBundleFromIdb,
  normalizeDetalheServicoBundle,
  type DetalheServicoBundle,
} from "../lib/detalheServicoBundle";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, setSotStateDocWithRetry, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { isFirebaseOnlyOnlineActive } from "../lib/firebaseOnlyOnlinePolicy";
import { getDepartureReferenceDate } from "../lib/dateFormat";
import {
  DEFAULT_KM_EDIT_PASSWORD,
  notifyKmEditPasswordChangedExternally,
  setKmEditPassword,
} from "../lib/kmEditPassword";
import {
  ensureVistoriaCloudStateSyncStarted,
  getVistoriaCloudState,
  isVistoriaCloudStateHydrated,
  subscribeVistoriaCloudStateChange,
} from "../lib/vistoriaCloudState";
import type { DepartureRecord } from "../types/departure";
import type { DeparturesExportFile } from "../lib/adminDeparturesExport";
import { parseDeparturesFromImportFile } from "../lib/adminDeparturesExport";
import {
  buildBackupPreviewItems,
  exportFullBackupFromFirebase,
  type FirebaseFullBackup,
  importFullBackupToFirebase,
  parseFullBackupJson,
  pushLocalOperationalStateToFirebase,
  restoreFullBackupToLocal,
} from "../lib/firebase/systemBackup";
import {
  loadMobileMotoristaCredentials,
  removeMobileMotoristaCredential,
  type MobileMotoristaCredential,
  upsertMobileMotoristaCredential,
} from "../lib/mobileMotoristaCredentials";
import {
  ensureMobilePushServiceWorkerRegistered,
  isNotificationSupported,
  requestNotificationPermissionIfNeeded,
  showLocalAlarmNotification,
} from "../lib/mobilePushNotifications";
import {
  clampIntervaloRastreamentoMinutos,
  DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS,
  INTERVALO_RASTREAMENTO_MAX_MINUTOS,
  INTERVALO_RASTREAMENTO_MIN_MINUTOS,
  loadRastreamentoMotoristasFromLocalStorage,
  normalizeRastreamentoMotoristasPayload,
  persistRastreamentoMotoristasToLocalStorage,
  type RastreamentoMotoristasPayload,
} from "../lib/driverTrackingConfig";
import {
  heuristicVehicleTypeFromText,
  loadVehicleTypeByPlacaFromLocalStorage,
  normalizePlacaKey,
  normalizeVehicleTypeByPlacaPayload,
  persistVehicleTypeByPlacaToLocalStorage,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPES,
  type VehicleType,
  type VehicleTypeByPlaca,
} from "../lib/vehicleTypeByPlaca";
import { VehicleIcon } from "./vehicle-icon";
import {
  clearAllDriverActiveLocationsOnServer,
  clearDriverActiveLocation,
  resolveDriverLocationPostUrl,
} from "../lib/driverLocationPost";
import { useDriverActiveLocations } from "../hooks/useDriverActiveLocations";
import { cn } from "../lib/utils";
import { SettingsVistoriaClearCalendarModal } from "./settings-vistoria-clear-calendar-modal";
import { DesktopDriverLocationsMapHeaderButton } from "./desktop-driver-locations-map";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type SavePeriodMode = "full" | "month" | "year";
type FirebaseActivationStrategy = "push-local-to-firebase" | "use-remote-as-source";
type AlarmesConfig = {
  beforeDepartureEnabled: boolean;
  beforeDepartureMinutes: number;
  beforeDepartureSound: "som1" | "som2" | "som3" | "som4" | "som5";
  vistoriaPendenteEnabled: boolean;
  vistoriaPendenteTime: string;
  vistoriaPendenteSound: "som1" | "som2" | "som3" | "som4" | "som5";
};

const SETTINGS_SECTIONS = [
  { id: "settings-sync", label: "Modo de sincronização" },
  { id: "settings-senha-km", label: "Senha — KM e chegada" },
  { id: "settings-saidas", label: "Saídas" },
  { id: "settings-email-pdf", label: "E-mail do relatório PDF" },
  { id: "settings-alarmes", label: "Alarmes" },
  { id: "settings-mobile-motoristas", label: "Mobile — motoristas" },
  {
    id: "settings-rastreamento-gps",
    label: "Mobile — rastreamento (GPS)",
  },
  { id: "settings-vistoria-cal", label: "Vistoria — calendário" },
  { id: "settings-zona-risco", label: "Zona de risco" },
] as const;

const SETTINGS_PANEL_CLASS =
  "space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm sm:p-5";

const ALARMES_CONFIG_KEY = "sot_alarmes_config_v1";
const DEFAULT_ALARMES_CONFIG: AlarmesConfig = {
  beforeDepartureEnabled: false,
  beforeDepartureMinutes: 15,
  beforeDepartureSound: "som1",
  vistoriaPendenteEnabled: false,
  vistoriaPendenteTime: "14:00",
  vistoriaPendenteSound: "som1",
};

function loadAlarmesConfig(): AlarmesConfig {
  if (typeof localStorage === "undefined") return DEFAULT_ALARMES_CONFIG;
  try {
    const raw = localStorage.getItem(ALARMES_CONFIG_KEY);
    if (!raw) return DEFAULT_ALARMES_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AlarmesConfig>;
    const minutesNum = Number(parsed.beforeDepartureMinutes);
    const beforeDepartureMinutes =
      Number.isFinite(minutesNum) && minutesNum >= 0 ? Math.floor(minutesNum) : DEFAULT_ALARMES_CONFIG.beforeDepartureMinutes;
    const vistoriaPendenteTime =
      typeof parsed.vistoriaPendenteTime === "string" && /^\d{2}:\d{2}$/.test(parsed.vistoriaPendenteTime)
        ? parsed.vistoriaPendenteTime
        : DEFAULT_ALARMES_CONFIG.vistoriaPendenteTime;
    const isValidSound = (s: unknown): s is AlarmesConfig["beforeDepartureSound"] =>
      s === "som1" || s === "som2" || s === "som3" || s === "som4" || s === "som5";
    return {
      beforeDepartureEnabled: Boolean(parsed.beforeDepartureEnabled),
      beforeDepartureMinutes,
      beforeDepartureSound: isValidSound(parsed.beforeDepartureSound)
        ? parsed.beforeDepartureSound
        : DEFAULT_ALARMES_CONFIG.beforeDepartureSound,
      vistoriaPendenteEnabled: Boolean(parsed.vistoriaPendenteEnabled),
      vistoriaPendenteTime,
      vistoriaPendenteSound: isValidSound(parsed.vistoriaPendenteSound)
        ? parsed.vistoriaPendenteSound
        : DEFAULT_ALARMES_CONFIG.vistoriaPendenteSound,
    };
  } catch {
    return DEFAULT_ALARMES_CONFIG;
  }
}

function currentMonthInputValue() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function filterDeparturesForSave(
  rows: DepartureRecord[],
  mode: SavePeriodMode,
  year: number,
  month: number,
): { selected: DepartureRecord[]; skippedNoDate: number } {
  if (mode === "full") return { selected: rows, skippedNoDate: 0 };
  const selected: DepartureRecord[] = [];
  let skippedNoDate = 0;
  for (const r of rows) {
    const d = getDepartureReferenceDate(r);
    if (!d) {
      skippedNoDate++;
      continue;
    }
    if (mode === "year") {
      if (d.getFullYear() === year) selected.push(r);
    } else {
      if (d.getFullYear() === year && d.getMonth() + 1 === month) selected.push(r);
    }
  }
  return { selected, skippedNoDate };
}

// ─── Editor placa→tipo de viatura ──────────────────────────────────────────
// Componente isolado para manter o `SettingsPage` legível. Mostra todas as
// placas cadastradas (administrativas + ambulâncias) em duas colunas, cada
// uma com um selector de tipo (Carro / Ambulância / Caminhão) e preview SVG
// da silhueta resultante.
type VehicleTypeByPlacaEditorProps = {
  catalog: CatalogItemsState;
  value: VehicleTypeByPlaca;
  onChange: (next: VehicleTypeByPlaca) => void;
};

function VehicleTypeByPlacaEditor({
  catalog,
  value,
  onChange,
}: VehicleTypeByPlacaEditorProps) {
  const placas = useMemo(() => {
    // Lista combinada admin + ambulâncias, ordenada alfabeticamente,
    // anotada com a categoria de origem para sugerir um tipo por defeito.
    const seen = new Set<string>();
    type Row = { placa: string; defaultType: VehicleType };
    const rows: Row[] = [];
    for (const p of catalog.viaturasAdministrativas ?? []) {
      const t = p.trim();
      if (!t) continue;
      const key = normalizePlacaKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ placa: t, defaultType: heuristicVehicleTypeFromText(t) });
    }
    for (const p of catalog.ambulancias ?? []) {
      const t = p.trim();
      if (!t) continue;
      const key = normalizePlacaKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ placa: t, defaultType: "ambulance" });
    }
    rows.sort((a, b) => a.placa.localeCompare(b.placa, "pt-BR"));
    return rows;
  }, [catalog.viaturasAdministrativas, catalog.ambulancias]);

  // ─── Auto-commit dos defaults ─────────────────────────────────────────────
  // Quando o catálogo tem placas que ainda NÃO estão no mapa guardado,
  // adiciona-as com o defaultType (ambulância para placas em `ambulancias`,
  // carro para administrativas/heurística). Isto garante que "o que o
  // utilizador vê na UI é o que está guardado" — sem isto, abrir a página
  // mostra defaults pré-selecionados que parecem guardados mas só ficam
  // guardados se o utilizador clicar manualmente em cada dropdown.
  //
  // O `vehicleTypeFirstSyncRef` no pai garante que isto só corre DEPOIS do
  // 1.º snapshot do Firestore chegar — portanto não sobrescreve dados.
  useEffect(() => {
    const missing: Array<[string, VehicleType]> = [];
    for (const { placa, defaultType } of placas) {
      const key = normalizePlacaKey(placa);
      if (!key) continue;
      if (!(key in value)) missing.push([key, defaultType]);
    }
    if (missing.length === 0) return;
    const next = { ...value };
    for (const [k, t] of missing) next[k] = t;
    onChange(next);
    // Deliberadamente sem `value`/`onChange` nas deps — só queremos correr
    // quando o catálogo de placas muda, e referenciamos `value` snapshot via
    // closure (o auto-commit é idempotente: se já foi feito, missing fica []).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placas]);

  if (placas.length === 0) {
    return (
      <p className="mt-3 text-xs italic text-[hsl(var(--muted-foreground))]">
        Nenhuma placa cadastrada ainda. Adiciona placas em <strong>Aba Listas → Viaturas</strong> e elas aparecerão aqui.
      </p>
    );
  }

  function setTypeForPlaca(placa: string, type: VehicleType) {
    const key = normalizePlacaKey(placa);
    if (!key) return;
    onChange({ ...value, [key]: type });
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {placas.map(({ placa, defaultType }) => {
        const key = normalizePlacaKey(placa);
        const current = value[key] ?? defaultType;
        return (
          <div
            key={key}
            className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5"
          >
            <div className="shrink-0">
              <VehicleIcon variant={current} size={26} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                {placa}
              </p>
              <select
                value={current}
                onChange={(e) => setTypeForPlaca(placa, e.target.value as VehicleType)}
                className="mt-0.5 h-7 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1 text-xs text-[hsl(var(--foreground))]"
                aria-label={`Tipo de viatura para ${placa}`}
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VEHICLE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsPage() {
  const { departures, mergeDeparturesFromBackup, clearAllDepartures } = useDepartures();
  const { items } = useCatalogItems();
  const { firebaseOnlyEnabled, setFirebaseOnlyEnabled } = useSyncPreference();
  const { email: reportEmailStored, setEmail: setReportEmailStored } = useDeparturesReportEmail();
  const [reportEmailDest, setReportEmailDest] = useState(reportEmailStored);
  useEffect(() => {
    setReportEmailDest(reportEmailStored);
  }, [reportEmailStored]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fullBackupFileInputRef = useRef<HTMLInputElement>(null);
  const firebaseImportBackupFileInputRef = useRef<HTMLInputElement>(null);
  const [savePeriodMode, setSavePeriodMode] = useState<SavePeriodMode>("full");
  const [saveMonthValue, setSaveMonthValue] = useState(currentMonthInputValue);
  const [saveYearValue, setSaveYearValue] = useState(() => String(new Date().getFullYear()));
  const [fullBackupBusy, setFullBackupBusy] = useState(false);
  const [firebaseImportBackupBusy, setFirebaseImportBackupBusy] = useState(false);
  const [firebaseModeBusy, setFirebaseModeBusy] = useState(false);
  const [firebaseActivationStrategy, setFirebaseActivationStrategy] =
    useState<FirebaseActivationStrategy>("push-local-to-firebase");
  const [backupPreviewOpen, setBackupPreviewOpen] = useState(false);
  const [preparedBackup, setPreparedBackup] = useState<FirebaseFullBackup | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [detalheServicoBundle, setDetalheServicoBundle] = useState<DetalheServicoBundle | null>(null);
  const [vistoriaCloudTick, setVistoriaCloudTick] = useState(0);
  const [vistoriaClearModalOpen, setVistoriaClearModalOpen] = useState(false);
  const [kmSenhaNova, setKmSenhaNova] = useState("");
  const [kmSenhaConfirm, setKmSenhaConfirm] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<string>(SETTINGS_SECTIONS[0].id);
  const [alarmesConfig, setAlarmesConfig] = useState<AlarmesConfig>(() => loadAlarmesConfig());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (!isNotificationSupported()) return "unsupported";
    return Notification.permission;
  });
  const [alarmPreviewTarget, setAlarmPreviewTarget] = useState<"beforeDeparture" | "vistoriaPendente" | null>(null);
  const alarmPreviewTimerRef = useRef<number | null>(null);
  const [mobileMotoristaCreds, setMobileMotoristaCreds] = useState<MobileMotoristaCredential[]>(
    () => loadMobileMotoristaCredentials(),
  );
  const [mobileCredMotorista, setMobileCredMotorista] = useState("");
  const [mobileCredSenha, setMobileCredSenha] = useState("");
  const [rastreamentoMotoristas, setRastreamentoMotoristas] = useState<RastreamentoMotoristasPayload>(() =>
    loadRastreamentoMotoristasFromLocalStorage(),
  );
  const [vehicleTypeByPlaca, setVehicleTypeByPlaca] = useState<VehicleTypeByPlaca>(() =>
    loadVehicleTypeByPlacaFromLocalStorage(),
  );
  const [clearDriverMapBusy, setClearDriverMapBusy] = useState(false);
  /**
   * Estado da remoção manual de **uma** placa do mapa (select + botão dentro
   * da secção «Mobile — rastreamento (GPS)»). `placaParaExcluirDoMapa` é o
   * valor seleccionado no `<select>`; `excluirPlacaDoMapaBusy` bloqueia o
   * botão durante a chamada à Cloud Function de remoção.
   */
  const [placaParaExcluirDoMapa, setPlacaParaExcluirDoMapa] = useState("");
  const [excluirPlacaDoMapaBusy, setExcluirPlacaDoMapaBusy] = useState(false);
  /**
   * Lista em tempo real (Firestore `onSnapshot`) das placas actualmente
   * presentes no mapa. Só subscreve enquanto a secção está aberta para
   * evitar listeners desnecessários nas outras secções.
   */
  const { pins: driverActivePins } = useDriverActiveLocations(
    activeSectionId === "settings-rastreamento-gps" && isFirebaseConfigured(),
  );
  const placasNoMapaOrdenadas = useMemo(() => {
    const set = new Set<string>();
    for (const p of driverActivePins) {
      const t = p.placa.trim();
      if (t) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [driverActivePins]);

  const vistoriaCloudSnapshot = useMemo(() => getVistoriaCloudState(), [vistoriaCloudTick]);

  useEffect(() => {
    ensureVistoriaCloudStateSyncStarted();
    const unsub = subscribeVistoriaCloudStateChange(() => setVistoriaCloudTick((t) => t + 1));
    return () => unsub();
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    if (isOnline && isFirebaseOnlyOnlineActive()) {
      void (async () => {
        try {
          await ensureFirebaseAuth();
          if (cancelled) return;
          unsub = subscribeSotStateDoc(
            SOT_STATE_DOC.detalheServico,
            (payload) => {
              if (cancelled) return;
              setDetalheServicoBundle(normalizeDetalheServicoBundle(payload));
            },
            (err) => console.error("[SOT] Firestore detalhe serviço (settings):", err),
            { ignoreCachedSnapshotWhenOnline: true },
          );
        } catch (e) {
          console.error("[SOT] Firebase auth (detalhe serviço settings):", e);
          if (cancelled) return;
          void loadDetalheServicoBundleFromIdb().then((b) => {
            if (!cancelled) setDetalheServicoBundle(b);
          });
        }
      })();
    } else {
      void loadDetalheServicoBundleFromIdb().then((b) => {
        if (!cancelled) setDetalheServicoBundle(b);
      });
    }
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [isOnline]);

  const administrativas = useMemo(
    () => departures.filter((d) => d.tipo === "Administrativa"),
    [departures],
  );
  const motoristasCatalogo = useMemo(
    () => [...new Set(items.motoristas.map((m) => m.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [items.motoristas],
  );

  useEffect(() => {
    try {
      localStorage.setItem(ALARMES_CONFIG_KEY, JSON.stringify(alarmesConfig));
    } catch {
      /* ignore */
    }
  }, [alarmesConfig]);
  useEffect(() => {
    if (!isOnline || !isFirebaseConfigured()) return;
    void setSotStateDocWithRetry(SOT_STATE_DOC.alarmesConfig, alarmesConfig).catch((err) => {
      console.error("[SOT] salvar alarmesConfig no Firebase:", err);
    });
  }, [alarmesConfig, isOnline]);

  useEffect(() => {
    persistRastreamentoMotoristasToLocalStorage(rastreamentoMotoristas);
  }, [rastreamentoMotoristas]);

  useEffect(() => {
    if (!isOnline || !isFirebaseConfigured()) return;
    const payload = normalizeRastreamentoMotoristasPayload(rastreamentoMotoristas);
    void setSotStateDocWithRetry(SOT_STATE_DOC.rastreamentoMotoristas, payload).catch((err) => {
      console.error("[SOT] salvar rastreamentoMotoristas no Firebase:", err);
    });
  }, [rastreamentoMotoristas, isOnline]);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    if (isOnline && isFirebaseConfigured()) {
      void (async () => {
        try {
          await ensureFirebaseAuth();
          if (cancelled) return;
          unsub = subscribeSotStateDoc(
            SOT_STATE_DOC.rastreamentoMotoristas,
            (payload) => {
              if (cancelled) return;
              if (payload == null) return;
              const next = normalizeRastreamentoMotoristasPayload(payload);
              setRastreamentoMotoristas(next);
              persistRastreamentoMotoristasToLocalStorage(next);
            },
            (err) => console.error("[SOT] Firestore rastreamentoMotoristas (settings):", err),
          );
        } catch (e) {
          console.error("[SOT] Firebase auth (rastreamentoMotoristas):", e);
        }
      })();
    }
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [isOnline]);

  // ─── Tipo de viatura por placa (espelho LS + Firestore) ────────────────────
  // CRÍTICO: não permitir escrever ao Firestore antes do PRIMEIRO snapshot do
  // subscribe chegar. Caso contrário, montar a página com state vazio ({})
  // antes do snapshot ser lido sobrescreveria o documento existente no
  // Firestore, apagando a configuração feita noutro dispositivo.
  const vehicleTypeFirstSyncRef = useRef(false);

  useEffect(() => {
    persistVehicleTypeByPlacaToLocalStorage(vehicleTypeByPlaca);
  }, [vehicleTypeByPlaca]);

  useEffect(() => {
    if (!isOnline || !isFirebaseConfigured()) return;
    if (!vehicleTypeFirstSyncRef.current) return; // aguarda 1.º snapshot
    const payload = normalizeVehicleTypeByPlacaPayload(vehicleTypeByPlaca);
    void setSotStateDocWithRetry(SOT_STATE_DOC.vehicleTypeByPlaca, payload).catch((err) => {
      console.error("[SOT] salvar vehicleTypeByPlaca no Firebase:", err);
    });
  }, [vehicleTypeByPlaca, isOnline]);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    if (isOnline && isFirebaseConfigured()) {
      void (async () => {
        try {
          await ensureFirebaseAuth();
          if (cancelled) return;
          unsub = subscribeSotStateDoc(
            SOT_STATE_DOC.vehicleTypeByPlaca,
            (payload) => {
              if (cancelled) return;
              // Mesmo se payload for null (doc inexistente), libertamos a
              // flag de sync para permitir a 1ª escrita do utilizador.
              vehicleTypeFirstSyncRef.current = true;
              if (payload == null) return;
              const next = normalizeVehicleTypeByPlacaPayload(payload);
              setVehicleTypeByPlaca(next);
              persistVehicleTypeByPlacaToLocalStorage(next);
            },
            (err) => console.error("[SOT] Firestore vehicleTypeByPlaca (settings):", err),
          );
        } catch (e) {
          console.error("[SOT] Firebase auth (vehicleTypeByPlaca):", e);
        }
      })();
    } else {
      // Offline ou Firebase não configurado — sem sync remoto, libertamos
      // a flag para que mudanças locais sejam persistidas (quando online).
      vehicleTypeFirstSyncRef.current = true;
    }
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [isOnline]);

  function playAlarmBeepSample(sound: AlarmesConfig["beforeDepartureSound"]) {
    try {
      const audioContext =
        new (window.AudioContext ||
          (
            window as unknown as {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext)();
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = sound === "som2" ? "triangle" : sound === "som3" ? "square" : "sine";
      const baseFrequency =
        sound === "som1" ? 880 : sound === "som2" ? 740 : sound === "som3" ? 988 : sound === "som4" ? 660 : 523;
      const duration = sound === "som5" ? 0.42 : sound === "som3" ? 0.24 : 0.3;
      oscillator.frequency.setValueAtTime(baseFrequency, now);
      if (sound === "som4") {
        oscillator.frequency.linearRampToValueAtTime(baseFrequency * 1.28, now + duration * 0.7);
      } else if (sound === "som5") {
        oscillator.frequency.linearRampToValueAtTime(baseFrequency * 0.82, now + duration);
      }
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
      window.setTimeout(() => {
        void audioContext.close();
      }, Math.max(500, Math.ceil((duration + 0.1) * 1000)));
    } catch {
      /* ignore */
    }
  }

  function stopAlarmPreview() {
    if (alarmPreviewTimerRef.current !== null) {
      window.clearInterval(alarmPreviewTimerRef.current);
      alarmPreviewTimerRef.current = null;
    }
    setAlarmPreviewTarget(null);
  }

  function startAlarmPreview(target: "beforeDeparture" | "vistoriaPendente", sound: AlarmesConfig["beforeDepartureSound"]) {
    stopAlarmPreview();
    playAlarmBeepSample(sound);
    alarmPreviewTimerRef.current = window.setInterval(() => {
      playAlarmBeepSample(sound);
    }, 950);
    setAlarmPreviewTarget(target);
  }

  function toggleAlarmPreview(target: "beforeDeparture" | "vistoriaPendente", sound: AlarmesConfig["beforeDepartureSound"]) {
    if (alarmPreviewTarget === target) {
      stopAlarmPreview();
      return;
    }
    startAlarmPreview(target, sound);
  }

  async function handleEnableNotifications() {
    const permission = await requestNotificationPermissionIfNeeded();
    setNotifPermission(permission);
    if (permission === "granted") {
      await ensureMobilePushServiceWorkerRegistered();
      window.alert("Notificações ativadas neste dispositivo.");
      return;
    }
    if (permission === "denied") {
      window.alert("As notificações estão bloqueadas. Permita no navegador/sistema para receber alarmes com a tela bloqueada.");
      return;
    }
    if (permission === "unsupported") {
      window.alert("Este navegador não suporta notificações push.");
    }
  }

  async function handleTestNotification() {
    if (notifPermission !== "granted") {
      await handleEnableNotifications();
      return;
    }
    await showLocalAlarmNotification("Teste de alarme SOT 2.0", {
      body: "Notificação de teste recebida com sucesso.",
      tag: "sot-mobile-test",
      requireInteraction: true,
    });
  }

  useEffect(() => () => stopAlarmPreview(), []);
  const ambulancias = useMemo(
    () => departures.filter((d) => d.tipo === "Ambulância"),
    [departures],
  );

  function handleSalvarSaidas() {
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    if (savePeriodMode === "month") {
      const parts = saveMonthValue.split("-");
      year = Number(parts[0]);
      month = Number(parts[1]);
      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        window.alert("Selecione um mês/ano válidos.");
        return;
      }
    } else if (savePeriodMode === "year") {
      year = Number(saveYearValue);
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        window.alert("Informe um ano válido (2000–2100).");
        return;
      }
    }

    const { selected, skippedNoDate } = filterDeparturesForSave(
      departures,
      savePeriodMode,
      year,
      month,
    );

    if (selected.length === 0) {
      window.alert(
        "Nenhuma saída no período selecionado. Verifique o filtro ou se as datas de saída/pedido estão preenchidas.",
      );
      return;
    }

    const payload: DeparturesExportFile = {
      version: 1,
      tipo: "saidas",
      exportadoEm: new Date().toISOString(),
      saidas: selected,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    let name: string;
    if (savePeriodMode === "full") {
      name = `sot_saidas_completo_${stamp}.json`;
    } else if (savePeriodMode === "year") {
      name = `Saídas (${year}).json`;
    } else {
      name = `Saídas (${String(month).padStart(2, "0")}-${year}).json`;
    }
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);

    if (skippedNoDate > 0 && savePeriodMode !== "full") {
      window.alert(
        `${selected.length} saída(s) exportada(s). ${skippedNoDate} registro(s) sem data de saída/pedido foram ignorados pelo filtro.`,
      );
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as unknown;
        const rows = parseDeparturesFromImportFile(data);
        if (rows.length === 0) {
          window.alert("Nenhuma saída válida foi encontrada no arquivo.");
          return;
        }
        mergeDeparturesFromBackup(rows);
        window.alert(
          `${rows.length} registro(s) processado(s). Itens com id já existente foram mantidos; apenas entradas novas foram adicionadas.`,
        );
      } catch {
        window.alert("Não foi possível ler o arquivo. Verifique se é um JSON válido.");
      }
    };
    reader.readAsText(file);
  }

  function handleAbrirModalLimparVistoriasCalendario() {
    if (!isVistoriaCloudStateHydrated()) {
      window.alert("Aguarde a sincronização dos dados da Vistoria (Firebase).");
      return;
    }
    if (!detalheServicoBundle) {
      window.alert(
        "Ainda não foi possível carregar o detalhe de serviço (escala). Verifique a ligação à rede e tente de novo.",
      );
      return;
    }
    setVistoriaClearModalOpen(true);
  }

  function handleExcluirTodas() {
    if (
      !window.confirm(
        "Excluir TODAS as saídas (administrativas e ambulância)? Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    clearAllDepartures();
  }

  async function handleAbrirPreviewBackupGeral() {
    try {
      setFullBackupBusy(true);
      const backup = await exportFullBackupFromFirebase();
      setPreparedBackup(backup);
      setBackupPreviewOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar backup geral do Firebase.";
      window.alert(msg);
    } finally {
      setFullBackupBusy(false);
    }
  }

  function handleConfirmarDownloadBackupGeral() {
    if (!preparedBackup) return;
    const blob = new Blob([JSON.stringify(preparedBackup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `sot_backup_geral_firebase_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBackupPreviewOpen(false);
  }

  function handleCarregarBackupGeralClick() {
    if (firebaseOnlyEnabled) {
      window.alert("Desative 'Usar somente dados do Firebase' para carregar backup local.");
      return;
    }
    fullBackupFileInputRef.current?.click();
  }

  function handleSalvarSenhaKmListas() {
    const a = kmSenhaNova.trim();
    const b = kmSenhaConfirm.trim();
    if (a.length < 4) {
      window.alert("A senha deve ter pelo menos 4 caracteres.");
      return;
    }
    if (a !== b) {
      window.alert("A confirmação não coincide com a nova senha.");
      return;
    }
    setKmEditPassword(a);
    notifyKmEditPasswordChangedExternally();
    setKmSenhaNova("");
    setKmSenhaConfirm("");
    window.alert(
      "Senha guardada. Será pedida ao alterar KM saída, KM chegada ou hora de chegada nas abas Saídas Administrativas e Ambulância.",
    );
  }

  function handleSaveMobileMotoristaCred() {
    const motorista = mobileCredMotorista.trim();
    const senha = mobileCredSenha.trim();
    if (!motorista) {
      window.alert("Selecione um motorista cadastrado.");
      return;
    }
    if (!senha) {
      window.alert("Digite a senha do motorista.");
      return;
    }
    const next = upsertMobileMotoristaCredential({ motorista, senha });
    setMobileMotoristaCreds(next);
    setMobileCredSenha("");
    window.alert("Credencial mobile guardada.");
  }

  function handleRemoveMobileMotoristaCred(motorista: string) {
    const next = removeMobileMotoristaCredential(motorista);
    setMobileMotoristaCreds(next);
  }

  /**
   * Remove **uma** placa específica da coleção `driver_active_locations`
   * via a mesma Cloud Function usada pelo «Iniciar saída» (corpo
   * `{ clear: true, placa }`). É a versão manual do que o cartão já faz
   * automaticamente ao rubricar a saída no mobile — útil para limpar
   * pinos órfãos sem apagar tudo.
   */
  async function handleExcluirPlacaDoMapa() {
    const placa = placaParaExcluirDoMapa.trim();
    if (!placa) {
      window.alert("Selecione a viatura a remover do mapa.");
      return;
    }
    if (!isFirebaseConfigured() || !resolveDriverLocationPostUrl()) {
      window.alert(
        "Firebase ou URL da função de localização não estão disponíveis. Defina o projeto (VITE_FIREBASE_*) e, em produção, VITE_DRIVER_LOCATION_POST_URL se usar Cloud Run.",
      );
      return;
    }
    if (
      !window.confirm(
        `Remover a viatura ${placa} do mapa em tempo real? Se essa viatura ainda tiver GPS activo, voltará a aparecer no próximo envio de coordenadas.`,
      )
    ) {
      return;
    }
    setExcluirPlacaDoMapaBusy(true);
    try {
      await clearDriverActiveLocation(placa);
      setPlacaParaExcluirDoMapa("");
      window.alert(
        `Viatura ${placa} removida do mapa. A actualização propaga em tempo real para todos os browsers ligados ao Firebase.`,
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setExcluirPlacaDoMapaBusy(false);
    }
  }

  async function handleLimparTodasLocalizacoesMapa() {
    if (!isFirebaseConfigured() || !resolveDriverLocationPostUrl()) {
      window.alert(
        "Firebase ou URL da função de localização não estão disponíveis. Defina o projeto (VITE_FIREBASE_*) e, em produção, VITE_DRIVER_LOCATION_POST_URL se usar Cloud Run.",
      );
      return;
    }
    if (
      !window.confirm(
        "Remover todas as posições do mapa em tempo real (todas as viaturas)? Quem tiver «Iniciar saída» e GPS activo voltará a aparecer no próximo envio de coordenadas.",
      )
    ) {
      return;
    }
    setClearDriverMapBusy(true);
    try {
      const n = await clearAllDriverActiveLocationsOnServer();
      window.alert(
        n === 0
          ? "Nenhuma posição estava registada no mapa."
          : `Foram removidas ${n} posição(ões). O mapa actualiza em tempo real para todos os browsers ligados ao Firebase.`,
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setClearDriverMapBusy(false);
    }
  }

  async function handleFirebaseOnlyToggle(next: boolean) {
    if (!next) {
      setFirebaseOnlyEnabled(false);
      return;
    }
    if (!isFirebaseConfigured()) {
      window.alert("Firebase não está configurado neste build.");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      window.alert("É necessário estar online para enviar os dados locais para o Firebase.");
      return;
    }
    setFirebaseModeBusy(true);
    try {
      if (firebaseActivationStrategy === "push-local-to-firebase") {
        await pushLocalOperationalStateToFirebase();
      }
      setFirebaseOnlyEnabled(true);
      window.alert(
        firebaseActivationStrategy === "push-local-to-firebase"
          ? "Estratégia aplicada: enviar dados locais para o Firebase. O modo «somente Firebase» foi ativado."
          : "Estratégia aplicada: usar dados remotos como fonte da verdade (sem enviar o estado local agora). O modo «somente Firebase» foi ativado.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(
        `Não foi possível enviar tudo para o Firebase. O modo local mantém-se ativo.\n\nDetalhe: ${msg}`,
      );
    } finally {
      setFirebaseModeBusy(false);
    }
  }

  function handleFullBackupFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (firebaseOnlyEnabled) {
      window.alert("Carregamento bloqueado: use apenas com o modo local ativo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          setFullBackupBusy(true);
          const raw = JSON.parse(String(reader.result)) as unknown;
          const backup = parseFullBackupJson(raw);
          await restoreFullBackupToLocal(backup);
          window.alert(
            "Backup geral carregado na memória local (inclui Detalhe de Serviço e Vistoria). A página será recarregada.",
          );
          window.location.reload();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Falha ao carregar backup geral.";
          window.alert(msg);
        } finally {
          setFullBackupBusy(false);
        }
      })();
    };
    reader.readAsText(file);
  }

  function handleFirebaseImportBackupClick() {
    if (!isFirebaseConfigured()) {
      window.alert("Firebase não está configurado neste build.");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      window.alert("É necessário estar online para importar para o Firebase.");
      return;
    }
    const ok = window.confirm(
      "ATENÇÃO: Esta operação remove todas as saídas na nuvem e substitui cada documento em sot_state (Detalhe de Serviço, Vistoria, catálogos, etc.) pelos dados do ficheiro JSON.\n\nTodos os utilizadores passam a ver estes dados. Continuar?",
    );
    if (!ok) return;
    firebaseImportBackupFileInputRef.current?.click();
  }

  function handleFirebaseImportBackupFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          setFirebaseImportBackupBusy(true);
          const raw = JSON.parse(String(reader.result)) as unknown;
          const backup = parseFullBackupJson(raw);
          await importFullBackupToFirebase(backup);
          window.alert(
            "Backup importado para o Firebase. A página será recarregada para atualizar calendário de vistoria e abas.",
          );
          window.location.reload();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Falha ao importar backup para o Firebase.";
          window.alert(msg);
        } finally {
          setFirebaseImportBackupBusy(false);
        }
      })();
    };
    reader.readAsText(file);
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/15 px-4 py-4 sm:px-6">
          <CardTitle className="text-xl">Configurações</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Preferências de sincronização, exportação, segurança e manutenção dos dados.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col lg:flex-row lg:items-start">
            <nav
              className="shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 px-3 py-3 lg:sticky lg:top-4 lg:w-56 lg:self-start lg:border-b-0 lg:border-r lg:px-4 lg:py-6"
              aria-label="Secções das configurações"
            >
              <p className="mb-2 hidden text-[0.65rem] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] lg:block">
                Nesta página
              </p>
              <ul className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
                {SETTINGS_SECTIONS.map(({ id, label }) => {
                  const active = activeSectionId === id;
                  return (
                    <li key={id} className="lg:w-full">
                      <button
                        type="button"
                        onClick={() => setActiveSectionId(id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full rounded-lg px-3 py-2 text-left text-xs transition-colors sm:text-sm",
                          active
                            ? "border border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/12 font-semibold text-[hsl(var(--primary))]"
                            : "border border-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/60",
                        )}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="min-h-[min(28rem,70vh)] min-w-0 flex-1 p-4 sm:p-6">
              {activeSectionId === "settings-sync" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-sync">
                <h3 id="settings-heading-sync" className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Modo de sincronização
                </h3>
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-[hsl(var(--foreground))]"
              htmlFor="firebase-activation-strategy"
            >
              Estratégia ao ativar «somente Firebase»
            </label>
            <select
              id="firebase-activation-strategy"
              value={firebaseActivationStrategy}
              disabled={firebaseModeBusy || firebaseOnlyEnabled}
              onChange={(e) =>
                setFirebaseActivationStrategy(e.target.value as FirebaseActivationStrategy)
              }
              className="h-10 w-full max-w-xl rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
            >
              <option value="push-local-to-firebase">
                Enviar estado local para o Firebase (atualizar nuvem antes de ativar)
              </option>
              <option value="use-remote-as-source">
                Não enviar local agora; usar o Firebase remoto como fonte da verdade
              </option>
            </select>
          </div>
          <label className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] p-3">
            <input
              type="checkbox"
              checked={firebaseOnlyEnabled}
              disabled={firebaseModeBusy}
              onChange={(e) => void handleFirebaseOnlyToggle(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">
              {firebaseModeBusy
                ? "A enviar dados locais para o Firebase…"
                : "Usar somente dados do Firebase (local apenas como cache de leitura)"}
            </span>
          </label>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            A estratégia acima define o comportamento no momento da ativação. Quando ativo: leitura/escrita na
            nuvem (cache local apenas para leitura/continuidade). Quando desativado: apenas dados locais, sem
            sincronização com a nuvem.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              type="button"
              variant="default"
              onClick={handleAbrirPreviewBackupGeral}
              disabled={fullBackupBusy || firebaseImportBackupBusy}
            >
              {fullBackupBusy ? "Processando..." : "Backup geral do Firebase"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCarregarBackupGeralClick}
              disabled={firebaseOnlyEnabled || fullBackupBusy || firebaseImportBackupBusy}
            >
              Carregar backup geral (local)
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red-600 text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={handleFirebaseImportBackupClick}
              disabled={
                !isFirebaseConfigured() || firebaseImportBackupBusy || fullBackupBusy || !isOnline
              }
            >
              {firebaseImportBackupBusy ? "A importar..." : "Importar backup para o Firebase"}
            </Button>
            <input
              ref={fullBackupFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFullBackupFileChange}
            />
            <input
              ref={firebaseImportBackupFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFirebaseImportBackupFileChange}
            />
          </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  O carregamento do backup geral só é permitido em modo local para evitar conflito com a nuvem. Depois,
                  pode usar «Enviar estado local para o Firebase» para publicar. «Importar backup para o Firebase»
                  envia o JSON diretamente à nuvem (apaga saídas remotas e substitui <code className="text-xs">sot_state</code>
                  ), atualizando calendário de vistoria (verde/vermelho), Detalhe de Serviço, responsabilidades, estado e
                  prioridades para todos os utilizadores.
                </p>
              </section>
              ) : null}

              {activeSectionId === "settings-senha-km" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-senha">
                <h3 id="settings-heading-senha" className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Senha — edição de KM e hora de chegada (listas)
                </h3>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            Nas abas <strong>Saídas Administrativas</strong> e <strong>Ambulância</strong>, os campos{" "}
            <strong>KM saída</strong>, <strong>KM chegada</strong> e <strong>Chegada</strong> (hora) só podem ser
            alterados após introduzir esta senha (válida até fechar o separador do navegador). Valor inicial:{" "}
            <code className="rounded bg-[hsl(var(--muted))]/50 px-1 font-mono">{DEFAULT_KM_EDIT_PASSWORD}</code>.
          </p>
          <div className="flex max-w-md flex-col gap-2">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="km-senha-nova">
              Nova senha
            </label>
            <input
              id="km-senha-nova"
              type="password"
              autoComplete="new-password"
              value={kmSenhaNova}
              onChange={(e) => setKmSenhaNova(e.target.value)}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 font-mono text-sm"
            />
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="km-senha-confirm">
              Confirmar senha
            </label>
            <input
              id="km-senha-confirm"
              type="password"
              autoComplete="new-password"
              value={kmSenhaConfirm}
              onChange={(e) => setKmSenhaConfirm(e.target.value)}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 font-mono text-sm"
            />
                <Button type="button" variant="default" className="mt-1 w-fit" onClick={handleSalvarSenhaKmListas}>
                  Guardar senha
                </Button>
              </div>
              </section>
              ) : null}

              {activeSectionId === "settings-saidas" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-saidas">
                <h3 id="settings-heading-saidas" className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Saídas
                </h3>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            <strong>Salvar</strong> gera um arquivo JSON com as saídas (administrativas e ambulância) conforme o{" "}
            <strong>período</strong> escolhido. O filtro usa a <strong>data da saída</strong>; se estiver vazia, usa a{" "}
            <strong>data do pedido</strong>.
          </p>
          <div className="flex max-w-xl flex-col gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="save-period-mode">
              Período do arquivo
            </label>
            <select
              id="save-period-mode"
              value={savePeriodMode}
              onChange={(e) => setSavePeriodMode(e.target.value as SavePeriodMode)}
              className="h-10 w-full max-w-sm rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
            >
              <option value="full">Completo (todas as saídas)</option>
              <option value="month">Por mês</option>
              <option value="year">Por ano</option>
            </select>
            {savePeriodMode === "month" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[hsl(var(--muted-foreground))]" htmlFor="save-month">
                  Mês e ano
                </label>
                <input
                  id="save-month"
                  type="month"
                  value={saveMonthValue}
                  onChange={(e) => setSaveMonthValue(e.target.value)}
                  className="h-10 w-full max-w-sm rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                />
              </div>
            ) : null}
            {savePeriodMode === "year" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[hsl(var(--muted-foreground))]" htmlFor="save-year">
                  Ano
                </label>
                <input
                  id="save-year"
                  type="number"
                  min={2000}
                  max={2100}
                  step={1}
                  value={saveYearValue}
                  onChange={(e) => setSaveYearValue(e.target.value)}
                  className="h-10 w-full max-w-sm rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                />
              </div>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            <strong>Carregar</strong> aceita o JSON exportado aqui, ou um <strong>backup completo do sistema</strong>{" "}
            (arquivo com <code className="text-xs">viaturasCadastradas</code>, ex. backup do navegador). Nesse caso
            importam-se <strong>todas</strong> as saídas reconhecidas (administrativa e ambulância). Só são{" "}
            <strong>adicionados</strong> registros cujo id ainda não existe; ids já presentes não são substituídos.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="default" onClick={handleSalvarSaidas}>
              Salvar saídas
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              Carregar saídas
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Saídas administrativas: <strong>{administrativas.length}</strong> · Ambulâncias:{" "}
                  <strong>{ambulancias.length}</strong> · Total geral: <strong>{departures.length}</strong>
                </p>
              </section>
              ) : null}

              {activeSectionId === "settings-email-pdf" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-email">
                <h3 id="settings-heading-email" className="text-base font-semibold text-[hsl(var(--foreground))]">
                  E-mail do relatório PDF
                </h3>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            Endereço usado pelo botão <strong>Enviar</strong>: abre o <strong>Gmail na Web</strong> (conta já iniciada no
            navegador) com este destinatário e o assunto <strong>Saídas</strong>. O PDF é descarregado em seguida — o
            Gmail <strong>não permite</strong> anexar ficheiros automaticamente por ligação; anexe o ficheiro descarregado
            (ícone de clip ou arrastar para a janela de novo e-mail).
          </p>
          <div className="flex max-w-xl flex-col gap-2">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="report-email-dest">
              E-mail de destino
            </label>
            <input
              id="report-email-dest"
              type="email"
              autoComplete="email"
              placeholder="exemplo@instituicao.pt"
              value={reportEmailDest}
              onChange={(e) => setReportEmailDest(e.target.value)}
              onBlur={() => setReportEmailStored(reportEmailDest)}
              className="h-10 w-full max-w-md rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                />
              </div>
              </section>
              ) : null}

              {activeSectionId === "settings-alarmes" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-alarmes">
                <h3 id="settings-heading-alarmes" className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Alarmes
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Configure alarmes personalizados por regras operacionais do SOT. As definições desta aba ficam
                  guardadas neste navegador.
                </p>

                <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.08] p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                        Alarme minutos antes de qualquer saída cadastrada
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Dispara antes do horário de cada saída em que o motorista estiver atribuído.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={alarmesConfig.beforeDepartureEnabled}
                      onClick={() =>
                        setAlarmesConfig((prev) => ({
                          ...prev,
                          beforeDepartureEnabled: !prev.beforeDepartureEnabled,
                        }))
                      }
                      className={`relative inline-flex h-7 w-[3.2rem] shrink-0 items-center rounded-full border px-0.5 transition-colors ${
                        alarmesConfig.beforeDepartureEnabled
                          ? "border-emerald-600/45 bg-emerald-500/20"
                          : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          alarmesConfig.beforeDepartureEnabled ? "translate-x-[1.08rem]" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="max-w-xs">
                    <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor="alarme-minutos-saida">
                      Minutos antes da saída
                    </label>
                    <input
                      id="alarme-minutos-saida"
                      type="number"
                      min={0}
                      max={720}
                      value={alarmesConfig.beforeDepartureMinutes}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setAlarmesConfig((prev) => ({
                          ...prev,
                          beforeDepartureMinutes: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0,
                        }));
                      }}
                      className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
                    />
                  </div>
                  <div className="max-w-md">
                    <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor="alarme-som-saida">
                      Som do alarme
                    </label>
                    <div className="mt-1 flex gap-2">
                      <select
                        id="alarme-som-saida"
                        value={alarmesConfig.beforeDepartureSound}
                        onChange={(e) => {
                          const nextSound = e.target.value as AlarmesConfig["beforeDepartureSound"];
                          setAlarmesConfig((prev) => ({
                            ...prev,
                            beforeDepartureSound: nextSound,
                          }));
                          if (alarmPreviewTarget === "beforeDeparture") {
                            startAlarmPreview("beforeDeparture", nextSound);
                          }
                        }}
                        className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
                      >
                        <option value="som1">Som 1</option>
                        <option value="som2">Som 2</option>
                        <option value="som3">Som 3</option>
                        <option value="som4">Som 4</option>
                        <option value="som5">Som 5</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 min-w-[6rem]"
                        onClick={() => toggleAlarmPreview("beforeDeparture", alarmesConfig.beforeDepartureSound)}
                      >
                        {alarmPreviewTarget === "beforeDeparture" ? "Pause" : "Play"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.08] p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                        Alarme de vistoria não realizada
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Dispara no horário definido apenas no dia em que o motorista estiver de serviço com
                        <strong> S</strong> no Detalhe de Serviço e com viaturas vinculadas ainda em vermelho.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={alarmesConfig.vistoriaPendenteEnabled}
                      onClick={() =>
                        setAlarmesConfig((prev) => ({
                          ...prev,
                          vistoriaPendenteEnabled: !prev.vistoriaPendenteEnabled,
                        }))
                      }
                      className={`relative inline-flex h-7 w-[3.2rem] shrink-0 items-center rounded-full border px-0.5 transition-colors ${
                        alarmesConfig.vistoriaPendenteEnabled
                          ? "border-emerald-600/45 bg-emerald-500/20"
                          : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          alarmesConfig.vistoriaPendenteEnabled ? "translate-x-[1.08rem]" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="max-w-xs">
                    <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor="alarme-vistoria-hora">
                      Horário do alarme
                    </label>
                    <input
                      id="alarme-vistoria-hora"
                      type="time"
                      value={alarmesConfig.vistoriaPendenteTime}
                      onChange={(e) =>
                        setAlarmesConfig((prev) => ({
                          ...prev,
                          vistoriaPendenteTime: e.target.value,
                        }))
                      }
                      className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
                    />
                  </div>
                  <div className="max-w-md">
                    <label className="text-xs font-medium text-[hsl(var(--foreground))]" htmlFor="alarme-vistoria-som">
                      Som do alarme
                    </label>
                    <div className="mt-1 flex gap-2">
                      <select
                        id="alarme-vistoria-som"
                        value={alarmesConfig.vistoriaPendenteSound}
                        onChange={(e) => {
                          const nextSound = e.target.value as AlarmesConfig["vistoriaPendenteSound"];
                          setAlarmesConfig((prev) => ({
                            ...prev,
                            vistoriaPendenteSound: nextSound,
                          }));
                          if (alarmPreviewTarget === "vistoriaPendente") {
                            startAlarmPreview("vistoriaPendente", nextSound);
                          }
                        }}
                        className="h-10 min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
                      >
                        <option value="som1">Som 1</option>
                        <option value="som2">Som 2</option>
                        <option value="som3">Som 3</option>
                        <option value="som4">Som 4</option>
                        <option value="som5">Som 5</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 min-w-[6rem]"
                        onClick={() => toggleAlarmPreview("vistoriaPendente", alarmesConfig.vistoriaPendenteSound)}
                      >
                        {alarmPreviewTarget === "vistoriaPendente" ? "Pause" : "Play"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.08] p-3 sm:p-4">
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    Notificações para app em segundo plano/fechado (PWA)
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Para receber avisos com o app fechado, é necessário ativar notificações e configurar envio push no servidor.
                    No Android funciona melhor; no iPhone há restrições do sistema.
                  </p>
                  <p className="text-xs">
                    Estado atual:{" "}
                    <strong>
                      {notifPermission === "granted"
                        ? "Permitido"
                        : notifPermission === "denied"
                          ? "Bloqueado"
                          : notifPermission === "default"
                            ? "Pendente"
                            : "Não suportado"}
                    </strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void handleEnableNotifications()}>
                      Ativar notificações
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void handleTestNotification()}>
                      Testar notificação
                    </Button>
                  </div>
                </div>
              </section>
              ) : null}

              {activeSectionId === "settings-mobile-motoristas" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-mobile-motoristas">
                <h3
                  id="settings-heading-mobile-motoristas"
                  className="text-base font-semibold text-[hsl(var(--foreground))]"
                >
                  Mobile — cadastro de motoristas e senha
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Credenciais usadas pelo fluxo mobile. O motorista deve existir no catálogo.
                </p>
                <div className="grid gap-2 sm:max-w-xl">
                  <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="mobile-motorista">
                    Motorista
                  </label>
                  <select
                    id="mobile-motorista"
                    value={mobileCredMotorista}
                    onChange={(e) => setMobileCredMotorista(e.target.value)}
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
                  >
                    <option value="">— Selecionar —</option>
                    {motoristasCatalogo.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="mobile-senha">
                    Senha
                  </label>
                  <input
                    id="mobile-senha"
                    type="password"
                    value={mobileCredSenha}
                    onChange={(e) => setMobileCredSenha(e.target.value)}
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
                  />
                  <div className="pt-1">
                    <Button type="button" className="w-fit" onClick={handleSaveMobileMotoristaCred}>
                      Guardar credencial
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  {mobileMotoristaCreds.length === 0 ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Nenhuma credencial cadastrada.</p>
                  ) : (
                    mobileMotoristaCreds.map((row) => (
                      <div
                        key={row.motorista.toLowerCase()}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{row.motorista}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            Atualizado em {new Date(row.updatedAt || Date.now()).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveMobileMotoristaCred(row.motorista)}
                        >
                          Remover
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </section>
              ) : null}

              {activeSectionId === "settings-rastreamento-gps" ? (
                <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-rastreamento">
                  <h3
                    id="settings-heading-rastreamento"
                    className="text-base font-semibold text-[hsl(var(--foreground))]"
                  >
                    Rastreamento em tempo real (motoristas)
                  </h3>
                  <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                    Define <strong>somente em minutos</strong> com que periodicidade os motoristas devem enviar a
                    posição ao iniciar uma viagem no mobile. O valor sincroniza no Firebase (<code>sot_state</code> /
                    <code className="text-xs"> rastreamentoMotoristas </code>) para todos os browsers autenticados
                    lerem o mesmo intervalo.
                  </p>

                  <div className="max-w-xs space-y-1">
                    <label
                      className="text-sm font-medium text-[hsl(var(--foreground))]"
                      htmlFor="rastreamento-intervalo-min"
                    >
                      Intervalo entre envios de coordenadas (minutos)
                    </label>
                    <input
                      id="rastreamento-intervalo-min"
                      type="number"
                      min={INTERVALO_RASTREAMENTO_MIN_MINUTOS}
                      max={INTERVALO_RASTREAMENTO_MAX_MINUTOS}
                      step={1}
                      value={rastreamentoMotoristas.intervaloRastreamentoMinutos}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setRastreamentoMotoristas({
                          intervaloRastreamentoMinutos: Number.isFinite(n)
                            ? clampIntervaloRastreamentoMinutos(n)
                            : DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS,
                        });
                      }}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))]"
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Permitido: {INTERVALO_RASTREAMENTO_MIN_MINUTOS} a {INTERVALO_RASTREAMENTO_MAX_MINUTOS} minutos (
                      predefinição {DEFAULT_INTERVALO_RASTREAMENTO_MINUTOS} min).
                    </p>
                    {!isFirebaseConfigured() ? (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Firebase não está configurado: o valor fica apenas neste navegador até configurar sincronização.
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-6 max-w-lg border-t border-[hsl(var(--border))] pt-4">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">Mapa de viaturas (tempo real)</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <p className="min-w-0 flex-1 text-sm text-[hsl(var(--muted-foreground))]">
                        Abre o mapa com as posições enviadas pelos motoristas (placa junto a cada marcador).
                      </p>
                      <DesktopDriverLocationsMapHeaderButton />
                    </div>
                    <div className="mt-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3">
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                        Excluir uma viatura específica do mapa
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                        Escolhe a placa que queres retirar do mapa em tempo real (ex.: pino órfão de uma saída já finalizada).
                        A lista mostra apenas as placas com posição activa neste momento.
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Viatura</span>
                          <select
                            value={placaParaExcluirDoMapa}
                            onChange={(e) => setPlacaParaExcluirDoMapa(e.target.value)}
                            disabled={
                              !isFirebaseConfigured() ||
                              resolveDriverLocationPostUrl() === null ||
                              excluirPlacaDoMapaBusy ||
                              placasNoMapaOrdenadas.length === 0
                            }
                            className="h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Selecionar viatura a remover do mapa"
                          >
                            <option value="">
                              {placasNoMapaOrdenadas.length === 0
                                ? "— Nenhuma viatura no mapa —"
                                : "— Selecionar —"}
                            </option>
                            {placasNoMapaOrdenadas.map((placa) => (
                              <option key={placa} value={placa}>
                                {placa}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 border-red-400/80 text-red-800 hover:bg-red-50 dark:text-red-200 dark:hover:bg-red-950/40"
                          disabled={
                            !isFirebaseConfigured() ||
                            resolveDriverLocationPostUrl() === null ||
                            excluirPlacaDoMapaBusy ||
                            !placaParaExcluirDoMapa
                          }
                          onClick={() => void handleExcluirPlacaDoMapa()}
                        >
                          {excluirPlacaDoMapaBusy ? "A remover…" : "Excluir do mapa"}
                        </Button>
                      </div>
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                      Apaga no Firestore todas as entradas da coleção usada pelo mapa. Útil para limpar posições antigas ou
                      órfãs. Viaturas com rastreamento activo voltam a surgir no envio seguinte.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 border-red-400/80 text-red-800 hover:bg-red-50 dark:text-red-200 dark:hover:bg-red-950/40"
                      disabled={
                        !isFirebaseConfigured() ||
                        resolveDriverLocationPostUrl() === null ||
                        clearDriverMapBusy
                      }
                      onClick={() => void handleLimparTodasLocalizacoesMapa()}
                    >
                      {clearDriverMapBusy ? "A remover…" : "Excluir todas as localizações do mapa"}
                    </Button>
                    {!isFirebaseConfigured() || resolveDriverLocationPostUrl() === null ? (
                      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                        Disponível quando o Firebase e o endpoint da Cloud Function de localização estiverem configurados
                        (como no envio GPS no mobile).
                      </p>
                    ) : null}
                  </div>

                  {/* ─── Tipo de viatura por placa ───────────────────────────
                       Para cada placa cadastrada (administrativa + ambulância),
                       permite escolher entre Carro/Ambulância/Caminhão. O valor
                       sincroniza no Firestore (`sot_state/vehicleTypeByPlaca`)
                       e influencia o ícone mostrado no Google Maps de navegação
                       quando o motorista inicia a saída com aquela placa. */}
                  <div className="mt-6 border-t border-[hsl(var(--border))] pt-4">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                      Tipo de viatura por placa (mapa de navegação)
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                      Escolhe o desenho a usar no Google Maps quando o motorista iniciar uma saída com aquela placa.
                      As 3 silhuetas disponíveis: <strong>Carro</strong> (cinza), <strong>Ambulância</strong>{" "}
                      (branca com cruz vermelha) e <strong>Caminhão</strong> (cinza com baú). O valor sincroniza para
                      todos os browsers e telemóveis autenticados no mesmo Firebase.
                    </p>
                    <VehicleTypeByPlacaEditor
                      catalog={items}
                      value={vehicleTypeByPlaca}
                      onChange={setVehicleTypeByPlaca}
                    />
                  </div>
                </section>
              ) : null}

              {activeSectionId === "settings-vistoria-cal" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-vistoria">
                <h3 id="settings-heading-vistoria" className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Vistoria — calendário
                </h3>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            Abre um calendário com as mesmas cores da aba <strong>Vistoriar</strong> (verde = todas as viaturas
            vistoriadas, laranja = parcial, vermelho = nenhuma). Escolha os dias e confirme para remover as vistorias
            que contam nesse calendário (escala com «S» e vínculos de viatura), incluindo dias verdes e laranjas. Afeta o
            Firebase como na própria aba Vistoria.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={!detalheServicoBundle}
            className="border-amber-600/80 text-amber-900 hover:bg-amber-50 dark:text-amber-100 dark:hover:bg-amber-950/40"
            onClick={handleAbrirModalLimparVistoriasCalendario}
          >
            Apagar vistorias por dia (calendário)
          </Button>
          {!detalheServicoBundle ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Aguarde o carregamento da escala (detalhe de serviço) para usar o calendário.
            </p>
                ) : null}
              </section>
              ) : null}

              {activeSectionId === "settings-zona-risco" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-risco">
                <h3 id="settings-heading-risco" className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Zona de risco
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Remove todas as saídas da memória (incluindo ambulância). Não afeta o arquivo de backup estático do
                  SOT, se existir.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={handleExcluirTodas}
                >
                  Excluir todas as saídas
                </Button>
              </section>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {backupPreviewOpen && preparedBackup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
              Backup geral - Pré-visualização dos dados
            </h3>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Projeto: <strong>{preparedBackup.projectId || "-"}</strong> · Exportado em:{" "}
              {new Date(preparedBackup.exportedAt).toLocaleString("pt-BR")}
            </p>
            <div className="mt-3 space-y-2">
              {buildBackupPreviewItems(preparedBackup).map((item, idx) => (
                <div
                  key={`${item.aba}-${item.descricao}-${idx}`}
                  className="rounded-md border border-[hsl(var(--border))] px-3 py-2"
                >
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{item.aba}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {item.descricao}: <strong>{item.quantidade}</strong>
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBackupPreviewOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" variant="default" onClick={handleConfirmarDownloadBackupGeral}>
                Baixar backup geral
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {detalheServicoBundle ? (
        <SettingsVistoriaClearCalendarModal
          open={vistoriaClearModalOpen}
          onOpenChange={setVistoriaClearModalOpen}
          detalheServicoBundle={detalheServicoBundle}
          assignments={vistoriaCloudSnapshot.assignments}
          inspections={vistoriaCloudSnapshot.inspections}
        />
      ) : null}
    </>
  );
}
