import { useId, useRef } from "react";
import { RubricaSignaturePad, type RubricaSignaturePadHandle } from "../saidas-mobile/rubrica-signature-pad";
import { Button } from "./ui/button";

type Props = {
  title?: string;
  description?: string;
  padKey?: string | number;
  initialRubrica?: string | null;
  onCancel: () => void;
  onConfirm: (rubricaDataUrl: string) => void;
};

/** Painel de captura de rubrica (Cancelar / Limpar / Confirmar). */
export function OccurrenceRubricaCapturePanel({
  title = "Rubrica da ocorrência",
  description = "Desenhe a rubrica com o dedo ou o rato. Aparece ao lado da ocorrência no PDF.",
  padKey = "occ-rubrica",
  initialRubrica = null,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId();
  const rubricaPadRef = useRef<RubricaSignaturePadHandle>(null);

  function handleConfirmar() {
    const dataUrl = rubricaPadRef.current?.getDataUrl().trim() ?? "";
    if (!dataUrl) {
      window.alert("Desenhe a rubrica antes de confirmar.");
      return;
    }
    onConfirm(dataUrl);
  }

  return (
    <div className="space-y-3">
      <h3 id={titleId} className="text-base font-semibold text-[hsl(var(--foreground))]">
        {title}
      </h3>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
      <RubricaSignaturePad key={padKey} ref={rubricaPadRef} initialDataUrl={initialRubrica} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="default" onClick={() => rubricaPadRef.current?.clearPad()}>
          Limpar
        </Button>
        <Button type="button" variant="default" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" variant="default" onClick={handleConfirmar}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}
