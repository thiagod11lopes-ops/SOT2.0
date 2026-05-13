import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { flushSync } from "react-dom";
import { Button } from "../components/ui/button";
import {
  formatDistance,
  geocodeAddresses,
  haversineMeters,
  type GeocodeResult,
} from "../lib/navigationRouting";
import { normalize24hTime, normalize24hTimeWithCaret } from "../lib/timeInput";
import { cn } from "../lib/utils";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";

type AddressSuggestion = GeocodeResult & {
  /** Distância em metros à posição actual do utilizador (null se desconhecida). */
  distanceMeters: number | null;
};

type UserCoord = { lat: number; lng: number };

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
  /**
   * Activa sugestões de endereço (Nominatim) à medida que o utilizador digita,
   * estilo Waze/Maps. Ao tocar numa sugestão, o campo é preenchido com o
   * endereço canónico devolvido pelo geocoder.
   */
  autocompleteAddress?: boolean;
};

type SelectProps = BaseProps & {
  variant: "select";
  options: string[];
  /** Valor no registo que não está no catálogo (opção extra). */
  orphanValue?: string | null;
  /** Não listar estas opções (ex.: hospitais de demonstração implantados no catálogo). */
  excludeOptions?: string[];
};

export type MobileFieldEditModalProps = InputProps | SelectProps;

/** Modal grande para editar um campo no mobile (OK antes de Cancelar). */
export function MobileFieldEditModal(props: MobileFieldEditModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [draft, setDraft] = useState(props.initialValue);
  const isTime24h = props.variant === "input" ? Boolean(props.time24h) : false;
  const autocompleteAddress =
    props.variant === "input" ? Boolean(props.autocompleteAddress) : false;
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  /** Posição actual do utilizador (mais próximo primeiro nas sugestões). */
  const [userCoord, setUserCoord] = useState<UserCoord | null>(null);
  /**
   * Sinaliza que o último valor de `draft` veio de uma sugestão tocada — nesse caso
   * não voltamos a procurar para não substituir as sugestões durante a selecção.
   */
  const suggestionAppliedRef = useRef(false);
  /** Última query verdadeiramente consultada — evita re-chamadas redundantes. */
  const lastQueriedRef = useRef<string>("");

  useEffect(() => {
    if (props.open) {
      if (isTime24h) {
        setDraft(normalize24hTime(props.initialValue));
      } else {
        setDraft(props.initialValue);
      }
      setAddressSuggestions([]);
      setAddressLoading(false);
      suggestionAppliedRef.current = false;
      lastQueriedRef.current = "";
    }
  }, [props.open, props.initialValue, isTime24h]);

  /**
   * Pede a posição actual do utilizador uma vez ao abrir o modal de endereço.
   * `maximumAge: 60000` reutiliza a leitura recente do GPS (sem novo prompt) e
   * evita atrasos. Em caso de falha (permissão recusada, timeout, dispositivo
   * sem GPS) deixamos `userCoord` a `null` — o autocomplete continua a funcionar,
   * apenas sem ordenação por proximidade.
   */
  useEffect(() => {
    if (!props.open || !autocompleteAddress) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setUserCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // Sem localização: fica null, sem ordenação por distância.
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
    return () => {
      cancelled = true;
    };
  }, [props.open, autocompleteAddress]);

  /**
   * Quando a localização chega depois das sugestões já estarem no ar, reordena-as
   * pela nova distância sem nova chamada ao geocoder.
   */
  useEffect(() => {
    if (!userCoord) return;
    setAddressSuggestions((prev) => {
      if (prev.length === 0) return prev;
      const next = prev
        .map((s) => ({
          ...s,
          distanceMeters: haversineMeters(userCoord, { lat: s.lat, lng: s.lng }),
        }))
        .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
      return next;
    });
  }, [userCoord]);

  /**
   * Autocomplete de endereços (Nominatim). Debounced ~350 ms para respeitar
   * o limite "1 req/s" do servidor público. Resultados ordenados do mais
   * próximo (em linha recta) para o mais distante quando temos `userCoord`.
   */
  useEffect(() => {
    if (!props.open || !autocompleteAddress) return;
    if (suggestionAppliedRef.current) {
      suggestionAppliedRef.current = false;
      return;
    }
    const query = draft.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      lastQueriedRef.current = "";
      return;
    }
    if (lastQueriedRef.current === query) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      lastQueriedRef.current = query;
      setAddressLoading(true);
      try {
        const results = await geocodeAddresses(query, 8);
        if (cancelled) return;
        const withDistance: AddressSuggestion[] = results.map((r) => ({
          ...r,
          distanceMeters: userCoord
            ? haversineMeters(userCoord, { lat: r.lat, lng: r.lng })
            : null,
        }));
        withDistance.sort(
          (a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
        );
        setAddressSuggestions(withDistance);
      } finally {
        if (!cancelled) setAddressLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, props.open, autocompleteAddress, userCoord]);

  function handleSuggestionTap(suggestion: AddressSuggestion) {
    suggestionAppliedRef.current = true;
    setDraft(suggestion.displayName);
    setAddressSuggestions([]);
    lastQueriedRef.current = suggestion.displayName;
    inputRef.current?.focus({ preventScroll: true });
  }

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

  const excludeOptionKeys =
    props.variant === "select"
      ? new Set(
          (props.excludeOptions ?? [])
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        )
      : null;

  const orphan =
    props.variant === "select"
      ? (() => {
          const v = props.initialValue.trim();
          if (!v) return null;
          if (props.options.some((o) => o === v)) return null;
          return v;
        })()
      : null;

  /** Opções visíveis no select (sem excluídas); o valor atual mantém-se se ainda existir no catálogo completo. */
  const selectOptionsList =
    props.variant === "select"
      ? (() => {
          const full = props.options;
          const vis = excludeOptionKeys
            ? full.filter((o) => !excludeOptionKeys.has(o.trim().toLowerCase()))
            : full;
          const v = draft.trim();
          if (v && !vis.some((o) => o === v) && full.some((o) => o === v)) {
            return [v, ...vis];
          }
          return vis;
        })()
      : [];

  return (
    <div
      className={cn(MOBILE_MODAL_OVERLAY_CLASS, "z-[500] p-3 sm:p-4")}
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
            <>
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
                placeholder={
                  isTime24h
                    ? "HH:MM"
                    : autocompleteAddress
                      ? "Digite o endereço, bairro ou ponto de referência…"
                      : undefined
                }
                autoComplete="off"
                enterKeyHint="done"
                className={cn(
                  "min-h-[3.75rem] w-full rounded-xl border-2 border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-2xl text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/35",
                  (props.mono || isTime24h) && "font-mono tabular-nums tracking-tight",
                )}
              />
              {autocompleteAddress ? (
                <div className="mt-3" aria-live="polite">
                  {addressLoading ? (
                    <div className="flex items-center gap-2 px-1 text-sm text-[hsl(var(--muted-foreground))]">
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--primary))]/25 border-t-[hsl(var(--primary))]"
                        aria-hidden
                      />
                      A procurar endereços…
                    </div>
                  ) : null}
                  {!addressLoading && addressSuggestions.length > 0 ? (
                    <ul
                      role="listbox"
                      aria-label="Sugestões de endereço"
                      className="flex flex-col divide-y divide-[hsl(var(--border))] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/80"
                    >
                      {addressSuggestions.map((suggestion, idx) => (
                        <li key={`${suggestion.lat},${suggestion.lng},${idx}`} role="option" aria-selected="false">
                          <button
                            type="button"
                            onClick={() => handleSuggestionTap(suggestion)}
                            className="flex w-full items-start gap-3 px-3 py-2.5 text-left leading-snug active:bg-[hsl(var(--muted))]/40 hover:bg-[hsl(var(--muted))]/30"
                          >
                            <span className="min-w-0 flex-1 text-sm text-[hsl(var(--foreground))]">
                              {suggestion.displayName}
                            </span>
                            {suggestion.distanceMeters !== null ? (
                              <span className="mt-0.5 shrink-0 rounded-full bg-[hsl(var(--muted))]/60 px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums text-[hsl(var(--muted-foreground))]">
                                {formatDistance(suggestion.distanceMeters)}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {!addressLoading &&
                  addressSuggestions.length === 0 &&
                  draft.trim().length >= 3 &&
                  lastQueriedRef.current === draft.trim() ? (
                    <p className="px-1 text-xs text-[hsl(var(--muted-foreground))]">
                      Nenhum endereço encontrado para «{draft.trim()}». Pode mesmo assim guardar o texto livre.
                    </p>
                  ) : null}
                  {draft.trim().length > 0 && draft.trim().length < 3 ? (
                    <p className="px-1 text-xs text-[hsl(var(--muted-foreground))]">
                      Digite pelo menos 3 letras para ver sugestões.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <select
              ref={selectRef}
              autoFocus
              value={
                selectOptionsList.some((o) => o === draft) || draft === "" || orphan === draft
                  ? draft
                  : ""
              }
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              size={Math.min(12, Math.max(4, selectOptionsList.length + (orphan ? 2 : 1)))}
              className="min-h-[12rem] w-full rounded-xl border-2 border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-lg text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/35"
            >
              <option value="">— Selecionar —</option>
              {orphan ? (
                <option value={orphan}>
                  {orphan} (fora do catálogo)
                </option>
              ) : null}
              {selectOptionsList.map((opt) => (
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
  onBeforeOpen,
  disabled,
  inputMode,
  mono,
  transform,
  time24h,
  autocompleteAddress,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  /** Retorne true para bloquear a abertura do modal (ex.: preencheu automático no toque). */
  onBeforeOpen?: () => boolean;
  disabled?: boolean;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  mono?: boolean;
  transform?: (v: string) => string;
  /** Modal com máscara e texto para hora 24 h (HH:MM). */
  time24h?: boolean;
  /** Mostrar sugestões de endereço (Nominatim) à medida que o utilizador digita. */
  autocompleteAddress?: boolean;
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
              if (onBeforeOpen?.()) return;
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
        autocompleteAddress={autocompleteAddress}
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
  excludeOptions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  emptyCatalogHint?: boolean;
  /** Não listar no modal (ex.: hospitais de demonstração). */
  excludeOptions?: string[];
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
        excludeOptions={excludeOptions}
      />
    </>
  );
}
