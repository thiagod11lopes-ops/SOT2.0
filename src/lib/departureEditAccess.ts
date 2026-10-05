/** Acessos para editar saídas nas abas Administrativa e Ambulância. */
const DEPARTURE_EDIT_CREDENTIALS: ReadonlyArray<{ login: string; senha: string }> = [
  { login: "Thiago", senha: "ogaiht" },
  { login: "Fernando", senha: "odnanerf" },
  { login: "Pacheco", senha: "ocehcap" },
  { login: "Silva", senha: "avlis" },
];

export const DEPARTURE_EDIT_LOGINS = DEPARTURE_EDIT_CREDENTIALS.map((row) => row.login);

/** Nome canónico do login, ou `null` se o par não conferir. */
export function resolveDepartureEditLogin(login: string, senha: string): string | null {
  const user = login.trim().toLowerCase();
  const pass = senha.trim();
  if (!user || !pass) return null;
  const match = DEPARTURE_EDIT_CREDENTIALS.find(
    (row) => row.login.toLowerCase() === user && row.senha === pass,
  );
  return match?.login ?? null;
}

export function departureEditLoginInitial(login: string | undefined): string {
  const name = login?.trim() ?? "";
  if (!name) return "";
  return name.charAt(0).toLocaleUpperCase("pt-BR");
}
