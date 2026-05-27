import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useEffect, useState, useMemo } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
// Importa o subscriber de departures (corrigido para não importar DepartureRecord daqui)
import { subscribeDepartures } from "../lib/firebase/departuresFirestore";
// Importa o tipo DepartureRecord do local correto
import type { DepartureRecord } from "../types/departure";
import { subscribeSotStateDoc, SOT_STATE_DOC, readSotStateDocFromServer, setSotStateDocWithRetry } from "../lib/firebase/sotStateFirestore";
import { upsertDepartureRecord } from "../lib/firebase/departuresFirestore";


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
  createdAt: number;
  id: string;
  dataSaida: string;
  tipo: string;
  texto: string;
  rubrica?: string;
}

export function OcorrenciasPage() {
  const [departuresOccurrences, setDeparturesOccurrences] = useState<Occurrence[]>([]);
  const [unlinkedOccurrences, setUnlinkedOccurrences] = useState<Occurrence[]>([]);


  const [showDeleteConfirmationModal, setShowDeleteConfirmationModal] = useState(false);
  const [occurrenceToDeleteId, setOccurrenceToDeleteId] = useState<string | null>(null);

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
          const extractedUnlinked: Occurrence[] = rawItems.map((item) => {
            const date = item.dataSaida;
            const time = new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return {
              id: item.id,
              timestamp: `${date} ${time}`,
              description: item.texto,
              details: item.texto,
              placa: undefined,
              rubricas: item.rubrica ? [item.rubrica] : undefined,
            };
          });
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

  function handleDeleteClick(occurrenceId: string) {
    setOccurrenceToDeleteId(occurrenceId);
    setShowDeleteConfirmationModal(true);
  }

  async function confirmDelete() {
    if (!occurrenceToDeleteId) return;

    // Lógica para determinar se é uma ocorrência desvinculada ou de departure
    if (occurrenceToDeleteId.startsWith("unlinked-")) {
      // É uma ocorrência desvinculada
      try {
        const docRef = await readSotStateDocFromServer(SOT_STATE_DOC.ocorrenciasDesvinculadas);
        if (docRef && typeof docRef === 'object' && 'items' in docRef && Array.isArray((docRef as { items: unknown[] }).items)) {
          const currentItems = (docRef as { items: UnlinkedOccurrencePayload[] }).items;
          const updatedItems = currentItems.filter(item => item.id !== occurrenceToDeleteId);
          await setSotStateDocWithRetry(SOT_STATE_DOC.ocorrenciasDesvinculadas, { items: updatedItems });
          console.log(`[OcorrenciasPage] Ocorrência desvinculada ${occurrenceToDeleteId} excluída com sucesso.`);
        }
      } catch (error) {
        console.error(`[OcorrenciasPage] Erro ao excluir ocorrência desvinculada ${occurrenceToDeleteId}:`, error);
        window.alert("Erro ao excluir ocorrência desvinculada.");
      }
    } else {
      // É uma ocorrência de departure
      try {
        const departureRecord = departuresOccurrences.find(occ => occ.id === occurrenceToDeleteId);
        if (departureRecord) {
          // Para ocorrências vinculadas, limpamos o texto e rubrica no record departure
          // Note: updateDeparture() precisa de um objeto completo de DepartureRecord, não apenas um patch parcial.
          // Se updateDeparture suportar patch, isso precisaria ser ajustado.
          // Por simplicidade, vamos usar o record existente e zerar os campos de ocorrencia.

          await upsertDepartureRecord({ ...departureRecord, ocorrencias: "", ocorrenciasRubrica: undefined });
          console.log(`[OcorrenciasPage] Ocorrência vinculada ${occurrenceToDeleteId} excluída com sucesso.`);
        }
      } catch (error) {
        console.error(`[OcorrenciasPage] Erro ao excluir ocorrência vinculada ${occurrenceToDeleteId}:`, error);
        window.alert("Erro ao excluir ocorrência vinculada.");
      }
    }

    setOccurrenceToDeleteId(null);
    setShowDeleteConfirmationModal(false);
  }

  return (
    <div className="container mx-auto py-10">
      <h2 className="text-2xl font-bold mb-6">Ocorrências do Sistema</h2>
      {allOccurrences.length === 0 ? (
        <p className="text-center text-gray-500">Nenhuma ocorrência registrada.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
            <TableHead>Data</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Rubricas</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allOccurrences.map((occurrence) => {
              const [datePart, timePart] = occurrence.timestamp.split(" ");
              return (
                <TableRow key={occurrence.id}>
                  <TableCell>{datePart}</TableCell>
                  <TableCell>{timePart}</TableCell>
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
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Excluir ocorrência"
                      onClick={() => handleDeleteClick(occurrence.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Dialog open={showDeleteConfirmationModal} onOpenChange={setShowDeleteConfirmationModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowDeleteConfirmationModal(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar</span>
              </Button>
            </DialogClose>
            <DialogDescription>
              Tem certeza de que deseja excluir esta ocorrência? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={() => setShowDeleteConfirmationModal(false)}>
                Cancelar
              </Button>
            </DialogClose>
            <Button variant="default" onClick={confirmDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
