import type { DepartureOccurrenceViewEntry } from "../lib/departureOccurrenceEntries";
import { isRubricaImageDataUrl } from "../lib/rubricaDrawing";
import { cn } from "../lib/utils";

type Props = {
  texto: string;
  rubrica?: string;
  className?: string;
  compact?: boolean;
};

/** Linha de ocorrência: texto à esquerda e rubrica ao lado (quando existir). */
export function DepartureOccurrenceLine({ texto, rubrica, className, compact = false }: Props) {
  const rubricaRaw = (rubrica ?? "").trim();
  const hasRubrica = isRubricaImageDataUrl(rubricaRaw);

  return (
    <div className={cn("flex min-w-0 items-start gap-2.5 text-left", className)}>
      <p
        className={cn(
          "min-w-0 flex-1 italic leading-snug text-[hsl(var(--foreground))]/88",
          compact ? "text-xs" : "text-sm",
        )}
      >
        <span className="font-semibold not-italic text-[hsl(var(--foreground))]/95">Ocorrências:</span> {texto}
      </p>
      {hasRubrica ? (
        <img
          src={rubricaRaw}
          alt=""
          className={cn(
            "shrink-0 object-contain object-left",
            compact ? "h-9 w-14" : "h-10 w-16",
          )}
        />
      ) : null}
    </div>
  );
}

type ListProps = {
  entries: DepartureOccurrenceViewEntry[];
  className?: string;
  itemClassName?: string;
  compact?: boolean;
};

export function DepartureOccurrenceLinesList({
  entries,
  className,
  itemClassName,
  compact = false,
}: ListProps) {
  if (entries.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {entries.map((entry) => (
        <DepartureOccurrenceLine
          key={entry.id}
          texto={entry.texto}
          rubrica={entry.rubrica}
          className={itemClassName}
          compact={compact}
        />
      ))}
    </div>
  );
}
