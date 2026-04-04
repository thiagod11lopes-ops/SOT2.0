import { useState, type HTMLAttributes } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { DepartureKmFieldsPatch } from "../context/departures-provider";
import { normalize24hTime } from "../lib/timeInput";
import type { DepartureRecord } from "../types/departure";
import { listRowFromRecord } from "../types/departure";
import { cn } from "../lib/utils";

function Field({
  label,
  value,
  onChange,
  inputMode,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete="off"
        className={cn(
          "min-h-[2.75rem] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-3 text-sm text-[hsl(var(--foreground))] outline-none ring-0 transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/40",
          mono && "font-mono tabular-nums",
        )}
      />
    </label>
  );
}

export function DepartureCard({
  record,
  onPatchKm,
}: {
  record: DepartureRecord;
  onPatchKm: (patch: DepartureKmFieldsPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const row = listRowFromRecord(record);

  function commitChegada(raw: string) {
    onPatchKm({ chegada: normalize24hTime(raw) });
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-[hsl(var(--border))]/90 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--card))]/70 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] transition",
        open && "ring-1 ring-[hsl(var(--primary))]/35",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[4.5rem] items-stretch gap-3 p-4 text-left active:bg-[hsl(var(--muted))]/20"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-bold tabular-nums text-[hsl(var(--primary))]">{row.saida}</span>
            <span className="truncate text-base font-semibold text-[hsl(var(--foreground))]">{row.viatura}</span>
          </div>
          <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{row.motorista}</p>
          <p className="truncate text-sm">
            <span className="text-[hsl(var(--muted-foreground))]">Dest. </span>
            <span className="font-medium text-[hsl(var(--foreground))]">{row.destino}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-1">
          <span className="rounded-lg bg-[hsl(var(--muted))]/60 px-2 py-0.5 text-[0.65rem] font-bold text-[hsl(var(--foreground))]">
            {row.om}
          </span>
          {open ? (
            <ChevronUp className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
          ) : (
            <ChevronDown className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden />
          )}
        </div>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/35 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Setor / ramal
              </p>
              <p className="text-sm text-[hsl(var(--foreground))]">
                {record.setor.trim() || "—"} · {record.ramal.trim() || "—"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Objetivo
              </p>
              <p className="text-sm leading-snug text-[hsl(var(--foreground))]">{record.objetivoSaida.trim() || "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label="KM saída"
              value={record.kmSaida}
              onChange={(v) => onPatchKm({ kmSaida: v })}
              inputMode="numeric"
              mono
            />
            <Field
              label="KM chegada"
              value={record.kmChegada}
              onChange={(v) => onPatchKm({ kmChegada: v })}
              inputMode="numeric"
              mono
            />
            <Field
              label="Chegada (hora)"
              value={record.chegada}
              onChange={(v) => commitChegada(v)}
              inputMode="numeric"
              mono
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
