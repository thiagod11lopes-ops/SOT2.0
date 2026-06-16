import { CarFront, Clock3, MapPin, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { groupSiadDeparturesForDay, type SiadDayDepartureGroup } from "../lib/siadDayDepartures";
import { subscribeSiadDriverRequestChanges } from "../lib/siadDriverRequest";
import { formatDestinosListaPt, type DepartureRecord } from "../types/departure";
import { cn } from "../lib/utils";

function MotoristaBadge({ status }: { status: SiadDayDepartureGroup["motoristaStatus"] }) {
  if (status === "none") return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        status === "confirmed"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
      )}
    >
      {status === "confirmed" ? "Motorista confirmado" : "Motorista solicitado"}
    </span>
  );
}

export function SiadDeparturesDayList({
  departures,
  dateSaida,
}: {
  departures: DepartureRecord[];
  dateSaida: string;
}) {
  const [driverRequestTick, setDriverRequestTick] = useState(0);

  useEffect(() => {
    return subscribeSiadDriverRequestChanges(() => {
      setDriverRequestTick((tick) => tick + 1);
    });
  }, []);

  const groups = useMemo(() => {
    void driverRequestTick;
    return groupSiadDeparturesForDay(departures, dateSaida);
  }, [departures, dateSaida, driverRequestTick]);

  return (
    <section className="space-y-3" aria-labelledby="siad-day-departures-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="siad-day-departures-title" className="text-sm font-semibold text-[hsl(var(--foreground))]">
          Saídas do dia
        </h3>
        <span className="rounded-full bg-[hsl(var(--primary)/0.1)] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--primary))]">
          {groups.length} {groups.length === 1 ? "horário" : "horários"}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] px-4 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Nenhuma saída cadastrada para {dateSaida || "esta data"}.
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group.horaSaida}
              className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.12)] px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">
                  <Clock3 className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
                  {group.horaSaida}
                </span>
                <MotoristaBadge status={group.motoristaStatus} />
              </div>
              <div className="space-y-2 px-4 py-3 text-sm">
                <p className="flex items-start gap-2 text-[hsl(var(--foreground))]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                  <span>
                    <span className="font-medium">Bairro{group.bairros.length === 1 ? "" : "s"}: </span>
                    {group.bairros.length > 0 ? formatDestinosListaPt(group.bairros) : "—"}
                  </span>
                </p>
                <p className="flex items-start gap-2 text-[hsl(var(--foreground))]">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                  <span>
                    <span className="font-medium">Passageiros: </span>
                    {group.passageiros.length > 0 ? formatDestinosListaPt(group.passageiros) : "—"}
                  </span>
                </p>
                {group.motoristaStatus === "none" ? (
                  <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                    <CarFront className="h-3.5 w-3.5" aria-hidden />
                    Motorista ainda não solicitado
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
