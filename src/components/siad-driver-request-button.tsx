import { CarFront, CheckCircle2, Loader2, Radio } from "lucide-react";
import { useSiadDriverRequest } from "../hooks/useSiadDriverRequest";
import { cn } from "../lib/utils";

export function SiadDriverRequestButton({
  dateSaida,
  horaSaida,
  disabled = false,
  layout = "embedded",
}: {
  dateSaida: string;
  horaSaida: string;
  disabled?: boolean;
  layout?: "embedded" | "standalone";
}) {
  const { isConfirmed, isRequested, canRequest, request } = useSiadDriverRequest(dateSaida, horaSaida);

  const embedded = layout === "embedded";
  const shell = cn(
    "relative flex w-full overflow-hidden rounded-xl text-white shadow-sm",
    embedded ? "min-h-11 flex-row items-center justify-between gap-2 p-2.5 sm:p-3" : "flex-col gap-3 p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-4",
  );

  function handleClick() {
    if (disabled || !canRequest) return;
    request(horaSaida);
  }

  if (isConfirmed) {
    return (
      <div
        className={cn(shell, "border border-emerald-400/35 bg-gradient-to-r from-emerald-600 to-teal-700")}
        aria-live="polite"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-white/15", embedded ? "h-8 w-8" : "h-10 w-10")}>
            <CheckCircle2 className={embedded ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
          </span>
          <p className={cn("font-bold leading-tight", embedded ? "text-sm" : "text-base sm:text-lg")}>
            Motorista confirmado
          </p>
        </div>
      </div>
    );
  }

  if (isRequested) {
    return (
      <div
        className={cn(
          shell,
          "border border-orange-300/30 bg-gradient-to-r from-orange-600/95 via-amber-600 to-orange-700",
        )}
        aria-live="polite"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-white/15", embedded ? "h-8 w-8" : "h-10 w-10")}>
            <Loader2 className={cn("animate-spin", embedded ? "h-4 w-4" : "h-5 w-5")} aria-hidden />
          </span>
          <p className={cn("font-bold leading-tight", embedded ? "text-sm" : "text-base sm:text-lg")}>
            Solicitação enviada
          </p>
        </div>
        {!embedded ? (
          <span className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-white/20 px-4 text-sm font-semibold text-white/95 sm:min-w-[11rem]">
            Aguardando confirmação
          </span>
        ) : (
          <span className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white/95">
            Aguardando
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        shell,
        "group border border-orange-300/40 text-left shadow-[0_12px_32px_-14px_rgba(249,115,22,0.75)] transition-transform active:scale-[0.99]",
        "bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:brightness-105",
        "disabled:pointer-events-none disabled:opacity-55",
        "touch-manipulation",
      )}
      aria-label={`Solicitar motorista para saída às ${horaSaida}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-white/20 shadow-inner", embedded ? "h-8 w-8" : "h-10 w-10")}>
          <Radio className={embedded ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
        </span>
        <p className={cn("font-bold leading-tight", embedded ? "text-sm" : "text-base sm:text-lg")}>
          Solicitar motorista
        </p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white font-bold text-orange-600 shadow-md",
          embedded ? "h-8 px-2.5 text-[11px]" : "h-11 px-4 text-sm sm:min-w-[11rem]",
        )}
      >
        <CarFront className={embedded ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
        Enviar
      </span>
    </button>
  );
}
