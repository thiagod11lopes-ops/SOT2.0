import { isAssinanteRubricaThiago } from "./rubricaAssinanteThiago";

export type DeparturesAssinanteTextLine = {
  text: string;
  bold?: boolean;
  muted?: boolean;
};

export type DeparturesAssinanteDisplay = {
  lines: DeparturesAssinanteTextLine[];
  /** Rubrica PNG do Thiago acima da linha horizontal. */
  rubricaThiagoPng?: boolean;
};

const ASSINANTE_WANDERSON_CATALOG = "CT Wanderson";
const ASSINANTE_WANDERSON_ALIASES = ["Capitão-Tenente Wanderson", "Capitao-Tenente Wanderson"];

const WANDERSON_SIGNATURE_LINES: DeparturesAssinanteTextLine[] = [
  { text: "Wanderson Teixeira Nogueira", bold: true },
  { text: "Capitão-Tenente (AA)" },
  { text: "Encarregado" },
];

function normalizeAssinanteCatalogName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isAssinanteWanderson(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const normalized = normalizeAssinanteCatalogName(name);
  if (normalized === normalizeAssinanteCatalogName(ASSINANTE_WANDERSON_CATALOG)) return true;
  return ASSINANTE_WANDERSON_ALIASES.some((alias) => normalized === normalizeAssinanteCatalogName(alias));
}

/** Texto e rubrica do bloco «Assinar» / PDF conforme o motorista escolhido no catálogo. */
export function resolveDeparturesAssinanteDisplay(catalogSelection: string): DeparturesAssinanteDisplay {
  const trimmed = catalogSelection.trim();
  if (isAssinanteWanderson(trimmed)) {
    return { lines: WANDERSON_SIGNATURE_LINES };
  }
  if (isAssinanteRubricaThiago(trimmed)) {
    return {
      lines: [{ text: trimmed, bold: true }, { text: "Divisão de Transporte", muted: true }],
      rubricaThiagoPng: true,
    };
  }
  return {
    lines: [{ text: trimmed, bold: true }, { text: "Divisão de Transporte", muted: true }],
  };
}
