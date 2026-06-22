import { useMemo } from "react";
import { useAvisos } from "../context/avisos-context";
import { useCatalogItems } from "../context/catalog-items-context";
import { useDepartures } from "../context/departures-context";
import { useEscalaPao } from "../context/escala-pao-context";
import { useMotoristaPao } from "../context/motorista-pao-context";
import { getMotoristaEscalaParaData } from "../lib/escalaPaoStorage";
import {
  buildSotRagKnowledgeBase,
  formatSotRagContext,
  retrieveSotRagChunks,
  type SotRagChunk,
} from "../lib/sotRag";

export function useSotRagKnowledge() {
  const { departures } = useDepartures();
  const { items: catalog } = useCatalogItems();
  const { escala, integrantes } = useEscalaPao();
  const { nome: motoristaPaoHoje } = useMotoristaPao();
  const { avisoPrincipal, avisosGeraisLinhas } = useAvisos();

  const chunks = useMemo(
    () =>
      buildSotRagKnowledgeBase({
        departures,
        catalog,
        escalaPao: escala,
        integrantesPao: integrantes,
        motoristaPaoHoje: motoristaPaoHoje.trim() || getMotoristaEscalaParaData(escala, new Date()),
        avisoPrincipal,
        avisosGerais: avisosGeraisLinhas,
      }),
    [departures, catalog, escala, integrantes, motoristaPaoHoje, avisoPrincipal, avisosGeraisLinhas],
  );

  return {
    chunks,
    retrieve(query: string, limit = 8): SotRagChunk[] {
      return retrieveSotRagChunks(query, chunks, limit);
    },
    formatContext(selected: SotRagChunk[]): string {
      return formatSotRagContext(selected);
    },
  };
}
