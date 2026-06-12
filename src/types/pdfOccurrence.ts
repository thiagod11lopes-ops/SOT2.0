/** Bloco de ocorrência no PDF (texto + rubrica opcional ao lado). */
export type PdfOccurrenceEntry = {
  texto: string;
  rubrica?: string;
};
