import { CalendarDays, CheckCircle2, Clock, Lock, MapPin, Plus, Settings, Sparkles, Users, X } from "lucide-react";
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

const WEEKDAY_NAMES_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatWeekdayCommaDatePtBr(d: Date): string {
  return `${WEEKDAY_NAMES_PT[d.getDay()]}, ${formatDateToPtBr(d)}`;
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

function formatSiadObjetivoComPassageiros(nomes: string[]): string {
  const base = "Atendimento domiciliar";
  if (nomes.length === 0) return base;
  return `${base} — Passageiros: ${formatDestinosListaPt(nomes)}`;
}

function buildSiadQuickDeparturePayload(params: {
  dataSaida: string;
  horaSaida: string;
  endereco: string;
  passageirosNomes: string[];
}): Omit<DepartureRecord, "id" | "createdAt"> {
  const endereco = params.endereco.trim();
  const nomes = dedupeTextosPreserveOrder(params.passageirosNomes);
  return {
    tipo: "Administrativa",
    dataPedido: getCurrentDatePtBr(),
    horaPedido: getCurrentTime(),
    dataSaida: params.dataSaida,
    horaSaida: params.horaSaida,
    setor: "SIAD",
    ramal: "",
    objetivoSaida: formatSiadObjetivoComPassageiros(nomes),
    numeroPassageiros: String(nomes.length),
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
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
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
  const { addDeparture } = useDepartures();
  const { addItem: addCatalogItem } = useCatalogItems();

  const [dataSaida, setDataSaida] = useState(getCurrentDatePtBr);
  const [horaSaida, setHoraSaida] = useState("08:00");
  const [bairros, setBairros] = useState<string[]>([""]);
  const [passageirosNomes, setPassageirosNomes] = useState<string[]>([""]);
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

  useEffect(() => {
    setSetorPassword(getSiadFormPassword());
  }, [passwordDialogOpen]);

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
    () => dedupeTextosPreserveOrder(passageirosNomes),
    [passageirosNomes],
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
    setPassageirosNomes((prev) => [...prev, ""]);
  }

  function handlePassageiroChange(index: number, value: string) {
    setPassageirosNomes((prev) => prev.map((nome, i) => (i === index ? value : nome)));
  }

  function handleRemovePassageiro(index: number) {
    setPassageirosNomes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
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
        passageirosNomes: passageirosPreenchidos,
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
      setPassageirosNomes([""]);
      setSubmitAttempted(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCloseSuccessModal() {
    setSuccessModalOpen(false);
    setSuccessMessage(null);
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[hsl(var(--background))]">
      <SiadCadastroSuccessModal
        open={successModalOpen}
        message={successMessage ?? ""}
        onClose={handleCloseSuccessModal}
      />
      <Dialog open={!isUnlocked}>
        <DialogContent
          hideCloseButton
          className="max-w-sm"
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar senha</DialogTitle>
            <DialogDescription>
              Altere a senha exibida ao lado do campo Setor. A senha inicial é 0000.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleChangePassword}>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handlePasswordDialogChange(false)}>
                Fechar
              </Button>
              <Button type="submit">Salvar senha</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="space-y-1 text-center sm:text-left">
        <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--primary))] sm:text-3xl">
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
              <CardTitle className="text-lg">Novo registro</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Setor SIAD — data, hora, bairro e passageiros
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
              aria-label="Configurar senha do SIAD"
              disabled={!isUnlocked}
              onClick={() => setPasswordDialogOpen(true)}
            >
              <Settings className="h-4 w-4 text-[hsl(var(--primary))]" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={dateFieldId}>
                Data
              </label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <div
                  className={cn(
                    "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-800 to-[hsl(var(--primary)/0.85)] p-4 text-white shadow-lg shadow-slate-900/25",
                    submitAttempted && dateInvalid && "ring-2 ring-red-400/80",
                  )}
                >
                  <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                  <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-[hsl(var(--primary))]/30 blur-2xl" />
                  <div className="relative flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/70">
                        Data da saída
                      </p>
                      <p className="truncate text-xl font-semibold tabular-nums sm:text-2xl">
                        {selectedDate ? formatWeekdayCommaDatePtBr(selectedDate) : "Selecione a data"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-white/25 bg-white/15 text-white hover:bg-white/25"
                        onClick={() => {
                          const hoje = getCurrentDatePtBr();
                          setDataSaida(hoje);
                          setCalendarOpen(false);
                        }}
                      >
                        Hoje
                      </Button>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          className="h-11 w-11 rounded-xl bg-white text-[hsl(var(--primary))] shadow-md hover:bg-white/90"
                          aria-label="Abrir calendário"
                        >
                          <CalendarDays className="h-5 w-5" />
                        </Button>
                      </PopoverTrigger>
                    </div>
                  </div>
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
                    className="relative mt-3 h-10 w-full rounded-xl border border-white/20 bg-black/20 px-3 text-center font-mono text-sm tabular-nums text-white placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  />
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
                  aria-describedby="siad-setor-hint"
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
            <p id="siad-setor-hint" className="text-xs text-[hsl(var(--muted-foreground))]">
              Setor bloqueado: este formulário é exclusivo para <strong>SIAD</strong> e o setor não pode ser alterado.
              A senha ao lado do título fica invisível, mas pode ser selecionada para copiar.
            </p>

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
                {passageirosNomes.map((nome, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      id={index === 0 ? passageirosFieldId : undefined}
                      type="text"
                      value={nome}
                      onChange={(e) => handlePassageiroChange(index, e.target.value)}
                      placeholder="Nome do passageiro"
                      autoComplete="name"
                      aria-label={index === 0 ? "Passageiro" : `Passageiro ${index + 1}`}
                      className={cn(
                        "h-11 min-w-0 flex-1 rounded-xl border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                        submitAttempted && passageirosInvalid && index === 0 && "border-red-500/90",
                      )}
                    />
                    {index === 0 ? (
                      <Button
                        type="button"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-xl"
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
                        className="h-11 w-11 shrink-0 rounded-xl"
                        aria-label={`Remover passageiro ${index + 1}`}
                        onClick={() => handleRemovePassageiro(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Cada nome cadastrado conta como um passageiro no sistema. Use o botão + para incluir mais pessoas.
              </p>
              {submitAttempted && passageirosInvalid ? (
                <p className="text-xs text-red-600">Informe ao menos um passageiro.</p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-base font-semibold shadow-md"
              disabled={submitting}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden />
              {submitting ? "Cadastrando…" : "Cadastrar saída"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
