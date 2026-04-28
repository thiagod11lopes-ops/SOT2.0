import {
  Building2,
  ClipboardList,
  ClockAlert,
  Droplets,
  Route,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAlarmDismiss } from "../context/alarm-dismiss-context";
import { useAvisos } from "../context/avisos-context";
import { useAppTab } from "../context/app-tab-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { useLimpezaPendente } from "../context/limpeza-pendente-context";
import {
  getLatestPersistedRdvIsoDate,
  getRdvPlacasNaOficinaComObservacaoForDate,
  getRdvPlacasPorSituacaoComObservacaoForDate,
  getRdvPlacasPorSituacaoForDate,
  RDV_STORAGE_EVENT,
} from "../lib/relatorioDiarioViaturasStorage";
import { getCurrentDatePtBr, isDepartureDateSameLocalDay } from "../lib/dateFormat";
import { listMotoristasComServicoOuRotinaNoDia } from "../lib/detalheServicoDayMarkers";
import { loadDetalheServicoBundleFromIdb, type DetalheServicoBundle } from "../lib/detalheServicoBundle";
import { parseHhMm } from "../lib/timeInput";
import { fraseProximaTrocaOleo, rotuloViaturaPlaca } from "../lib/homeTickerStrings";
import type { TrocaOleoRegistro } from "../lib/oilMaintenance";
import { departuresTableShadowClass } from "../lib/uiShadows";
import {
  alertaProximaTrocaOleo,
  maiorKmChegadaPorViatura,
  statusTrocaOleo,
  viaturasCatalogoUnicas,
} from "../lib/oilMaintenance";
import {
  normalizeViaturaKey,
  useVistoriaProblemasMarcadosRefresh,
} from "../lib/vistoriaSituacaoVtr";
import { groupDeparturesForListDisplay, listRowFromRecord, type DepartureRecord } from "../types/departure";
import { cn } from "../lib/utils";
import { DailyAlarmCard } from "./daily-alarm-card";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

/** Minutos desde meia-noite no fuso local (para comparar com horário da saída). */
function minutosRelogioLocal(agora: Date): number {
  return agora.getHours() * 60 + agora.getMinutes();
}

/** True quando o relógio local já chegou ou passou do horário do alarme (HH:MM) neste dia. */
function alarmeJaDisparouNesteDia(agora: Date, horaAlarme: string): boolean {
  const parsed = parseHhMm(horaAlarme);
  if (!parsed) return false;
  return minutosRelogioLocal(agora) >= parsed.h * 60 + parsed.m;
}

/** KM saída preenchido, KM chegada e chegada vazios → mesmo critério do card Saídas em Andamento. */
function saidaEmAndamento(r: DepartureRecord): boolean {
  return (
    r.kmSaida.trim().length > 0 &&
    r.kmChegada.trim().length === 0 &&
    r.chegada.trim().length === 0
  );
}

/**
 * Hoje, horário de saída já passou (minuto atual > agendado), KM saída vazio —
 * prevista mas sem registro de saída (atraso).
 */
function saidasComAtrasoHoje(
  rows: DepartureRecord[],
  hojeDdMmYyyy: string,
  agora: Date,
): DepartureRecord[] {
  const agoraMin = minutosRelogioLocal(agora);
  return rows
    .filter((r) => isDepartureDateSameLocalDay(r.dataSaida, hojeDdMmYyyy))
    .filter((r) => r.kmSaida.trim().length === 0)
    .filter((r) => {
      const k = sortKeyHoraSaida(r.horaSaida);
      if (k === Number.POSITIVE_INFINITY) return false;
      return k < agoraMin;
    })
    .sort((a, b) => {
      const ka = sortKeyHoraSaida(a.horaSaida);
      const kb = sortKeyHoraSaida(b.horaSaida);
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
}

/** Hoje, KM saída preenchido, KM chegada e chegada vazios → viatura em deslocamento. */
function saidasEmAndamentoHoje(rows: DepartureRecord[], hojeDdMmYyyy: string): DepartureRecord[] {
  return rows
    .filter((r) => isDepartureDateSameLocalDay(r.dataSaida, hojeDdMmYyyy))
    .filter((r) => saidaEmAndamento(r))
    .sort((a, b) => {
      const ka = sortKeyHoraSaida(a.horaSaida);
      const kb = sortKeyHoraSaida(b.horaSaida);
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
}

/** Mesma aparência dos títulos das abas Saídas Administrativas / Ambulância. */
const homeCardTitleClass =
  "text-[2rem] font-bold leading-tight text-[hsl(var(--primary))] [text-shadow:0_2px_4px_rgba(0,0,0,0.45),0_4px_14px_rgba(0,0,0,0.35)]";

/** Mesmos cabeçalhos de tabela das páginas de saídas. */
const homeTableHeadClass =
  "font-bold text-[hsl(var(--primary))] [text-shadow:0_1px_2px_rgba(0,0,0,0.42),0_2px_8px_rgba(0,0,0,0.32)]";

/** Mesmo conteúdo de célula (corpo da tabela). */
const homeTableCellClass = "font-bold text-[hsl(var(--primary))]";

/** Tabela compacta no card Saídas administrativas (home). Tamanho do texto: `.home-dashboard-departures-panel` em index.css. */
const homeCompactHeadClass =
  "min-h-7 px-1 py-0.5 font-bold leading-tight text-[hsl(var(--primary))] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]";
const homeCompactCellClass =
  "max-w-[8rem] truncate px-1 py-0.5 font-bold leading-tight text-[hsl(var(--primary))] sm:max-w-none";

/** Títulos nos cards com `.home-dashboard-fluid-card` — tamanho fluido em `index.css`. */
const homeFluidCardTitleClass =
  "home-dashboard-fluid-card-title font-bold text-[hsl(var(--primary))] [text-shadow:0_1px_2px_rgba(0,0,0,0.42),0_2px_8px_rgba(0,0,0,0.32)]";

/** Textos de corpo / listas / vazios: mesma cor e peso das células. */
const homeBodyEmphasisClass = "font-bold text-[hsl(var(--primary))]";

/** Minutos desde meia-noite; inválido/vazio ordena por último (igual às abas de saídas). */
function sortKeyHoraSaida(hora: string): number {
  const parsed = parseHhMm(hora);
  if (!parsed) return Number.POSITIVE_INFINITY;
  return parsed.h * 60 + parsed.m;
}

/** Últimos 10 min (incl.) antes da hora agendada, ainda sem KM saída → alerta laranja na linha (Saídas administrativas). */
function shouldBlinkProximaSaidaRow(r: DepartureRecord, agora: Date): boolean {
  if (r.kmSaida.trim().length > 0) return false;
  const saidaMin = sortKeyHoraSaida(r.horaSaida);
  if (saidaMin === Number.POSITIVE_INFINITY) return false;
  const agoraMin = minutosRelogioLocal(agora);
  const minutosRestantes = saidaMin - agoraMin;
  return minutosRestantes >= 0 && minutosRestantes <= 10;
}

/** Data de hoje para exibição (pt-BR), primeira letra maiúscula. */
function formatDataHojeLongaPtBr() {
  const s = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatIsoDatePtBrShort(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function isoDateFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function Dashboard({ mapaOleo }: { mapaOleo: Record<string, TrocaOleoRegistro> }) {
  const { setActiveTab, requestFleetManutencoesTab, requestAvisosFainasGeraisOpen } = useAppTab();
  const { items } = useCatalogItems();
  const { departures } = useDepartures();
  /** Na home não entram saídas canceladas (mantêm-se nas listas por tipo). */
  const departuresAtivas = useMemo(
    () => departures.filter((d) => d.cancelada !== true),
    [departures],
  );
  const { placas: placasPendenciaLimpeza, isPendente, setPendente } = useLimpezaPendente();
  const { fainasLinhas, alarmesDiarios } = useAvisos();
  const { isDismissedTodayForAlarm } = useAlarmDismiss();
  const placasCatalogo = useMemo(
    () => viaturasCatalogoUnicas(items.viaturasAdministrativas, items.ambulancias),
    [items.viaturasAdministrativas, items.ambulancias],
  );
  const linhasProximasTrocasOleo = useMemo(() => {
    return placasCatalogo
      .map((placa) => {
        const kmAtual = maiorKmChegadaPorViatura(departuresAtivas, placa);
        const st = statusTrocaOleo(kmAtual, mapaOleo[placa]);
        return { placa, st };
      })
      .filter(({ st }) => alertaProximaTrocaOleo(st))
      .sort((a, b) => a.placa.localeCompare(b.placa, "pt-BR"));
  }, [placasCatalogo, departuresAtivas, mapaOleo]);
  /** Atualiza saídas administrativas, alarmes e atraso quando o relógio avança (30s para o card de alarme aproximar-se do minuto configurado). */
  const [relogio, setRelogio] = useState(0);
  const [rdvOficinaTick, setRdvOficinaTick] = useState(0);
  const [limpezaModalOpen, setLimpezaModalOpen] = useState(false);
  const [detalheServicoBundle, setDetalheServicoBundle] = useState<DetalheServicoBundle | null>(null);
  const { viaturasComProblema, porViatura } = useVistoriaProblemasMarcadosRefresh();
  const [vistoriaProblemaModalKey, setVistoriaProblemaModalKey] = useState<string | null>(null);

  function openFleetManutencoes() {
    requestFleetManutencoesTab();
    setActiveTab("Frota e Pessoal");
  }

  function openAvisosFainasGerais() {
    requestAvisosFainasGeraisOpen();
    setActiveTab("Avisos");
  }

  useEffect(() => {
    const id = window.setInterval(() => setRelogio((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const on = () => setRdvOficinaTick((t) => t + 1);
    window.addEventListener(RDV_STORAGE_EVENT, on);
    return () => window.removeEventListener(RDV_STORAGE_EVENT, on);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadDetalheServicoBundleFromIdb().then((bundle) => {
      if (cancelled) return;
      setDetalheServicoBundle(bundle);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Oficina, Inoperante e Destacada no RDV gravado com a data mais recente (atualiza com `RDV_STORAGE_EVENT`). */
  void rdvOficinaTick;
  const isoRdvFrota = getLatestPersistedRdvIsoDate();
  const rdvFrotaHome = !isoRdvFrota
    ? {
        isoDate: null as string | null,
        oficinaComObs: [] as { placa: string; observacao: string }[],
        inoperantesComObs: [] as { placa: string; observacao: string }[],
        placasDestacadas: [] as string[],
      }
    : {
        isoDate: isoRdvFrota,
        oficinaComObs: getRdvPlacasNaOficinaComObservacaoForDate(isoRdvFrota),
        inoperantesComObs: getRdvPlacasPorSituacaoComObservacaoForDate(isoRdvFrota, "Inoperante"),
        placasDestacadas: getRdvPlacasPorSituacaoForDate(isoRdvFrota, "Destacada"),
      };

  const placasNaOficina = rdvFrotaHome.oficinaComObs;
  const placasInoperantesRdv = rdvFrotaHome.inoperantesComObs;
  const placasDestacadasRdv = rdvFrotaHome.placasDestacadas;
  /** Mesmo instante para tabelas da home, atraso, alarmes e alerta de piscar. */
  const agoraDashboard = useMemo(() => new Date(), [relogio]);

  /**
   * Só mostra alarmes ativos na home a partir do horário configurado (não antes).
   * Se o utilizador cancelou o alarme na própria home hoje, não volta a aparecer até amanhã.
   */
  const alarmesNaHome = useMemo(
    () =>
      alarmesDiarios.filter(
        (a) =>
          a.ativo &&
          a.nome.trim().length > 0 &&
          parseHhMm(a.hora) !== null &&
          alarmeJaDisparouNesteDia(agoraDashboard, a.hora) &&
          !isDismissedTodayForAlarm(a.id),
      ),
    [alarmesDiarios, agoraDashboard, isDismissedTodayForAlarm],
  );
  /** Enquanto um alarme estiver «ativo» na home (após a hora, antes de desativar), esconde oficina/óleo/limpeza/fainas. */
  const alarmeBloqueiaSecoesOperacionais = alarmesNaHome.length > 0;

  const emAndamento = useMemo(() => {
    const hoje = getCurrentDatePtBr();
    const rows = saidasEmAndamentoHoje(departuresAtivas, hoje);
    return groupDeparturesForListDisplay(rows);
  }, [departuresAtivas]);

  const comAtraso = useMemo(() => {
    const hoje = getCurrentDatePtBr();
    const rows = saidasComAtrasoHoje(departuresAtivas, hoje, agoraDashboard);
    return groupDeparturesForListDisplay(rows);
  }, [departuresAtivas, agoraDashboard]);

  /** Saídas administrativas do dia atual (agrupadas como nas listas). */
  const saidasAdministrativasHoje = useMemo(() => {
    const hoje = getCurrentDatePtBr();
    const raw = departuresAtivas.filter(
      (d) => d.tipo === "Administrativa" && isDepartureDateSameLocalDay(d.dataSaida, hoje),
    );
    const sorted = [...raw].sort((a, b) => {
      const ka = sortKeyHoraSaida(a.horaSaida);
      const kb = sortKeyHoraSaida(b.horaSaida);
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
    return groupDeparturesForListDisplay(sorted);
  }, [departuresAtivas]);

  const motoristasServicoRotinaHoje = useMemo(() => {
    if (!detalheServicoBundle) return { servico: [] as string[], rotina: [] as string[] };
    const isoHoje = isoDateFromDate(new Date());
    const marcados = listMotoristasComServicoOuRotinaNoDia(detalheServicoBundle, isoHoje);
    const servico = [...new Set(marcados.filter((m) => m.servico).map((m) => m.motorista.trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "pt-BR"),
    );
    const rotina = [...new Set(marcados.filter((m) => m.rotina).map((m) => m.motorista.trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "pt-BR"),
    );
    return { servico, rotina };
  }, [detalheServicoBundle]);

  const hasMotoristasServicoOuRotina =
    motoristasServicoRotinaHoje.servico.length > 0 || motoristasServicoRotinaHoje.rotina.length > 0;
  const showSaidasAdministrativasHoje = saidasAdministrativasHoje.length > 0;
  const showAtraso = comAtraso.length > 0;
  const showAndamento = emAndamento.length > 0;
  const showAtrasoOuAndamento = showAtraso || showAndamento;

  const hasViaturasOficinaRdvContent =
    placasNaOficina.length > 0 || placasInoperantesRdv.length > 0 || placasDestacadasRdv.length > 0;
  const showTrocasOleoHome = linhasProximasTrocasOleo.length > 0;
  const showPendenciaLimpeza = placasPendenciaLimpeza.length > 0;
  const showFainasGerais = fainasLinhas.length > 0;
  const hasAlgumCardOperacionalSemAlarme =
    hasViaturasOficinaRdvContent || showTrocasOleoHome || showPendenciaLimpeza || showFainasGerais;
  const showRegiaoCardsInferiores =
    hasMotoristasServicoOuRotina || (!alarmeBloqueiaSecoesOperacionais && hasAlgumCardOperacionalSemAlarme);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        {alarmesNaHome.map((a) => (
          <DailyAlarmCard key={a.id} alarm={a} />
        ))}

        {showSaidasAdministrativasHoje ? (
          <Card className={cn("flex w-full min-w-0 flex-col", departuresTableShadowClass)}>
            <CardHeader className="flex shrink-0 flex-row items-start justify-between space-y-0 pb-2">
              <div className="min-w-0 space-y-1 pr-2">
                <CardTitle className={cn(homeCardTitleClass, "text-[1.35rem] sm:text-[1.65rem] md:text-[1.85rem]")}>
                  Saídas administrativas
                </CardTitle>
                <p
                  className={cn(
                    "text-xs font-bold text-[hsl(var(--primary))]",
                    "[text-shadow:0_1px_2px_rgba(0,0,0,0.35)]",
                  )}
                >
                  {formatDataHojeLongaPtBr()}
                </p>
              </div>
              <div className="rounded-lg bg-[hsl(var(--muted))] p-2.5">
                <Building2 className="h-5 w-5 text-slate-600" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col pt-0">
              <div className="home-dashboard-departures-panel max-h-[min(72vh,42rem)] w-full overflow-auto rounded-md border border-[hsl(var(--border))]">
                    <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className={cn("w-[22%]", homeCompactHeadClass)}>Viatura</TableHead>
                        <TableHead className={cn("w-[24%]", homeCompactHeadClass)}>Motorista</TableHead>
                        <TableHead className={cn("w-[12%] whitespace-nowrap", homeCompactHeadClass)}>Saída</TableHead>
                        <TableHead className={cn("w-[26%]", homeCompactHeadClass)}>Destino</TableHead>
                        <TableHead className={cn("w-[16%]", homeCompactHeadClass)}>OM</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saidasAdministrativasHoje.map((group) => {
                        const r = group.primary;
                        const lr = listRowFromRecord(r);
                        const destino = group.destinoDisplay;
                        const alertaProxima = shouldBlinkProximaSaidaRow(r, agoraDashboard);
                        const viaturaKey = normalizeViaturaKey(lr.viatura);
                        const viaturaComProblemaMarcado =
                          lr.viatura.trim().length > 0 &&
                          lr.viatura !== "—" &&
                          viaturasComProblema.has(viaturaKey);
                        return (
                          <TableRow
                            key={group.records.map((x) => x.id).join("|")}
                            className={cn(alertaProxima && "home-proxima-saida-blink")}
                            aria-label={
                              alertaProxima ? "Saída em menos de 10 minutos — registre o KM saída" : undefined
                            }
                          >
                            <TableCell
                              className={cn(
                                homeCompactCellClass,
                                viaturaComProblemaMarcado &&
                                  "cursor-pointer underline decoration-2 underline-offset-2 decoration-[hsl(var(--primary))]",
                              )}
                              title={lr.viatura}
                              onClick={
                                viaturaComProblemaMarcado
                                  ? (e) => {
                                      e.stopPropagation();
                                      setVistoriaProblemaModalKey(viaturaKey);
                                    }
                                  : undefined
                              }
                            >
                              {lr.viatura}
                            </TableCell>
                            <TableCell className={homeCompactCellClass} title={lr.motorista}>
                              {lr.motorista}
                            </TableCell>
                            <TableCell className={cn(homeCompactCellClass, "whitespace-nowrap tabular-nums")}>
                              {lr.saida}
                            </TableCell>
                            <TableCell className={homeCompactCellClass} title={destino}>
                              {destino}
                            </TableCell>
                            <TableCell className={homeCompactCellClass} title={lr.om}>
                              {lr.om}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
            </CardContent>
          </Card>
        ) : null}

        {showAtrasoOuAndamento ? (
          <div
            className={cn(
              "grid w-full min-w-0 items-stretch gap-4",
              showAtraso && showAndamento ? "lg:grid-cols-2" : "grid-cols-1",
            )}
          >
            {showAtraso ? (
          <Card className={cn("min-w-0 h-full", departuresTableShadowClass, showAtraso && !showAndamento && "w-full")}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="min-w-0 space-y-1 pr-2">
                <CardTitle className={homeCardTitleClass}>Saídas com Atraso</CardTitle>
                <p
                  className={cn(
                    "text-xs font-bold text-[hsl(var(--primary))]",
                    "[text-shadow:0_1px_2px_rgba(0,0,0,0.35)]",
                  )}
                >
                  {formatDataHojeLongaPtBr()}
                </p>
              </div>
              <div className="rounded-lg bg-[hsl(var(--muted))] p-2.5">
                <ClockAlert className="h-5 w-5 text-slate-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="home-dashboard-departures-panel min-h-0 w-full flex-1 overflow-x-auto rounded-md border border-[hsl(var(--border))]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={cn("min-w-[7rem]", homeTableHeadClass)}>Viatura</TableHead>
                        <TableHead className={cn("min-w-[8rem]", homeTableHeadClass)}>Motorista</TableHead>
                        <TableHead className={cn("w-[5.5rem] whitespace-nowrap", homeTableHeadClass)}>
                          Saída
                        </TableHead>
                        <TableHead className={cn("min-w-[8rem]", homeTableHeadClass)}>Destino</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comAtraso.map((group) => {
                        const r = group.primary;
                        const hora = r.horaSaida.trim() || "—";
                        const destino = group.destinoDisplay;
                        return (
                          <TableRow key={group.records.map((x) => x.id).join("|")}>
                            <TableCell className={cn("max-w-[14rem] truncate", homeTableCellClass)}>
                              {r.viaturas.trim() || "—"}
                            </TableCell>
                            <TableCell className={cn("max-w-[16rem] truncate", homeTableCellClass)}>
                              {r.motoristas.trim() || "—"}
                            </TableCell>
                            <TableCell className={cn("whitespace-nowrap tabular-nums", homeTableCellClass)}>
                              {hora}
                            </TableCell>
                            <TableCell className={cn("max-w-[18rem] truncate", homeTableCellClass)}>
                              {destino}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
            </CardContent>
          </Card>
            ) : null}

            {showAndamento ? (
          <Card className={cn("min-w-0 h-full", departuresTableShadowClass, !showAtraso && showAndamento && "w-full")}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="min-w-0 space-y-1 pr-2">
                <CardTitle className={homeCardTitleClass}>Saídas em Andamento</CardTitle>
                <p
                  className={cn(
                    "text-xs font-bold text-[hsl(var(--primary))]",
                    "[text-shadow:0_1px_2px_rgba(0,0,0,0.35)]",
                  )}
                >
                  {formatDataHojeLongaPtBr()}
                </p>
              </div>
              <div className="rounded-lg bg-[hsl(var(--muted))] p-2.5">
                <Route className="h-5 w-5 text-slate-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="home-dashboard-departures-panel min-h-0 w-full flex-1 overflow-x-auto rounded-md border border-[hsl(var(--border))]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={cn("min-w-[7rem]", homeTableHeadClass)}>Viatura</TableHead>
                        <TableHead className={cn("min-w-[8rem]", homeTableHeadClass)}>Motorista</TableHead>
                        <TableHead className={cn("w-[5.5rem] whitespace-nowrap", homeTableHeadClass)}>
                          Saída
                        </TableHead>
                        <TableHead className={cn("w-[6.5rem] whitespace-nowrap", homeTableHeadClass)}>
                          KM saída
                        </TableHead>
                        <TableHead className={cn("min-w-[8rem]", homeTableHeadClass)}>Destino</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emAndamento.map((group) => {
                        const r = group.primary;
                        const hora = r.horaSaida.trim() || "—";
                        const destino = group.destinoDisplay;
                        const kmS = r.kmSaida.trim() || "—";
                        return (
                          <TableRow key={group.records.map((x) => x.id).join("|")}>
                            <TableCell className={cn("max-w-[14rem] truncate", homeTableCellClass)}>
                              {r.viaturas.trim() || "—"}
                            </TableCell>
                            <TableCell className={cn("max-w-[16rem] truncate", homeTableCellClass)}>
                              {r.motoristas.trim() || "—"}
                            </TableCell>
                            <TableCell className={cn("whitespace-nowrap tabular-nums", homeTableCellClass)}>
                              {hora}
                            </TableCell>
                            <TableCell className={cn("whitespace-nowrap tabular-nums", homeTableCellClass)}>
                              {kmS}
                            </TableCell>
                            <TableCell className={cn("max-w-[18rem] truncate", homeTableCellClass)}>
                              {destino}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
            </CardContent>
          </Card>
            ) : null}
        </div>
        ) : null}

        {showRegiaoCardsInferiores ? (
        <div className="grid w-full min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(17.5rem,1fr))]">
            {hasViaturasOficinaRdvContent && !alarmeBloqueiaSecoesOperacionais ? (
            <Card className={departuresTableShadowClass}>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="home-dashboard-fluid-card min-w-0 flex-1 space-y-4">
                  {placasNaOficina.length > 0 ? (
                  <div>
                    <p className={homeFluidCardTitleClass}>Viaturas na Oficina</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {placasNaOficina.map(({ placa, observacao }) => {
                          const tip = observacao.trim();
                          return (
                            <li
                              key={placa}
                              title={tip || undefined}
                              className={cn(
                                "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 font-mono",
                                homeBodyEmphasisClass,
                                tip && "cursor-help",
                              )}
                            >
                              {placa}
                            </li>
                          );
                        })}
                      </ul>
                  </div>
                  ) : null}

                  {placasInoperantesRdv.length > 0 ? (
                  <div
                    className={cn(
                      placasNaOficina.length > 0 && "border-t border-[hsl(var(--border))] pt-3",
                    )}
                  >
                    <p className={homeFluidCardTitleClass}>Viaturas Inoperantes</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {placasInoperantesRdv.map(({ placa, observacao }) => {
                          const tip = observacao.trim();
                          return (
                            <li
                              key={placa}
                              title={tip || undefined}
                              className={cn(
                                "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 font-mono",
                                homeBodyEmphasisClass,
                                tip && "cursor-help",
                              )}
                            >
                              {placa}
                            </li>
                          );
                        })}
                      </ul>
                  </div>
                  ) : null}

                  {placasDestacadasRdv.length > 0 ? (
                    <div
                      className={cn(
                        (placasNaOficina.length > 0 || placasInoperantesRdv.length > 0) &&
                          "border-t border-[hsl(var(--border))] pt-3",
                      )}
                    >
                      <p className={homeFluidCardTitleClass}>Viaturas Destacadas</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {placasDestacadasRdv.map((placa) => (
                          <li
                            key={placa}
                            className={cn(
                              "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 font-mono",
                              homeBodyEmphasisClass,
                            )}
                          >
                            {placa}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3" aria-hidden>
                  <Wrench className="h-5 w-5 text-slate-600" />
                </div>
              </CardContent>
            </Card>
            ) : null}

              {showTrocasOleoHome && !alarmeBloqueiaSecoesOperacionais ? (
              <Card className={departuresTableShadowClass}>
                <CardContent className="flex items-start justify-between gap-3">
                  <div className="home-dashboard-fluid-card min-w-0 flex-1">
                    <p className={homeFluidCardTitleClass}>Próximas Trocas de Óleo</p>
                      <ul className="mt-2 space-y-2">
                        {linhasProximasTrocasOleo.map(({ placa, st }) => (
                          <li
                            key={placa}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2"
                          >
                            <span className={cn("shrink-0 font-mono", homeBodyEmphasisClass)}>
                              {rotuloViaturaPlaca(placa)}
                            </span>
                            <span className={cn("min-w-0", homeBodyEmphasisClass)}>
                              {fraseProximaTrocaOleo(st)}
                            </span>
                          </li>
                        ))}
                      </ul>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3 hover:bg-[hsl(var(--muted))]"
                    onClick={openFleetManutencoes}
                    aria-label="Abrir Frota e Pessoal, Viaturas, Manutenções — trocas de óleo"
                  >
                    <Droplets className="h-5 w-5 text-slate-600" />
                  </Button>
                </CardContent>
              </Card>
              ) : null}

              {showPendenciaLimpeza && !alarmeBloqueiaSecoesOperacionais ? (
              <Card className={departuresTableShadowClass}>
                <CardContent className="flex items-start justify-between gap-3">
                  <div className="home-dashboard-fluid-card min-w-0 flex-1">
                    <p className={homeFluidCardTitleClass}>Viaturas com pendência de limpeza.</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {placasPendenciaLimpeza.map((placa) => (
                          <li
                            key={placa}
                            className={cn(
                              "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 font-mono",
                              homeBodyEmphasisClass,
                            )}
                          >
                            {placa}
                          </li>
                        ))}
                      </ul>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3 hover:bg-[hsl(var(--muted))]"
                    onClick={() => setLimpezaModalOpen(true)}
                    aria-label="Marcar pendência de limpeza por viatura"
                  >
                    <Sparkles className="h-5 w-5 text-slate-600" />
                  </Button>
                </CardContent>
              </Card>
              ) : null}

              {showFainasGerais && !alarmeBloqueiaSecoesOperacionais ? (
              <Card className={departuresTableShadowClass}>
                <CardContent className="flex items-start justify-between gap-3">
                  <div className="home-dashboard-fluid-card min-w-0 flex-1">
                    <p className={homeFluidCardTitleClass}>Fainas Gerais</p>
                      <ul className="mt-2 space-y-2">
                        {fainasLinhas.map((linha, i) => (
                          <li
                            key={`${i}-${linha.slice(0, 24)}`}
                            className={cn(
                              "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 leading-snug",
                              homeBodyEmphasisClass,
                            )}
                          >
                            {linha}
                          </li>
                        ))}
                      </ul>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3 hover:bg-[hsl(var(--muted))]"
                    onClick={openAvisosFainasGerais}
                    aria-label="Abrir Avisos — Fainas gerais"
                  >
                    <ClipboardList className="h-5 w-5 text-slate-600" />
                  </Button>
                </CardContent>
              </Card>
              ) : null}

              {hasMotoristasServicoOuRotina ? (
                <Card className={departuresTableShadowClass}>
                  <CardContent className="flex items-start justify-between gap-3">
                    <div className="home-dashboard-fluid-card min-w-0 flex-1 space-y-3">
                      <div>
                        <p className={homeFluidCardTitleClass}>Motoristas de Serviço</p>
                        <p className={cn("mt-1 leading-snug", homeBodyEmphasisClass)}>
                          {motoristasServicoRotinaHoje.servico.length > 0
                            ? motoristasServicoRotinaHoje.servico.join(", ")
                            : "Nenhum motorista marcado hoje."}
                        </p>
                      </div>
                      <div className="border-t border-[hsl(var(--border))] pt-3">
                        <p className={homeFluidCardTitleClass}>Motoristas de Rotina</p>
                        <p className={cn("mt-1 leading-snug", homeBodyEmphasisClass)}>
                          {motoristasServicoRotinaHoje.rotina.length > 0
                            ? motoristasServicoRotinaHoje.rotina.join(", ")
                            : "Nenhum motorista marcado hoje."}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3" aria-hidden>
                      <Users className="h-5 w-5 text-slate-600" />
                    </div>
                  </CardContent>
                </Card>
              ) : null}
        </div>
        ) : null}
      </section>

      {limpezaModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-limpeza-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLimpezaModalOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
              <h2
                id="dashboard-limpeza-title"
                className="text-lg font-semibold text-[hsl(var(--foreground))]"
              >
                Pendência de limpeza
              </h2>
              <Button type="button" variant="default" size="sm" onClick={() => setLimpezaModalOpen(false)}>
                Fechar
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
                Marque as viaturas que devem aparecer no card <strong>Viaturas com pendência de limpeza</strong> na
                página inicial. O mesmo estado é usado em <strong>Frota e Pessoal</strong> → Cadastrar Viatura.
              </p>
              {placasCatalogo.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Cadastre viaturas em <strong>Frota e Pessoal</strong> para listá-las aqui.
                </p>
              ) : (
                <ul className="space-y-2">
                  {placasCatalogo.map((placa) => (
                    <li
                      key={placa}
                      className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] px-3 py-2"
                    >
                      <input
                        id={`dashboard-limpeza-${placa}`}
                        type="checkbox"
                        checked={isPendente(placa)}
                        onChange={(e) => setPendente(placa, e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-[hsl(var(--border))]"
                        aria-label={`Pendência de limpeza para ${placa}`}
                      />
                      <label
                        htmlFor={`dashboard-limpeza-${placa}`}
                        className="min-w-0 flex-1 cursor-pointer font-mono text-sm text-[hsl(var(--foreground))]"
                      >
                        {placa}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {vistoriaProblemaModalKey !== null ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
          <Card className="w-full max-w-lg border-[hsl(var(--primary))]/25 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-[hsl(var(--border))]">
              <CardTitle className="text-lg">
                Relatório Simplificado da Viatura
                {(() => {
                  const first = porViatura.get(vistoriaProblemaModalKey)?.[0];
                  return first?.viatura ? (
                    <span className="block text-sm font-bold text-[hsl(var(--muted-foreground))]">{first.viatura}</span>
                  ) : null;
                })()}
              </CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => setVistoriaProblemaModalKey(null)}>
                Fechar
              </Button>
            </CardHeader>
            <CardContent className="max-h-[min(70vh,28rem)] space-y-3 overflow-y-auto p-4">
              {(porViatura.get(vistoriaProblemaModalKey) ?? []).length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum item pendente para esta viatura.</p>
              ) : (
                <ul className="space-y-3">
                  {(porViatura.get(vistoriaProblemaModalKey) ?? []).map((item) => (
                    <li
                      key={`${item.inspectionId}-${item.itemKey}`}
                      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.12] p-3"
                    >
                      <p className="text-sm font-semibold text-orange-500">{item.itemLabel}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Data da vistoria: {formatIsoDatePtBrShort(item.inspectionDate)}
                      </p>
                      {item.anotacao ? (
                        <p className="mt-2 text-sm font-bold text-orange-500">{item.anotacao}</p>
                      ) : (
                        <p className="mt-2 text-sm italic text-[hsl(var(--muted-foreground))]">Sem anotação escrita.</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
