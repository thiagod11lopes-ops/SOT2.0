import { getCurrentDatePtBr } from "./dateFormat";
import { getProximoIntegranteEscalaAposHoje } from "./escalaPaoStorage";
import type { EscalaPaoStored } from "./escalaPaoStorage";
import type { CatalogItemsState } from "../context/catalog-items-context";
import type { DepartureRecord } from "../types/departure";

export type SotRagChunk = {
  id: string;
  category: string;
  text: string;
};

export type SotRagKnowledgeInput = {
  departures: DepartureRecord[];
  catalog: CatalogItemsState;
  escalaPao: EscalaPaoStored;
  integrantesPao: string[];
  motoristaPaoHoje: string;
  avisoPrincipal: string;
  avisosGerais: string[];
};

const STOP_WORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "um",
  "uma",
  "e",
  "ou",
  "que",
  "para",
  "por",
  "com",
  "sem",
  "ao",
  "à",
  "é",
  "ser",
  "foi",
  "são",
  "qual",
  "quais",
  "quem",
  "como",
  "onde",
  "hoje",
  "ontem",
  "amanhã",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function formatDepartureLine(row: DepartureRecord): string {
  const cancelada = row.cancelada ? " [cancelada]" : "";
  const km =
    row.kmSaida || row.kmChegada
      ? ` | KM saída ${row.kmSaida || "—"} / chegada ${row.kmChegada || "—"}`
      : "";
  return `${row.tipo} | ${row.dataSaida} ${row.horaSaida} | setor ${row.setor} | viatura ${row.viaturas} | motorista ${row.motoristas} | bairro ${row.bairro} | objetivo ${row.objetivoSaida}${km}${cancelada}`;
}

export function buildSotRagKnowledgeBase(input: SotRagKnowledgeInput): SotRagChunk[] {
  const chunks: SotRagChunk[] = [];
  const hoje = getCurrentDatePtBr();

  const ativas = input.departures.filter((r) => !r.cancelada);
  const hojeRows = ativas.filter((r) => r.dataSaida === hoje);
  const recent = [...ativas]
    .sort((a, b) => {
      const da = `${a.dataSaida} ${a.horaSaida}`;
      const db = `${b.dataSaida} ${b.horaSaida}`;
      return db.localeCompare(da, "pt-BR");
    })
    .slice(0, 120);

  chunks.push({
    id: "resumo-saidas",
    category: "Resumo",
    text: `Total de saídas ativas no sistema: ${ativas.length}. Saídas de hoje (${hoje}): ${hojeRows.length} (${hojeRows.filter((r) => r.tipo === "Administrativa").length} administrativas, ${hojeRows.filter((r) => r.tipo === "Ambulância").length} ambulância).`,
  });

  if (hojeRows.length > 0) {
    chunks.push({
      id: "saidas-hoje",
      category: "Saídas de hoje",
      text: hojeRows.map(formatDepartureLine).join("\n"),
    });
  }

  for (const row of recent.slice(0, 40)) {
    chunks.push({
      id: `saida-${row.id}`,
      category: `Saída ${row.tipo}`,
      text: formatDepartureLine(row),
    });
  }

  for (const [category, items] of Object.entries(input.catalog) as [keyof CatalogItemsState, string[]][]) {
    if (!items.length) continue;
    chunks.push({
      id: `catalog-${category}`,
      category: `Catálogo ${category}`,
      text: items.join(", "),
    });
  }

  const proxPao = getProximoIntegranteEscalaAposHoje(input.escalaPao, new Date());
  chunks.push({
    id: "escala-pao",
    category: "Escala do pão",
    text: [
      `Motorista do pão hoje: ${input.motoristaPaoHoje || "—"}`,
      proxPao
        ? `Próximo na escala: ${proxPao.nome} em ${proxPao.data.toLocaleDateString("pt-BR")}`
        : "Próximo na escala: —",
      input.integrantesPao.length ? `Integrantes: ${input.integrantesPao.join(", ")}` : "",
      Object.keys(input.escalaPao).length
        ? `Datas escaladas (amostra): ${Object.entries(input.escalaPao)
            .slice(0, 21)
            .map(([d, n]) => `${d}=${n}`)
            .join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (input.avisoPrincipal.trim()) {
    chunks.push({
      id: "aviso-principal",
      category: "Aviso principal",
      text: input.avisoPrincipal.trim(),
    });
  }

  if (input.avisosGerais.length) {
    chunks.push({
      id: "avisos-gerais",
      category: "Avisos gerais",
      text: input.avisosGerais.join("\n"),
    });
  }

  return chunks;
}

export function retrieveSotRagChunks(query: string, chunks: SotRagChunk[], limit = 8): SotRagChunk[] {
  const terms = tokenize(query);
  if (!terms.length) return chunks.slice(0, limit);

  const scored = chunks
    .map((chunk) => {
      const hay = `${chunk.category} ${chunk.text}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (hay.includes(term)) score += term.length >= 4 ? 3 : 2;
        const re = new RegExp(`\\b${term}`, "i");
        if (re.test(chunk.category)) score += 4;
      }
      return { chunk, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return chunks.filter((c) => c.id === "resumo-saidas" || c.id === "saidas-hoje").slice(0, limit);
  }

  return scored.slice(0, limit).map((row) => row.chunk);
}

export function formatSotRagContext(chunks: SotRagChunk[]): string {
  return chunks.map((chunk) => `[${chunk.category}]\n${chunk.text}`).join("\n\n---\n\n");
}
