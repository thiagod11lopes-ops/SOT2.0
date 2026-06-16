import { CalendarDays, CheckCircle2, Clock, Lock, MapPin, Settings, Users } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
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
import type { DepartureRecord } from "../types/departure";
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

function buildSiadQuickDeparturePayload(params: {
  dataSaida: string;
  horaSaida: string;
  endereco: string;
  numeroPassageiros: string;
}): Omit<DepartureRecord, "id" | "createdAt"> {
  const endereco = params.endereco.trim();
  return {
    tipo: "Administrativa",
    dataPedido: getCurrentDatePtBr(),
    horaPedido: getCurrentTime(),
    dataSaida: params.dataSaida,
    horaSaida: params.horaSaida,
    setor: "SIAD",
    ramal: "",
    objetivoSaida: "Atendimento domiciliar",
    numeroPassageiros: params.numeroPassageiros,
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

export function SiadQuickDepartureFormPage() {
  const { addDeparture } = useDepartures();
  const { addItem: addCatalogItem } = useCatalogItems();

  const [dataSaida, setDataSaida] = useState(getCurrentDatePtBr);
  const [horaSaida, setHoraSaida] = useState("08:00");
  const [endereco, setEndereco] = useState("");
  const [numeroPassageiros, setNumeroPassageiros] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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

  const dateInvalid = !isCompleteDatePtBr(dataSaida) || !selectedDate;
  const horaSaidaInvalid = parseHhMm(horaSaida) === null;
  const enderecoInvalid = endereco.trim().length === 0;
  const passageirosInvalid = numeroPassageiros.trim().length === 0;
  const canSubmit = !dateInvalid && !horaSaidaInvalid && !enderecoInvalid && !passageirosInvalid;

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
      const payload = buildSiadQuickDeparturePayload({
        dataSaida: dataSaida.trim(),
        horaSaida: horaSaida.trim(),
        endereco,
        numeroPassageiros: numeroPassageiros.trim(),
      });
      addDeparture(payload);
      setSuccessMessage(`Saída cadastrada para ${payload.dataSaida} às ${payload.horaSaida}.`);
      setEndereco("");
      setNumeroPassageiros("");
      setSubmitAttempted(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[hsl(var(--background))]">
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

      {successMessage ? (
        <div
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

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
                Bairro
              </label>
              <input
                id={enderecoFieldId}
                type="text"
                list={enderecoListId}
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Bairro na RM-RJ"
                autoComplete="off"
                className={cn(
                  "h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-white px-3 text-sm shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  submitAttempted && enderecoInvalid && "border-red-500/90",
                )}
              />
              <datalist id={enderecoListId}>
                {neighborhoodOptions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Sugestões de bairros do Rio de Janeiro e região metropolitana. Você também pode digitar livremente.
              </p>
              {submitAttempted && enderecoInvalid ? (
                <p className="text-xs text-red-600">Informe o bairro de destino.</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor={passageirosFieldId}>
                <Users className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
                Número de Passageiros
              </label>
              <input
                id={passageirosFieldId}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={numeroPassageiros}
                onChange={(e) => setNumeroPassageiros(e.target.value.replace(/\D/g, ""))}
                placeholder="Somente números"
                className={cn(
                  "h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-white px-3 font-mono text-sm tabular-nums shadow-sm placeholder:font-sans placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  submitAttempted && passageirosInvalid && "border-red-500/90",
                )}
              />
              {submitAttempted && passageirosInvalid ? (
                <p className="text-xs text-red-600">Informe o número de passageiros.</p>
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
