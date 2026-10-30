/** Primeira letra do nome de guerra, mostrada na tapela da saída. */
export function departureEditLoginInitial(login: string | undefined): string {
  const name = login?.trim() ?? "";
  if (!name) return "";
  return name.charAt(0).toLocaleUpperCase("pt-BR");
}
