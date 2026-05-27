import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useEffect, useState } from "react";
import { subscribeSotStateDoc, SOT_STATE_DOC } from "../lib/firebase/sotStateFirestore"; // Importar Firebase


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
    const unsubscribe = subscribeSotStateDoc(
      SOT_STATE_DOC.ocorrenciasDesvinculadas,
      (payload) => {
        if (payload && Array.isArray(payload)) {
          // Ordenar as ocorrências pelas mais atuais (timestamp decrescente)
          const sortedOccurrences = (payload as Occurrence[]).sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setOccurrences(sortedOccurrences);
        } else {
          setOccurrences([]);
        }
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
