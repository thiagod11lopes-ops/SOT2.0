import { useEffect, useState } from "react";
import { HEADER_INFO_CARD_CLASS } from "./header-info-card";
import { cn } from "../lib/utils";

/**
 * Relógio digital (HH:MM:SS) e data em português, atualização por segundo.
 * Estilo “glass” alinhado ao tema do header.
 */
export function HeaderDateTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const rawDate = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dateLabel =
    rawDate.length > 0 ? rawDate.charAt(0).toUpperCase() + rawDate.slice(1) : rawDate;

  return (
    <div
      className={cn(
        HEADER_INFO_CARD_CLASS,
        "flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5 md:gap-3",
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      <time
        dateTime={now.toISOString()}
        className={cn(
          "font-mono text-sm font-semibold tabular-nums tracking-[0.06em] text-[hsl(var(--primary))] sm:text-lg md:text-xl",
          "[text-shadow:0_0_24px_hsl(var(--primary)/0.35),0_2px_8px_rgba(0,0,0,0.25)]",
        )}
      >
        {time}
      </time>
      <span
        className="hidden h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-[hsl(var(--primary))]/35 to-transparent sm:block"
        aria-hidden
      />
      <span
        className={cn(
          "text-[0.65rem] font-medium leading-snug text-[hsl(var(--muted-foreground))] sm:max-w-[min(100%,20rem)] sm:text-[0.7rem] md:max-w-[22rem] md:text-xs",
          "tracking-wide",
        )}
      >
        {dateLabel}
      </span>
    </div>
  );
}
