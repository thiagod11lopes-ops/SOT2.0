import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useEffect, useState } from "react";

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
    const fetchOccurrences = () => {
      // Simula uma chamada de API para buscar ocorrências reais
      const fetchedData: Occurrence[] = [
        {
          id: "o-12345",
          timestamp: "2026-05-12 08:30:00",
          description: "Colisão traseira leve",
          details: "Amassado no para-choque traseiro, sem feridos. Envolvimento da placa RKK-9I27.",
          placa: "RKK-9I27",
          rubricas: ["Acidente", "Reparo"],
        },
        {
          id: "o-67890",
          timestamp: "2026-05-27 14:00:00",
          description: "Problema no freio",
          details: "Freio falhando intermitentemente. Necessita de inspeção urgente.",
          placa: "JHL-5432",
          rubricas: ["Manutenção", "Urgente"],
        },
        {
          id: "o-11223",
          timestamp: "2026-05-27 10:45:00",
          description: "Farol queimado",
          details: "Farol dianteiro esquerdo não acende.",
          placa: "ABC-1234",
          rubricas: ["Manutenção"],
        },
      ];

      // Simula um atraso de rede
      setTimeout(() => {
        setOccurrences(fetchedData);
      }, 500);
    };

    fetchOccurrences();
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
