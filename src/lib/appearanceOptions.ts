import type { AppearanceMode } from "../context/appearance-context";

export type AppearancePreviewTokens = {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  primary: string;
  primaryForeground: string;
  border: string;
};

export type AppearanceOption = {
  mode: AppearanceMode;
  title: string;
  subtitle: string;
  description: string;
  preview: AppearancePreviewTokens;
  highlights: string[];
};

/** Opções de aparência — tokens alinhados a `index.css` (`data-appearance`). */
export const APPEARANCE_OPTIONS: AppearanceOption[] = [
  {
    mode: "original",
    title: "Claro institucional",
    subtitle: "Padrão do SOT",
    description:
      "Fundo claro neutro, azul institucional e textos escuros de alto contraste para uso diário em escritório.",
    highlights: ["Alto contraste", "Leitura prolongada"],
    preview: {
      background: "hsl(210 20% 96%)",
      card: "hsl(0 0% 100%)",
      foreground: "hsl(222 47% 11%)",
      muted: "hsl(215 16% 42%)",
      primary: "hsl(204 58% 32%)",
      primaryForeground: "hsl(210 40% 98%)",
      border: "hsl(214 25% 88%)",
    },
  },
  {
    mode: "dark",
    title: "Modo escuro",
    subtitle: "Conforto visual noturno",
    description:
      "Interface escura com texto claro, acentos em ciano e separação forte entre cartões, bordas e campos.",
    highlights: ["Menos fadiga visual", "Textos claros sobre fundo escuro"],
    preview: {
      background: "hsl(222 32% 7%)",
      card: "hsl(222 30% 10%)",
      foreground: "hsl(210 36% 98%)",
      muted: "hsl(215 20% 76%)",
      primary: "hsl(187 72% 52%)",
      primaryForeground: "hsl(222 40% 8%)",
      border: "hsl(217 22% 17%)",
    },
  },
  {
    mode: "ultra-modern",
    title: "Ultra moderno",
    subtitle: "Claro premium",
    description:
      "Gradiente suave, tipografia refinada e azul vibrante — visual contemporâneo mantendo textos bem legíveis.",
    highlights: ["Visual premium", "Tipografia ampliada"],
    preview: {
      background: "hsl(220 28% 98.5%)",
      card: "hsl(0 0% 100%)",
      foreground: "hsl(224 64% 7%)",
      muted: "hsl(220 10% 36%)",
      primary: "hsl(201 90% 44%)",
      primaryForeground: "hsl(0 0% 100%)",
      border: "hsl(220 16% 88%)",
    },
  },
  {
    mode: "radar",
    title: "Radar",
    subtitle: "Console tático",
    description:
      "Fundo escuro fosforescente, textos e acentos em verde com grade de varredura e linha giratória estilo painel de radar.",
    highlights: ["Visual tático", "Varredura animada"],
    preview: {
      background: "hsl(125 42% 5%)",
      card: "hsl(125 38% 8%)",
      foreground: "hsl(120 90% 62%)",
      muted: "hsl(120 55% 42%)",
      primary: "hsl(120 100% 42%)",
      primaryForeground: "hsl(125 45% 6%)",
      border: "hsl(120 65% 28%)",
    },
  },
];
