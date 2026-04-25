import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SaidasMobileApp } from "./saidas-mobile/saidas-mobile-app";
import { AvisosPage } from "./components/avisos-page";
import { Dashboard } from "./components/dashboard";
import { HomeNewsTicker } from "./components/home-news-ticker";
import { Layout } from "./components/layout";
import { DeparturesListPage } from "./components/departures-list-page";
import { PlaceholderPage } from "./components/placeholder-page";
import { StatisticsPage } from "./components/statistics-page";
import { SettingsPage } from "./components/settings-page";
import { VistoriaPage } from "./components/vistoria-page";
import { FleetPersonnelPage } from "./components/fleet-personnel-page";
import { RegisterDeparturePage } from "./components/register-departure-page";
import { RelatorioDiarioViaturasCalendarPage } from "./components/relatorio-diario-viaturas-calendar-page";
import { RelatorioDiarioViaturasPage } from "./components/relatorio-diario-viaturas-page";
import { RdvRouteErrorBoundary } from "./components/rdv-route-error-boundary";
import { useAvisos } from "./context/avisos-context";
import { useAppTab } from "./context/app-tab-context";
import { useDepartures } from "./context/departures-context";
import { useSyncPreference } from "./context/sync-preference-context";
import { useMapaOleoFromMaintenance } from "./context/vehicle-maintenance-context";
import { loadDetalheServicoBundleFromIdb } from "./lib/detalheServicoBundle";
import { exportFullBackupFromFirebase } from "./lib/firebase/systemBackup";
import {
  ensureVistoriaCloudStateSyncStarted,
  getVistoriaCloudState,
  isVistoriaCloudStateHydrated,
} from "./lib/vistoriaCloudState";
import { listMotoristasComServicoOuRotinaNoDia } from "./lib/detalheServicoDayMarkers";
import { sendWhatsAppTemplateHelloWorld, sendWhatsAppTextMessage } from "./lib/whatsappCloudApi";
import { useIdleResetToHome } from "./lib/useIdleResetToHome";
import { isSettingsTab } from "./lib/tabMatch";
import { buildViaturasPorMotoristaMap } from "./lib/vistoriaCalendarTint";
import { isoDateFromDate, resolveViaturasParaMotoristaEscala } from "./lib/vistoriaInspectionShared";
import { Button } from "./components/ui/button";

function useLocationHash() {
  const [hash, setHash] = useState(() => (typeof window !== "undefined" ? window.location.hash : ""));
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const tabs = [
  "Cadastrar Saída",
  "Saídas Administrativas",
  "Saídas de Ambulância",
  "Vistoria",
  "Frota e Pessoal",
  "Estatística",
  "Avisos",
  "Configurações",
];

const DAILY_BACKUP_KEY = "sot_daily_backup_gate_v1";
const VISTORIA_WHATSAPP_CONTACTS_KEY = "sot_vistoria_whatsapp_contacts_v1";
const VISTORIA_WHATSAPP_SENT_KEY = "sot_vistoria_whatsapp_sent_v1";

type VistoriaWhatsappContact = {
  motorista: string;
  telefone: string;
};

function localDayKeyNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

function loadVistoriaWhatsappContacts(): VistoriaWhatsappContact[] {
  try {
    const raw = localStorage.getItem(VISTORIA_WHATSAPP_CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        motorista: String(row.motorista ?? "").trim(),
        telefone: normalizePhone(String(row.telefone ?? "")),
      }))
      .filter((row) => row.motorista && row.telefone);
  } catch {
    return [];
  }
}

function readVistoriaWhatsappSentGate(): { dayKey: string; sentMotoristas: string[] } {
  try {
    const raw = localStorage.getItem(VISTORIA_WHATSAPP_SENT_KEY);
    if (!raw) return { dayKey: "", sentMotoristas: [] };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      dayKey: String(parsed.dayKey ?? ""),
      sentMotoristas: Array.isArray(parsed.sentMotoristas)
        ? parsed.sentMotoristas.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return { dayKey: "", sentMotoristas: [] };
  }
}

function writeVistoriaWhatsappSentGate(dayKey: string, sentMotoristas: string[]): void {
  try {
    localStorage.setItem(VISTORIA_WHATSAPP_SENT_KEY, JSON.stringify({ dayKey, sentMotoristas }));
  } catch {
    /* ignore */
  }
}

function readDailyBackupDone(): string {
  try {
    return localStorage.getItem(DAILY_BACKUP_KEY) ?? "";
  } catch {
    return "";
  }
}

function markDailyBackupDone(dayKey: string): void {
  try {
    localStorage.setItem(DAILY_BACKUP_KEY, dayKey);
  } catch {
    /* ignore */
  }
}

function App() {
  const hash = useLocationHash();
  const {
    activeTab,
    setActiveTab,
    pendingDeparturesFilterDatePtBr,
    setPendingDeparturesFilterDatePtBr,
    departuresListMountKey,
  } = useAppTab();
  const prevActiveTabForPendingRef = useRef<string | null>(null);
  const skipNextTabPendingClearRef = useRef(true);

  /** Limpa filtro “pendente” só ao entrar em Cadastrar vindo de outra aba (não após salvar e ir para a lista). */
  useEffect(() => {
    const current = activeTab ?? null;
    const prev = prevActiveTabForPendingRef.current;
    if (skipNextTabPendingClearRef.current) {
      skipNextTabPendingClearRef.current = false;
      prevActiveTabForPendingRef.current = current;
      return;
    }
    if (current === "Cadastrar Saída" && prev !== "Cadastrar Saída") {
      setPendingDeparturesFilterDatePtBr(null);
    }
    prevActiveTabForPendingRef.current = current;
  }, [activeTab, setPendingDeparturesFilterDatePtBr]);
  /** Mesmo mapa de óleo da aba Manutenções (VehicleMaintenanceProvider). */
  const mapaOleo = useMapaOleoFromMaintenance();
  const { avisoPrincipal, avisosGeraisLinhas } = useAvisos();
  const { editIntentVersion, cloudDeparturesSync } = useDepartures();
  const { firebaseOnlyEnabled } = useSyncPreference();
  const lastEditIntentVersion = useRef(editIntentVersion);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [backupBusy, setBackupBusy] = useState(false);
  const [dailyBackupDoneKey, setDailyBackupDoneKey] = useState<string>(() => readDailyBackupDone());
  /** Força remontagem do Dashboard ao regressar à página inicial por inatividade. */
  const [homeRemountKey, setHomeRemountKey] = useState(0);

  const handleTabChange = useCallback(
    (tab: string) => {
      if (/^#\/carro-quebrado(\/|$)/.test(window.location.hash)) {
        window.location.hash = "";
      }
      setActiveTab(tab);
    },
    [setActiveTab],
  );

  const handleIdleReturnHome = useCallback(() => {
    setActiveTab(null);
    setHomeRemountKey((k) => k + 1);
    if (/^#\/carro-quebrado(\/|$)/.test(window.location.hash)) {
      window.location.hash = "";
    }
  }, [setActiveTab]);

  const isMobileRoute = hash.startsWith("#/saidas");
  const isCarroQuebradoRoute = /^#\/carro-quebrado(\/|$)/.test(hash);
  useIdleResetToHome(!isMobileRoute, handleIdleReturnHome);

  useEffect(() => {
    if (hash.startsWith("#/saidas")) return;
    if (editIntentVersion > 0 && editIntentVersion !== lastEditIntentVersion.current) {
      lastEditIntentVersion.current = editIntentVersion;
      if (/^#\/carro-quebrado(\/|$)/.test(window.location.hash)) {
        window.location.hash = "";
      }
      setActiveTab("Cadastrar Saída");
    }
  }, [editIntentVersion, setActiveTab, hash]);

  useEffect(() => {
    ensureVistoriaCloudStateSyncStarted();
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
    if (isMobileRoute) return;
    let cancelled = false;
    let timer: number | undefined;

    const runCheck = async () => {
      if (cancelled) return;
      const now = new Date();
      if (now.getHours() < 14) return;
      if (!isVistoriaCloudStateHydrated()) return;

      const dayKey = localDayKeyNow();
      const isoToday = isoDateFromDate(now);
      const sentGate = readVistoriaWhatsappSentGate();
      const sentSet = new Set(sentGate.dayKey === dayKey ? sentGate.sentMotoristas : []);
      const contacts = loadVistoriaWhatsappContacts();
      if (contacts.length === 0) return;

      const detalheServicoBundle = await loadDetalheServicoBundleFromIdb();
      if (!detalheServicoBundle) return;

      const escaladosHoje = new Set(
        listMotoristasComServicoOuRotinaNoDia(detalheServicoBundle, isoToday)
          .filter((row) => row.servico)
          .map((row) => row.motorista.trim().toLowerCase()),
      );
      if (escaladosHoje.size === 0) return;

      const cloud = getVistoriaCloudState();
      const viaturasPorMotorista = buildViaturasPorMotoristaMap(cloud.assignments);
      const toSend: Array<{ motorista: string; telefone: string; pendentes: string[] }> = [];

      for (const c of contacts) {
        const motoristaNorm = c.motorista.trim().toLowerCase();
        if (!motoristaNorm || !escaladosHoje.has(motoristaNorm)) continue;
        if (sentSet.has(motoristaNorm)) continue;
        const viaturas = resolveViaturasParaMotoristaEscala(c.motorista, viaturasPorMotorista);
        if (viaturas.length === 0) continue;
        const pendentes = viaturas.filter(
          (v) =>
            !cloud.inspections.some(
              (i) =>
                i.inspectionDate === isoToday &&
                i.viatura.trim().toLowerCase() === v.trim().toLowerCase(),
            ),
        );
        if (pendentes.length === 0) continue;
        toSend.push({ motorista: c.motorista, telefone: c.telefone, pendentes });
      }

      if (toSend.length === 0) return;

      const failedSends: string[] = [];
      for (const row of toSend) {
        const text =
          `SOT 2.0 - Aviso de vistoria\n` +
          `Motorista: ${row.motorista}\n` +
          `Data: ${now.toLocaleDateString("pt-BR")}\n` +
          `Ha viatura(s) pendente(s) de vistoria: ${row.pendentes.join(", ")}.\n` +
          `Por favor, realize a vistoria o quanto antes.`;
        const textResult = await sendWhatsAppTextMessage(row.telefone, text);
        if (!textResult.ok) {
          const templateResult = await sendWhatsAppTemplateHelloWorld(row.telefone);
          if (!templateResult.ok) {
            failedSends.push(`${row.motorista}: ${textResult.error}`);
            continue;
          }
        }
        sentSet.add(row.motorista.trim().toLowerCase());
      }

      writeVistoriaWhatsappSentGate(dayKey, [...sentSet]);
      if (failedSends.length > 0) {
        window.alert(
          `Falha ao enviar ${failedSends.length} aviso(s) no WhatsApp API. Verifique token/permissoes/modelo.`,
        );
      }
    };

    void runCheck();
    timer = window.setInterval(() => {
      void runCheck();
    }, 60_000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [isMobileRoute]);

  const todayKey = localDayKeyNow();
  const shouldRequireDailyBackup =
    !isMobileRoute &&
    isOnline &&
    firebaseOnlyEnabled &&
    cloudDeparturesSync.enabled &&
    dailyBackupDoneKey !== todayKey;

  async function handleDailyBackupNow() {
    try {
      setBackupBusy(true);
      const backup = await exportFullBackupFromFirebase();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = `sot_backup_automatico_${stamp}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      markDailyBackupDone(todayKey);
      setDailyBackupDoneKey(todayKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar backup automático.";
      window.alert(msg);
    } finally {
      setBackupBusy(false);
    }
  }

  const content = useMemo(() => {
    if (isCarroQuebradoRoute) {
      const m = /^#\/carro-quebrado\/dia\/(\d{4}-\d{2}-\d{2})$/.exec(hash);
      return (
        <RdvRouteErrorBoundary>
          {m?.[1] ? (
            <RelatorioDiarioViaturasPage key={m[1]} initialReportDate={m[1]} />
          ) : (
            <RelatorioDiarioViaturasCalendarPage />
          )}
        </RdvRouteErrorBoundary>
      );
    }
    if (!activeTab) return <Dashboard key={homeRemountKey} mapaOleo={mapaOleo} />;
    if (activeTab === "Cadastrar Saída") return <RegisterDeparturePage />;
    if (activeTab === "Saídas Administrativas")
      return (
        <DeparturesListPage
          key={`lista-adm-${departuresListMountKey}`}
          title="Saídas Administrativas"
          filterTipo="Administrativa"
          initialDeparturesFilterDatePtBr={pendingDeparturesFilterDatePtBr}
        />
      );
    if (activeTab === "Saídas de Ambulância")
      return (
        <DeparturesListPage
          key={`lista-amb-${departuresListMountKey}`}
          title="Saídas de Ambulância"
          filterTipo="Ambulância"
          initialDeparturesFilterDatePtBr={pendingDeparturesFilterDatePtBr}
        />
      );
    if (activeTab === "Vistoria") return <VistoriaPage />;
    if (isSettingsTab(activeTab)) return <SettingsPage />;
    if (activeTab === "Frota e Pessoal") return <FleetPersonnelPage />;
    if (activeTab === "Estatística") return <StatisticsPage />;
    if (activeTab === "Avisos") return <AvisosPage />;
    return <PlaceholderPage title={activeTab} />;
  }, [
    hash,
    activeTab,
    homeRemountKey,
    mapaOleo,
    pendingDeparturesFilterDatePtBr,
    departuresListMountKey,
    isCarroQuebradoRoute,
  ]);

  const isHome = !activeTab && !isCarroQuebradoRoute;
  const showHomeAvisosTicker =
    isHome && (Boolean(avisoPrincipal.trim()) || avisosGeraisLinhas.length > 0);

  const appContent = isMobileRoute ? (
    <SaidasMobileApp />
  ) : (
    <>
      <Layout
        tabs={tabs}
        activeTab={activeTab ?? ""}
        onTabChange={handleTabChange}
        rdvRouteActive={isCarroQuebradoRoute}
        homeTickerActive={showHomeAvisosTicker}
        fitHomeViewport={isHome}
      >
        {content}
      </Layout>
      {showHomeAvisosTicker ? <HomeNewsTicker /> : null}
    </>
  );

  return (
    <>
      {appContent}
      {shouldRequireDailyBackup ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Backup diário obrigatório</h2>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Sistema em modo online com Firebase. Antes de continuar, é obrigatório gerar um backup geral com todos os
              dados preenchidos no sistema.
            </p>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={handleDailyBackupNow} disabled={backupBusy}>
                {backupBusy ? "Gerando backup..." : "Fazer Backup"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default App;
