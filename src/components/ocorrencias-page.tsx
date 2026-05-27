import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useEffect, useState } from "react";
// Importa o subscriber de departures
import { subscribeDepartures } from "../lib/firebase/departuresFirestore";
// Importa o tipo DepartureRecord do local correto
import type { DepartureRecord } from "../types/departure";


// Componente para a página de Ocorrências

interface Occurrence {
  id: string;
  timestamp: string;
  description: string;
  details: string;
  placa?: string; // Adicionando a placa, opcional por enquanto
  rubricas?: string[]; // Adicionando as rubricas, opcional
}

export function OcorrenciasPage() {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeDepartures(
      (departureRecords: DepartureRecord[]) => {
        const extractedOccurrences: Occurrence[] = [];
        departureRecords.forEach((record) => {
          // Apenas adiciona se houver texto na ocorrência
          if (record.ocorrencias && record.ocorrencias.trim().length > 0) {
            extractedOccurrences.push({
              id: record.id,
              // Combina data e hora da saída para o timestamp
              timestamp: `${record.dataSaida} ${record.horaSaida}`,
              description: record.ocorrencias,
              details: record.ocorrencias, // Usando o mesmo para detalhes por simplicidade
              placa: record.viaturas || undefined, // A placa vem de 'viaturas'
              rubricas: record.ocorrenciasRubrica
                ? record.ocorrenciasRubrica.split(",").map((s: string) => s.trim())
                : undefined,
            });
          }
        });

        // Ordenar as ocorrências pelas mais atuais (timestamp decrescente)
        const sortedOccurrences = extractedOccurrences.sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setOccurrences(sortedOccurrences);
      },
      (error) => {
        console.error("Erro ao buscar ocorrências do Firestore:", error);
        setOccurrences([]);
      }
    );

    return () => unsubscribe(); // Cleanup on unmount
  }, []);

  return (
    <div className="container mx-auto py-10">
      <h2 className="text-2xl font-bold mb-6">Ocorrências do Sistema</h2>
      {occurrences.length === 0 ? (
        <p className="text-center text-gray-500">Nenhuma ocorrência registrada.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Detalhes</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Rubricas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {occurrences.map((occurrence) => (
              <TableRow key={occurrence.id}>
                <TableCell>{occurrence.timestamp}</TableCell>
                <TableCell>{occurrence.description}</TableCell>
                <TableCell>{occurrence.details}</TableCell>
                <TableCell>{occurrence.placa ?? "N/A"}</TableCell>
                <TableCell>{occurrence.rubricas?.join(", ") ?? "N/A"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
