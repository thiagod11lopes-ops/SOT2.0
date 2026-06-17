import { CarFront, Clock3, MapPin, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDepartures } from "../context/departures-context";
import { groupSiadDeparturesForDay, type SiadDayDepartureGroup } from "../lib/siadDayDepartures";
import { deleteSiadDepartureGroupCompletely } from "../lib/siadDepartureDelete";
import { subscribeSiadDriverRequestChanges } from "../lib/siadDriverRequest";
import { formatDestinosListaPt, type DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";
import { SiadDriverRequestButton } from "./siad-driver-request-button";

function SiadDepartureDeleteConfirmModal({
  open,
  group,
  dateSaida,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  group: SiadDayDepartureGroup | null;
  dateSaida: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !group) return null;

  const count = group.recordIds.length;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="siad-delete-departure-title"
      aria-describedby="siad-delete-departure-desc"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="siad-delete-departure-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Excluir saída
        </h2>
        <p id="siad-delete-departure-desc" className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Deseja excluir permanentemente a saída de{" "}
          <strong className="text-[hsl(var(--foreground))]">{dateSaida || "esta data"}</strong> às{" "}
          <strong className="text-[hsl(var(--foreground))]">{group.horaSaida}</strong>
          {count > 1 ? (
            <>
              {" "}
              ({count} registros agrupados: {formatDestinosListaPt(group.bairros)})
            </>
          ) : group.bairros.length > 0 ? (
            <> — {formatDestinosListaPt(group.bairros)}</>
          ) : null}
          ? Esta ação não pode ser desfeita. Os registros serão removidos do SOT 2.0 e o pedido de motorista deste horário também será apagado.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto"
            onClick={onConfirm}
          >
            Excluir saída
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SiadDeparturesDayList({
  departures,
  dateSaida,
  driverRequestDisabled = false,
}: {
  departures: DepartureRecord[];
  dateSaida: string;
  driverRequestDisabled?: boolean;
}) {
  const { removeDeparture, initialLoadComplete } = useDepartures();
  const [driverRequestTick, setDriverRequestTick] = useState(0);
  const [deleteGroup, setDeleteGroup] = useState<SiadDayDepartureGroup | null>(null);

  useEffect(() => {
    return subscribeSiadDriverRequestChanges(() => {
      setDriverRequestTick((tick) => tick + 1);
    });
  }, []);

  const groups = useMemo(() => {
    void driverRequestTick;
    return groupSiadDeparturesForDay(departures, dateSaida, initialLoadComplete);
  }, [departures, dateSaida, driverRequestTick, initialLoadComplete]);

  function handleConfirmDelete() {
    if (!deleteGroup) return;
    deleteSiadDepartureGroupCompletely({
      group: deleteGroup,
      dateSaida,
      departures,
      removeDeparture,
    });
    setDeleteGroup(null);
  }

  return (
    <>
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
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">
                    <Clock3 className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                    {group.horaSaida}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="siad-pwa-touch-target h-9 w-9 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                      aria-label={`Excluir saída das ${group.horaSaida}`}
                      onClick={() => setDeleteGroup(group)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
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
                  {group.motoristasEscalados.length > 0 ? (
                    <p className="flex items-start gap-2 text-[hsl(var(--foreground))]">
                      <CarFront className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
                      <span>
                        <span className="font-medium">Motorista escalado: </span>
                        {formatDestinosListaPt(group.motoristasEscalados)}
                      </span>
                    </p>
                  ) : group.motoristaStatus === "none" ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Motorista ainda não escalado no SOT 2.0
                    </p>
                  ) : (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Aguardando escala de motorista no SOT 2.0
                    </p>
                  )}
                </div>
                <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.06)] px-3 py-2.5 sm:px-4">
                  <SiadDriverRequestButton
                    dateSaida={dateSaida}
                    horaSaida={group.horaSaida}
                    disabled={driverRequestDisabled}
                    layout="embedded"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SiadDepartureDeleteConfirmModal
        open={deleteGroup !== null}
        group={deleteGroup}
        dateSaida={dateSaida}
        onCancel={() => setDeleteGroup(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
