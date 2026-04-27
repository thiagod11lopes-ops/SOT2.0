import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Ambulance, Building2, ClipboardCheck, ShieldCheck, UserPlus } from "lucide-react";
import { useDepartures } from "../context/departures-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { CloudSyncIndicator } from "../components/cloud-sync-indicator";
import { Button } from "../components/ui/button";
import {
  findMobileMotoristaCredentialByName,
  loadActiveMobileMotorista,
  setActiveMobileMotorista,
  upsertMobileMotoristaCredential,
} from "../lib/mobileMotoristaCredentials";
import { VISTORIA_ADMINISTRATIVA_SENHA_PADRAO } from "../lib/vistoriaAdminMobile";
import { cn } from "../lib/utils";
import { loadDetalheServicoBundleFromIdb } from "../lib/detalheServicoBundle";
import { listMotoristasComServicoOuRotinaNoDia } from "../lib/detalheServicoDayMarkers";
import { getVistoriaCloudState, subscribeVistoriaCloudStateChange } from "../lib/vistoriaCloudState";
import { normalizeDriverKey, nomesMotoristaVistoriaEquivalentes, resolveViaturasParaMotoristaEscala } from "../lib/vistoriaInspectionShared";
import {
  clearPushSubscription,
  ensurePushSubscription,
  requestNotificationPermissionIfNeeded,
  showLocalAlarmNotification,
} from "../lib/mobilePushNotifications";
import {
  disableMobilePushSubscriptionForMotorista,
  saveMobilePushSubscriptionForMotorista,
} from "../lib/firebase/mobilePushSubscriptions";
import { SaidasHeaderEscalaPao } from "./saidas-header-escala-pao";
import { MobileVistoriaFullscreen } from "./mobile-vistoria-fullscreen";
import { SaidasMobileDetalheServicoModal } from "./saidas-mobile-detalhe-servico-modal";
import { useSaidasMobileFilterDate } from "./saidas-mobile-filter-date-context";
import { SteeringWheelIcon } from "./steering-wheel-icon";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";
import { MobileLoadingOverlayHost } from "./mobile-loading-overlay";
import { useMobileLoadingOverlay } from "./mobile-loading-context";

type AlarmesConfig = {
  beforeDepartureEnabled: boolean;
  beforeDepartureMinutes: number;
  beforeDepartureSound: "som1" | "som2" | "som3" | "som4" | "som5";
  vistoriaPendenteEnabled: boolean;
  vistoriaPendenteTime: string;
  vistoriaPendenteSound: "som1" | "som2" | "som3" | "som4" | "som5";
};

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
    const n = Number(parsed.beforeDepartureMinutes);
    const isValidSound = (s: unknown): s is AlarmesConfig["beforeDepartureSound"] =>
      s === "som1" || s === "som2" || s === "som3" || s === "som4" || s === "som5";
    return {
      beforeDepartureEnabled: Boolean(parsed.beforeDepartureEnabled),
      beforeDepartureMinutes: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 15,
      beforeDepartureSound: isValidSound(parsed.beforeDepartureSound)
        ? parsed.beforeDepartureSound
        : DEFAULT_ALARMES_CONFIG.beforeDepartureSound,
      vistoriaPendenteEnabled: Boolean(parsed.vistoriaPendenteEnabled),
      vistoriaPendenteTime:
        typeof parsed.vistoriaPendenteTime === "string" && /^\d{2}:\d{2}$/.test(parsed.vistoriaPendenteTime)
          ? parsed.vistoriaPendenteTime
          : "14:00",
      vistoriaPendenteSound: isValidSound(parsed.vistoriaPendenteSound)
        ? parsed.vistoriaPendenteSound
        : DEFAULT_ALARMES_CONFIG.vistoriaPendenteSound,
    };
  } catch {
    return DEFAULT_ALARMES_CONFIG;
  }
}

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parsePtBrDateAndTimeToLocal(datePtBr: string, timeHhMm: string): Date | null {
  const dm = datePtBr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const tm = timeHhMm.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]) - 1;
  const year = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (!Number.isFinite(day + month + year + hour + minute)) return null;
  return new Date(year, month, day, hour, minute, 0, 0);
}

export function SaidasLayout() {
  const { runWithTrackedProgress } = useMobileLoadingOverlay();
  const { departures } = useDepartures();
  const { items: catalogItems } = useCatalogItems();
  const { filterDatePtBr } = useSaidasMobileFilterDate();
  const [detalheServicoOpen, setDetalheServicoOpen] = useState(false);
  const [vistoriaMobileOpen, setVistoriaMobileOpen] = useState(false);
  const [vistoriaAdministrativaMotorista, setVistoriaAdministrativaMotorista] = useState<string | null>(null);
  const [vistoriaAdminModalOpen, setVistoriaAdminModalOpen] = useState(false);
  const [vistoriaAdminStep, setVistoriaAdminStep] = useState<"motorista" | "senha">("motorista");
  const [vistoriaAdminMotoristaId, setVistoriaAdminMotoristaId] = useState("");
  const [vistoriaAdminSenha, setVistoriaAdminSenha] = useState("");
  const [cadastroCredModalOpen, setCadastroCredModalOpen] = useState(false);
  const [cadastroMotorista, setCadastroMotorista] = useState("");
  const [cadastroSenha, setCadastroSenha] = useState("");
  const [motoristaLogadoMobile, setMotoristaLogadoMobile] = useState<string | null>(
    () => loadActiveMobileMotorista(),
  );
  const [alarmToast, setAlarmToast] = useState<{ title: string; body: string } | null>(null);
  const alarmesStateRef = useRef<{ lastDepartureKey: string; lastVistoriaKey: string }>({
    lastDepartureKey: "",
    lastVistoriaKey: "",
  });

  function playAlarmBeep(sound: AlarmesConfig["beforeDepartureSound"]) {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      const freq =
        sound === "som1" ? 880 : sound === "som2" ? 740 : sound === "som3" ? 988 : sound === "som4" ? 660 : 523;
      const duration = sound === "som5" ? 0.42 : sound === "som3" ? 0.24 : 0.3;
      osc.frequency.value = freq;
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      if (sound === "som4") {
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 1.35, now + duration * 0.75);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      window.setTimeout(() => void ctx.close(), 650);
    } catch {
      /* ignore */
    }
  }

  function notifyAlarm(title: string, body: string, sound: AlarmesConfig["beforeDepartureSound"]): void {
    if (typeof window === "undefined") return;
    playAlarmBeep(sound);
    setAlarmToast({ title, body });
    void showLocalAlarmNotification(title, { body, tag: "sot-mobile-alarm", requireInteraction: true });
  }

  const motoristasCatalogoOrdenados = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of catalogItems.motoristas) {
      const t = m.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
    return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [catalogItems.motoristas]);

  function closeCadastroCredModal() {
    setCadastroCredModalOpen(false);
    setCadastroMotorista("");
    setCadastroSenha("");
  }

  function handleSalvarCadastroCred() {
    const motorista = cadastroMotorista.trim();
    const senha = cadastroSenha.trim();
    if (!motorista) {
      window.alert("Selecione um motorista cadastrado.");
      return;
    }
    if (!senha) {
      window.alert("Digite a senha do motorista.");
      return;
    }
    const existing = findMobileMotoristaCredentialByName(motorista);
    if (existing) {
      if (existing.senha !== senha) {
        window.alert("Senha incorreta para este motorista.");
        return;
      }
    } else {
      upsertMobileMotoristaCredential({ motorista, senha });
    }
    setActiveMobileMotorista(motorista);
    setMotoristaLogadoMobile(motorista);
    window.alert(
      existing
        ? `Login efetuado como ${motorista}.`
        : `Senha criada e login efetuado como ${motorista}.`,
    );
    closeCadastroCredModal();
  }

  async function handlePermitirNotificacoesNoLogin() {
    const permission = await requestNotificationPermissionIfNeeded();
    if (permission !== "granted") {
      if (permission === "denied") {
        window.alert("Notificações bloqueadas neste navegador. Ative nas permissões do sistema/navegador.");
      } else if (permission === "unsupported") {
        window.alert("Este dispositivo/navegador não suporta notificações push.");
      }
      return;
    }
    const motorista = cadastroMotorista.trim() || motoristaLogadoMobile?.trim() || "";
    if (!motorista) {
      window.alert("Permissão concedida. Agora selecione o motorista e toque em Guardar para finalizar o login.");
      return;
    }
    const subscription = await ensurePushSubscription();
    if (!subscription) {
      window.alert("Permissão concedida, mas não foi possível registrar o dispositivo para push.");
      return;
    }
    await saveMobilePushSubscriptionForMotorista(motorista, subscription);
    window.alert(`Notificações ativadas para ${motorista} neste celular.`);
  }

  function handleLogoutMotoristaMobile() {
    if (motoristaLogadoMobile?.trim()) {
      void disableMobilePushSubscriptionForMotorista(motoristaLogadoMobile);
      void clearPushSubscription();
    }
    setActiveMobileMotorista(null);
    setMotoristaLogadoMobile(null);
  }

  function closeVistoriaAdminModal() {
    setVistoriaAdminModalOpen(false);
    setVistoriaAdminStep("motorista");
    setVistoriaAdminMotoristaId("");
    setVistoriaAdminSenha("");
  }

  function handleVistoriaAdminMotoristaOk() {
    const m = vistoriaAdminMotoristaId.trim();
    if (!m) {
      window.alert("Selecione o motorista que será o vistoriador.");
      return;
    }
    setVistoriaAdminStep("senha");
    setVistoriaAdminSenha("");
  }

  function handleVistoriaAdminSenhaOk() {
    if (vistoriaAdminSenha !== VISTORIA_ADMINISTRATIVA_SENHA_PADRAO) {
      window.alert("Senha incorreta.");
      return;
    }
    const m = vistoriaAdminMotoristaId.trim();
    setVistoriaAdministrativaMotorista(m);
    closeVistoriaAdminModal();
    setVistoriaMobileOpen(true);
  }

  function openVistoriaWithFirebaseProgress() {
    void runWithTrackedProgress(
      async (progress) => {
        progress.setProgress(5);
        setVistoriaAdministrativaMotorista(null);
        setVistoriaMobileOpen(true);
        progress.setProgress(12);
        await new Promise<void>((resolve) => {
          let done = false;
          const onProgress = (event: Event) => {
            const custom = event as CustomEvent<number>;
            progress.setProgress(custom.detail);
          };
          const timer = window.setTimeout(() => {
            if (done) return;
            done = true;
            progress.setProgress(100);
            window.removeEventListener("sot-mobile-vistoria-progress", onProgress as EventListener);
            window.removeEventListener("sot-mobile-vistoria-ready", onReady as EventListener);
            resolve();
          }, 9000);
          const onReady = () => {
            if (done) return;
            done = true;
            progress.setProgress(100);
            window.clearTimeout(timer);
            window.removeEventListener("sot-mobile-vistoria-progress", onProgress as EventListener);
            window.removeEventListener("sot-mobile-vistoria-ready", onReady as EventListener);
            resolve();
          };
          window.addEventListener("sot-mobile-vistoria-progress", onProgress as EventListener);
          window.addEventListener("sot-mobile-vistoria-ready", onReady as EventListener);
        });
      },
      { label: "Sincronizando calendário e placas com o Firebase...", minDurationMs: 300 },
    );
  }

  useEffect(() => {
    if (!alarmToast) return;
    const t = window.setTimeout(() => setAlarmToast(null), 7000);
    return () => window.clearTimeout(t);
  }, [alarmToast]);

  useEffect(() => {
    void requestNotificationPermissionIfNeeded();
  }, []);

  useEffect(() => {
    if (!motoristaLogadoMobile?.trim()) return;
    let cancelled = false;
    void (async () => {
      const permission = await requestNotificationPermissionIfNeeded();
      if (cancelled || permission !== "granted") return;
      const subscription = await ensurePushSubscription();
      if (cancelled || !subscription) return;
      await saveMobilePushSubscriptionForMotorista(motoristaLogadoMobile, subscription);
    })();
    return () => {
      cancelled = true;
    };
  }, [motoristaLogadoMobile]);

  useEffect(() => {
    if (!motoristaLogadoMobile?.trim()) return;
    const motoristaLogado = motoristaLogadoMobile.trim();
    let cancelled = false;
    let timer: number | null = null;
    let vistoriaCloudTick = 0;
    const unsubVistoria = subscribeVistoriaCloudStateChange(() => {
      vistoriaCloudTick += 1;
    });

    function driverMatchesDepartureField(field: string, motorista: string): boolean {
      const nk = normalizeDriverKey(motorista);
      if (!nk) return false;
      const tokens = field
        .split(/[;,/]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      return tokens.some((t) => normalizeDriverKey(t) === nk);
    }

    async function tick() {
      if (cancelled) return;
      const config = loadAlarmesConfig();
      const motorista = motoristaLogado;
      const now = new Date();
      const dayIso = todayIsoLocal();

      if (config.beforeDepartureEnabled) {
        const leadMin = Math.max(0, config.beforeDepartureMinutes);
        for (const row of departures) {
          if (!driverMatchesDepartureField(row.motoristas ?? "", motorista)) continue;
          const time = (row.horaSaida || row.horaPedido || "").trim();
          const date = (row.dataSaida || row.dataPedido || "").trim();
          const dt = parsePtBrDateAndTimeToLocal(date, time);
          if (!dt) continue;
          const alarmAt = new Date(dt.getTime() - leadMin * 60_000);
          const delta = now.getTime() - alarmAt.getTime();
          if (delta < 0 || delta > 60_000) continue;
          const fireKey = `dep:${dayIso}:${row.id}:${leadMin}`;
          if (alarmesStateRef.current.lastDepartureKey === fireKey) continue;
          alarmesStateRef.current.lastDepartureKey = fireKey;
          notifyAlarm(
            "Alarme de saída",
            `${motorista}: saída às ${time || "--:--"} (${leadMin} min antes).`,
            config.beforeDepartureSound,
          );
          break;
        }
      }

      if (config.vistoriaPendenteEnabled && /^\d{2}:\d{2}$/.test(config.vistoriaPendenteTime)) {
        const [hh, mm] = config.vistoriaPendenteTime.split(":").map(Number);
        const shouldCheckNow = now.getHours() === hh && now.getMinutes() === mm;
        if (shouldCheckNow) {
          const bundle = await loadDetalheServicoBundleFromIdb();
          const marcados = listMotoristasComServicoOuRotinaNoDia(bundle, dayIso);
          const hasServicoHoje = marcados.some(
            (m) => m.servico && normalizeDriverKey(m.motorista) === normalizeDriverKey(motorista),
          );
          if (hasServicoHoje) {
            const cloud = getVistoriaCloudState();
            const map = new Map<string, string[]>();
            for (const a of cloud.assignments) {
              const key = normalizeDriverKey(a.motorista);
              if (!key) continue;
              if (!map.has(key)) map.set(key, []);
              map.get(key)!.push(a.viatura);
            }
            const viaturasEsperadas = resolveViaturasParaMotoristaEscala(motorista, map);
            if (viaturasEsperadas.length > 0) {
              const vistoriadas = viaturasEsperadas.filter((v) =>
                cloud.inspections.some(
                  (i) =>
                    i.inspectionDate === dayIso &&
                    nomesMotoristaVistoriaEquivalentes(i.motorista, motorista) &&
                    i.viatura.trim() === v.trim(),
                ),
              );
              const pendentes = viaturasEsperadas.filter(
                (v) => !vistoriadas.some((ok) => ok.trim() === v.trim()),
              );
              if (pendentes.length > 0) {
                const fireKey = `vis:${dayIso}:${motorista}:${vistoriaCloudTick}`;
                if (alarmesStateRef.current.lastVistoriaKey !== fireKey) {
                  alarmesStateRef.current.lastVistoriaKey = fireKey;
                  notifyAlarm(
                    "Alarme de vistoria pendente",
                    `${motorista}: viatura(s) ainda pendente(s): ${pendentes.join(", ")}.`,
                    config.vistoriaPendenteSound,
                  );
                }
              }
            }
          }
        }
      }

      timer = window.setTimeout(tick, 20_000);
    }

    timer = window.setTimeout(tick, 1000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      unsubVistoria();
    };
  }, [motoristaLogadoMobile, departures]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-[hsl(var(--background))]">
      <MobileLoadingOverlayHost />
      {vistoriaAdminModalOpen ? (
        <div
          className={`${MOBILE_MODAL_OVERLAY_CLASS} z-[520]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="vistoria-admin-titulo"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeVistoriaAdminModal();
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="vistoria-admin-titulo" className="mb-1 text-lg font-semibold text-[hsl(var(--foreground))]">
              Vistoria administrativa
            </h2>
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
              {vistoriaAdminStep === "motorista"
                ? "Escolha o motorista que será o vistoriador nesta vistoria avulsa."
                : "Introduza a senha para abrir o formulário."}
            </p>
            {vistoriaAdminStep === "motorista" ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Vistoriador (motorista)</label>
                <select
                  className="min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
                  value={vistoriaAdminMotoristaId}
                  onChange={(e) => setVistoriaAdminMotoristaId(e.target.value)}
                  aria-label="Motorista vistoriador"
                >
                  <option value="">— Selecionar —</option>
                  {motoristasCatalogoOrdenados.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    className="min-h-11 flex-1 rounded-xl border border-red-600/90 bg-red-500 font-semibold text-white"
                    onClick={closeVistoriaAdminModal}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11 flex-1 rounded-xl border border-emerald-600/90 bg-emerald-500 font-semibold text-white"
                    onClick={handleVistoriaAdminMotoristaOk}
                  >
                    OK
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Senha</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={vistoriaAdminSenha}
                  onChange={(e) => setVistoriaAdminSenha(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
                  aria-label="Senha da vistoria administrativa"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    className="min-h-11 flex-1 rounded-xl border border-red-600/90 bg-red-500 font-semibold text-white"
                    onClick={() => {
                      setVistoriaAdminStep("motorista");
                      setVistoriaAdminSenha("");
                    }}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11 flex-1 rounded-xl border border-emerald-600/90 bg-emerald-500 font-semibold text-white"
                    onClick={handleVistoriaAdminSenhaOk}
                  >
                    OK
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {cadastroCredModalOpen ? (
        <div
          className={`${MOBILE_MODAL_OVERLAY_CLASS} z-[520]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cadastro-motorista-mobile-titulo"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeCadastroCredModal();
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2
              id="cadastro-motorista-mobile-titulo"
              className="mb-1 text-lg font-semibold text-[hsl(var(--foreground))]"
            >
              Login do motorista (mobile)
            </h2>
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
              Selecione o seu nome e informe a senha para entrar. Se ainda não houver senha para esse motorista,
              esta senha será criada e usada neste login.
            </p>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Motorista</label>
              <select
                className="min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
                value={cadastroMotorista}
                onChange={(e) => setCadastroMotorista(e.target.value)}
                aria-label="Selecionar motorista"
              >
                <option value="">— Selecionar —</option>
                {motoristasCatalogoOrdenados.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Senha</label>
              <input
                type="password"
                autoComplete="off"
                value={cadastroSenha}
                onChange={(e) => setCadastroSenha(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
                aria-label="Senha do motorista mobile"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  className="min-h-11 flex-1 rounded-xl border border-sky-600/90 bg-sky-500 font-semibold text-white"
                  onClick={() => {
                    void handlePermitirNotificacoesNoLogin();
                  }}
                >
                  Permitir notificações
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  className="min-h-11 flex-1 rounded-xl border border-red-600/90 bg-red-500 font-semibold text-white"
                  onClick={closeCadastroCredModal}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="min-h-11 flex-1 rounded-xl border border-emerald-600/90 bg-emerald-500 font-semibold text-white"
                  onClick={handleSalvarCadastroCred}
                >
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <MobileVistoriaFullscreen
        open={vistoriaMobileOpen}
        onOpenChange={(next) => {
          setVistoriaMobileOpen(next);
          if (!next) setVistoriaAdministrativaMotorista(null);
        }}
        administrativeVistoriadorMotorista={vistoriaAdministrativaMotorista}
      />
      <SaidasMobileDetalheServicoModal
        open={detalheServicoOpen}
        onOpenChange={setDetalheServicoOpen}
        filterDatePtBr={filterDatePtBr}
      />
      <header
        className="sticky top-0 z-20 w-full min-w-0 overflow-x-hidden border-b border-[hsl(var(--border))]/90 bg-[hsl(var(--card))]/85 px-3 pb-3 pt-[calc(0.75rem+var(--safe-top))] backdrop-blur-xl sm:px-4"
        style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}
      >
        <div className="relative mx-auto flex max-w-lg items-center justify-center gap-1.5 min-[400px]:gap-2">
          <div className="absolute left-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDetalheServicoOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Detalhe de Serviço — serviço e rotina no dia do filtro"
              title="Detalhe de Serviço"
            >
              <SteeringWheelIcon className="h-[1.15rem] w-[1.15rem] text-[hsl(var(--primary))]" />
            </button>
            <button
              type="button"
              onClick={openVistoriaWithFirebaseProgress}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Vistoria — calendário e checklist"
              title="Vistoria"
            >
              <ClipboardCheck className="h-[1.15rem] w-[1.15rem] text-[hsl(var(--primary))]" />
            </button>
          </div>
          <div className="min-w-0 max-w-[calc(100%-15rem)] px-1 text-center sm:max-w-[calc(100%-16rem)]">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
              SOT
            </p>
            <h1 className="truncate text-lg font-bold tracking-tight text-[hsl(var(--foreground))]">Saídas</h1>
          </div>
          <div className="absolute right-0 top-1/2 flex min-w-0 -translate-y-1/2 items-center gap-1.5 min-[400px]:gap-2">
            <SaidasHeaderEscalaPao />
            <button
              type="button"
              onClick={() => {
                setVistoriaAdminStep("motorista");
                setVistoriaAdminMotoristaId("");
                setVistoriaAdminSenha("");
                setVistoriaAdminModalOpen(true);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Vistoria administrativa — motorista e senha"
              title="Vistoria administrativa"
            >
              <ShieldCheck className="h-[1.15rem] w-[1.15rem] text-[hsl(var(--primary))]" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setCadastroCredModalOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] transition active:scale-[0.98]"
              aria-label="Cadastro de motorista para acesso mobile"
              title="Cadastro de motorista (mobile)"
            >
              <UserPlus className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-col items-center gap-1">
          <CloudSyncIndicator compact />
          {motoristaLogadoMobile ? (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded-full border border-emerald-300/80 bg-emerald-100/80 px-2 py-0.5 font-medium text-emerald-900">
                Motorista logado: {motoristaLogadoMobile}
              </span>
              <button
                type="button"
                className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-0.5 text-[hsl(var(--muted-foreground))]"
                onClick={handleLogoutMotoristaMobile}
              >
                Sair
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Sem motorista logado
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full min-w-0 max-w-lg flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain overscroll-x-none px-3 pb-28 pt-2 min-[480px]:px-4">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[hsl(var(--border))]/80 bg-[hsl(var(--card))]/90 px-2 pb-[calc(0.5rem+var(--safe-bottom))] pt-2 backdrop-blur-2xl"
        style={{ paddingBottom: "max(0.5rem, var(--safe-bottom))" }}
        aria-label="Tipo de saída"
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <NavLink
            to="/saidas/administrativas"
            className={({ isActive }) =>
              cn(
                "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.7rem] font-semibold transition",
                isActive
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/25"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/50",
              )
            }
          >
            <Building2 className="h-5 w-5" aria-hidden />
            <span className="leading-none">Administrativas</span>
          </NavLink>
          <NavLink
            to="/saidas/ambulancia"
            className={({ isActive }) =>
              cn(
                "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.7rem] font-semibold transition",
                isActive
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary))]/25"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/50",
              )
            }
          >
            <Ambulance className="h-5 w-5" aria-hidden />
            <span className="leading-none">Ambulância</span>
          </NavLink>
        </div>
      </nav>
      {alarmToast ? (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+0.65rem)] z-[560] flex justify-center px-3">
          <div className="w-full max-w-lg rounded-xl border border-amber-300/80 bg-amber-100/95 px-3 py-2 shadow-lg backdrop-blur">
            <p className="text-sm font-semibold text-amber-900">{alarmToast.title}</p>
            <p className="text-xs text-amber-900/90">{alarmToast.body}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
