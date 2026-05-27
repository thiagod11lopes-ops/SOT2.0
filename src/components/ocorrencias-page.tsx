import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { PlaceholderPage } from "./placeholder-page";

interface Occurrence {
  id: string;
  timestamp: string;
  description: string;
  details: string;
}

const mockOccurrences: Occurrence[] = [
  {
    id: "1",
    timestamp: "2026-05-27 10:00:00",
    description: "Pneu furado",
    details: "Pneu dianteiro direito furado na rodovia BR-101.",
  },
  {
    id: "2",
    timestamp: "2026-05-27 09:30:00",
    description: "Motor superaquecido",
    details: "Veículo parou devido a superaquecimento do motor.",
  },
  {
    id: "3",
    timestamp: "2026-05-26 15:45:00",
    description: "Problema elétrico",
    details: "Falha no sistema elétrico, luzes internas não acendem.",
  },
];

export function OcorrenciasPage() {
  return (
    <div className="container mx-auto py-10">
      <h2 className="text-2xl font-bold mb-6">Ocorrências do Sistema</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data/Hora</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Detalhes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockOccurrences.map((occurrence) => (
            <TableRow key={occurrence.id}>
              <TableCell>{occurrence.timestamp}</TableCell>
              <TableCell>{occurrence.description}</TableCell>
              <TableCell>{occurrence.details}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
