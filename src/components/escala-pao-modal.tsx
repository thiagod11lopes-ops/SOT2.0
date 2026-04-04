import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Lock,
  PencilLine,
  Rows2,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { useEscalaPao } from "../context/escala-pao-context";
import {
  aplicarDiaEspecialComDeslocamento,
  distribuirMotoristasNoMes,
  formatDateKeyLocal,
  indiceDiaSemanaSegundaPrimeiro,
  isDiaEspecialValor,
  isWeekend,
  MESES_DISTRIBUICAO_INTEGRANTES,
  OPCOES_DIA_ESPECIAL,
} from "../lib/escalaPaoStorage";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const WEEK_HEADERS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

const MIME_ESC_PA_DIA = "application/x-sot-escala-pao-dia";

interface EscalaPaoModalProps {
  open: boolean;
  onClose: () => void;
}

export function EscalaPaoModal({ open, onClose }: EscalaPaoModalProps) {
  const { escala, integrantes, setIntegrantes, setMotoristaNaData, setEscalaCompleta } = useEscalaPao();

  const [cursor, setCursor] = useState(() => new Date());
  const [novoIntegrante, setNovoIntegrante] = useState("");
  /** Painel de integrantes recolhido por defeito. */
  const [integrantesPainelAberto, setIntegrantesPainelAberto] = useState(false);
  const [painelDistribuirAberto, setPainelDistribuirAberto] = useState(false);
  const [diaInicioDistribuicao, setDiaInicioDistribuicao] = useState(1);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [modoArrastar, setModoArrastar] = useState(false);
  /** Só este dia mostra o select; o resto mantém a escala até ser clicado. */
  const [diaEditando, setDiaEditando] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCursor(new Date());
      setPainelDistribuirAberto(false);
      setDiaInicioDistribuicao(1);
      setModoEdicao(false);
      setModoArrastar(false);
      setDiaEditando(null);
      setNovoIntegrante("");
      setIntegrantesPainelAberto(false);
    }
  }, [open]);

  useEffect(() => {
    setDiaEditando(null);
  }, [cursor]);

  const { year, monthIndex, monthLabel, gridCells, daysInMonth } = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const monthStart = startOfMonth(cursor);
    const daysInMonth = endOfMonth(cursor).getDate();
    const pad = indiceDiaSemanaSegundaPrimeiro(monthStart);
    const raw = format(cursor, "MMMM yyyy", { locale: ptBR });
    const monthLabel = raw.charAt(0).toUpperCase() + raw.slice(1);
    const totalCells = Math.ceil((pad + daysInMonth) / 7) * 7;
    const cells: ({ kind: "empty" } | { kind: "day"; date: Date })[] = [];
    for (let i = 0; i < totalCells; i++) {
      if (i < pad) {
        cells.push({ kind: "empty" });
        continue;
      }
      const dayNum = i - pad + 1;
      if (dayNum > daysInMonth) {
        cells.push({ kind: "empty" });
        continue;
      }
      cells.push({ kind: "day", date: new Date(y, m, dayNum) });
    }
    return { year: y, monthIndex: m, monthLabel, gridCells: cells, daysInMonth };
  }, [cursor]);

  useEffect(() => {
    setDiaInicioDistribuicao((d) => Math.min(Math.max(1, d), daysInMonth));
  }, [year, monthIndex, daysInMonth]);

  const hojeKey = useMemo(() => formatDateKeyLocal(new Date()), [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const temNomesAtribuidos = useMemo(
    () => Object.values(escala).some((v) => typeof v === "string" && v.trim().length > 0),
    [escala],
  );

  const handleDragOverDia = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleIntegranteAdd = useCallback(() => {
    const t = novoIntegrante.trim();
    if (!t) return;
    if (integrantes.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setNovoIntegrante("");
      return;
    }
    setIntegrantes([...integrantes, t]);
    setNovoIntegrante("");
  }, [integrantes, novoIntegrante, setIntegrantes]);

  const handleDropTrocarDias = useCallback(
    (e: DragEvent, targetKey: string) => {
      e.preventDefault();
      const sourceKey = e.dataTransfer.getData(MIME_ESC_PA_DIA);
      if (!sourceKey || sourceKey === targetKey) return;
      const a = (escala[sourceKey] ?? "").trim();
      const b = (escala[targetKey] ?? "").trim();
      setEscalaCompleta({
        ...escala,
        [sourceKey]: b,
        [targetKey]: a,
      });
    },
    [escala, setEscalaCompleta],
  );

  const handleEdicaoDiaSelect = useCallback(
    (dateKey: string, value: string) => {
      if (value === "") {
        setMotoristaNaData(dateKey, "");
        setDiaEditando(null);
        return;
      }
      if (isDiaEspecialValor(value)) {
        setEscalaCompleta(aplicarDiaEspecialComDeslocamento(escala, dateKey, value));
        setDiaEditando(null);
        return;
      }
      setMotoristaNaData(dateKey, value);
      setDiaEditando(null);
    },
    [escala, setEscalaCompleta, setMotoristaNaData],
  );

  if (!open) return null;

  function toggleEditar() {
    setModoEdicao((v) => {
      const next = !v;
      if (next) {
        setModoArrastar(false);
      } else {
        setDiaEditando(null);
      }
      return next;
    });
  }

  function toggleArrastar() {
    setModoArrastar((v) => {
      const next = !v;
      if (next) {
        setModoEdicao(false);
        setDiaEditando(null);
      }
      return next;
    });
  }

  function handleConfirmarDistribuicao() {
    if (integrantes.length === 0) return;
    const d = Math.min(Math.max(1, diaInicioDistribuicao), daysInMonth);
    setEscalaCompleta(distribuirMotoristasNoMes(year, monthIndex, integrantes, escala, d));
    setPainelDistribuirAberto(false);
    setDiaEditando(null);
  }

  function handleLimparCalendario() {
    if (!temNomesAtribuidos) return;
    if (
      !window.confirm(
        "Remover todas as atribuições da escala do pão em todos os meses? Esta ação não pode ser anulada.",
      )
    ) {
      return;
    }
    setEscalaCompleta({});
    setDiaEditando(null);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex min-h-0 flex-col bg-black/50"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="escala-pao-title"
        className="flex h-dvh min-h-0 w-full max-w-none flex-col overflow-hidden bg-[hsl(var(--card))] shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[hsl(var(--border))] px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/10"
              aria-hidden
            >
              <CalendarDays className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.75} />
            </div>
            <h2 id="escala-pao-title" className="min-w-0 flex-1 text-lg font-semibold text-[hsl(var(--foreground))]">
              Escala do Pão
            </h2>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/15">
              <button
                type="button"
                id="escala-pao-integrantes-toggle"
                aria-expanded={integrantesPainelAberto}
                aria-controls="escala-pao-integrantes-painel"
                onClick={() => setIntegrantesPainelAberto((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--muted))]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))] sm:px-4"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">Integrantes da escala</span>
                  {integrantes.length > 0 ? (
                    <span className="rounded-md bg-[hsl(var(--primary))]/15 px-1.5 py-0.5 text-xs font-medium tabular-nums text-[hsl(var(--primary))]">
                      {integrantes.length}
                    </span>
                  ) : null}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200",
                    integrantesPainelAberto && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {integrantesPainelAberto ? (
                <div
                  id="escala-pao-integrantes-painel"
                  role="region"
                  aria-labelledby="escala-pao-integrantes-toggle"
                  className="border-t border-[hsl(var(--border))] px-3 pb-3 pt-2 sm:px-4 sm:pb-4"
                >
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Estes nomes são usados na <strong>distribuição automática</strong> e no select de cada dia útil.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      id="escala-pao-novo-integrante"
                      type="text"
                      value={novoIntegrante}
                      onChange={(e) => setNovoIntegrante(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleIntegranteAdd();
                        }
                      }}
                      placeholder="Nome do integrante"
                      autoComplete="off"
                      className="min-w-[12rem] flex-1 rounded-md border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    />
                    <Button type="button" size="sm" onClick={handleIntegranteAdd}>
                      Adicionar
                    </Button>
                  </div>
                  {integrantes.length > 0 ? (
                    <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                      {integrantes.map((nome) => (
                        <li
                          key={nome}
                          className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))]/80 bg-[hsl(var(--card))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                        >
                          <span className="min-w-0 truncate">{nome}</span>
                          <button
                            type="button"
                            className="shrink-0 rounded-md p-1 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]/80 hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                            aria-label={`Remover ${nome}`}
                            onClick={() => setIntegrantes(integrantes.filter((x) => x !== nome))}
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 shadow-sm ring-1 ring-[hsl(var(--border))]/40 dark:bg-[hsl(var(--card))]/50">
              <div className="border-b border-[hsl(var(--border))]/80 bg-[hsl(var(--muted))]/20 px-3 py-2.5 sm:px-4">
                <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
                  Ferramentas do calendário
                </h3>
              </div>
              <div className="flex flex-col gap-3 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {integrantes.length > 0 && !painelDistribuirAberto ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-[hsl(var(--border))] bg-white shadow-sm hover:bg-[hsl(var(--muted))]/50 dark:bg-[hsl(var(--background))]/80"
                      onClick={() => setPainelDistribuirAberto(true)}
                    >
                      <LayoutGrid className="h-3.5 w-3.5 opacity-80" aria-hidden />
                      Distribuir integrantes
                    </Button>
                  ) : null}

                  <div
                    className="inline-flex rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/35 p-0.5 shadow-inner dark:bg-[hsl(var(--muted))]/25"
                    role="group"
                    aria-label="Modo de edição do calendário"
                  >
                    <Button
                      type="button"
                      variant={modoEdicao ? "default" : "ghost"}
                      size="sm"
                      disabled={integrantes.length === 0}
                      onClick={toggleEditar}
                      aria-pressed={modoEdicao}
                      className={cn(
                        "gap-1 rounded-md px-2.5 shadow-none sm:px-3",
                        modoEdicao ? "" : "text-[hsl(var(--foreground))]",
                      )}
                    >
                      <PencilLine className="h-3.5 w-3.5 opacity-90" aria-hidden />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant={modoArrastar ? "default" : "ghost"}
                      size="sm"
                      onClick={toggleArrastar}
                      aria-pressed={modoArrastar}
                      className={cn(
                        "gap-1 rounded-md px-2.5 shadow-none sm:px-3",
                        modoArrastar ? "" : "text-[hsl(var(--foreground))]",
                      )}
                    >
                      <Rows2 className="h-3.5 w-3.5 opacity-90" aria-hidden />
                      Arrastar
                    </Button>
                  </div>

                  <div className="hidden h-7 w-px shrink-0 bg-[hsl(var(--border))] sm:block" aria-hidden />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!temNomesAtribuidos}
                    onClick={handleLimparCalendario}
                    className="gap-1.5 border-red-200 bg-white text-red-800 shadow-sm hover:bg-red-50 dark:border-red-900/60 dark:bg-[hsl(var(--background))]/80 dark:text-red-200 dark:hover:bg-red-950/50 sm:ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Limpar calendário
                  </Button>
                </div>

                {integrantes.length > 0 && painelDistribuirAberto ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/[0.06] p-3 dark:bg-[hsl(var(--primary))]/10 sm:flex-row sm:items-end sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <label
                        htmlFor="escala-pao-dia-inicio"
                        className="text-sm font-medium text-[hsl(var(--foreground))]"
                      >
                        Distribuir a partir do dia
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          id="escala-pao-dia-inicio"
                          type="number"
                          min={1}
                          max={daysInMonth}
                          inputMode="numeric"
                          value={diaInicioDistribuicao}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setDiaInicioDistribuicao(1);
                              return;
                            }
                            const v = parseInt(raw, 10);
                            if (Number.isNaN(v)) return;
                            setDiaInicioDistribuicao(Math.min(Math.max(1, v), daysInMonth));
                          }}
                          className="h-9 w-[4.5rem] rounded-md border border-[hsl(var(--border))] bg-white px-2 text-center text-sm tabular-nums text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] dark:bg-[hsl(var(--background))]"
                        />
                        <span className="text-sm text-[hsl(var(--muted-foreground))]">
                          (mês com {daysInMonth} dias)
                        </span>
                      </div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Os dias anteriores a este, no mês visível, ficam sem nome. A distribuição repete-se nos dias úteis
                        até ao fim de {MESES_DISTRIBUICAO_INTEGRANTES} meses (este mês +{" "}
                        {MESES_DISTRIBUICAO_INTEGRANTES - 1} seguintes), na mesma ordem rotativa.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={handleConfirmarDistribuicao}>
                        Aplicar distribuição
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPainelDistribuirAberto(false)}
                        className="bg-white dark:bg-[hsl(var(--background))]/80"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {integrantes.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Adicione pelo menos um <strong>integrante</strong> na secção acima para usar a distribuição e o modo{" "}
              <strong>Editar</strong> no calendário.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 sm:order-first"
                  aria-label="Mês anterior"
                  onClick={() => setCursor((d) => addMonths(d, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="order-first flex min-w-0 flex-1 flex-col items-center gap-1 sm:order-none">
                  <p className="w-full text-center text-base font-semibold text-[hsl(var(--foreground))] sm:text-lg">
                    {monthLabel}
                  </p>
                  {modoArrastar ? (
                    <p className="text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                      Arraste um nome para outro dia útil para trocar as atribuições.
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Mês seguinte"
                  onClick={() => setCursor((d) => addMonths(d, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-2 shadow-inner sm:p-3">
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {WEEK_HEADERS.map((h, col) => (
                    <div
                      key={h}
                      className={cn(
                        "py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))] sm:text-[11px]",
                        col >= 5 && "rounded-md bg-[hsl(var(--muted))]/50 text-[hsl(var(--muted-foreground))]/90",
                      )}
                    >
                      {h}
                    </div>
                  ))}

                  {gridCells.map((cell, i) => {
                    const col = i % 7;
                    if (cell.kind === "empty") {
                      return (
                        <div
                          key={`e-${i}`}
                          className={cn(
                            "min-h-[4.5rem] rounded-lg border border-transparent bg-[hsl(var(--muted))]/10 sm:min-h-[5.5rem]",
                            col >= 5 && "bg-[hsl(var(--muted))]/20",
                          )}
                        />
                      );
                    }

                    const { date } = cell;
                    const dateKey = formatDateKeyLocal(date);
                    const weekend = isWeekend(date);
                    const isToday = dateKey === hojeKey;
                    const dayNum = date.getDate();
                    const valorDia = (escala[dateKey] ?? "").trim();
                    const isEspecial = isDiaEspecialValor(valorDia);

                    if (weekend) {
                      return (
                        <div
                          key={dateKey}
                          className={cn(
                            "flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-lg border p-1.5 sm:min-h-[5.5rem] sm:p-2",
                            "border-[hsl(var(--border))]/80 bg-[hsl(var(--muted))]/35 text-[hsl(var(--muted-foreground))]",
                            isToday && "ring-2 ring-[hsl(var(--primary))]/60",
                          )}
                          aria-disabled
                        >
                          <span className="text-xs font-semibold tabular-nums text-[hsl(var(--foreground))]/70">
                            {dayNum}
                          </span>
                          <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          <span className="text-center text-[9px] font-medium leading-tight sm:text-[10px]">
                            Fim de semana
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={dateKey}
                        className={cn(
                          "flex min-h-[4.5rem] flex-col rounded-lg border bg-[hsl(var(--card))] p-1 shadow-sm sm:min-h-[5.5rem] sm:p-1.5",
                          "border-[hsl(var(--border))]",
                          isEspecial &&
                            "border-orange-400 bg-orange-100 text-orange-950 dark:border-orange-600 dark:bg-orange-950/45 dark:text-orange-50",
                          isToday &&
                            !isEspecial &&
                            "ring-2 ring-[hsl(var(--primary))] ring-offset-1 ring-offset-[hsl(var(--muted))]/20",
                          isToday && isEspecial && "ring-2 ring-orange-500 ring-offset-1 ring-offset-orange-100 dark:ring-offset-orange-950",
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 border-b border-[hsl(var(--border))]/70 pb-1">
                          <span className="text-xs font-semibold tabular-nums text-[hsl(var(--foreground))]">
                            {dayNum}
                          </span>
                          {isToday ? (
                            <span className="text-[9px] font-medium text-[hsl(var(--primary))] sm:text-[10px]">
                              Hoje
                            </span>
                          ) : null}
                        </div>
                        <div
                          className={cn(
                            "mt-auto flex min-h-[2.25rem] flex-1 flex-col items-center justify-center px-0.5 py-1",
                            modoArrastar && "rounded-md border border-dashed border-[hsl(var(--border))]/60",
                          )}
                          role="status"
                          onDragOver={modoArrastar ? handleDragOverDia : undefined}
                          onDrop={modoArrastar ? (e) => handleDropTrocarDias(e, dateKey) : undefined}
                          aria-label={
                            isEspecial
                              ? `Dia especial: ${valorDia}`
                              : valorDia
                                ? `Integrante: ${valorDia}`
                                : `Sem atribuição a ${dateKey}`
                          }
                        >
                          {modoEdicao && diaEditando === dateKey ? (
                            <select
                              autoFocus
                              value={valorDia}
                              onChange={(e) => handleEdicaoDiaSelect(dateKey, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "w-full max-w-full rounded-md border py-1 text-center text-[10px] font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:text-[11px]",
                                isEspecial
                                  ? "border-orange-500 bg-white text-orange-950 dark:bg-orange-950/30 dark:text-orange-50"
                                  : "border-[hsl(var(--border))] bg-white text-[hsl(var(--foreground))]",
                              )}
                              title={valorDia || undefined}
                              aria-label="Integrante ou tipo de dia (Feriado, RD, Lic Pag, Recesso)"
                            >
                              <option value="">—</option>
                              {integrantes.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                              {valorDia &&
                              !isDiaEspecialValor(valorDia) &&
                              !integrantes.some((m) => m.trim().toLowerCase() === valorDia.toLowerCase()) ? (
                                <option value={valorDia}>{valorDia}</option>
                              ) : null}
                              {OPCOES_DIA_ESPECIAL.map((op) => (
                                <option key={op} value={op}>
                                  {op}
                                </option>
                              ))}
                            </select>
                          ) : modoEdicao ? (
                            <button
                              type="button"
                              onClick={() => setDiaEditando(dateKey)}
                              className={cn(
                                "line-clamp-3 min-h-[2.25rem] w-full rounded-md px-0.5 py-1 text-center text-[10px] font-medium leading-tight transition-colors hover:bg-[hsl(var(--muted))]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:text-[11px]",
                                isEspecial ? "text-orange-950 dark:text-orange-50" : "text-[hsl(var(--foreground))]",
                              )}
                              title="Clique para editar integrante ou dia especial (Feriado, RD, Lic Pag, Recesso)"
                            >
                              {valorDia || "—"}
                            </button>
                          ) : modoArrastar ? (
                            <span
                              draggable={!!valorDia}
                              onDragStart={(e) => {
                                if (!valorDia) return;
                                e.dataTransfer.setData(MIME_ESC_PA_DIA, dateKey);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              className={cn(
                                "line-clamp-3 w-full select-none text-center text-[10px] font-medium leading-tight sm:text-[11px]",
                                isEspecial ? "text-orange-950 dark:text-orange-50" : "text-[hsl(var(--foreground))]",
                                valorDia && "cursor-grab active:cursor-grabbing",
                              )}
                              title={valorDia || undefined}
                            >
                              {valorDia || "—"}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "line-clamp-3 w-full text-center text-[10px] font-medium leading-tight sm:text-[11px]",
                                isEspecial ? "text-orange-950 dark:text-orange-50" : "text-[hsl(var(--foreground))]",
                              )}
                              title={valorDia || undefined}
                            >
                              {valorDia || "—"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-[hsl(var(--border))] px-4 py-4 sm:px-6">
          <Button type="button" className="min-w-[5.5rem]" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
