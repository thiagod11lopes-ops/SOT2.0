import { Car, ClipboardList, Droplets, Sparkles, Truck } from "lucide-react";
import { useMemo } from "react";
import { useAvisos } from "../context/avisos-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { useLimpezaPendente } from "../context/limpeza-pendente-context";
import { useOficinaVisitas } from "../context/oficina-visits-context";
import { useOilMaintenanceMap } from "../hooks/useOilMaintenanceMap";
import { getCurrentDatePtBr } from "../lib/dateFormat";
import { fraseProximaTrocaOleo } from "../lib/homeTickerStrings";
import {
  alertaProximaTrocaOleo,
  maiorKmChegadaPorViatura,
  statusTrocaOleo,
  viaturasCatalogoUnicas,
} from "../lib/oilMaintenance";
import { viaturaEstaNaOficina, type MapaOficinaPorViatura } from "../lib/oficinaVisits";
import type { DepartureRecord } from "../types/departure";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const MAX_PROXIMAS_SAIDAS = 3;

/** Placas com visita na oficina que tem data de entrada e ainda sem data de saída (modal Oficina). */
function placasAtualmenteNaOficina(mapaOficina: MapaOficinaPorViatura): string[] {
  return Object.keys(mapaOficina)
    .filter((placa) => viaturaEstaNaOficina(mapaOficina[placa]))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function horaSaidaSortKey(hora: string): number {
  const t = hora.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + min;
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

function proximasSaidasAdministrativasHoje(rows: DepartureRecord[], hojeDdMmYyyy: string): DepartureRecord[] {
  return rows
    .filter(
      (r) =>
        r.tipo === "Administrativa" &&
        r.dataSaida.trim() === hojeDdMmYyyy &&
        !r.kmSaida.trim(),
    )
    .sort((a, b) => horaSaidaSortKey(a.horaSaida) - horaSaidaSortKey(b.horaSaida))
    .slice(0, MAX_PROXIMAS_SAIDAS);
}

export function Dashboard() {
  const { items } = useCatalogItems();
  const { departures } = useDepartures();
  const { placas: placasPendenciaLimpeza } = useLimpezaPendente();
  const { fainasLinhas } = useAvisos();
  const { mapaOficina } = useOficinaVisitas();
  const mapaOleo = useOilMaintenanceMap();
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
  const proximas = useMemo(() => {
    const hoje = getCurrentDatePtBr();
    return proximasSaidasAdministrativasHoje(departures, hoje);
  }, [departures]);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <Card className="w-full">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div className="min-w-0 space-y-1 pr-2">
              <CardTitle className="text-base font-semibold leading-tight">Próximas Saídas</CardTitle>
              <p className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                {formatDataHojeLongaPtBr()}
              </p>
            </div>
            <div className="rounded-lg bg-[hsl(var(--muted))] p-2.5">
              <Truck className="h-5 w-5 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {proximas.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhuma saída administrativa prevista para hoje sem KM de saída.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[7rem]">Viatura</TableHead>
                      <TableHead className="min-w-[8rem]">Motorista</TableHead>
                      <TableHead className="w-[5.5rem] whitespace-nowrap">Saída</TableHead>
                      <TableHead className="min-w-[8rem]">Destino</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proximas.map((r) => {
                      const hora = r.horaSaida.trim() || "—";
                      const destino = r.bairro.trim() || "—";
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="max-w-[14rem] truncate font-medium">
                            {r.viaturas.trim() || "—"}
                          </TableCell>
                          <TableCell className="max-w-[16rem] truncate">{r.motoristas.trim() || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">{hora}</TableCell>
                          <TableCell className="max-w-[18rem] truncate">{destino}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500">Viaturas na Oficina</p>
                {placasNaOficina.length === 0 ? (
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                    Nenhuma viatura com entrada na oficina sem data de saída.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {placasNaOficina.map((placa) => (
                      <li
                        key={placa}
                        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 font-mono text-sm font-medium text-[hsl(var(--foreground))]"
                      >
                        {placa}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3">
                <Car className="h-5 w-5 text-slate-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500">Próximas Trocas de Óleo</p>
                {placasCatalogo.length === 0 ? (
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                    Cadastre viaturas em <strong>Frota e Pessoal</strong> para acompanhar trocas de óleo.
                  </p>
                ) : linhasProximasTrocasOleo.length === 0 ? (
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                    Nenhuma viatura está próxima do prazo de troca de óleo.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {linhasProximasTrocasOleo.map(({ placa, st }) => (
                      <li
                        key={placa}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2"
                      >
                        <span className="shrink-0 font-mono text-sm font-medium text-[hsl(var(--foreground))]">
                          {placa}
                        </span>
                        <span className="min-w-0 text-sm text-[hsl(var(--muted-foreground))]">
                          {fraseProximaTrocaOleo(st)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3">
                <Droplets className="h-5 w-5 text-slate-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500">Viaturas com pendência de limpeza.</p>
                {placasPendenciaLimpeza.length === 0 ? (
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                    Nenhuma viatura marcada em Frota e Pessoal → Cadastrar Viatura.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {placasPendenciaLimpeza.map((placa) => (
                      <li
                        key={placa}
                        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 font-mono text-sm font-medium text-[hsl(var(--foreground))]"
                      >
                        {placa}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="shrink-0 rounded-lg bg-[hsl(var(--muted))] p-3">
                <Sparkles className="h-5 w-5 text-slate-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500">Fainas Gerais</p>
                {fainasLinhas.length === 0 ? (
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                    Nenhuma faina cadastrada. Use a aba <strong>Avisos</strong>.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm text-[hsl(var(--foreground))]">
                    {fainasLinhas.map((linha, i) => (
                      <li
                        key={`${i}-${linha.slice(0, 24)}`}
                        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 leading-snug"
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
    </div>
  );
}
