import { CalendarDays, CheckCircle2, MapPin, Users } from "lucide-react";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useAppTab } from "../context/app-tab-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { stashDeparturesListFilterFromCadastro } from "../lib/departuresListFilterCadastro";
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
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
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
  endereco: string;
  numeroPassageiros: string;
}): Omit<DepartureRecord, "id" | "createdAt"> {
  const endereco = params.endereco.trim();
  return {
    tipo: "Administrativa",
    dataPedido: getCurrentDatePtBr(),
    horaPedido: getCurrentTime(),
    dataSaida: params.dataSaida,
    horaSaida: "08:00",
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
  const {
    setActiveTab: setMainAppTab,
    setPendingDeparturesFilterDatePtBr,
    bumpDeparturesListMountKey,
  } = useAppTab();

  const [dataSaida, setDataSaida] = useState(getCurrentDatePtBr);
  const [endereco, setEndereco] = useState("");
  const [numeroPassageiros, setNumeroPassageiros] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const pendingDateCaret = useRef<number | null>(null);
  const enderecoListId = useId();
  const dateFieldId = useId();
  const enderecoFieldId = useId();
  const passageirosFieldId = useId();

  const neighborhoodOptions = useMemo(() => getMetroRioNeighborhoodSuggestions(), []);
  const selectedDate = useMemo(() => parsePtBrToDate(dataSaida), [dataSaida]);

  const dateInvalid = !isCompleteDatePtBr(dataSaida) || !selectedDate;
  const enderecoInvalid = endereco.trim().length === 0;
  const passageirosInvalid = numeroPassageiros.trim().length === 0;
  const canSubmit = !dateInvalid && !enderecoInvalid && !passageirosInvalid;

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitAttempted(true);
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      ensureSiadCatalogDefaults();
      const payload = buildSiadQuickDeparturePayload({
        dataSaida: dataSaida.trim(),
        endereco,
        numeroPassageiros: numeroPassageiros.trim(),
      });
      addDeparture(payload);
      stashDeparturesListFilterFromCadastro(payload.dataSaida);
      flushSync(() => {
        setPendingDeparturesFilterDatePtBr(payload.dataSaida);
        bumpDeparturesListMountKey();
        setMainAppTab("Saídas Administrativas");
      });
      if (typeof window !== "undefined" && /^#\/siad-saida(\/|$)/.test(window.location.hash)) {
        window.location.hash = "";
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="space-y-1 text-center sm:text-left">
        <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--primary))] sm:text-3xl">
          Saída administrativa SIAD
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Preencha os dados e cadastre direto na tabela de saídas administrativas.
        </p>
      </div>

      <Card className="overflow-hidden border-[hsl(var(--border))] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.35)]">
        <CardHeader className="border-b border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--primary)/0.12)] to-transparent pb-5">
          <CardTitle className="text-lg">Novo registro</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Setor SIAD — destino e passageiros</p>
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

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="siad-setor">
                Setor
              </label>
              <input
                id="siad-setor"
                type="text"
                value="SIAD"
                readOnly
                className="h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-slate-50 px-3 text-sm font-medium text-[hsl(var(--foreground))] shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor={enderecoFieldId}>
                <MapPin className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
                Endereço
              </label>
              <input
                id={enderecoFieldId}
                type="text"
                list={enderecoListId}
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Bairro ou endereço na RM-RJ"
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
                <p className="text-xs text-red-600">Informe o endereço ou bairro de destino.</p>
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
              {submitting ? "Cadastrando…" : "Cadastrar e abrir tabela"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
