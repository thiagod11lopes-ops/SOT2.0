import { CalendarDays } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useDepartures } from "../context/departures-context";
import type { DepartureType } from "../types/departure";
import { formatDateToPtBr, getCurrentDatePtBr, normalizeDatePtBr, parsePtBrToDate } from "../lib/dateFormat";
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
  const filterDateId = useId();
  const [filterDepartureDate, setFilterDepartureDate] = useState<string>(() => getCurrentDatePtBr());
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    setFilterDepartureDate(getCurrentDatePtBr());
  }, [filterTipo]);

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

  const emptyMessage = useMemo(() => {
    const ofTipo = departures.filter((d) => d.tipo === filterTipo);
    if (ofTipo.length === 0) return "Nenhuma saída cadastrada para este tipo.";
    if (isCompleteDatePtBr(filterDepartureDate) && rows.length === 0) {
      return "Nenhum registro encontrado para a data de saída selecionada.";
    }
    return "Nenhum registro encontrado.";
  }, [departures, filterTipo, filterDepartureDate, rows.length]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-5">
        <CardTitle className="min-w-0 flex-1 leading-none">{title}</CardTitle>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              id={filterDateId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              aria-label="Filtrar por data de saída (dd/mm/aaaa)"
              value={filterDepartureDate}
              onChange={(event) => setFilterDepartureDate(normalizeDatePtBr(event.target.value))}
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
      <CardContent>
        <DeparturesDataTable
          rows={rows}
          emptyLabel={emptyMessage}
          onRemove={removeDeparture}
          onUpdateKmFields={updateDepartureKmFields}
          onEdit={beginEditDeparture}
        />
      </CardContent>
    </Card>
  );
}
