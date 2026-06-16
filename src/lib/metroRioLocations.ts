import ibgeBairrosPorCidadeJson from "../data/bairrosPorCidade.json";

/** Cidades da região metropolitana do Rio de Janeiro (cadastro de saídas). */
export const METRO_RIO_CITIES = [
  "Rio de Janeiro",
  "Belford Roxo",
  "Duque de Caxias",
  "Guapimirim",
  "Itaboraí",
  "Itaguaí",
  "Japeri",
  "Magé",
  "Maricá",
  "Mesquita",
  "Nilópolis",
  "Niterói",
  "Nova Iguaçu",
  "Paracambi",
  "Queimados",
  "São Gonçalo",
  "São João de Meriti",
  "Seropédica",
  "Tanguá",
] as const;

const IBGE_BAIRROS_POR_CIDADE = ibgeBairrosPorCidadeJson as Record<string, string[]>;

/** Bairros de todas as cidades da RM-RJ, ordenados e sem duplicatas. */
export function getMetroRioNeighborhoodSuggestions(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const city of METRO_RIO_CITIES) {
    for (const bairro of IBGE_BAIRROS_POR_CIDADE[city] ?? []) {
      const key = bairro.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(bairro);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Resolve a cidade quando o bairro existe em apenas uma cidade da RM-RJ. */
export function resolveMetroRioCityForNeighborhood(neighborhood: string): string {
  const target = neighborhood.trim().toLowerCase();
  if (!target) return "Rio de Janeiro";
  let match: string | null = null;
  for (const city of METRO_RIO_CITIES) {
    const list = IBGE_BAIRROS_POR_CIDADE[city] ?? [];
    if (!list.some((b) => b.trim().toLowerCase() === target)) continue;
    if (match && match !== city) return "Rio de Janeiro";
    match = city;
  }
  return match ?? "Rio de Janeiro";
}
