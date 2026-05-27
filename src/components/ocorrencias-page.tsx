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
    // Aqui você faria a chamada à API para buscar as ocorrências reais.
    // Por enquanto, vamos simular que não há ocorrências até que algo seja registrado.
    // Exemplo de como você buscaria:
    // fetch('/api/ocorrencias')
    //   .then(res => res.json())
    //   .then(data => setOccurrences(data))
    //   .catch(error => console.error('Erro ao buscar ocorrências:', error));
    
    // Para simular dados vazios no início:
    setOccurrences([]);
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
