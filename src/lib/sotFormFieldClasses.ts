import { cn } from "./utils";

/** Base visual dos campos editáveis (igual ao «Data do pedido» em Cadastrar Nova Saída). */
export const sotFormFieldBaseClass =
  "rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted))]/40 disabled:opacity-70";

export const sotFormInputClass = cn("sot-form-control h-10 w-full px-3 text-sm", sotFormFieldBaseClass);

export const sotFormSelectClass = cn("sot-form-control h-10 w-full px-3 text-sm", sotFormFieldBaseClass);

export const sotFormTextareaClass = cn(
  "sot-form-control min-h-[5rem] w-full px-3 py-2 text-sm",
  sotFormFieldBaseClass,
);

export const sotFormInputMonoClass = cn(sotFormInputClass, "font-mono tabular-nums");

export const sotFormInputCompactClass = cn(
  "sot-form-control h-8 w-full min-w-0 px-2 text-xs",
  sotFormFieldBaseClass,
);
