import {
  addDaysPtBr,
  getCurrentDatePtBr,
  isCompleteDatePtBr,
  normalizeLegacyDateToPtBr,
  parsePtBrToDate,
  ptBrToIsoDate,
  sortDatasPtBr,
} from "./dateFormat";
import { getProximoIntegranteEscalaAposHoje } from "./escalaPaoStorage";
import type { EscalaPaoStored } from "./escalaPaoStorage";
import type { CatalogItemsState } from "../context/catalog-items-context";
import type { DepartureRecord } from "../types/departure";
import { buildSotStatisticsRagChunks, isStatisticsRagQuery } from "./sotStatisticsRag";

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

/** Saídas indexadas de hoje − N até hoje + N dias (inclusive). */
export const RAG_BACKWARD_DAYS = 40;
export const RAG_FORWARD_DAYS = 40;

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
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function departureDatePtBr(row: DepartureRecord): string {
  return normalizeLegacyDateToPtBr(row.dataSaida?.trim() || "");
}

function getRagWindowStart(hoje: string, backwardDays: number): string {
  return addDaysPtBr(hoje, -backwardDays);
}

function getRagWindowEnd(hoje: string, forwardDays: number): string {
  return addDaysPtBr(hoje, forwardDays);
}

export function isDateWithinRagWindow(
  datePtBr: string,
  hoje: string,
  options?: { forwardDays?: number; backwardDays?: number },
): boolean {
  const forwardDays = options?.forwardDays ?? RAG_FORWARD_DAYS;
  const backwardDays = options?.backwardDays ?? RAG_BACKWARD_DAYS;
  const normalized = normalizeLegacyDateToPtBr(datePtBr);
  if (!isCompleteDatePtBr(normalized) || !isCompleteDatePtBr(hoje)) return false;
  const d = parsePtBrToDate(normalized);
  const start = parsePtBrToDate(getRagWindowStart(hoje, backwardDays));
  const end = parsePtBrToDate(getRagWindowEnd(hoje, forwardDays));
  if (!d || !start || !end) return false;
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return day(d) >= day(start) && day(d) <= day(end);
}

function compareDeparturesChronologically(a: DepartureRecord, b: DepartureRecord): number {
  const da = `${departureDatePtBr(a)} ${a.horaSaida}`;
  const db = `${departureDatePtBr(b)} ${b.horaSaida}`;
  return da.localeCompare(db, "pt-BR");
}

function formatAmbulanceTypes(row: DepartureRecord): string {
  if (row.tipo !== "Ambulância") return "";
  const types: string[] = [];
  if (row.tipoSaidaInterHospitalar) types.push("inter-hospitalar");
  if (row.tipoSaidaAlta) types.push("alta");
  if (row.tipoSaidaOutros) types.push("outros");
  return types.length ? `Tipos ambulância: ${types.join(", ")}` : "";
}

/** Cadastro completo da saída para o RAG (texto; sem imagens de rubrica). */
export function formatDepartureFullForRag(row: DepartureRecord): string {
  const lines = [
    `[Saída ${row.tipo} | id: ${row.id}]`,
    `Cancelada: ${row.cancelada ? "sim" : "não"}`,
    `Pedido: ${row.dataPedido || "—"} ${row.horaPedido || ""}`.trim(),
    `Saída: ${row.dataSaida || "—"} ${row.horaSaida || ""}`.trim(),
    row.chegada?.trim() ? `Chegada: ${row.chegada.trim()}` : "",
    row.setor?.trim() ? `Setor: ${row.setor.trim()}` : "",
    row.ramal?.trim() ? `Ramal: ${row.ramal.trim()}` : "",
    row.responsavelPedido?.trim() ? `Responsável pelo pedido: ${row.responsavelPedido.trim()}` : "",
    row.om?.trim() ? `OM: ${row.om.trim()}` : "",
    row.objetivoSaida?.trim() ? `Objetivo: ${row.objetivoSaida.trim()}` : "",
    row.numeroPassageiros?.trim() ? `Passageiros: ${row.numeroPassageiros.trim()}` : "",
    row.viaturas?.trim() ? `Viatura(s): ${row.viaturas.trim()}` : "",
    row.motoristas?.trim() ? `Motorista(s): ${row.motoristas.trim()}` : "",
    row.hospitalDestino?.trim() ? `Hospital destino: ${row.hospitalDestino.trim()}` : "",
    formatAmbulanceTypes(row),
    row.cidade?.trim() ? `Cidade: ${row.cidade.trim()}` : "",
    row.bairro?.trim() ? `Bairro: ${row.bairro.trim()}` : "",
    row.kmSaida?.trim() || row.kmChegada?.trim()
      ? `KM saída: ${row.kmSaida?.trim() || "—"} | KM chegada: ${row.kmChegada?.trim() || "—"}`
      : "",
    row.ficouNaOficina ? "Ficou na oficina: sim" : "",
    row.rubrica?.trim() ? `Rubrica: ${row.rubrica.trim()}` : "",
    row.ocorrencias?.trim() ? `Ocorrências: ${row.ocorrencias.trim()}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function departureRegistroChunkId(row: DepartureRecord): string {
  return `saida-registro-${row.id}`;
}

function isDepartureChunkId(id: string): boolean {
  return id.startsWith("saidas-data-") || id.startsWith("saida-registro-");
}

function departureChunkMatchesDate(chunk: SotRagChunk, datePtBr: string): boolean {
  if (chunk.id === dateChunkId(datePtBr)) return true;
  if (!chunk.id.startsWith("saida-registro-")) return false;
  return chunk.text.includes(`Saída: ${datePtBr}`);
}

function departureChunkHasCancelada(chunk: SotRagChunk): boolean {
  return chunk.text.includes("Cancelada: sim");
}

function dateChunkId(datePtBr: string): string {
  return `saidas-data-${ptBrToIsoDate(datePtBr)}`;
}

function extractQueryDateHints(query: string, hoje: string): string[] {
  const hints = new Set<string>();
  const q = query.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  for (const match of query.matchAll(/\b(\d{2}\/\d{2}\/\d{2,4})\b/g)) {
    const normalized = normalizeLegacyDateToPtBr(match[1]);
    if (isCompleteDatePtBr(normalized)) hints.add(normalized);
  }

  if (/\bhoje\b/.test(q)) hints.add(hoje);
  if (/\bontem\b/.test(q)) hints.add(addDaysPtBr(hoje, -1));
  if (/\bamanha\b/.test(q)) hints.add(addDaysPtBr(hoje, 1));
  if (/\bdepois de amanha\b/.test(q)) hints.add(addDaysPtBr(hoje, 2));

  if (/\bsemana passada\b/.test(q)) {
    for (let i = 1; i <= 7; i++) hints.add(addDaysPtBr(hoje, -i));
  }

  if (/\bproxima semana\b|\bsemana que vem\b/.test(q)) {
    for (let i = 1; i <= 7; i++) hints.add(addDaysPtBr(hoje, i));
  }

  const ultimosDiasMatch = q.match(/\bultim[oa]s?\s+(\d+)\s+dias?\b/);
  if (ultimosDiasMatch) {
    const n = Math.min(Number(ultimosDiasMatch[1]) || RAG_BACKWARD_DAYS, RAG_BACKWARD_DAYS);
    for (let i = 0; i <= n; i++) hints.add(addDaysPtBr(hoje, -i));
  } else if (/\bultim[oa]s?\s+dias?\b/.test(q)) {
    for (let i = 0; i <= RAG_BACKWARD_DAYS; i++) hints.add(addDaysPtBr(hoje, -i));
  }

  if (/\bproximos?\s+\d+\s+dias?\b/.test(q) || /\bproximos?\s+dias?\b/.test(q)) {
    for (let i = 0; i <= RAG_FORWARD_DAYS; i++) hints.add(addDaysPtBr(hoje, i));
  }

  return [...hints];
}

function isBroadScheduleQuery(query: string): boolean {
  const q = query.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return (
    /\bproxim[oa]s?\b/.test(q) ||
    /\bprogramad[oa]s?\b/.test(q) ||
    /\bagendad[oa]s?\b/.test(q) ||
    /\bfutur[oa]s?\b/.test(q) ||
    /\bsemana\b/.test(q) ||
    /\bmes\b/.test(q)
  );
}

function isCanceladaQuery(query: string): boolean {
  const q = query.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return /\bcancelad[oa]s?\b/.test(q);
}

function isTipoQuery(query: string): "Administrativa" | "Ambulância" | null {
  const q = query.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/\badministrativ/.test(q)) return "Administrativa";
  if (/\bambulanc/.test(q)) return "Ambulância";
  return null;
}

export function buildSotRagKnowledgeBase(input: SotRagKnowledgeInput): SotRagChunk[] {
  const chunks: SotRagChunk[] = [];
  const hoje = getCurrentDatePtBr();
  const inicioJanela = getRagWindowStart(hoje, RAG_BACKWARD_DAYS);
  const fimJanela = getRagWindowEnd(hoje, RAG_FORWARD_DAYS);

  const naJanela = input.departures
    .filter((r) => isDateWithinRagWindow(departureDatePtBr(r), hoje))
    .sort(compareDeparturesChronologically);

  const ativasNaJanela = naJanela.filter((r) => !r.cancelada);
  const canceladasNaJanela = naJanela.filter((r) => r.cancelada);
  const hojeRows = naJanela.filter((r) => departureDatePtBr(r) === hoje);

  const porData = new Map<string, DepartureRecord[]>();
  for (const row of naJanela) {
    const data = departureDatePtBr(row);
    if (!data) continue;
    const list = porData.get(data) ?? [];
    list.push(row);
    porData.set(data, list);
  }

  chunks.push({
    id: "resumo-janela",
    category: "Resumo da janela",
    text: [
      `Janela consultável pela IA: ${inicioJanela} até ${fimJanela} (${RAG_BACKWARD_DAYS} dias anteriores + hoje + ${RAG_FORWARD_DAYS} dias à frente).`,
      `Total de saídas no sistema: ${input.departures.length}.`,
      `Saídas na janela: ${naJanela.length} (${ativasNaJanela.length} ativas, ${canceladasNaJanela.length} canceladas).`,
      `Tipos ativos na janela: ${ativasNaJanela.filter((r) => r.tipo === "Administrativa").length} administrativas, ${ativasNaJanela.filter((r) => r.tipo === "Ambulância").length} ambulância.`,
      `Saídas de hoje (${hoje}): ${hojeRows.length} (${hojeRows.filter((r) => r.cancelada).length} canceladas).`,
      `Dias com registro na janela: ${porData.size}.`,
      "Os chunks por data e por registro trazem o cadastro completo (horários, motoristas, viaturas, cancelamento, ocorrências, KM, etc.).",
    ].join(" "),
  });

  if (hojeRows.length > 0) {
    chunks.push({
      id: "saidas-hoje",
      category: "Saídas de hoje (cadastro completo)",
      text: hojeRows.map(formatDepartureFullForRag).join("\n\n---\n\n"),
    });
  }

  for (const data of sortDatasPtBr([...porData.keys()])) {
    const rows = porData.get(data);
    if (!rows?.length) continue;
    chunks.push({
      id: dateChunkId(data),
      category: `Saídas em ${data} (cadastro completo)`,
      text: rows.map(formatDepartureFullForRag).join("\n\n---\n\n"),
    });
  }

  for (const row of naJanela) {
    chunks.push({
      id: departureRegistroChunkId(row),
      category: `Cadastro saída ${departureDatePtBr(row)}`,
      text: formatDepartureFullForRag(row),
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
  const escalaEntries = Object.entries(input.escalaPao).map(
    ([rawDate, nome]) => [normalizeLegacyDateToPtBr(rawDate), nome] as const,
  );
  const escalaNaJanela = sortDatasPtBr(
    escalaEntries.filter(([d]) => isDateWithinRagWindow(d, hoje)).map(([d]) => d),
  ).map((d) => {
    const entry = escalaEntries.find(([date]) => date === d);
    return [d, entry?.[1] ?? ""] as const;
  });

  chunks.push({
    id: "escala-pao",
    category: "Escala do pão",
    text: [
      `Motorista do pão hoje: ${input.motoristaPaoHoje || "—"}`,
      proxPao
        ? `Próximo na escala: ${proxPao.nome} em ${proxPao.data.toLocaleDateString("pt-BR")}`
        : "Próximo na escala: —",
      input.integrantesPao.length ? `Integrantes: ${input.integrantesPao.join(", ")}` : "",
      escalaNaJanela.length
        ? `Escala na janela (${inicioJanela} a ${fimJanela}): ${escalaNaJanela.map(([d, n]) => `${d}=${n}`).join("; ")}`
        : "Escala na janela: nenhuma data cadastrada.",
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

  chunks.push(...buildSotStatisticsRagChunks(input.departures));

  return chunks;
}

function pickDateChunksInOrder(chunks: SotRagChunk[], limit: number): SotRagChunk[] {
  return chunks
    .filter((c) => c.id.startsWith("saidas-data-"))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limit);
}

function mergeChunksUnique(primary: SotRagChunk[], extra: SotRagChunk[], limit: number): SotRagChunk[] {
  const seen = new Set<string>();
  const out: SotRagChunk[] = [];
  for (const chunk of [...primary, ...extra]) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    out.push(chunk);
    if (out.length >= limit) break;
  }
  return out;
}

function collectDepartureChunksForDates(chunks: SotRagChunk[], dates: string[]): SotRagChunk[] {
  const out: SotRagChunk[] = [];
  const seen = new Set<string>();

  for (const date of dates) {
    const dateChunk = chunks.find((c) => c.id === dateChunkId(date));
    if (dateChunk && !seen.has(dateChunk.id)) {
      seen.add(dateChunk.id);
      out.push(dateChunk);
    }
  }

  for (const date of dates) {
    for (const chunk of chunks) {
      if (!chunk.id.startsWith("saida-registro-")) continue;
      if (!departureChunkMatchesDate(chunk, date)) continue;
      if (seen.has(chunk.id)) continue;
      seen.add(chunk.id);
      out.push(chunk);
    }
  }

  return out;
}

export function retrieveSotRagChunks(query: string, chunks: SotRagChunk[], limit = 12): SotRagChunk[] {
  const hoje = getCurrentDatePtBr();
  const dateHints = extractQueryDateHints(query, hoje);
  const tipoHint = isTipoQuery(query);
  const canceladaQuery = isCanceladaQuery(query);
  const statsQuery = isStatisticsRagQuery(query);
  const hasDateHints = dateHints.length > 0;
  const pinned = hasDateHints
    ? []
    : chunks.filter((c) => c.id === "resumo-janela" || c.id === "saidas-hoje");
  const effectiveLimit = hasDateHints ? Math.max(limit, 24) : limit;

  if (statsQuery && !hasDateHints && !isBroadScheduleQuery(query)) {
    const statsChunks = chunks.filter((c) => c.id.startsWith("stats-"));
    const statsPinned = statsChunks.filter((c) => c.id === "stats-totais-geral");
    const terms = tokenize(query);

    if (!terms.length) {
      return mergeChunksUnique(statsPinned, statsChunks.filter((c) => c.id !== "stats-totais-geral"), limit);
    }

    const scored = statsChunks
      .map((chunk) => {
        const hay = `${chunk.category} ${chunk.text}`.toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (hay.includes(term)) score += term.length >= 4 ? 3 : 2;
        }
        if (chunk.id === "stats-totais-geral") score += 2;
        return { chunk, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length) {
      return mergeChunksUnique(statsPinned, scored.map((row) => row.chunk), limit);
    }
    return mergeChunksUnique(statsPinned, statsChunks.filter((c) => c.id !== "stats-totais-geral"), limit);
  }

  if (hasDateHints) {
    let selected = collectDepartureChunksForDates(chunks, dateHints);
    if (tipoHint) {
      selected = selected.filter((c) => !isDepartureChunkId(c.id) || c.text.includes(tipoHint));
    }
    if (canceladaQuery) {
      selected = selected.filter((c) => !isDepartureChunkId(c.id) || departureChunkHasCancelada(c));
    }
    if (selected.length) {
      return selected.slice(0, effectiveLimit);
    }
    const resumo = chunks.find((c) => c.id === "resumo-janela");
    return resumo ? [resumo] : [];
  }

  if (isBroadScheduleQuery(query)) {
    const scheduleChunks = pickDateChunksInOrder(chunks, Math.max(0, effectiveLimit - pinned.length));
    return mergeChunksUnique(pinned, scheduleChunks, effectiveLimit);
  }

  const terms = tokenize(query);
  if (!terms.length) {
    return mergeChunksUnique(pinned, pickDateChunksInOrder(chunks, limit - pinned.length), limit);
  }

  const scored = chunks
    .map((chunk) => {
      const hay = `${chunk.category} ${chunk.text}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (hay.includes(term)) score += term.length >= 4 ? 3 : 2;
        const re = new RegExp(`\\b${term}`, "i");
        if (re.test(chunk.category)) score += 4;
      }
      if (tipoHint && isDepartureChunkId(chunk.id) && chunk.text.includes(tipoHint)) score += 6;
      if (canceladaQuery && isDepartureChunkId(chunk.id) && departureChunkHasCancelada(chunk)) score += 8;
      if (chunk.id.startsWith("saida-registro-")) score += 2;
      if (statsQuery && chunk.id.startsWith("stats-")) score += 5;
      for (const date of dateHints) {
        if (departureChunkMatchesDate(chunk, date)) score += 12;
      }
      return { chunk, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return mergeChunksUnique(pinned, pickDateChunksInOrder(chunks, effectiveLimit - pinned.length), effectiveLimit);
  }

  const ranked = scored.map((row) => row.chunk);
  return mergeChunksUnique(pinned, ranked, effectiveLimit);
}

export function formatSotRagContext(chunks: SotRagChunk[]): string {
  return chunks.map((chunk) => `[${chunk.category}]\n${chunk.text}`).join("\n\n---\n\n");
}
