import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { parseHhMm } from "../lib/timeInput";
import { cn } from "../lib/utils";

export type KmWizardStep = 1 | 2 | 3;

const LABELS: Record<KmWizardStep, string> = {
  1: "KM saída",
  2: "KM chegada",
  3: "Chegada (hora)",
};

export function KmSequenceModal({
  step,
  value,
  onChangeValue,
  onOk,
  onCancel,
}: {
  step: KmWizardStep;
  value: string;
  onChangeValue: (v: string) => void;
  onOk: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function handleOk() {
    const t = value.trim();
    if (step === 1 || step === 2) {
      if (!t) {
        window.alert(`Preencha ${LABELS[step]}.`);
        return;
      }
      onOk();
      return;
    }
    if (!t) {
      window.alert("Preencha a hora de chegada.");
      return;
    }
    if (!parseHhMm(t)) {
      window.alert("Use o formato HH:MM (24 horas), por exemplo 14:30.");
      return;
    }
    onOk();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="km-seq-title"
        className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id="km-seq-title"
          className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]"
        >
          Passo {step} de 3
        </p>
        <h2 className="mt-1 text-lg font-bold text-[hsl(var(--foreground))]">{LABELS[step]}</h2>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={step === 3 ? "HH:MM" : ""}
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
          className={cn(
            "mt-4 min-h-[3rem] w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-lg font-mono font-semibold tabular-nums text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/50",
          )}
        />
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 font-semibold text-[hsl(var(--foreground))] active:scale-[0.99]"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="min-h-12 flex-1 rounded-xl bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))] shadow-lg active:scale-[0.99]"
            onClick={handleOk}
          >
            Ok
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
