import { cn } from "../lib/utils";

/** Cartoes "vidro" do cabecalho (relogio e pao) — ficheiro leve so com classes. */
export const HEADER_INFO_CARD_CLASS = cn(
  "flex shrink-0 rounded-2xl border px-2.5 py-1.5 sm:px-3 sm:py-2",
  "border-[hsl(var(--primary))]/25 bg-gradient-to-br from-[hsl(var(--card))] via-[hsl(var(--card))] to-[hsl(var(--muted))]/40",
  "shadow-[0_8px_32px_-8px_rgba(0,0,0,0.2),inset_0_1px_0_hsla(0,0%,100%,0.06)]",
  "backdrop-blur-md",
  "ring-1 ring-[hsl(var(--primary))]/15",
);
