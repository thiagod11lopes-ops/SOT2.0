import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import type { DepartureType } from "../types/departure";
import {
  formatDateToPtBr,
  getCurrentDatePtBr,
  normalizeDatePtBrWithCaret,
  parsePtBrToDate,
} from "../lib/dateFormat";
import { downloadDeparturesListPdf } from "../lib/generateDeparturesPdf";
import { cn } from "../lib/utils";
import { DeparturesDataTable } from "./departures-data-table";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface DeparturesListPageProps {
  title: string;
  filterTipo: DepartureType;
}

function isCompleteDatePtBr(value: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

export function DeparturesListPage({ title, filterTipo }: DeparturesListPageProps) {
  const { departures, removeDeparture, updateDepartureKmFields, beginEditDeparture } = useDepartures();
  const { items: catalogItems } = useCatalogItems();
  const filterDateId = useId();
  const assinaturaSelectId = useId();
  const assinaturaMotorista1SelectId = useId();
  const assinaturaMotorista2SelectId = useId();
  const filterDateInputRef = useRef<HTMLInputElement>(null);
  const pendingFilterCaret = useRef<number | null>(null);
  const [filterDepartureDate, setFilterDepartureDate] = useState<string>(() => getCurrentDatePtBr());
  const [calendarOpen, setCalendarOpen] = useState(false);
  /** Mostra Imprimir / Assinar / Serviço após clicar na seta. */
  const [actionsToolbarOpen, setActionsToolbarOpen] = useState(false);
  /** Painel de assinatura com select de motoristas (Frota e Pessoal). */
  const [signPanelOpen, setSignPanelOpen] = useState(false);
  const [selectedMotoristaAssinatura, setSelectedMotoristaAssinatura] = useState("");
  /** Após OK: nome exibido na linha de assinatura abaixo da tabela. */
  const [assinaturaConfirmadaNome, setAssinaturaConfirmadaNome] = useState<string | null>(null);
  const isAmbulancia = filterTipo === "Ambulância";

  // Ambulância: dois campos adicionais acima do campo de assinatura que já existe.
  const [selectedMotorista1, setSelectedMotorista1] = useState("");
  const [selectedMotorista2, setSelectedMotorista2] = useState("");
  const [assinaturaConfirmadaMotorista1, setAssinaturaConfirmadaMotorista1] = useState<string | null>(null);
  const [assinaturaConfirmadaMotorista2, setAssinaturaConfirmadaMotorista2] = useState<string | null>(null);

  useEffect(() => {
    setFilterDepartureDate(getCurrentDatePtBr());
    setActionsToolbarOpen(false);
    setSignPanelOpen(false);
    setSelectedMotoristaAssinatura("");
    setAssinaturaConfirmadaNome(null);
    setSelectedMotorista1("");
    setSelectedMotorista2("");
    setAssinaturaConfirmadaMotorista1(null);
    setAssinaturaConfirmadaMotorista2(null);
  }, [filterTipo]);

  useEffect(() => {
    if (!actionsToolbarOpen) setSignPanelOpen(false);
  }, [actionsToolbarOpen]);

  useLayoutEffect(() => {
    const el = filterDateInputRef.current;
    const p = pendingFilterCaret.current;
    if (el && p !== null) {
      const clamped = Math.min(Math.max(0, p), el.value.length);
      el.setSelectionRange(clamped, clamped);
    }
    pendingFilterCaret.current = null;
  }, [filterDepartureDate]);

  const selectedDate = useMemo(
    () => parsePtBrToDate(filterDepartureDate),
    [filterDepartureDate],
  );

  const rows = useMemo(() => {
    let list = departures.filter((d) => d.tipo === filterTipo);
    if (isCompleteDatePtBr(filterDepartureDate)) {
      list = list.filter((d) => d.dataSaida === filterDepartureDate);
    }
    return list;
  }, [departures, filterTipo, filterDepartureDate]);

  /** Quantidade de saídas deste tipo na data de saída selecionada (dia completo dd/mm/aaaa). */
  const dayDepartureCount = useMemo(() => {
    if (!isCompleteDatePtBr(filterDepartureDate)) return null;
    return departures.filter(
      (d) => d.tipo === filterTipo && d.dataSaida === filterDepartureDate,
    ).length;
  }, [departures, filterTipo, filterDepartureDate]);

  const emptyMessage = useMemo(() => {
    const ofTipo = departures.filter((d) => d.tipo === filterTipo);
    if (ofTipo.length === 0) return "Nenhuma saída cadastrada para este tipo.";
    if (isCompleteDatePtBr(filterDepartureDate) && rows.length === 0) {
      return "Nenhum registro encontrado para a data de saída selecionada.";
    }
    return "Nenhum registro encontrado.";
  }, [departures, filterTipo, filterDepartureDate, rows.length]);

  function handleConfirmarAssinatura() {
    const t = selectedMotoristaAssinatura.trim();
    if (!t) return;
    setAssinaturaConfirmadaNome(t);
  }

  function handleConfirmarMotorista1() {
    const t = selectedMotorista1.trim();
    if (!t) return;
    setAssinaturaConfirmadaMotorista1(t);
  }

  function handleConfirmarMotorista2() {
    const t = selectedMotorista2.trim();
    if (!t) return;
    setAssinaturaConfirmadaMotorista2(t);
  }

  function handleGerarPdf() {
    downloadDeparturesListPdf({
      listTitle: title,
      tipo: filterTipo,
      filterDate: filterDepartureDate,
      rows,
      signatures: {
        motorista1: assinaturaConfirmadaMotorista1,
        motorista2: assinaturaConfirmadaMotorista2,
        assinanteDivisao: assinaturaConfirmadaNome,
      },
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-5">
        <CardTitle className="min-w-0 flex-1 leading-none">{title}</CardTitle>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              ref={filterDateInputRef}
              id={filterDateId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              aria-label="Filtrar por data de saída (dd/mm/aaaa)"
              value={filterDepartureDate}
              onChange={(event) => {
                const el = event.target;
                const start = el.selectionStart ?? el.value.length;
                const { value, caret } = normalizeDatePtBrWithCaret(el.value, start);
                pendingFilterCaret.current = caret;
                setFilterDepartureDate(value);
              }}
              className="h-9 w-[min(100%,10.5rem)] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 font-mono text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            />
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                translate="no"
                className="h-9 w-9 shrink-0 rounded-xl border-[hsl(var(--border))] shadow-sm transition hover:shadow-md"
                aria-label="Abrir calendário"
              >
                <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" />
              </Button>
            </PopoverTrigger>
          </div>
          <PopoverContent align="end" className="border-0 bg-transparent p-0 shadow-none">
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate ?? new Date()}
              onSelect={(d) => {
                setFilterDepartureDate(d ? formatDateToPtBr(d) : "");
                setCalendarOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </CardHeader>

      <div
        className={cn(
          "border-b border-[hsl(var(--border))] px-6 pb-3",
          actionsToolbarOpen && "pb-4",
        )}
      >
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              aria-expanded={actionsToolbarOpen}
              aria-label={actionsToolbarOpen ? "Ocultar ações" : "Mostrar ações (Imprimir, Assinar, Serviço)"}
              onClick={() => setActionsToolbarOpen((o) => !o)}
            >
              {actionsToolbarOpen ? (
                <ChevronDown className="h-4 w-4 text-[hsl(var(--foreground))]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[hsl(var(--foreground))]" />
              )}
            </Button>
            <div
              className="flex h-9 min-w-[7.5rem] items-center justify-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.25)] px-3 text-sm shadow-sm"
              role="status"
              aria-live="polite"
              aria-label={
                dayDepartureCount === null
                  ? "Informe uma data de saída completa para ver a quantidade no dia"
                  : `Saídas cadastradas no dia: ${dayDepartureCount}`
              }
            >
              <span className="whitespace-nowrap text-[hsl(var(--muted-foreground))]">Número de Saídas</span>
              <span className="min-w-[1.25rem] text-center font-mono font-semibold tabular-nums text-[hsl(var(--foreground))]">
                {dayDepartureCount === null ? "—" : dayDepartureCount}
              </span>
            </div>
          </div>
          {actionsToolbarOpen ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => window.print()}>
                Imprimir
              </Button>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleGerarPdf}>
                Gerar PDF
              </Button>
              <Button
                type="button"
                variant={signPanelOpen ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                aria-pressed={signPanelOpen}
                onClick={() => setSignPanelOpen((open) => !open)}
              >
                Assinar
              </Button>
              <Button type="button" variant="outline" size="sm" className="shrink-0">
                Serviço
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <CardContent className="pt-4">
        <DeparturesDataTable
          rows={rows}
          emptyLabel={emptyMessage}
          onRemove={removeDeparture}
          onUpdateKmFields={updateDepartureKmFields}
          onEdit={beginEditDeparture}
        />
        {signPanelOpen ? (
          <div className="mx-auto mt-8 flex w-full max-w-2xl flex-col gap-6">
            {isAmbulancia ? (
              <div className="grid grid-cols-2 gap-4 text-center">
                {!assinaturaConfirmadaMotorista1 ? (
                  <div className="flex flex-col items-center gap-2">
                    <label
                      htmlFor={assinaturaMotorista1SelectId}
                      className="text-sm font-medium text-[hsl(var(--foreground))]"
                    >
                      Motorista1
                    </label>
                    <select
                      id={assinaturaMotorista1SelectId}
                      value={selectedMotorista1}
                      onChange={(e) => setSelectedMotorista1(e.target.value)}
                      disabled={catalogItems.motoristas.length === 0}
                      className="h-10 w-full max-w-[12rem] rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted))]"
                    >
                      <option value="">Selecione o motorista…</option>
                      {catalogItems.motoristas.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    {catalogItems.motoristas.length === 0 ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Cadastre em <strong>Frota e Pessoal</strong> → <strong>Motorista</strong>.
                      </p>
                    ) : (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="min-w-[4rem]"
                        disabled={!selectedMotorista1.trim()}
                        onClick={handleConfirmarMotorista1}
                      >
                        OK
                      </Button>
                    )}
                  </div>
                ) : null}

                {!assinaturaConfirmadaMotorista2 ? (
                  <div className="flex flex-col items-center gap-2">
                    <label
                      htmlFor={assinaturaMotorista2SelectId}
                      className="text-sm font-medium text-[hsl(var(--foreground))]"
                    >
                      Motorista 2
                    </label>
                    <select
                      id={assinaturaMotorista2SelectId}
                      value={selectedMotorista2}
                      onChange={(e) => setSelectedMotorista2(e.target.value)}
                      disabled={catalogItems.motoristas.length === 0}
                      className="h-10 w-full max-w-[12rem] rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted))]"
                    >
                      <option value="">Selecione o motorista…</option>
                      {catalogItems.motoristas.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    {catalogItems.motoristas.length === 0 ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Cadastre em <strong>Frota e Pessoal</strong> → <strong>Motorista</strong>.
                      </p>
                    ) : (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="min-w-[4rem]"
                        disabled={!selectedMotorista2.trim()}
                        onClick={handleConfirmarMotorista2}
                      >
                        OK
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!assinaturaConfirmadaNome ? (
              <div className="flex w-full flex-col items-center gap-3 text-center">
                <label
                  htmlFor={assinaturaSelectId}
                  className="text-sm font-medium text-[hsl(var(--foreground))]"
                >
                  Assinante
                </label>
                <select
                  id={assinaturaSelectId}
                  value={selectedMotoristaAssinatura}
                  onChange={(e) => setSelectedMotoristaAssinatura(e.target.value)}
                  disabled={catalogItems.motoristas.length === 0}
                  className="h-10 w-full max-w-[22rem] rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted))]"
                >
                  <option value="">Selecione o motorista…</option>
                  {catalogItems.motoristas.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {catalogItems.motoristas.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Nenhum motorista cadastrado. Cadastre em <strong>Frota e Pessoal</strong> →{" "}
                    <strong>Motorista</strong>.
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="min-w-[5rem]"
                    disabled={!selectedMotoristaAssinatura.trim()}
                    onClick={handleConfirmarAssinatura}
                  >
                    OK
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {isAmbulancia && (assinaturaConfirmadaMotorista1 || assinaturaConfirmadaMotorista2) ? (
          <div className="mx-auto mt-8 grid w-full max-w-2xl grid-cols-2 gap-x-12 gap-y-8 text-center print:break-inside-avoid">
            {assinaturaConfirmadaMotorista1 ? (
              <div className="flex flex-col items-center gap-0">
                <div className="flex w-full max-w-[16rem] flex-col items-stretch gap-0">
                  <div className="min-h-[3rem] w-full border-0 border-b-2 border-[hsl(var(--foreground))] bg-transparent" />
                  <span className="sr-only">Área para assinatura manuscrita</span>
                </div>
                <p className="mt-4 text-base font-semibold text-[hsl(var(--foreground))]">
                  {assinaturaConfirmadaMotorista1}
                </p>
                <p className="mt-1 text-sm font-medium text-[hsl(var(--muted-foreground))]">Motorista1</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-[hsl(var(--muted-foreground))]"
                  onClick={() => {
                    setAssinaturaConfirmadaMotorista1(null);
                    setSelectedMotorista1("");
                  }}
                >
                  Alterar Motorista1
                </Button>
              </div>
            ) : null}

            {assinaturaConfirmadaMotorista2 ? (
              <div className="flex flex-col items-center gap-0">
                <div className="flex w-full max-w-[16rem] flex-col items-stretch gap-0">
                  <div className="min-h-[3rem] w-full border-0 border-b-2 border-[hsl(var(--foreground))] bg-transparent" />
                  <span className="sr-only">Área para assinatura manuscrita</span>
                </div>
                <p className="mt-4 text-base font-semibold text-[hsl(var(--foreground))]">
                  {assinaturaConfirmadaMotorista2}
                </p>
                <p className="mt-1 text-sm font-medium text-[hsl(var(--muted-foreground))]">Motorista 2</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-[hsl(var(--muted-foreground))]"
                  onClick={() => {
                    setAssinaturaConfirmadaMotorista2(null);
                    setSelectedMotorista2("");
                  }}
                >
                  Alterar Motorista 2
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {assinaturaConfirmadaNome ? (
          <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-center gap-0 text-center print:break-inside-avoid">
            <div className="flex w-full max-w-xs flex-col items-stretch gap-0">
              <div className="min-h-[3rem] w-full border-0 border-b-2 border-[hsl(var(--foreground))] bg-transparent" />
              <span className="sr-only">Área para assinatura manuscrita</span>
            </div>
            <p className="mt-4 text-base font-semibold text-[hsl(var(--foreground))]">{assinaturaConfirmadaNome}</p>
            <p className="mt-1 text-sm font-medium text-[hsl(var(--muted-foreground))]">Divisão de Transporte</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 text-[hsl(var(--muted-foreground))]"
              onClick={() => {
                setAssinaturaConfirmadaNome(null);
                setSelectedMotoristaAssinatura("");
              }}
            >
              Alterar assinante
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
