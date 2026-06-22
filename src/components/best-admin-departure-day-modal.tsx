import { useMemo } from "react";
import { useDepartures } from "../context/departures-context";
import {
  BEST_ADMIN_DEPARTURE_DAY_QUESTION,
  buildBestAdminDepartureDayAnswer,
} from "../lib/sotBestAdminDay";
import { MarkdownBoldText } from "./markdown-bold-text";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BestAdminDepartureDayModal({ open, onOpenChange }: Props) {
  const { departures } = useDepartures();
  const answer = useMemo(() => buildBestAdminDepartureDayAnswer(departures), [departures]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="best-admin-day-title"
      aria-describedby="best-admin-day-body"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 id="best-admin-day-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
              Melhor dia para saída administrativa
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{BEST_ADMIN_DEPARTURE_DAY_QUESTION}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>

        <div
          id="best-admin-day-body"
          className="mt-4 whitespace-pre-wrap rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.2] p-4 text-sm leading-relaxed text-[hsl(var(--foreground))]"
        >
          <MarkdownBoldText content={answer} strongClassName="font-semibold text-[hsl(var(--primary))]" />
        </div>
      </div>
    </div>
  );
}
