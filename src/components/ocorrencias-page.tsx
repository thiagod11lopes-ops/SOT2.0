import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

// Componente para a página de Ocorrências

interface Occurrence {
  id: string;
  timestamp: string;
  description: string;
  details: string;
  placa?: string; // Adicionando a placa, opcional por enquanto
  rubricas?: string[]; // Adicionando as rubricas, opcional
}

const mockOccurrences: Occurrence[] = [
  {
    id: "1",
    timestamp: "2026-05-27 10:00:00",
    description: "Pneu furado",
    details: "Pneu dianteiro direito furado na rodovia BR-101.",
    placa: "ABC-1234",
    rubricas: ["Manutenção", "Emergência"],
  },
  {
    id: "2",
    timestamp: "2026-05-27 09:30:00",
    description: "Motor superaquecido",
    details: "Veículo parou devido a superaquecimento do motor.",
    placa: "XYZ-5678",
    rubricas: ["Manutenção", "Avaria"],
  },
  {
    id: "3",
    timestamp: "2026-05-26 15:45:00",
    description: "Problema elétrico",
    details: "Falha no sistema elétrico, luzes internas não acendem.",
    placa: "DEF-9012",
    rubricas: ["Manutenção"],
  },
  {
    id: "4",
    timestamp: "2026-05-26 14:00:00",
    description: "Acidente leve",
    details: "Pequena colisão na traseira, sem feridos.",
    rubricas: ["Acidente"],
  },
  {
    id: "5",
    timestamp: "2026-05-25 11:00:00",
    description: "Falha no rádio",
    details: "Dificuldade de comunicação com a base.",
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
            <TableHead>Placa</TableHead>
            <TableHead>Rubricas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockOccurrences.map((occurrence) => (
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
    </div>
  );
}
