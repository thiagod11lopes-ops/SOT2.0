import { ptBR } from "date-fns/locale";
import type { ComponentProps } from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "../../lib/utils";

import "react-day-picker/style.css";

export type CalendarProps = ComponentProps<typeof DayPicker>;

export function Calendar({ className, locale = ptBR, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={locale}
      className={cn(
        "calendar-themed rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-[hsl(var(--foreground))] shadow-lg shadow-slate-900/10 [--rdp-day_button-border-radius:0.75rem] [--rdp-nav_button-height:2.25rem] [--rdp-nav_button-width:2.25rem] dark:shadow-black/30",
        className,
      )}
      {...props}
    />
  );
}
