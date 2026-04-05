import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDeparturesReportEmail } from "../context/departures-report-email-context";
import { useDepartures } from "../context/departures-context";
import type { DepartureType } from "../types/departure";
import {
  formatDateToPtBr,
  getCurrentDatePtBr,
  normalizeDatePtBrWithCaret,
  parsePtBrToDate,
} from "../lib/dateFormat";
import { parseHhMm } from "../lib/timeInput";
import { isPlausibleEmail } from "../lib/departuresReportEmail";
import { downloadDeparturesListPdf } from "../lib/generateDeparturesPdf";
import { openGmailComposeWithDeparturesPdf } from "../lib/sendDeparturesListPdfEmail";
import { cn } from "../lib/utils";
import { DepartureDeleteOrCancelModal } from "./departure-delete-or-cancel-modal";
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

/** Minutos desde meia-noite; horário inválido/vazio ordena por último. */
function sortKeyHoraSaida(horaSaida: string): number {
  const parsed = parseHhMm(horaSaida);
  if (!parsed) return Number.POSITIVE_INFINITY;
  return parsed.h * 60 + parsed.m;
}

export function DeparturesListPage({ title, filterTipo }: DeparturesListPageProps) {
  const { departures, removeDeparture, updateDeparture, updateDepartureKmFields, beginEditDeparture } =
    useDepartures();
  const { items: catalogItems } = useCatalogItems();
  const { email: reportEmailDest } = useDeparturesReportEmail();
  const filterDateId = useId();
  const assinaturaSelectId = useId();
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
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const deleteModalRecord = useMemo(
    () => (deleteModalId ? departures.find((d) => d.id === deleteModalId) ?? null : null),
    [departures, deleteModalId],
  );
  useEffect(() => {
    setFilterDepartureDate(getCurrentDatePtBr());
    setActionsToolbarOpen(false);
    setSignPanelOpen(false);
    setSelectedMotoristaAssinatura("");
    setAssinaturaConfirmadaNome(null);
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
    list = [...list].sort((a, b) => {
      const ka = sortKeyHoraSaida(a.horaSaida);
      const kb = sortKeyHoraSaida(b.horaSaida);
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
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

  function handleConfirmarCancelamentoLista(id: string, nome: string) {
    const d = departures.find((x) => x.id === id);
    if (!d) return;
    const { id: _id, createdAt: _c, ...rest } = d;
    updateDeparture(id, {
      ...rest,
      cancelada: true,
      rubrica: nome.trim(),
    });
  }

  function handleConfirmarAssinatura() {
    const t = selectedMotoristaAssinatura.trim();
    if (!t) return;
    setAssinaturaConfirmadaNome(t);
  }

  const departuresPdfParams = useMemo(
    () => ({
      listTitle: title,
      tipo: filterTipo,
      filterDate: filterDepartureDate,
      rows,
      signatures: {
        assinanteDivisao: assinaturaConfirmadaNome,
      },
    }),
    [title, filterTipo, filterDepartureDate, rows, assinaturaConfirmadaNome],
  );

  function handleGerarPdf() {
    downloadDeparturesListPdf(departuresPdfParams);
  }

  function handleEnviarPdf() {
    const email = reportEmailDest.trim();
    if (!email) {
      window.alert("Cadastre o e-mail de destino em Configurações.");
      return;
    }
    if (!isPlausibleEmail(email)) {
      window.alert("O e-mail em Configurações não parece válido. Corrija e guarde antes de enviar.");
      return;
    }
    try {
      openGmailComposeWithDeparturesPdf(departuresPdfParams, email);
    } catch {
      window.alert("Não foi possível preparar o envio. Use Gerar PDF e envie manualmente pelo Gmail.");
    }
  }

  return (
    <Card className="shadow-[0_22px_56px_-14px_rgba(0,0,0,0.45),0_12px_32px_-10px_rgba(0,0,0,0.3)]">
      <CardHeader
        className={cn(
          "flex flex-col gap-3 space-y-0 border-b border-[hsl(var(--border))] pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
          actionsToolbarOpen && "pb-4",
        )}
      >
        <CardTitle className="min-w-0 shrink text-[2rem] font-bold leading-tight text-[hsl(var(--primary))] [text-shadow:0_2px_4px_rgba(0,0,0,0.45),0_4px_14px_rgba(0,0,0,0.35)]">
          {title}
        </CardTitle>
        <div className="flex min-w-0 w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
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
                className="h-9 w-[min(100%,10.5rem)] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-center font-mono text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg"
            aria-expanded={actionsToolbarOpen}
            aria-label={actionsToolbarOpen ? "Ocultar ações" : "Mostrar ações (Imprimir, PDF, Enviar, Assinar, Serviço)"}
            onClick={() => setActionsToolbarOpen((o) => !o)}
          >
            {actionsToolbarOpen ? (
              <ChevronDown className="h-4 w-4 text-[hsl(var(--foreground))]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[hsl(var(--foreground))]" />
            )}
          </Button>
          <div
            className="flex h-9 min-w-[7.5rem] items-center justify-center gap-1.5 rounded-lg border border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] px-3 text-sm font-medium shadow-sm"
            role="status"
            aria-live="polite"
            aria-label={
              dayDepartureCount === null
                ? "Informe uma data de saída completa para ver a quantidade no dia"
                : `Saídas cadastradas no dia: ${dayDepartureCount}`
            }
          >
            <span className="whitespace-nowrap text-[hsl(var(--primary))]">Número de Saídas</span>
            <span className="min-w-[1.25rem] text-center font-mono font-semibold tabular-nums text-[hsl(var(--primary))]">
              {dayDepartureCount === null ? "—" : dayDepartureCount}
            </span>
          </div>
          {actionsToolbarOpen ? (
            <>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="shrink-0"
                onClick={() => window.print()}
              >
                Imprimir
              </Button>
              <Button type="button" variant="default" size="sm" className="shrink-0" onClick={handleGerarPdf}>
                Gerar PDF
              </Button>
              <Button type="button" variant="default" size="sm" className="shrink-0" onClick={handleEnviarPdf}>
                Enviar
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="shrink-0"
                aria-pressed={signPanelOpen}
                onClick={() => setSignPanelOpen((open) => !open)}
              >
                Assinar
              </Button>
              <Button type="button" variant="default" size="sm" className="shrink-0">
                Serviço
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <DepartureDeleteOrCancelModal
          open={deleteModalId !== null && deleteModalRecord !== null}
          onOpenChange={(o) => {
            if (!o) setDeleteModalId(null);
          }}
          record={deleteModalRecord}
          onExcluirDefinitivo={removeDeparture}
          onConfirmarCancelamento={handleConfirmarCancelamentoLista}
        />
        <DeparturesDataTable
          rows={rows}
          bodyFontBold
          emptyLabel={emptyMessage}
          onTrashClick={(id) => setDeleteModalId(id)}
          onUpdateKmFields={updateDepartureKmFields}
          onEdit={beginEditDeparture}
        />
        {signPanelOpen ? (
          <div className="mx-auto mt-8 flex w-full max-w-2xl flex-col gap-6">
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
