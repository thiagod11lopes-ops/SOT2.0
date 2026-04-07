import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { flushSync } from "react-dom";
import { Button } from "../components/ui/button";
import { normalize24hTime, normalize24hTimeWithCaret } from "../lib/timeInput";
import { cn } from "../lib/utils";

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialValue: string;
  onConfirm: (value: string) => void;
  /** Normaliza ao tocar OK (ex.: KM, hora). */
  transform?: (v: string) => string;
};

type InputProps = BaseProps & {
  variant: "input";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  mono?: boolean;
  /** Edição com máscara e indicação de formato 24 h (HH:MM). */
  time24h?: boolean;
};

type SelectProps = BaseProps & {
  variant: "select";
  options: string[];
  /** Valor no registo que não está no catálogo (opção extra). */
  orphanValue?: string | null;
};

export type MobileFieldEditModalProps = InputProps | SelectProps;

/** Modal grande para editar um campo no mobile (OK antes de Cancelar). */
export function MobileFieldEditModal(props: MobileFieldEditModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [draft, setDraft] = useState(props.initialValue);
  const isTime24h = props.variant === "input" ? Boolean(props.time24h) : false;

  useEffect(() => {
    if (props.open) {
      if (isTime24h) {
        setDraft(normalize24hTime(props.initialValue));
      } else {
        setDraft(props.initialValue);
      }
    }
  }, [props.open, props.initialValue, isTime24h]);

  /** Foco imediato + rAF: ajuda o teclado virtual (sobretudo Android) a abrir ao abrir o modal. */
  useLayoutEffect(() => {
    if (!props.open) return;

    function focusField() {
      if (props.variant === "input") {
        const el = inputRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        try {
          el.select();
        } catch {
          /* select() pode falhar em alguns estados */
        }
      } else {
        selectRef.current?.focus({ preventScroll: true });
      }
    }

    focusField();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(focusField);
    });
    return () => cancelAnimationFrame(id);
  }, [props.open, props.variant]);

  if (!props.open) return null;

  const { onOpenChange, title, onConfirm, transform } = props;

  function handleConfirm() {
    const next = transform ? transform(draft) : draft;
    onConfirm(next);
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  const orphan =
    props.variant === "select"
      ? (() => {
          const v = props.initialValue.trim();
          if (!v) return null;
          if (props.options.some((o) => o === v)) return null;
          return v;
        })()
      : null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[220] flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        className="flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-4 py-4 sm:px-5">
          <h2 id={titleId} className="text-xl font-semibold text-[hsl(var(--foreground))]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {isTime24h ? (
              <>
                Formato <span className="font-mono font-semibold text-[hsl(var(--foreground))]">HH:MM</span> em 24 horas
                (00:00–23:59). Toque em OK para guardar ou Cancelar para fechar sem alterar.
              </>
            ) : (
              "Toque em OK para guardar ou Cancelar para fechar sem alterar."
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {props.variant === "input" ? (
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              onChange={(e) => {
                if (isTime24h) {
                  const sel = e.target.selectionStart ?? 0;
                  const { value, caret } = normalize24hTimeWithCaret(e.target.value, sel);
                  setDraft(value);
                  queueMicrotask(() => {
                    inputRef.current?.setSelectionRange(caret, caret);
                  });
                } else {
                  setDraft(e.target.value);
                }
              }}
              inputMode={isTime24h ? "numeric" : props.inputMode}
              placeholder={isTime24h ? "HH:MM" : undefined}
              autoComplete="off"
              enterKeyHint="done"
              className={cn(
                "min-h-[3.75rem] w-full rounded-xl border-2 border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-2xl text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/35",
                (props.mono || isTime24h) && "font-mono tabular-nums tracking-tight",
              )}
            />
          ) : (
            <select
              ref={selectRef}
              autoFocus
              value={
                props.options.some((o) => o === draft) || draft === "" || orphan === draft
                  ? draft
                  : ""
              }
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              size={Math.min(12, Math.max(4, props.options.length + (orphan ? 2 : 1)))}
              className="min-h-[12rem] w-full rounded-xl border-2 border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-lg text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/35"
            >
              <option value="">— Selecionar —</option>
              {orphan ? (
                <option value={orphan}>
                  {orphan} (fora do catálogo)
                </option>
              ) : null}
              {props.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="shrink-0 flex flex-col gap-2 border-t border-[hsl(var(--border))] px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <Button
            type="button"
            className="min-h-12 w-full rounded-xl text-base font-semibold text-black sm:w-auto sm:min-w-[7rem]"
            onClick={handleConfirm}
          >
            OK
          </Button>
          <Button
            type="button"
            className="min-h-12 w-full rounded-xl text-base font-medium text-black sm:w-auto sm:min-w-[7rem]"
            onClick={handleCancel}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Campo de texto: toque abre modal grande (OK antes de Cancelar). */
export function MobileEditableTextField({
  label,
  value,
  onCommit,
  disabled,
  inputMode,
  mono,
  transform,
  time24h,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  mono?: boolean;
  transform?: (v: string) => string;
  /** Modal com máscara e texto para hora 24 h (HH:MM). */
  time24h?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const display = useMemo(() => {
    if (!value.trim()) return "—";
    if (time24h) return normalize24hTime(value);
    return value;
  }, [value, time24h]);
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {label}
        </span>
        {disabled ? (
          <div
            className={cn(
              "flex min-h-[2.75rem] items-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-3 text-sm text-[hsl(var(--foreground))]",
              mono && "font-mono tabular-nums",
              "cursor-not-allowed opacity-70",
            )}
          >
            {display}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              flushSync(() => setOpen(true));
            }}
            className={cn(
              "min-h-[2.75rem] w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-3 text-left text-sm text-[hsl(var(--foreground))] outline-none ring-0 transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/40 active:bg-[hsl(var(--muted))]/25",
              mono && "font-mono tabular-nums",
            )}
          >
            {display}
          </button>
        )}
      </div>
      <MobileFieldEditModal
        variant="input"
        open={open}
        onOpenChange={setOpen}
        title={label}
        initialValue={value}
        onConfirm={onCommit}
        inputMode={time24h ? "numeric" : inputMode}
        mono={mono ?? time24h}
        time24h={time24h}
        transform={transform}
      />
    </>
  );
}

/** Select de catálogo: toque abre modal grande (OK antes de Cancelar). */
export function MobileEditableSelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  emptyCatalogHint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  emptyCatalogHint?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const orphan = useMemo(() => {
    if (!value.trim()) return null;
    if (options.some((o) => o === value)) return null;
    return value;
  }, [value, options]);

  const display = useMemo(() => {
    if (!value.trim()) return "— Selecionar —";
    if (orphan) return `${value} (fora do catálogo)`;
    return value;
  }, [value, orphan]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {label}
        </span>
        {disabled ? (
          <div className="flex min-h-[2.75rem] items-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-3 text-sm text-[hsl(var(--foreground))] cursor-not-allowed opacity-70">
            {display}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              flushSync(() => setOpen(true));
            }}
            className="min-h-[2.75rem] w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-3 text-left text-sm text-[hsl(var(--foreground))] outline-none ring-0 transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/40 active:bg-[hsl(var(--muted))]/25"
          >
            {display}
          </button>
        )}
        {emptyCatalogHint && options.length === 0 ? (
          <span className="text-[0.65rem] text-[hsl(var(--muted-foreground))]">
            Cadastre itens em <strong>Frota e Pessoal</strong> no SOT (ambiente completo).
          </span>
        ) : null}
      </div>
      <MobileFieldEditModal
        variant="select"
        open={open}
        onOpenChange={setOpen}
        title={label}
        initialValue={value}
        onConfirm={onChange}
        options={options}
      />
    </>
  );
}
