import { useId, type ReactNode } from "react";
import type { DepartureRecord } from "../types/departure";
import { formatKmThousandsPtBr } from "../lib/kmInput";
import { isRubricaImageDataUrl } from "../lib/rubricaDrawing";
import { Button } from "./ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DepartureRecord | null;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-[hsl(var(--border))]/50 py-2.5 last:border-b-0 sm:grid sm:grid-cols-[minmax(10rem,12rem)_1fr] sm:gap-4 sm:py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-snug text-[hsl(var(--foreground))] sm:mt-0">{children}</dd>
    </div>
  );
}

function displayOrDash(v: string) {
  const t = v?.trim();
  return t && t.length > 0 ? t : "—";
}

export function DepartureDetailModal({ open, onOpenChange, record }: Props) {
  const titleId = useId();

  if (!open || !record) return null;

  const criadoEm =
    record.createdAt > 0
      ? new Date(record.createdAt).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—";

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[280] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl sm:max-w-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Dados completos da saída
          </h2>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Tipo: <span className="font-medium text-[hsl(var(--foreground))]">{record.tipo}</span>
            {record.cancelada ? (
              <span className="ml-2 rounded bg-red-600/15 px-1.5 py-0.5 text-red-700 dark:text-red-400">
                Cancelada
              </span>
            ) : null}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <dl>
            <Field label="Identificador">{record.id}</Field>
            <Field label="Registado em">{criadoEm}</Field>
            <Field label="Data do pedido">{displayOrDash(record.dataPedido)}</Field>
            <Field label="Hora do pedido">{displayOrDash(record.horaPedido)}</Field>
            <Field label="Data da saída">{displayOrDash(record.dataSaida)}</Field>
            <Field label="Hora da saída">{displayOrDash(record.horaSaida)}</Field>
            <Field label="Setor">{displayOrDash(record.setor)}</Field>
            <Field label="Ramal">{displayOrDash(record.ramal)}</Field>
            <Field label="Objetivo da saída">
              <span className="whitespace-pre-wrap break-words">{displayOrDash(record.objetivoSaida)}</span>
            </Field>
            <Field label="Número de passageiros">{displayOrDash(record.numeroPassageiros)}</Field>
            <Field label="Responsável pelo pedido">{displayOrDash(record.responsavelPedido)}</Field>
            <Field label="OM">{displayOrDash(record.om)}</Field>
            <Field label="Viaturas">{displayOrDash(record.viaturas)}</Field>
            <Field label="Motoristas">{displayOrDash(record.motoristas)}</Field>
            <Field label="Hospital destino">{displayOrDash(record.hospitalDestino)}</Field>
            <Field label="KM saída">{displayOrDash(formatKmThousandsPtBr(record.kmSaida))}</Field>
            <Field label="KM chegada">{displayOrDash(formatKmThousandsPtBr(record.kmChegada))}</Field>
            <Field label="Hora de chegada">{displayOrDash(record.chegada)}</Field>
            <Field label="Cidade">{displayOrDash(record.cidade)}</Field>
            <Field label="Bairro / destino">{displayOrDash(record.bairro)}</Field>
            <Field label="Ocorrências">
              <span className="whitespace-pre-wrap break-words">{displayOrDash(record.ocorrencias ?? "")}</span>
            </Field>
            <Field label="Rubrica">
              {isRubricaImageDataUrl(record.rubrica) ? (
                <div className="mt-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-2">
                  <img
                    src={record.rubrica}
                    alt="Rubrica desenhada"
                    className="max-h-40 max-w-full object-contain object-left"
                  />
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Desenho (rubrica)</p>
                </div>
              ) : (
                <span className="whitespace-pre-wrap break-words">{displayOrDash(record.rubrica)}</span>
              )}
            </Field>
          </dl>
        </div>
        <div className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
          <Button type="button" variant="default" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
