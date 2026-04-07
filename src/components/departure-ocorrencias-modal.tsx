import { useEffect, useId, useState } from "react";
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DepartureRecord | null;
  onSave: (id: string, texto: string) => void;
};

export function DepartureOcorrenciasModal({ open, onOpenChange, record, onSave }: Props) {
  const titleId = useId();
  const textId = useId();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open && record) {
      setDraft(record.ocorrencias ?? "");
    }
  }, [open, record]);

  if (!open || !record) return null;

  const r = record;

  function fechar() {
    onOpenChange(false);
  }

  function handleSalvar() {
    onSave(r.id, draft.trim());
    fechar();
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[290] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Ocorrências
        </h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Texto livre associado a esta saída. Aparece abaixo da linha no PDF gerado (Gerar PDF / Enviar).
        </p>
        <label htmlFor={textId} className="mt-4 block text-sm font-medium text-[hsl(var(--foreground))]">
          Descrição da ocorrência
        </label>
        <textarea
          id={textId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="mt-1.5 w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          placeholder="Descreva a ocorrência…"
        />
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="button" variant="default" onClick={handleSalvar}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
