/** Separador entre itens no marquee de Avisos gerais (página inicial). */
export const HOME_AVISOS_GERAIS_SEP = "   •   ";

/** Uma linha contínua para o marquee a partir das linhas já filtradas em `avisosGeraisLinhas`. */
export function joinMarqueeAvisosGeraisLinhas(linhas: string[]): string {
  return linhas.join(HOME_AVISOS_GERAIS_SEP);
}
