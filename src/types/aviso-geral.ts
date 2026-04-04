/** Aviso livre para o telão da página inicial, com período opcional (dd/mm/aaaa). */
export type AvisoGeralItem = {
  id: string;
  texto: string;
  /** Início do período em que o aviso aparece. Vazio + dataFim vazio = sempre (legado). */
  dataInicio: string;
  /** Fim inclusive; vazio = mesmo dia que dataInicio. */
  dataFim: string;
};
