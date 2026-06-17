import { CalendarDays, CheckCircle2, ChevronDown, Clock, Lock, MapPin, Plus, Scale, Settings, Sparkles, Users, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import {
  formatDateToPtBr,
  getCurrentDatePtBr,
  isCompleteDatePtBr,
  normalizeDatePtBrWithCaret,
  parsePtBrToDate,
} from "../lib/dateFormat";
import {
  getMetroRioNeighborhoodSuggestions,
  resolveMetroRioCityForNeighborhood,
} from "../lib/metroRioLocations";
import { normalize24hTime, parseHhMm } from "../lib/timeInput";
import {
  getSiadFormPassword,
  setSiadFormPassword,
  verifySiadFormPassword,
} from "../lib/siadFormPassword";
import { useSiadPwaShell } from "../lib/useSiadPwaShell";
import {
  describeSiadDriverRequestsForDate,
  purgeOrphanedSiadDriverRequests,
  resetSiadDriverRequestForDate,
} from "../lib/siadDriverRequest";
import { useSiadDriverRequest } from "../hooks/useSiadDriverRequest";
import { formatDestinosListaPt, type DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";
import { SiadStatisticsPanel } from "./siad-statistics-panel";
import { SiadDeparturesDayList } from "./siad-departures-day-list";

const SIAD_DEPARTURE_FORM_ID = "siad-departure-form";

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function dedupeTextosPreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function dedupeBairrosPreserveOrder(items: string[]): string[] {
  return dedupeTextosPreserveOrder(items);
}

const SIAD_PASSAGEIRO_POSTOS = [
  "Alte",
  "CMG",
  "CF",
  "CC",
  "CT",
  "1°TEN",
  "2°TEN",
  "GM",
  "SO",
  "1°SG",
  "2°SG",
  "3°SG",
  "CB",
  "MN",
] as const;

type SiadPassageiroRow = {
  nome: string;
  posto: string;
};

const EMPTY_SIAD_PASSAGEIRO: SiadPassageiroRow = { nome: "", posto: "" };

function formatPassageiroComPosto(row: SiadPassageiroRow): string {
  const nome = row.nome.trim();
  const posto = row.posto.trim();
  if (!nome) return "";
  return posto ? `${posto} ${nome}` : nome;
}

function dedupePassageirosPreserveOrder(items: SiadPassageiroRow[]): SiadPassageiroRow[] {
  const seen = new Set<string>();
  const out: SiadPassageiroRow[] = [];
  for (const item of items) {
    const nome = item.nome.trim();
    if (!nome) continue;
    const posto = item.posto.trim();
    const key = `${posto.toLowerCase()}|${nome.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ nome, posto });
  }
  return out;
}

function formatSiadObjetivoComPassageiros(passageiros: SiadPassageiroRow[]): string {
  const base = "Atendimento domiciliar";
  const labels = passageiros.map(formatPassageiroComPosto).filter(Boolean);
  if (labels.length === 0) return base;
  return `${base} — Passageiros: ${formatDestinosListaPt(labels)}`;
}

function buildSiadQuickDeparturePayload(params: {
  dataSaida: string;
  horaSaida: string;
  endereco: string;
  passageiros: SiadPassageiroRow[];
}): Omit<DepartureRecord, "id" | "createdAt"> {
  const endereco = params.endereco.trim();
  const passageiros = dedupePassageirosPreserveOrder(params.passageiros);
  return {
    tipo: "Administrativa",
    dataPedido: getCurrentDatePtBr(),
    horaPedido: getCurrentTime(),
    dataSaida: params.dataSaida,
    horaSaida: params.horaSaida,
    setor: "SIAD",
    ramal: "",
    objetivoSaida: formatSiadObjetivoComPassageiros(passageiros),
    numeroPassageiros: String(passageiros.length),
    responsavelPedido: "SIAD",
    om: "",
    viaturas: "ASD",
    motoristas: "ASD",
    hospitalDestino: "",
    tipoSaidaInterHospitalar: false,
    tipoSaidaAlta: false,
    tipoSaidaOutros: false,
    kmSaida: "",
    kmChegada: "",
    chegada: "",
    cidade: resolveMetroRioCityForNeighborhood(endereco),
    bairro: endereco,
    rubrica: "",
    cancelada: false,
    ocorrencias: "",
    ocorrenciasRubrica: "",
  };
}

function SiadCadastroSuccessModal({
  open,
  message,
  onClose,
}: {
  open: boolean;
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="siad-success-title"
      aria-describedby="siad-success-desc"
      aria-live="polite"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
        aria-label="Fechar confirmação"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/25 bg-gradient-to-br from-white via-white to-emerald-50/90 p-8 text-center shadow-[0_40px_100px_-24px_rgba(16,185,129,0.55),0_0_0_1px_rgba(255,255,255,0.5)_inset] dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/40">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-[hsl(var(--primary)/0.15)] blur-3xl" />
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/40">
            <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={2.25} aria-hidden />
          </div>
        </div>
        <div className="relative mt-6 space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Sucesso</span>
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <h2 id="siad-success-title" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Saída cadastrada
          </h2>
          <p id="siad-success-desc" className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {message}
          </p>
        </div>
        <Button
          type="button"
          className="relative mt-8 h-11 min-w-[9rem] rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-base font-semibold shadow-md shadow-emerald-500/30 hover:brightness-105"
          onClick={onClose}
        >
          OK
        </Button>
      </div>
    </div>,
    document.body,
  );
}

export function SiadQuickDepartureFormPage() {
  useSiadPwaShell();
  const { addDeparture, departures, initialLoadComplete } = useDepartures();
  const { addItem: addCatalogItem } = useCatalogItems();

  const [dataSaida, setDataSaida] = useState(getCurrentDatePtBr);
  const [horaSaida, setHoraSaida] = useState("08:00");
  const [bairros, setBairros] = useState<string[]>([""]);
  const [passageiros, setPassageiros] = useState<SiadPassageiroRow[]>([{ ...EMPTY_SIAD_PASSAGEIRO }]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [setorPassword, setSetorPassword] = useState(getSiadFormPassword);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loginSenha, setLoginSenha] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaNovaConfirmacao, setSenhaNovaConfirmacao] = useState("");
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [passwordFormSuccess, setPasswordFormSuccess] = useState<string | null>(null);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);
  const [addSaidaExpanded, setAddSaidaExpanded] = useState(false);
  const [motoristaResetDate, setMotoristaResetDate] = useState(getCurrentDatePtBr);
  const [motoristaResetMessage, setMotoristaResetMessage] = useState<string | null>(null);

  const motoristaResetStatus = useSiadDriverRequest(motoristaResetDate, horaSaida);

  useEffect(() => {
    if (!initialLoadComplete) return;
    purgeOrphanedSiadDriverRequests(departures, true);
  }, [departures, initialLoadComplete]);

  useEffect(() => {
    setSetorPassword(getSiadFormPassword());
  }, [passwordDialogOpen]);

  const motoristaResetSituacao = useMemo(
    () => describeSiadDriverRequestsForDate(motoristaResetDate, departures, initialLoadComplete),
    [motoristaResetDate, departures, initialLoadComplete],
  );

  useEffect(() => {
    if (!passwordDialogOpen) return;
    setMotoristaResetDate(dataSaida);
    setMotoristaResetMessage(null);
  }, [passwordDialogOpen, dataSaida]);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const pendingDateCaret = useRef<number | null>(null);
  const enderecoListId = useId();
  const dateFieldId = useId();
  const horaSaidaFieldId = useId();
  const enderecoFieldId = useId();
  const passageirosFieldId = useId();

  const neighborhoodOptions = useMemo(() => getMetroRioNeighborhoodSuggestions(), []);
  const selectedDate = useMemo(() => parsePtBrToDate(dataSaida), [dataSaida]);
  const bairrosPreenchidos = useMemo(
    () => dedupeBairrosPreserveOrder(bairros),
    [bairros],
  );
  const passageirosPreenchidos = useMemo(
    () => dedupePassageirosPreserveOrder(passageiros),
    [passageiros],
  );

  const dateInvalid = !isCompleteDatePtBr(dataSaida) || !selectedDate;
  const horaSaidaInvalid = parseHhMm(horaSaida) === null;
  const bairrosInvalid = bairrosPreenchidos.length === 0;
  const passageirosInvalid = passageirosPreenchidos.length === 0;
  const canSubmit = !dateInvalid && !horaSaidaInvalid && !bairrosInvalid && !passageirosInvalid;

  if (pendingDateCaret.current !== null && dateInputRef.current) {
    const caret = pendingDateCaret.current;
    pendingDateCaret.current = null;
    requestAnimationFrame(() => {
      dateInputRef.current?.setSelectionRange(caret, caret);
    });
  }

  function ensureSiadCatalogDefaults() {
    addCatalogItem("setores", "SIAD");
    addCatalogItem("responsaveis", "SIAD");
    addCatalogItem("viaturasAdministrativas", "ASD");
    addCatalogItem("motoristas", "ASD");
  }

  function handleAddBairro() {
    setBairros((prev) => [...prev, ""]);
  }

  function handleBairroChange(index: number, value: string) {
    setBairros((prev) => prev.map((b, i) => (i === index ? value : b)));
  }

  function handleRemoveBairro(index: number) {
    setBairros((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function handleAddPassageiro() {
    setPassageiros((prev) => [...prev, { ...EMPTY_SIAD_PASSAGEIRO }]);
  }

  function handlePassageiroNomeChange(index: number, value: string) {
    setPassageiros((prev) => prev.map((row, i) => (i === index ? { ...row, nome: value } : row)));
  }

  function handlePassageiroPostoChange(index: number, value: string) {
    setPassageiros((prev) => prev.map((row, i) => (i === index ? { ...row, posto: value } : row)));
  }

  function handleRemovePassageiro(index: number) {
    setPassageiros((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (!verifySiadFormPassword(loginSenha.trim())) {
      setLoginError("Senha incorreta.");
      return;
    }
    setLoginError(null);
    setLoginSenha("");
    setIsUnlocked(true);
  }

  function resetPasswordForm() {
    setSenhaAtual("");
    setSenhaNova("");
    setSenhaNovaConfirmacao("");
    setPasswordFormError(null);
    setPasswordFormSuccess(null);
    setMotoristaResetMessage(null);
  }

  function handleResetMotoristaRequest() {
    const date = motoristaResetDate.trim();
    if (!isCompleteDatePtBr(date)) {
      setMotoristaResetMessage("Informe uma data válida (dd/mm/aaaa).");
      return;
    }
    const removed = resetSiadDriverRequestForDate(date);
    if (removed === 0) {
      setMotoristaResetMessage(`Não há pedido de motorista para ${date}.`);
      return;
    }
    setMotoristaResetMessage(
      removed === 1
        ? `Pedido resetado para ${date}. Já é possível solicitar novamente.`
        : `${removed} pedidos resetados para ${date}. Já é possível solicitar novamente.`,
    );
    motoristaResetStatus.refresh();
  }

  function handlePasswordDialogChange(open: boolean) {
    setPasswordDialogOpen(open);
    if (!open) resetPasswordForm();
  }

  function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordFormError(null);
    setPasswordFormSuccess(null);

    if (!verifySiadFormPassword(senhaAtual.trim())) {
      setPasswordFormError("Senha atual incorreta.");
      return;
    }
    const nova = senhaNova.trim();
    const confirmacao = senhaNovaConfirmacao.trim();
    if (nova.length < 4) {
      setPasswordFormError("A nova senha deve ter pelo menos 4 caracteres.");
      return;
    }
    if (nova !== confirmacao) {
      setPasswordFormError("A confirmação não coincide com a nova senha.");
      return;
    }

    setSiadFormPassword(nova);
    setSetorPassword(nova);
    setSenhaAtual("");
    setSenhaNova("");
    setSenhaNovaConfirmacao("");
    setPasswordFormError(null);
    setPasswordFormSuccess("Senha alterada com sucesso.");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitAttempted(true);
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      ensureSiadCatalogDefaults();
      const base = {
        dataSaida: dataSaida.trim(),
        horaSaida: horaSaida.trim(),
        passageiros: passageirosPreenchidos,
      };
      for (const bairro of bairrosPreenchidos) {
        addDeparture(
          buildSiadQuickDeparturePayload({
            ...base,
            endereco: bairro,
          }),
        );
      }
      const count = bairrosPreenchidos.length;
      const passCount = passageirosPreenchidos.length;
      const passLabel = passCount === 1 ? "1 passageiro" : `${passCount} passageiros`;
      setSuccessMessage(
        count === 1
          ? `Saída registrada para ${base.dataSaida} às ${base.horaSaida} com ${passLabel}.`
          : `${count} saídas agrupadas registradas para ${base.dataSaida} às ${base.horaSaida} com ${passLabel}.`,
      );
      setSuccessModalOpen(true);
      setBairros([""]);
      setPassageiros([{ ...EMPTY_SIAD_PASSAGEIRO }]);
      setSubmitAttempted(false);
      setAddSaidaExpanded(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCloseSuccessModal() {
    setSuccessModalOpen(false);
    setSuccessMessage(null);
  }

  return (
    <div className="siad-pwa-scope relative bg-[hsl(var(--background))]">
      <SiadCadastroSuccessModal
        open={successModalOpen}
        message={successMessage ?? ""}
        onClose={handleCloseSuccessModal}
      />
      <SiadStatisticsPanel open={statsPanelOpen} onClose={() => setStatsPanelOpen(false)} />
      <Dialog open={!isUnlocked}>
        <DialogContent
          hideCloseButton
          className="max-w-sm w-[calc(100vw-2rem)] sm:w-full"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Acesso ao SIAD</DialogTitle>
            <DialogDescription>Informe a senha para usar o formulário de saídas.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="siad-login-senha">
                Senha
              </label>
              <input
                id="siad-login-senha"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                autoFocus
                value={loginSenha}
                onChange={(e) => setLoginSenha(e.target.value)}
                className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
            {loginError ? <p className="text-xs text-red-600">{loginError}</p> : null}
            <DialogFooter>
              <Button type="submit" className="w-full sm:w-auto">
                Entrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialogOpen} onOpenChange={handlePasswordDialogChange}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações SIAD</DialogTitle>
            <DialogDescription>
              Senha do formulário e reset do pedido de motorista por data da saída.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleChangePassword}>
            <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] p-4">
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Senha do formulário</h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Altere a senha exibida ao lado do campo Setor. A senha inicial é 0000.
              </p>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="siad-senha-atual">
                Senha atual
              </label>
              <input
                id="siad-senha-atual"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="siad-senha-nova">
                Nova senha
              </label>
              <input
                id="siad-senha-nova"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
                className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="siad-senha-confirmacao">
                Confirmar nova senha
              </label>
              <input
                id="siad-senha-confirmacao"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={senhaNovaConfirmacao}
                onChange={(e) => setSenhaNovaConfirmacao(e.target.value)}
                className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              />
            </div>
            {passwordFormError ? <p className="text-xs text-red-600">{passwordFormError}</p> : null}
            {passwordFormSuccess ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">{passwordFormSuccess}</p>
            ) : null}
            <Button type="submit" className="w-full sm:w-auto">
              Salvar senha
            </Button>
            </div>

            <div className="space-y-3 rounded-xl border border-orange-200/80 bg-orange-50/50 p-4 dark:border-orange-500/20 dark:bg-orange-950/20">
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Pedido de motorista</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="siad-motorista-reset-date">
                  Data da saída
                </label>
                <input
                  id="siad-motorista-reset-date"
                  type="date"
                  value={
                    motoristaResetDate.includes("/")
                      ? `${motoristaResetDate.slice(6, 10)}-${motoristaResetDate.slice(3, 5)}-${motoristaResetDate.slice(0, 2)}`
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const [y, m, d] = v.split("-");
                    setMotoristaResetDate(`${d}/${m}/${y}`);
                    setMotoristaResetMessage(null);
                  }}
                  className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                />
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Situação:{" "}
                <strong className="text-[hsl(var(--foreground))]">
                  {motoristaResetSituacao}
                </strong>
              </p>
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleResetMotoristaRequest}>
                Resetar pedido de motorista
              </Button>
              {motoristaResetMessage ? (
                <p
                  className={cn(
                    "text-xs",
                    motoristaResetMessage.startsWith("Pedido resetado")
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-[hsl(var(--muted-foreground))]",
                  )}
                >
                  {motoristaResetMessage}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handlePasswordDialogChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="siad-pwa-scroll">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 siad-pwa-safe-top">
      <div className="space-y-1 text-center sm:text-left">
        <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--primary))] sm:text-3xl">
          Saída administrativa SIAD
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Cadastro rápido de saídas do setor SIAD.
        </p>
      </div>

      <Card
        className={cn(
          "overflow-hidden border-[hsl(var(--border))] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.35)]",
          !isUnlocked && "pointer-events-none opacity-60",
        )}
      >
        <CardHeader className="relative border-b border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--primary)/0.12)] to-transparent pb-5">
          <div className="flex items-start justify-between gap-3 pr-1">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg">Saídas SIAD</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Data do dia, solicitação de motorista e cadastro de saídas
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="siad-pwa-touch-target h-10 w-10 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm touch-manipulation sm:h-9 sm:w-9"
                aria-label="Estatísticas de saídas SIAD"
                disabled={!isUnlocked}
                onClick={() => setStatsPanelOpen(true)}
              >
                <Scale className="h-4 w-4 text-[hsl(var(--primary))]" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="siad-pwa-touch-target h-10 w-10 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm touch-manipulation sm:h-9 sm:w-9"
                aria-label="Configurações do SIAD"
                disabled={!isUnlocked}
                onClick={() => setPasswordDialogOpen(true)}
              >
                <Settings className="h-4 w-4 text-[hsl(var(--primary))]" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form id={SIAD_DEPARTURE_FORM_ID} className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
            <div className="order-1 space-y-3">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <div
                  className={cn(
                    "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-800 to-[hsl(var(--primary)/0.85)] p-4 text-white shadow-lg shadow-slate-900/25 sm:p-5",
                    submitAttempted && dateInvalid && "ring-2 ring-red-400/80",
                  )}
                >
                  <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                  <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-[hsl(var(--primary))]/30 blur-2xl" />
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <input
                        ref={dateInputRef}
                        id={dateFieldId}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="dd/mm/aaaa"
                        aria-label="Data da saída (dd/mm/aaaa)"
                        value={dataSaida}
                        onChange={(event) => {
                          const el = event.target;
                          const start = el.selectionStart ?? el.value.length;
                          const { value, caret } = normalizeDatePtBrWithCaret(el.value, start);
                          pendingDateCaret.current = caret;
                          setDataSaida(value);
                        }}
                        className="h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-black/30 px-3 text-center font-mono text-base tabular-nums text-white placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      />
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          className="h-11 w-11 shrink-0 rounded-xl bg-white text-[hsl(var(--primary))] shadow-md hover:bg-white/90"
                          aria-label="Abrir calendário"
                        >
                          <CalendarDays className="h-5 w-5" />
                        </Button>
                      </PopoverTrigger>
                    </div>
                  </div>
                </div>
                <PopoverContent align="center" className="border-0 bg-transparent p-0 shadow-none">
                  <Calendar
                    mode="single"
                    selected={selectedDate ?? undefined}
                    defaultMonth={selectedDate ?? new Date()}
                    onSelect={(d) => {
                      if (!d) return;
                      setDataSaida(formatDateToPtBr(d));
                      setCalendarOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              {submitAttempted && dateInvalid ? (
                <p className="text-xs text-red-600">Informe uma data válida (dd/mm/aaaa).</p>
              ) : null}
            </div>

            <div className="order-3 space-y-0 sm:order-2">
              <button
                type="button"
                onClick={() => setAddSaidaExpanded((expanded) => !expanded)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.1)] px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-[hsl(var(--muted)/0.16)]",
                  addSaidaExpanded && "rounded-b-none border-b-transparent",
                )}
                aria-expanded={addSaidaExpanded}
                aria-controls="siad-add-saida-panel"
              >
                <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Adicionar Saída</span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-[hsl(var(--primary))] transition-transform duration-200",
                    addSaidaExpanded && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>

              {addSaidaExpanded ? (
                <div
                  id="siad-add-saida-panel"
                  className="space-y-6 rounded-2xl rounded-t-none border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:p-5"
                >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex min-h-[1.25rem] flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium" htmlFor="siad-setor">
                    <Lock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />
                    Setor
                  </label>
                  <span
                    className="select-all font-mono text-xs text-transparent selection:bg-[hsl(var(--primary)/0.18)] selection:text-[hsl(var(--foreground))]"
                    title="Selecione para copiar a senha"
                    aria-label="Senha do setor: selecione para copiar"
                  >
                    {setorPassword}
                  </span>
                </div>
                <input
                  id="siad-setor"
                  type="text"
                  value="SIAD"
                  readOnly
                  disabled
                  aria-readonly="true"
                  className="h-11 w-full cursor-not-allowed rounded-xl border border-[hsl(var(--border))] bg-slate-100 px-3 text-sm font-medium text-[hsl(var(--muted-foreground))] shadow-sm opacity-90"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium" htmlFor={horaSaidaFieldId}>
                  <Clock className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
                  Hora da Saída
                </label>
                <input
                  id={horaSaidaFieldId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="HH:MM"
                  aria-label="Hora da saída (HH:MM)"
                  value={horaSaida}
                  onChange={(event) => setHoraSaida(normalize24hTime(event.target.value))}
                  className={cn(
                    "h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-white px-3 text-center font-mono text-sm tabular-nums shadow-sm placeholder:font-sans placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                    submitAttempted && horaSaidaInvalid && "border-red-500/90",
                  )}
                />
                {submitAttempted && horaSaidaInvalid ? (
                  <p className="text-xs text-red-600">Informe um horário válido (HH:MM).</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor={enderecoFieldId}>
                <MapPin className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
                Bairro{bairros.length > 1 ? "s" : ""}
              </label>
              <div className="space-y-2">
                {bairros.map((bairro, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      id={index === 0 ? enderecoFieldId : undefined}
                      type="text"
                      list={enderecoListId}
                      value={bairro}
                      onChange={(e) => handleBairroChange(index, e.target.value)}
                      placeholder="Bairro na RM-RJ"
                      autoComplete="off"
                      aria-label={index === 0 ? "Bairro" : `Bairro ${index + 1}`}
                      className={cn(
                        "h-11 min-w-0 flex-1 rounded-xl border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                        submitAttempted && bairrosInvalid && index === 0 && "border-red-500/90",
                      )}
                    />
                    {index === 0 ? (
                      <Button
                        type="button"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-xl"
                        aria-label="Adicionar outro bairro"
                        onClick={handleAddBairro}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-xl"
                        aria-label={`Remover bairro ${index + 1}`}
                        onClick={() => handleRemoveBairro(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <datalist id={enderecoListId}>
                {neighborhoodOptions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Use o botão + para cadastrar vários bairros na mesma saída agrupada (mesma data, hora e viatura).
              </p>
              {submitAttempted && bairrosInvalid ? (
                <p className="text-xs text-red-600">Informe ao menos um bairro de destino.</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-medium" htmlFor={passageirosFieldId}>
                  <Users className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
                  Passageiros
                </label>
                {passageirosPreenchidos.length > 0 ? (
                  <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--primary))]">
                    {passageirosPreenchidos.length}{" "}
                    {passageirosPreenchidos.length === 1 ? "passageiro" : "passageiros"}
                  </span>
                ) : null}
              </div>
              <div className="space-y-2">
                {passageiros.map((passageiro, index) => (
                  <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={passageiro.posto}
                      onChange={(e) => handlePassageiroPostoChange(index, e.target.value)}
                      aria-label={
                        index === 0 ? "Posto/Grad do passageiro" : `Posto/Grad do passageiro ${index + 1}`
                      }
                      className="h-11 w-full shrink-0 rounded-xl border border-[hsl(var(--border))] bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:w-[7.25rem]"
                    >
                      <option value="">Posto/Grad</option>
                      {SIAD_PASSAGEIRO_POSTOS.map((posto) => (
                        <option key={posto} value={posto}>
                          {posto}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        id={index === 0 ? passageirosFieldId : undefined}
                        type="text"
                        value={passageiro.nome}
                        onChange={(e) => handlePassageiroNomeChange(index, e.target.value)}
                        placeholder="Nome do passageiro"
                        autoComplete="name"
                        aria-label={index === 0 ? "Nome do passageiro" : `Nome do passageiro ${index + 1}`}
                        className={cn(
                          "h-11 min-w-0 flex-1 rounded-xl border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                          submitAttempted && passageirosInvalid && index === 0 && "border-red-500/90",
                        )}
                      />
                      {index === 0 ? (
                        <Button
                          type="button"
                          size="icon"
                          className="siad-pwa-touch-target h-11 w-11 shrink-0 rounded-xl touch-manipulation"
                          aria-label="Adicionar outro passageiro"
                          onClick={handleAddPassageiro}
                        >
                          <Plus className="h-5 w-5" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="siad-pwa-touch-target h-11 w-11 shrink-0 rounded-xl touch-manipulation"
                          aria-label={`Remover passageiro ${index + 1}`}
                          onClick={() => handleRemovePassageiro(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Cada passageiro cadastrado conta como um no sistema. Use o botão + para adicionar mais passageiros, como nos bairros.
              </p>
              {submitAttempted && passageirosInvalid ? (
                <p className="text-xs text-red-600">Informe ao menos um passageiro.</p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="siad-pwa-touch-target h-12 w-full rounded-xl text-base font-semibold shadow-md touch-manipulation"
              disabled={submitting || !isUnlocked}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden />
              {submitting ? "Cadastrando…" : "Cadastrar saída"}
            </Button>
                </div>
              ) : null}
            </div>

            <div className="order-2 sm:order-3">
              <SiadDeparturesDayList
                departures={departures}
                dateSaida={dataSaida}
                driverRequestDisabled={!isUnlocked || dateInvalid}
              />
            </div>
          </form>
        </CardContent>
      </Card>
      </div>
      </div>
    </div>
  );
}
