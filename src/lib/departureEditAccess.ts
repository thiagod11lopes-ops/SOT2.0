/** Acessos para editar saídas nas abas Administrativa e Ambulância. */
const DEPARTURE_EDIT_CREDENTIALS: ReadonlyArray<{ login: string; senha: string }> = [
  { login: "Thiago", senha: "ogaiht" },
  { login: "Fernando", senha: "odnanerf" },
  { login: "Pacheco", senha: "ocehcap" },
  { login: "Silva", senha: "avlis" },
];

export function verifyDepartureEditAccess(login: string, senha: string): boolean {
  const user = login.trim().toLowerCase();
  const pass = senha.trim();
  if (!user || !pass) return false;
  return DEPARTURE_EDIT_CREDENTIALS.some(
    (row) => row.login.toLowerCase() === user && row.senha === pass,
  );
}
