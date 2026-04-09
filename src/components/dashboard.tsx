import {
  CarFront,
  ClipboardList,
  ClockAlert,
  Droplets,
  Route,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAvisos } from "../context/avisos-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { useLimpezaPendente } from "../context/limpeza-pendente-context";
import { useOficinaVisitas } from "../context/oficina-visits-context";
import { getCurrentDatePtBr, isDepartureDateSameLocalDay } from "../lib/dateFormat";
import { parseHhMm } from "../lib/timeInput";
import {
  frasePendenciaLimpezaViatura,
  fraseProximaTrocaOleo,
  rotuloViaturaPlaca,
} from "../lib/homeTickerStrings";
import type { TrocaOleoRegistro } from "../lib/oilMaintenance";
import { departuresTableShadowClass } from "../lib/uiShadows";
import {
  alertaProximaTrocaOleo,
  maiorKmChegadaPorViatura,
  statusTrocaOleo,
  viaturasCatalogoUnicas,
} from "../lib/oilMaintenance";
import { viaturaEstaNaOficina, type MapaOficinaPorViatura } from "../lib/oficinaVisits";
import { groupDeparturesForListDisplay, type DepartureRecord } from "../types/departure";
import { cn } from "../lib/utils";
import { DailyAlarmCard } from "./daily-alarm-card";
import { VehicleMaintenancePanel } from "./vehicle-maintenance-panel";
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

/** KM saída, KM chegada e hora de chegada preenchidos → saída tratada como finalizada (fora do card). */
function saidaFinalizadaKmEChegada(r: DepartureRecord): boolean {
  return (
    r.kmSaida.trim().length > 0 &&
    r.kmChegada.trim().length > 0 &&
    r.chegada.trim().length > 0
  );
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
 * Próxima saída **prevista** a partir de agora (hoje): administrativa ou ambulância;
 * data com tolerância dd/mm/aaaa e yyyy-mm-dd; hora inválida/vazia não entra.
 * Saídas com KM saída, KM chegada e chegada preenchidos não entram (finalizadas).
 * Saídas em andamento (KM saída preenchido, retorno ainda vazio) não entram — ficam só no card correspondente.
 * Só entram horários ≥ hora atual; o menor desses é a “próxima”; empate no mesmo HH:MM → linhas distintas;
 * registros com todos os campos de cadastro iguais contam como um só.
 */
function proximaSaidaHoje(
  rows: DepartureRecord[],
  hojeDdMmYyyy: string,
  agora: Date,
): DepartureRecord[] {
  const agoraMin = minutosRelogioLocal(agora);

  const candidatas = rows
    .filter((r) => !saidaFinalizadaKmEChegada(r))
    .filter((r) => !saidaEmAndamento(r))
    .filter((r) => isDepartureDateSameLocalDay(r.dataSaida, hojeDdMmYyyy))
    .filter((r) => {
      const k = sortKeyHoraSaida(r.horaSaida);
      if (k === Number.POSITIVE_INFINITY) return false;
      return k >= agoraMin;
    });

  candidatas.sort((a, b) => {
    const ka = sortKeyHoraSaida(a.horaSaida);
    const kb = sortKeyHoraSaida(b.horaSaida);
    if (ka !== kb) return ka - kb;
    return a.id.localeCompare(b.id);
  });

  if (candidatas.length === 0) return [];

  const primeiroHorario = sortKeyHoraSaida(candidatas[0].horaSaida);
  const mesmoHorario = candidatas.filter((r) => sortKeyHoraSaida(r.horaSaida) === primeiroHorario);
  return mesmoHorario;
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

/** Títulos dos cards menores (grade): mesma lógica dos `<th>`. */
const homeSectionTitleClass =
  "text-sm font-bold text-[hsl(var(--primary))] [text-shadow:0_1px_2px_rgba(0,0,0,0.42),0_2px_8px_rgba(0,0,0,0.32)]";

/** Textos de corpo / listas / vazios: mesma cor e peso das células. */
const homeBodyEmphasisClass = "font-bold text-[hsl(var(--primary))]";

/** Placas com visita na oficina que tem data de entrada e ainda sem data de saída (modal Oficina). */
function placasAtualmenteNaOficina(mapaOficina: MapaOficinaPorViatura): string[] {
  return Object.keys(mapaOficina)
    .filter((placa) => viaturaEstaNaOficina(mapaOficina[placa]))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Minutos desde meia-noite; inválido/vazio ordena por último (igual às abas de saídas). */
function sortKeyHoraSaida(hora: string): number {
  const parsed = parseHhMm(hora);
  if (!parsed) return Number.POSITIVE_INFINITY;
  return parsed.h * 60 + parsed.m;
}

/** Últimos 10 min (incl.) antes da hora agendada, ainda sem KM saída → alerta laranja na Próxima Saída. */
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

export function Dashboard({ mapaOleo }: { mapaOleo: Record<string, TrocaOleoRegistro> }) {
  const { items } = useCatalogItems();
  const { departures } = useDepartures();
  const { placas: placasPendenciaLimpeza, isPendente, setPendente } = useLimpezaPendente();
  const { fainasLinhas, alarmesDiarios } = useAvisos();

  const { mapaOficina } = useOficinaVisitas();
  const placasCatalogo = useMemo(
    () => viaturasCatalogoUnicas(items.viaturasAdministrativas, items.ambulancias),
    [items.viaturasAdministrativas, items.ambulancias],
  );
  const linhasProximasTrocasOleo = useMemo(() => {
    return placasCatalogo
      .map((placa) => {
        const kmAtual = maiorKmChegadaPorViatura(departures, placa);
        const st = statusTrocaOleo(kmAtual, mapaOleo[placa]);
        return { placa, st };
      })
      .filter(({ st }) => alertaProximaTrocaOleo(st))
      .sort((a, b) => a.placa.localeCompare(b.placa, "pt-BR"));
  }, [placasCatalogo, departures, mapaOleo]);
  const placasNaOficina = useMemo(() => placasAtualmenteNaOficina(mapaOficina), [mapaOficina]);
  /** Atualiza próxima saída, alarmes e atraso quando o relógio avança (30s para o card de alarme aproximar-se do minuto configurado). */
  const [relogio, setRelogio] = useState(0);
  const [manutencoesModalOpen, setManutencoesModalOpen] = useState(false);
  const [limpezaModalOpen, setLimpezaModalOpen] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setRelogio((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  /** Mesmo instante para Próxima Saída, atraso, alarmes e alerta de piscar. */
  const agoraDashboard = useMemo(() => {
    void relogio;
    return new Date();
  }, [relogio]);

  /** Só mostra alarmes ativos na home a partir do horário configurado (não antes). */
  const alarmesNaHome = useMemo(
    () =>
      alarmesDiarios.filter(
        (a) =>
          a.ativo &&
          a.nome.trim().length > 0 &&
          parseHhMm(a.hora) !== null &&
          alarmeJaDisparouNesteDia(agoraDashboard, a.hora),
      ),
    [alarmesDiarios, agoraDashboard],
  );
  const proximas = useMemo(() => {
    const hoje = getCurrentDatePtBr();
    const rows = proximaSaidaHoje(departures, hoje, agoraDashboard);
    return groupDeparturesForListDisplay(rows);
  }, [departures, agoraDashboard]);

  const emAndamento = useMemo(() => {
    const hoje = getCurrentDatePtBr();
    const rows = saidasEmAndamentoHoje(departures, hoje);
    return groupDeparturesForListDisplay(rows);
  }, [departures]);

  const comAtraso = useMemo(() => {
    const hoje = getCurrentDatePtBr();
    const rows = saidasComAtrasoHoje(departures, hoje, agoraDashboard);
    return groupDeparturesForListDisplay(rows);
  }, [departures, agoraDashboard]);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        {alarmesNaHome.map((a) => (
          <DailyAlarmCard key={a.id} alarm={a} />
        ))}

        <Card className={cn("w-full", departuresTableShadowClass)}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="min-w-0 space-y-1 pr-2">
              <CardTitle className={homeCardTitleClass}>Próxima Saída</CardTitle>
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
              <CarFront className="h-5 w-5 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {proximas.length === 0 ? (
              <p className={cn("text-sm", homeBodyEmphasisClass)}>
                Nenhuma saída prevista a partir de agora para hoje.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
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
                    {proximas.map((group) => {
                      const r = group.primary;
                      const hora = r.horaSaida.trim() || "—";
                      const destino = group.destinoDisplay;
                      const alertaProxima = shouldBlinkProximaSaidaRow(r, agoraDashboard);
                      return (
                        <TableRow
                          key={group.records.map((x) => x.id).join("|")}
                          className={cn(alertaProxima && "home-proxima-saida-blink")}
                          aria-label={alertaProxima ? "Saída em menos de 10 minutos — registre o KM saída" : undefined}
                        >
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
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className={cn("min-w-0", departuresTableShadowClass)}>
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
              {comAtraso.length === 0 ? (
                <p className={cn("text-sm", homeBodyEmphasisClass)}>
                  Nenhuma saída com atraso para hoje.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
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
              )}
            </CardContent>
          </Card>

          <Card className={cn("min-w-0", departuresTableShadowClass)}>
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
              {emAndamento.length === 0 ? (
                <p className={cn("text-sm", homeBodyEmphasisClass)}>
                  Nenhuma saída em andamento para hoje.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
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
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className={departuresTableShadowClass}>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={homeSectionTitleClass}>Viaturas na Oficina</p>
                {placasNaOficina.length === 0 ? (
                  <p className={cn("mt-2 text-sm", homeBodyEmphasisClass)}>
                    Nenhuma viatura com entrada na oficina sem data de saída.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {placasNaOficina.map((placa) => (
                      <li
                        key={placa}
                        className={cn(
                          "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 font-mono text-sm",
                          homeBodyEmphasisClass,
                        )}
                      >
                        {placa}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-auto shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3 hover:bg-[hsl(var(--muted))]"
                onClick={() => setManutencoesModalOpen(true)}
                aria-label="Abrir manutenções (mesma aba Frota e Pessoal — Manutenções)"
              >
                <Wrench className="h-5 w-5 text-slate-600" />
              </Button>
            </CardContent>
          </Card>

          <Card className={departuresTableShadowClass}>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={homeSectionTitleClass}>Próximas Trocas de Óleo</p>
                {placasCatalogo.length === 0 ? (
                  <p className={cn("mt-2 text-sm", homeBodyEmphasisClass)}>
                    Cadastre viaturas em <strong>Frota e Pessoal</strong> para acompanhar trocas de óleo.
                  </p>
                ) : linhasProximasTrocasOleo.length === 0 ? (
                  <p className={cn("mt-2 text-sm", homeBodyEmphasisClass)}>
                    Nenhuma viatura está próxima do prazo de troca de óleo.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {linhasProximasTrocasOleo.map(({ placa, st }) => (
                      <li
                        key={placa}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2"
                      >
                        <span className={cn("shrink-0 font-mono text-sm", homeBodyEmphasisClass)}>
                          {rotuloViaturaPlaca(placa)}
                        </span>
                        <span className={cn("min-w-0 text-sm", homeBodyEmphasisClass)}>
                          {fraseProximaTrocaOleo(st)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-auto shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3 hover:bg-[hsl(var(--muted))]"
                onClick={() => setManutencoesModalOpen(true)}
                aria-label="Abrir manutenções — próximas trocas de óleo (mesma aba Frota e Pessoal — Manutenções)"
              >
                <Droplets className="h-5 w-5 text-slate-600" />
              </Button>
            </CardContent>
          </Card>

          <Card className={departuresTableShadowClass}>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={homeSectionTitleClass}>Viaturas com pendência de limpeza.</p>
                {placasPendenciaLimpeza.length === 0 ? (
                  <p className={cn("mt-2 text-sm", homeBodyEmphasisClass)}>
                    Nenhuma viatura marcada em Frota e Pessoal → Cadastrar Viatura.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {placasPendenciaLimpeza.map((placa) => (
                      <li
                        key={placa}
                        className={cn(
                          "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 text-sm leading-snug",
                          homeBodyEmphasisClass,
                        )}
                      >
                        {frasePendenciaLimpezaViatura(placa)}
                      </li>
                    ))}
                  </ul>
                )}
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

          <Card className={departuresTableShadowClass}>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className={homeSectionTitleClass}>Fainas Gerais</p>
                {fainasLinhas.length === 0 ? (
                  <p className={cn("mt-2 text-sm", homeBodyEmphasisClass)}>
                    Nenhuma faina cadastrada. Use a aba <strong>Avisos</strong>.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {fainasLinhas.map((linha, i) => (
                      <li
                        key={`${i}-${linha.slice(0, 24)}`}
                        className={cn(
                          "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 text-sm leading-snug",
                          homeBodyEmphasisClass,
                        )}
                      >
                        {linha}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3">
                <ClipboardList className="h-5 w-5 text-slate-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {manutencoesModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-manutencoes-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setManutencoesModalOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
              <h2
                id="dashboard-manutencoes-title"
                className="text-lg font-semibold text-[hsl(var(--foreground))]"
              >
                Manutenções
              </h2>
              <Button type="button" variant="default" size="sm" onClick={() => setManutencoesModalOpen(false)}>
                Fechar
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <VehicleMaintenancePanel />
            </div>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
