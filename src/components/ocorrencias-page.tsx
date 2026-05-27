import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useEffect, useState, useMemo } from "react";
// Importa o subscriber de departures (corrigido para não importar DepartureRecord daqui)
import { subscribeDepartures } from "../lib/firebase/departuresFirestore";
// Importa o tipo DepartureRecord do local correto
import type { DepartureRecord } from "../types/departure";
import { subscribeSotStateDoc, SOT_STATE_DOC } from "../lib/firebase/sotStateFirestore";


// Componente para a página de Ocorrências

interface Occurrence {
  id: string;
  timestamp: string;
  description: string;
  details: string; // Manter para compatibilidade, mas não será exibido
  placa?: string;
  rubricas?: string[];
}

// Tipo para as ocorrências desvinculadas
interface UnlinkedOccurrencePayload {
  data: string; // Ex: "2026-05-12"
  hora: string; // Ex: "08:30:00"
  texto: string; // Descrição da ocorrência
  rubrica?: string; // Rubrica da ocorrência (pode ser uma string única)
}

export function OcorrenciasPage() {
  const [departuresOccurrences, setDeparturesOccurrences] = useState<Occurrence[]>([]);
  const [unlinkedOccurrences, setUnlinkedOccurrences] = useState<Occurrence[]>([]);

  // Efeito para buscar ocorrências dos departures
  useEffect(() => {
    const unsubscribe = subscribeDepartures(
      (departureRecords: DepartureRecord[]) => {
        const extractedOccurrences: Occurrence[] = [];
        departureRecords.forEach((record) => {
          if (record.ocorrencias && record.ocorrencias.trim().length > 0) {
            extractedOccurrences.push({
              id: record.id,
              timestamp: `${record.dataSaida} ${record.horaSaida}`,
              description: record.ocorrencias,
              details: record.ocorrencias,
              placa: record.viaturas || undefined,
              rubricas: record.ocorrenciasRubrica
                ? record.ocorrenciasRubrica.split(",").map((s: string) => s.trim())
                : undefined,
            });
          }
        });
        setDeparturesOccurrences(extractedOccurrences);
      },
      (error) => {
        console.error("Erro ao buscar ocorrências dos departures:", error);
        setDeparturesOccurrences([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // Efeito para buscar ocorrências desvinculadas
  useEffect(() => {
    const unsubscribe = subscribeSotStateDoc(
      SOT_STATE_DOC.ocorrenciasDesvinculadas,
      (payload) => {
        console.log("[OcorrenciasPage] Payload de ocorrências desvinculadas:", payload);
        if (payload && typeof payload === 'object' && 'items' in payload && Array.isArray((payload as { items: unknown[] }).items)) {
          const rawItems = (payload as { items: UnlinkedOccurrencePayload[] }).items;
          const extractedUnlinked: Occurrence[] = rawItems.map((item, index) => ({
            id: `unlinked-${index}-${item.data}-${item.hora}`,
            timestamp: `${item.data} ${item.hora}`,
            description: item.texto,
            details: item.texto,
            placa: undefined,
            rubricas: item.rubrica ? [item.rubrica] : undefined,
          }));
          console.log("[OcorrenciasPage] Ocorrências desvinculadas extraídas:", extractedUnlinked);
          setUnlinkedOccurrences(extractedUnlinked);
        } else {
          console.log("[OcorrenciasPage] Payload de ocorrências desvinculadas inválido ou vazio.");
          setUnlinkedOccurrences([]);
        }
      },
      (error) => {
        console.error("Erro ao buscar ocorrências desvinculadas do Firestore:", error);
        setUnlinkedOccurrences([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // Combina e ordena as ocorrências
  const allOccurrences = useMemo(() => {
    const combined = [...departuresOccurrences, ...unlinkedOccurrences];
    return combined.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [departuresOccurrences, unlinkedOccurrences]);

  return (
    <div className="container mx-auto py-10">
      <h2 className="text-2xl font-bold mb-6">Ocorrências do Sistema</h2>
      {allOccurrences.length === 0 ? (
        <p className="text-center text-gray-500">Nenhuma ocorrência registrada.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Rubricas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allOccurrences.map((occurrence) => (
              <TableRow key={occurrence.id}>
                <TableCell>{occurrence.timestamp}</TableCell>
                <TableCell>{occurrence.description}</TableCell>
                <TableCell>{occurrence.placa ?? "N/A"}</TableCell>
                <TableCell>
                  {occurrence.rubricas && occurrence.rubricas.length > 0 ? (
                    (() => {
                      const firstRubrica = occurrence.rubricas[0];
                      console.log("[OcorrenciasPage] Rubrica para renderizar:", firstRubrica);
                      if (firstRubrica && firstRubrica.startsWith("data:image")) {
                        return <img src={firstRubrica} alt="Rubrica" style={{ maxWidth: "100px", maxHeight: "50px", objectFit: "contain" }} />;
                      } else {
                        return occurrence.rubricas.join(", ");
                      }
                    })()
                  ) : (
                    "N/A"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
