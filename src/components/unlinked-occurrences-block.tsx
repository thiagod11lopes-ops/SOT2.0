import type { PdfOccurrenceEntry } from "../types/pdfOccurrence";
import { DepartureOccurrenceLine } from "./departure-occurrence-line";
import { cn } from "../lib/utils";

type Props = {
  entries: PdfOccurrenceEntry[];
  className?: string;
};

/** Ocorrências sem placa — abaixo da lista/tabela, alinhadas à esquerda. */
export function UnlinkedOccurrencesBlock({ entries, className }: Props) {
  const visible = entries.filter((e) => e.texto.trim().length > 0);
  if (visible.length === 0) return null;

  return (
    <section
      className={cn("mt-3 space-y-2 border-t border-[hsl(var(--border))]/50 pt-3", className)}
      aria-label="Ocorrências sem viatura"
    >
      {visible.map((entry, index) => (
        <DepartureOccurrenceLine
          key={`${entry.texto}-${index}`}
          texto={entry.texto}
          rubrica={entry.rubrica}
        />
      ))}
    </section>
  );
}
