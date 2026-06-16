import { CarFront, CheckCircle2, Loader2, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { useDepartures } from "../context/departures-context";
import { useSiadDriverRequest } from "../hooks/useSiadDriverRequest";
import {
  getSiadDepartureTimesForDate,
  normalizeSiadDriverRequestHora,
} from "../lib/siadDriverRequest";
import { cn } from "../lib/utils";
import { SiadDriverRequestTimePickerModal } from "./siad-driver-request-time-picker-modal";

export function SiadDriverRequestButton({
  dateSaida,
  horaSaida,
  disabled = false,
}: {
  dateSaida: string;
  horaSaida: string;
  disabled?: boolean;
}) {
  const { departures } = useDepartures();
  const { isConfirmed, isRequested, canRequest, request } = useSiadDriverRequest(dateSaida, horaSaida);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const horariosDoDia = useMemo(
    () => getSiadDepartureTimesForDate(departures, dateSaida, horaSaida),
    [departures, dateSaida, horaSaida],
  );

  const horaLabel = normalizeSiadDriverRequestHora(horaSaida);

  function submitRequest(hora: string) {
    if (!normalizeSiadDriverRequestHora(hora)) return;
    request(hora);
    setTimePickerOpen(false);
  }

  function handleClick() {
    if (disabled || !canRequest) return;
    if (horariosDoDia.length >= 2) {
      setTimePickerOpen(true);
      return;
    }
    const hora = horariosDoDia[0] ?? horaSaida;
    submitRequest(hora);
  }

  function handleSelectHorario(hora: string) {
    submitRequest(hora);
  }

  const horaHint = horaLabel ? ` às ${horaLabel}` : "";

  const card = isConfirmed ? (
    <div
      className={cn(
        "relative flex h-full min-h-[11.5rem] w-full flex-col justify-between overflow-hidden rounded-2xl border border-emerald-400/35 p-4 text-white shadow-lg",
        "bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700",
      )}
      aria-live="polite"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
          Confirmado
        </span>
      </div>
      <div className="relative space-y-1">
        <p className="text-lg font-bold leading-tight">Saída confirmada</p>
        <p className="text-xs text-emerald-100/90">
          Motorista avisado pelo SOT 2.0{horaHint}
        </p>
      </div>
      <button
        type="button"
        disabled
        className="relative mt-3 h-11 w-full cursor-not-allowed rounded-xl bg-white/20 text-sm font-semibold text-white/95"
      >
        Saída confirmada
      </button>
    </div>
  ) : isRequested ? (
    <div
      className={cn(
        "relative flex h-full min-h-[11.5rem] w-full flex-col justify-between overflow-hidden rounded-2xl border border-orange-300/30 p-4 text-white shadow-lg",
        "bg-gradient-to-br from-orange-600/95 via-amber-600 to-orange-700",
      )}
      aria-live="polite"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-100">
          Aguardando
        </span>
      </div>
      <div className="relative space-y-1">
        <p className="text-lg font-bold leading-tight">Solicitação enviada</p>
        <p className="text-xs text-orange-100/90">
          Aguardando confirmação no SOT 2.0{horaHint}
        </p>
      </div>
      <button
        type="button"
        disabled
        className="relative mt-3 h-11 w-full cursor-not-allowed rounded-xl bg-white/20 text-sm font-semibold text-white/95"
      >
        Aguardando confirmação
      </button>
    </div>
  ) : (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "group relative flex h-full min-h-[11.5rem] w-full flex-col justify-between overflow-hidden rounded-2xl border border-orange-300/40 p-4 text-left text-white shadow-[0_20px_50px_-18px_rgba(249,115,22,0.75)] transition-transform active:scale-[0.99]",
        "bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 hover:brightness-105",
        "disabled:pointer-events-none disabled:opacity-55",
        "touch-manipulation",
      )}
      aria-label="Solicitar motorista ao SOT 2.0"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/20 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="pointer-events-none absolute -bottom-10 -left-8 h-24 w-24 rounded-full bg-yellow-300/20 blur-2xl" />
      <div className="relative flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 shadow-inner">
          <Radio className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-50">
          Motorista
        </span>
      </div>
      <div className="relative space-y-1">
        <p className="text-lg font-bold leading-tight">Solicitar motorista</p>
        <p className="text-xs text-orange-50/90">
          {horariosDoDia.length >= 2
            ? "Várias saídas no dia — escolha o horário"
            : `Avisar o SOT 2.0${horaHint || " para a data selecionada"}`}
        </p>
      </div>
      <span className="relative mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-orange-600 shadow-md">
        <CarFront className="h-4 w-4" aria-hidden />
        Enviar solicitação
      </span>
    </button>
  );

  return (
    <>
      {card}
      <SiadDriverRequestTimePickerModal
        open={timePickerOpen}
        dateSaida={dateSaida}
        horarios={horariosDoDia}
        onClose={() => setTimePickerOpen(false)}
        onSelect={handleSelectHorario}
      />
    </>
  );
}
