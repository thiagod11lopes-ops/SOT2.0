import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { getCurrentDatePtBr, normalizeDatePtBr, ptBrToIsoDate } from "../lib/dateFormat";
import { parseKmCampo } from "../lib/oilMaintenance";
import { Button } from "./ui/button";

/** Só dígitos; formata com ponto a cada mil (ex.: 45230 → 45.230). */
function formatKmComSeparadorMilhar(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return "";
  try {
    const n = BigInt(digitos);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  } catch {
    return "";
  }
}

type TrocaOleoModalProps = {
  placa: string | null;
  /** KM sugerido (ex.: maior KM chegada nas saídas), pode ser null. */
  kmSugerido: number | null;
  onConfirm: (km: number, dataIso: string) => void;
  onClose: () => void;
};

export function TrocaOleoModal({ placa, kmSugerido, onConfirm, onClose }: TrocaOleoModalProps) {
  const open = placa !== null;
  const [kmTexto, setKmTexto] = useState("");
  const [dataPtBr, setDataPtBr] = useState("");

  useEffect(() => {
    if (!open) return;
    setKmTexto(
      kmSugerido !== null && kmSugerido !== undefined
        ? formatKmComSeparadorMilhar(String(kmSugerido))
        : "",
    );
    setDataPtBr(getCurrentDatePtBr());
  }, [open, placa, kmSugerido]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !placa) return null;

  function handleConfirmar() {
    const km = parseKmCampo(kmTexto);
    if (km === null || km < 0) {
      window.alert("Informe uma quilometragem válida (número inteiro).");
      return;
    }
    const dataIso = ptBrToIsoDate(dataPtBr);
    if (!dataIso) {
      window.alert("Informe a data completa da troca (dd/mm/aaaa).");
      return;
    }
    onConfirm(km, dataIso);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="troca-oleo-modal-title"
        className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="troca-oleo-modal-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Troca de óleo — {placa}
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Informe a quilometragem do odômetro e a data em que a troca foi realizada.
        </p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="troca-oleo-km">
              Quilometragem da troca
            </label>
            <input
              id="troca-oleo-km"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={kmTexto}
              onChange={(e) => setKmTexto(formatKmComSeparadorMilhar(e.target.value))}
              placeholder="Ex.: 45.230"
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm tabular-nums text-[hsl(var(--foreground))]"
            />
            {kmSugerido !== null ? (
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Sugestão pelo maior KM chegada nas saídas: {kmSugerido.toLocaleString("pt-BR")} km (editável).
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[hsl(var(--foreground))]" htmlFor="troca-oleo-data">
              Data da troca
            </label>
            <input
              id="troca-oleo-data"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              value={dataPtBr}
              onChange={(e) => setDataPtBr(normalizeDatePtBr(e.target.value))}
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm tabular-nums text-[hsl(var(--foreground))]"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirmar}>
            Salvar troca
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
