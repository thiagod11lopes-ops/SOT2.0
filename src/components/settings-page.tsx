import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useDeparturesReportEmail } from "../context/departures-report-email-context";
import { useDepartures } from "../context/departures-context";
import { useSyncPreference } from "../context/sync-preference-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { Loader2 } from "lucide-react";
import {
  loadDetalheServicoBundleFromIdb,
  normalizeDetalheServicoBundle,
  type DetalheServicoBundle,
} from "../lib/detalheServicoBundle";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { isFirebaseConfigured } from "../lib/firebase/config";
import { SOT_STATE_DOC, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
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
import {
  readWhatsAppCloudApiConfig,
  saveWhatsAppCloudApiConfig,
  saveWhatsAppProxyBaseUrl,
  sendWhatsAppTemplateHelloWorld,
  sendWhatsAppTextMessage,
} from "../lib/whatsappCloudApi";
import type { DepartureRecord } from "../types/departure";
import type { DeparturesExportFile } from "../lib/adminDeparturesExport";
import { parseDeparturesFromImportFile } from "../lib/adminDeparturesExport";
import {
  buildBackupPreviewItems,
  exportFullBackupFromFirebase,
  type FirebaseFullBackup,
  parseFullBackupJson,
  pushLocalOperationalStateToFirebase,
  restoreFullBackupToLocal,
} from "../lib/firebase/systemBackup";
import { cn } from "../lib/utils";
import { SettingsVistoriaClearCalendarModal } from "./settings-vistoria-clear-calendar-modal";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type SavePeriodMode = "full" | "month" | "year";

const SETTINGS_SECTIONS = [
  { id: "settings-sync", label: "Modo de sincronização" },
  { id: "settings-senha-km", label: "Senha — KM e chegada" },
  { id: "settings-saidas", label: "Saídas" },
  { id: "settings-email-pdf", label: "E-mail do relatório PDF" },
  { id: "settings-whatsapp-vistoria", label: "WhatsApp — vistoria" },
  { id: "settings-vistoria-cal", label: "Vistoria — calendário" },
  { id: "settings-zona-risco", label: "Zona de risco" },
] as const;

const SETTINGS_PANEL_CLASS =
  "space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm sm:p-5";

type VistoriaWhatsappContact = {
  motorista: string;
  telefone: string;
};

const VISTORIA_WHATSAPP_CONTACTS_KEY = "sot_vistoria_whatsapp_contacts_v1";
const VISTORIA_WHATSAPP_TRIGGER_TIME_KEY = "sot_vistoria_whatsapp_trigger_time_v1";
const VISTORIA_WHATSAPP_MESSAGE_TEMPLATE_KEY = "sot_vistoria_whatsapp_message_template_v1";
const DEFAULT_VISTORIA_WHATSAPP_TRIGGER_TIME = "14:00";
const DEFAULT_VISTORIA_WHATSAPP_MESSAGE_TEMPLATE =
  "SOT 2.0 - Aviso de vistoria\nMotorista: {motorista}\nData: {data}\nHá viatura(s) pendente(s) de vistoria: {placas}.\nPor favor, realize a vistoria o quanto antes.";

function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

function formatPhone(input: string): string {
  const digits = normalizePhone(input).slice(0, 13);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
}

function loadVistoriaWhatsappContacts(): VistoriaWhatsappContact[] {
  if (typeof localStorage === "undefined") return [];
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

function loadVistoriaWhatsappTriggerTime(): string {
  if (typeof localStorage === "undefined") return DEFAULT_VISTORIA_WHATSAPP_TRIGGER_TIME;
  try {
    const raw = String(localStorage.getItem(VISTORIA_WHATSAPP_TRIGGER_TIME_KEY) ?? "").trim();
    return /^\d{2}:\d{2}$/.test(raw) ? raw : DEFAULT_VISTORIA_WHATSAPP_TRIGGER_TIME;
  } catch {
    return DEFAULT_VISTORIA_WHATSAPP_TRIGGER_TIME;
  }
}

function loadVistoriaWhatsappMessageTemplate(): string {
  if (typeof localStorage === "undefined") return DEFAULT_VISTORIA_WHATSAPP_MESSAGE_TEMPLATE;
  try {
    const raw = String(localStorage.getItem(VISTORIA_WHATSAPP_MESSAGE_TEMPLATE_KEY) ?? "");
    return raw.trim() ? raw : DEFAULT_VISTORIA_WHATSAPP_MESSAGE_TEMPLATE;
  } catch {
    return DEFAULT_VISTORIA_WHATSAPP_MESSAGE_TEMPLATE;
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
  const [savePeriodMode, setSavePeriodMode] = useState<SavePeriodMode>("full");
  const [saveMonthValue, setSaveMonthValue] = useState(currentMonthInputValue);
  const [saveYearValue, setSaveYearValue] = useState(() => String(new Date().getFullYear()));
  const [fullBackupBusy, setFullBackupBusy] = useState(false);
  const [firebaseModeBusy, setFirebaseModeBusy] = useState(false);
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
  const [whatsMotorista, setWhatsMotorista] = useState("");
  const [whatsTelefone, setWhatsTelefone] = useState("");
  const [vistoriaWhatsappContacts, setVistoriaWhatsappContacts] = useState<VistoriaWhatsappContact[]>(
    () => loadVistoriaWhatsappContacts(),
  );
  const [testingWhatsappMotorista, setTestingWhatsappMotorista] = useState<string | null>(null);
  const [vistoriaWhatsappTriggerTime, setVistoriaWhatsappTriggerTime] = useState<string>(() =>
    loadVistoriaWhatsappTriggerTime(),
  );
  const [vistoriaWhatsappMessageTemplate, setVistoriaWhatsappMessageTemplate] = useState<string>(() =>
    loadVistoriaWhatsappMessageTemplate(),
  );
  const [whatsMessageModalOpen, setWhatsMessageModalOpen] = useState(false);
  const [whatsMessageDraft, setWhatsMessageDraft] = useState<string>(() => loadVistoriaWhatsappMessageTemplate());
  const [whatsApiToken, setWhatsApiToken] = useState<string>(() => readWhatsAppCloudApiConfig().token);
  const [whatsApiPhoneNumberId, setWhatsApiPhoneNumberId] = useState<string>(() => readWhatsAppCloudApiConfig().phoneNumberId);
  const [whatsApiProxyBaseUrl, setWhatsApiProxyBaseUrl] = useState<string>(() => readWhatsAppCloudApiConfig().proxyBaseUrl);

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
      localStorage.setItem(VISTORIA_WHATSAPP_CONTACTS_KEY, JSON.stringify(vistoriaWhatsappContacts));
    } catch {
      /* ignore */
    }
  }, [vistoriaWhatsappContacts]);
  useEffect(() => {
    try {
      localStorage.setItem(VISTORIA_WHATSAPP_TRIGGER_TIME_KEY, vistoriaWhatsappTriggerTime);
    } catch {
      /* ignore */
    }
  }, [vistoriaWhatsappTriggerTime]);
  useEffect(() => {
    try {
      localStorage.setItem(VISTORIA_WHATSAPP_MESSAGE_TEMPLATE_KEY, vistoriaWhatsappMessageTemplate);
    } catch {
      /* ignore */
    }
  }, [vistoriaWhatsappMessageTemplate]);
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

  function handleAddVistoriaWhatsappContact() {
    const motorista = whatsMotorista.trim();
    const telefone = normalizePhone(whatsTelefone);
    if (!motorista) {
      window.alert("Selecione um motorista.");
      return;
    }
    if (telefone.length < 10) {
      window.alert("Informe um número de telefone válido com DDD.");
      return;
    }
    setVistoriaWhatsappContacts((prev) => {
      const already = prev.some((row) => row.motorista.toLowerCase() === motorista.toLowerCase());
      if (already) {
        return prev.map((row) =>
          row.motorista.toLowerCase() === motorista.toLowerCase() ? { ...row, telefone } : row,
        );
      }
      return [...prev, { motorista, telefone }].sort((a, b) => a.motorista.localeCompare(b.motorista, "pt-BR"));
    });
    setWhatsTelefone("");
  }

  function handleRemoveVistoriaWhatsappContact(motorista: string) {
    setVistoriaWhatsappContacts((prev) => prev.filter((row) => row.motorista !== motorista));
  }

  async function handleTestVistoriaWhatsappContact(row: VistoriaWhatsappContact) {
    setTestingWhatsappMotorista(row.motorista);
    const now = new Date();
    const text =
      `SOT 2.0 - Mensagem de teste\n` +
      `Motorista: ${row.motorista}\n` +
      `Data: ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR")}\n` +
      `Envio imediato de teste do WhatsApp da vistoria.`;
    const textResult = await sendWhatsAppTextMessage(row.telefone, text);
    if (!textResult.ok) {
      const templateResult = await sendWhatsAppTemplateHelloWorld(row.telefone);
      if (!templateResult.ok) {
        window.alert(`Falha no envio de teste via WhatsApp API: ${textResult.error}`);
        setTestingWhatsappMotorista(null);
        return;
      }
      window.alert(
        `Teste enviado para ${row.motorista} com template padrao (a conta pode estar fora da janela de 24h).`,
      );
      setTestingWhatsappMotorista(null);
      return;
    }
    window.alert(`Mensagem de teste enviada imediatamente para ${row.motorista}.`);
    setTestingWhatsappMotorista(null);
  }

  function handleSaveWhatsMessageTemplate() {
    const trimmed = whatsMessageDraft.trim();
    if (!trimmed) {
      window.alert("A mensagem automática não pode ficar vazia.");
      return;
    }
    setVistoriaWhatsappMessageTemplate(trimmed);
    setWhatsMessageModalOpen(false);
  }

  function handleSaveWhatsApiConfig() {
    const token = whatsApiToken.trim();
    const phoneNumberId = whatsApiPhoneNumberId.trim();
    const proxyBaseUrl = whatsApiProxyBaseUrl.trim();
    if (!proxyBaseUrl && (!token || !phoneNumberId)) {
      window.alert("Preencha Access Token + Phone Number ID, ou a URL base do Proxy.");
      return;
    }
    saveWhatsAppCloudApiConfig({ token, phoneNumberId });
    saveWhatsAppProxyBaseUrl(proxyBaseUrl);
    window.alert("Configuração da API do WhatsApp salva neste navegador.");
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
      await pushLocalOperationalStateToFirebase();
      setFirebaseOnlyEnabled(true);
      window.alert(
        "Dados locais (saídas, catálogos, detalhe de serviço, vistoria em cache, etc.) foram enviados para o Firebase. O modo «somente Firebase» foi ativado.",
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
          window.alert("Backup geral carregado na memória local. A página será recarregada.");
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
            Ao ativar esta opção, o sistema envia primeiro todo o estado local (IndexedDB e cópias em
            localStorage) para o Firebase e só depois passa a modo nuvem. Quando ativo: leitura/escrita na nuvem.
            Quando desativado: apenas dados locais, sem sincronização com a nuvem.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              type="button"
              variant="default"
              onClick={handleAbrirPreviewBackupGeral}
              disabled={fullBackupBusy}
            >
              {fullBackupBusy ? "Processando..." : "Backup geral do Firebase"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCarregarBackupGeralClick}
              disabled={firebaseOnlyEnabled || fullBackupBusy}
            >
              Carregar backup geral (local)
            </Button>
            <input
              ref={fullBackupFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFullBackupFileChange}
            />
          </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  O carregamento do backup geral só é permitido em modo local para evitar conflito e sobrescrita na nuvem.
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

              {activeSectionId === "settings-whatsapp-vistoria" ? (
              <section className={SETTINGS_PANEL_CLASS} aria-labelledby="settings-heading-whatsapp-vistoria">
                <h3 id="settings-heading-whatsapp-vistoria" className="text-base font-semibold text-[hsl(var(--foreground))]">
                  WhatsApp — vistoria
                </h3>
                <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                  Cadastre os contatos dos motoristas para aviso de vistoria no WhatsApp.
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="vistoria-whats-trigger-time">
                      Horário de disparo
                    </label>
                    <input
                      id="vistoria-whats-trigger-time"
                      type="time"
                      value={vistoriaWhatsappTriggerTime}
                      onChange={(e) => setVistoriaWhatsappTriggerTime(e.target.value)}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                    />
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    A mensagem automática será avaliada todos os dias a partir desse horário.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={() => {
                      setWhatsMessageDraft(vistoriaWhatsappMessageTemplate);
                      setWhatsMessageModalOpen(true);
                    }}
                  >
                    Editar mensagem automática
                  </Button>
                </div>
                <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.1] p-3 space-y-2">
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">Configuração da API (produção/pages)</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px_1fr_auto] md:items-end">
                    <div className="space-y-1">
                      <label
                        className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
                        htmlFor="vistoria-whats-api-token"
                      >
                        Access Token
                      </label>
                      <input
                        id="vistoria-whats-api-token"
                        type="password"
                        value={whatsApiToken}
                        onChange={(e) => setWhatsApiToken(e.target.value)}
                        className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                        placeholder="Cole o token da Cloud API"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
                        htmlFor="vistoria-whats-api-phone-id"
                      >
                        Phone Number ID
                      </label>
                      <input
                        id="vistoria-whats-api-phone-id"
                        type="text"
                        value={whatsApiPhoneNumberId}
                        onChange={(e) => setWhatsApiPhoneNumberId(e.target.value)}
                        className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                        placeholder="Ex.: 1141540469032095"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
                        htmlFor="vistoria-whats-api-proxy-url"
                      >
                        URL base do Proxy (recomendado)
                      </label>
                      <input
                        id="vistoria-whats-api-proxy-url"
                        type="text"
                        value={whatsApiProxyBaseUrl}
                        onChange={(e) => setWhatsApiProxyBaseUrl(e.target.value)}
                        className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                        placeholder="https://seu-backend.onrender.com"
                      />
                    </div>
                    <Button type="button" variant="outline" className="h-10" onClick={handleSaveWhatsApiConfig}>
                      Salvar API
                    </Button>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Em GitHub Pages, prefira usar a URL do Proxy para evitar bloqueio CORS da Meta.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="vistoria-whats-motorista">
                      Motorista
                    </label>
                    <select
                      id="vistoria-whats-motorista"
                      value={whatsMotorista}
                      onChange={(e) => setWhatsMotorista(e.target.value)}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                    >
                      <option value="">Selecione</option>
                      {motoristasCatalogo.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="vistoria-whats-telefone">
                      Telefone (WhatsApp)
                    </label>
                    <input
                      id="vistoria-whats-telefone"
                      type="text"
                      inputMode="numeric"
                      placeholder="(11) 99999-9999"
                      value={formatPhone(whatsTelefone)}
                      onChange={(e) => setWhatsTelefone(e.target.value)}
                      className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm"
                    />
                  </div>
                  <Button type="button" variant="default" className="h-10" onClick={handleAddVistoriaWhatsappContact}>
                    Salvar contato
                  </Button>
                </div>
                {motoristasCatalogo.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Cadastre motoristas em <strong>Frota e Pessoal</strong> para habilitar o seletor.
                  </p>
                ) : null}
                {vistoriaWhatsappContacts.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum contato de motorista cadastrado.</p>
                ) : (
                  <ul className="space-y-2">
                    {vistoriaWhatsappContacts.map((row) => (
                      <li
                        key={row.motorista}
                        className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.15] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{row.motorista}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatPhone(row.telefone)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            disabled={testingWhatsappMotorista === row.motorista}
                            onClick={() => {
                              void handleTestVistoriaWhatsappContact(row);
                            }}
                          >
                            {testingWhatsappMotorista === row.motorista ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Enviando...
                              </span>
                            ) : (
                              "Teste"
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 border-red-300 text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveVistoriaWhatsappContact(row.motorista)}
                          >
                            Remover
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
      {whatsMessageModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="border-b border-[hsl(var(--border))]">
              <CardTitle>Mensagem automática de vistoria</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Variáveis disponíveis: {"{motorista}"}, {"{data}"}, {"{placas}"}.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <textarea
                value={whatsMessageDraft}
                onChange={(e) => setWhatsMessageDraft(e.target.value)}
                rows={8}
                className="w-full rounded-md border border-[hsl(var(--border))] bg-white p-3 text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setWhatsMessageDraft(DEFAULT_VISTORIA_WHATSAPP_MESSAGE_TEMPLATE)}
                >
                  Restaurar padrão
                </Button>
                <Button type="button" variant="outline" onClick={() => setWhatsMessageModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleSaveWhatsMessageTemplate}>
                  Salvar mensagem
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
