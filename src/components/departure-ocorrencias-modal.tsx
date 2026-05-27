import { useEffect, useId, useState } from "react";
import type { DepartureRecord } from "../types/departure";
import { cn } from "../lib/utils";
import { MOBILE_MODAL_ABOVE_BOTTOM_TABS_OVERLAY_CLASS } from "../saidas-mobile/mobileModalOverlayClass";
import { Button } from "./ui/button";
import { OccurrenceRubricaCapturePanel } from "./occurrence-rubrica-capture-panel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DepartureRecord | null;
  onSave: (id: string, texto: string, rubrica: string) => void;
  /** Mobile: modal no topo da tela, sobre todo o conteúdo. */
  alignTop?: boolean;
  /** Mobile: modal acima da barra Administrativo / Serviço (formulário de saída). */
  alignAboveBottomTabs?: boolean;
};

export function DepartureOcorrenciasModal({
  open,
  onOpenChange,
  record,
  onSave,
  alignTop = false,
  alignAboveBottomTabs = false,
}: Props) {
  const titleId = useId();
  const textId = useId();
  const [draft, setDraft] = useState("");
  const [step, setStep] = useState<"form" | "rubrica">("form");
  const [rubricaPadKey, setRubricaPadKey] = useState(0);

  useEffect(() => {
    if (open && record) {
      setDraft(record.ocorrencias ?? "");
      setStep("form");
      setRubricaPadKey((k) => k + 1);
    }
  }, [open, record]);

  if (!open || !record) return null;

  const r = record;

  function fechar() {
    onOpenChange(false);
  }

  function handleGuardar() {
    if (!draft.trim()) {
      window.alert("Descreva a ocorrência antes de guardar.");
      return;
    }
    setRubricaPadKey((k) => k + 1);
    setStep("rubrica");
  }

  function handleConfirmarRubrica(rubricaDataUrl: string) {
    onSave(r.id, draft.trim(), rubricaDataUrl);
    fechar();
  }

  return (
    <div
      className={cn(
        alignAboveBottomTabs
          ? cn(MOBILE_MODAL_ABOVE_BOTTOM_TABS_OVERLAY_CLASS, "z-[500]")
          : cn(
              "pointer-events-auto fixed inset-0 flex justify-center bg-black/55 p-4",
              alignTop
                ? "z-[500] items-start pt-[max(1rem,env(safe-area-inset-top,0px))]"
                : "z-[290] items-end sm:items-center",
            ),
      )}
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

        {step === "form" ? (
          <>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Texto livre associado a esta saída. Aparece abaixo da linha no PDF gerado (Gerar PDF / Enviar), com rubrica
              ao lado.
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
              <Button type="button" variant="default" onClick={handleGuardar}>
                Guardar
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-3">
            <OccurrenceRubricaCapturePanel
              padKey={`${r.id}-${rubricaPadKey}`}
              initialRubrica={r.ocorrenciasRubrica || null}
              onCancel={() => setStep("form")}
              onConfirm={handleConfirmarRubrica}
            />
          </div>
        )}
      </div>
    </div>
  );
}
