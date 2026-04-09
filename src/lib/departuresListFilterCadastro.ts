import { isCompleteDatePtBr } from "./dateFormat";

const STORAGE_KEY = "sot:v1:departuresListFilterDataSaida";

/** Grava a data da saída antes de abrir a lista (síncrono; sobrevive ao 1.º render do React). */
export function stashDeparturesListFilterFromCadastro(ptBr: string): void {
  try {
    if (isCompleteDatePtBr(ptBr)) sessionStorage.setItem(STORAGE_KEY, ptBr.trim());
  } catch {
    /* ignore */
  }
}

/** Lê sem remover (Strict Mode monta duas vezes). */
export function peekDeparturesListFilterFromCadastro(): string | null {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    return s && isCompleteDatePtBr(s) ? s : null;
  } catch {
    return null;
  }
}

export function clearDeparturesListFilterFromCadastro(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
