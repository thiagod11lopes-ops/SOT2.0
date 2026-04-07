import { useId } from "react";
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";

export type MergedPickAction = "detail" | "ocorrencias" | "edit" | "trash";

const ACTION_COPY: Record<MergedPickAction, { title: string; description: string }> = {
  detail: {
    title: "Visualizar saída",
    description:
      "Esta linha reúne várias saídas. Escolha pelo setor (e destino) qual deseja visualizar.",
  },
  ocorrencias: {
    title: "Ocorrências",
    description: "Escolha pelo setor (e destino) qual registo deseja abrir para ocorrências.",
  },
  edit: {
    title: "Editar no cadastro",
    description: "Escolha pelo setor (e destino) qual saída deseja editar.",
  },
  trash: {
    title: "Excluir ou cancelar",
    description: "Escolha pelo setor (e destino) qual saída deseja excluir ou cancelar.",
  },
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: DepartureRecord[];
  action: MergedPickAction;
  onSelect: (record: DepartureRecord) => void;
};

function labelSetorDestino(r: DepartureRecord): { setor: string; destino: string } {
  const setor = r.setor.trim() || "—";
  const destino = r.bairro.trim() || "—";
  return { setor, destino };
}

export function MergedDeparturePickRecordModal({ open, onOpenChange, records, action, onSelect }: Props) {
  const titleId = useId();
  if (!open || records.length === 0) return null;

  const copy = ACTION_COPY[action];

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[290] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="flex max-h-[min(88vh,560px)] w-full max-w-md flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
            {copy.title}
          </h2>
          <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">{copy.description}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
          <ul className="flex flex-col gap-2">
            {records.map((r) => {
              const { setor, destino } = labelSetorDestino(r);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.06)] px-3 py-3 text-left text-sm transition hover:bg-[hsl(var(--muted)/0.14)] active:scale-[0.99]"
                    onClick={() => onSelect(r)}
                  >
                    <span className="font-semibold text-[hsl(var(--foreground))]">Setor: {setor}</span>
                    <span className="mt-0.5 block text-[hsl(var(--muted-foreground))]">Destino: {destino}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
          <Button type="button" className="w-full font-medium sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
