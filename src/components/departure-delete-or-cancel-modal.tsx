import { useEffect, useId, useState } from "react";
import type { DepartureRecord } from "../types/departure";
import { Button } from "./ui/button";

type Step = "escolher" | "nome";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DepartureRecord | null;
  onExcluirDefinitivo: (id: string) => void;
  onConfirmarCancelamento: (id: string, nomeResponsavel: string) => void;
};

export function DepartureDeleteOrCancelModal({
  open,
  onOpenChange,
  record,
  onExcluirDefinitivo,
  onConfirmarCancelamento,
}: Props) {
  const titleId = useId();
  const nomeId = useId();
  const [step, setStep] = useState<Step>("escolher");
  const [nome, setNome] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("escolher");
      setNome("");
    }
  }, [open]);

  if (!open || !record) return null;

  const r = record;
  const jaCancelada = r.cancelada === true;

  function fechar() {
    onOpenChange(false);
  }

  function handleExcluir() {
    onExcluirDefinitivo(r.id);
    fechar();
  }

  function handleConfirmarNome() {
    const t = nome.trim();
    if (!t) return;
    onConfirmarCancelamento(r.id, t);
    fechar();
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[300] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
          {jaCancelada ? "Remover saída" : "Excluir ou cancelar saída"}
        </h2>
        {jaCancelada ? (
          <>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Esta saída está cancelada. Deseja removê-la definitivamente da lista?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={fechar}>
                Fechar
              </Button>
              <Button
                type="button"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={handleExcluir}
              >
                Remover da lista
              </Button>
            </div>
          </>
        ) : step === "escolher" ? (
          <>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Escolha se deseja apagar o registo de forma permanente ou apenas marcar a saída como
              cancelada (permanece na tabela, com indicação de cancelamento).
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button type="button" variant="outline" onClick={fechar}>
                Voltar
              </Button>
              <Button
                type="button"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={handleExcluir}
              >
                Excluir permanentemente
              </Button>
              <Button type="button" variant="default" onClick={() => setStep("nome")}>
                Cancelar saída
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Indique o nome do responsável pelo cancelamento. Será registado no campo Rubrica.
            </p>
            <label htmlFor={nomeId} className="mt-4 block text-sm font-medium text-[hsl(var(--foreground))]">
              Nome do responsável
            </label>
            <input
              id={nomeId}
              type="text"
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              placeholder="Nome completo"
            />
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("escolher")}>
                Voltar
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={!nome.trim()}
                onClick={handleConfirmarNome}
              >
                Confirmar cancelamento
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
