import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useEffect, useState, useMemo } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { subscribeDepartures, getDepartureRecord, upsertDepartureRecord } from "../lib/firebase/departuresFirestore";
import type { DepartureRecord } from "../types/departure";
import {
  subscribeSotStateDoc,
  SOT_STATE_DOC,
  readSotStateDocFromServer,
  setSotStateDocWithRetry,
} from "../lib/firebase/sotStateFirestore";
import { cn } from "../lib/utils";

interface Occurrence {
  id: string;
  timestamp: string;
  sortKey: number;
  description: string;
  placa?: string;
  motorista: string;
  rubricas?: string[];
  isUnlinked: boolean;
}

interface UnlinkedOccurrencePayload {
  createdAt: number;
  id: string;
  dataSaida: string;
  tipo: string;
  texto: string;
  rubrica?: string;
  motorista?: string;
}

function isUnlinkedOccurrenceId(id: string): boolean {
  return id.startsWith("uo-");
}

function formatMotoristaLabel(value: string | undefined): string {
  const t = value?.trim();
  return t && t.length > 0 ? t : "—";
}

function RubricaCell({ rubricas }: { rubricas?: string[] }) {
  if (!rubricas || rubricas.length === 0) {
    return <span className="text-[hsl(var(--muted-foreground))]">—</span>;
  }
  const first = rubricas[0]?.trim();
  if (first && first.startsWith("data:image")) {
    return (
      <div className="inline-flex rounded-lg border border-[hsl(var(--border))] bg-white p-1 shadow-sm">
        <img
          src={first}
          alt="Rubrica"
          className="max-h-12 max-w-[7rem] object-contain"
        />
      </div>
    );
  }
  return <span className="text-sm">{rubricas.join(", ")}</span>;
}

export function OcorrenciasPage() {
  const [departuresOccurrences, setDeparturesOccurrences] = useState<Occurrence[]>([]);
  const [unlinkedOccurrences, setUnlinkedOccurrences] = useState<Occurrence[]>([]);
  const [showDeleteConfirmationModal, setShowDeleteConfirmationModal] = useState(false);
  const [occurrenceToDeleteId, setOccurrenceToDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeDepartures(
      (departureRecords: DepartureRecord[]) => {
        const extractedOccurrences: Occurrence[] = [];
        departureRecords.forEach((record) => {
          if (record.ocorrencias && record.ocorrencias.trim().length > 0) {
            extractedOccurrences.push({
              id: record.id,
              timestamp: `${record.dataSaida} ${record.horaSaida}`,
              sortKey: record.createdAt ?? 0,
              description: record.ocorrencias,
              placa: record.viaturas.trim() || undefined,
              motorista: formatMotoristaLabel(record.motoristas),
              rubricas: record.ocorrenciasRubrica
                ? record.ocorrenciasRubrica.split(",").map((s: string) => s.trim()).filter(Boolean)
                : undefined,
              isUnlinked: false,
            });
          }
        });
        setDeparturesOccurrences(extractedOccurrences);
      },
      (error) => {
        console.error("Erro ao buscar ocorrências dos departures:", error);
        setDeparturesOccurrences([]);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSotStateDoc(
      SOT_STATE_DOC.ocorrenciasDesvinculadas,
      (payload) => {
        if (
          payload &&
          typeof payload === "object" &&
          "items" in payload &&
          Array.isArray((payload as { items: unknown[] }).items)
        ) {
          const rawItems = (payload as { items: UnlinkedOccurrencePayload[] }).items;
          const extractedUnlinked: Occurrence[] = rawItems.map((item) => {
            const time = new Date(item.createdAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            return {
              id: item.id,
              timestamp: `${item.dataSaida} ${time}`,
              sortKey: item.createdAt,
              description: item.texto,
              placa: undefined,
              motorista: formatMotoristaLabel(item.motorista),
              rubricas: item.rubrica ? [item.rubrica] : undefined,
              isUnlinked: true,
            };
          });
          setUnlinkedOccurrences(extractedUnlinked);
        } else {
          setUnlinkedOccurrences([]);
        }
      },
      (error) => {
        console.error("Erro ao buscar ocorrências desvinculadas do Firestore:", error);
        setUnlinkedOccurrences([]);
      },
    );
    return () => unsubscribe();
  }, []);

  const allOccurrences = useMemo(() => {
    const combined = [...departuresOccurrences, ...unlinkedOccurrences];
    return combined.sort((a, b) => b.sortKey - a.sortKey);
  }, [departuresOccurrences, unlinkedOccurrences]);

  function handleDeleteClick(occurrenceId: string) {
    setOccurrenceToDeleteId(occurrenceId);
    setShowDeleteConfirmationModal(true);
  }

  async function confirmDelete() {
    if (!occurrenceToDeleteId || deleting) return;
    setDeleting(true);

    const isUnlinked = isUnlinkedOccurrenceId(occurrenceToDeleteId);

    try {
      if (isUnlinked) {
        const docRef = await readSotStateDocFromServer(SOT_STATE_DOC.ocorrenciasDesvinculadas);
        if (
          docRef &&
          typeof docRef === "object" &&
          "items" in docRef &&
          Array.isArray((docRef as { items: unknown[] }).items)
        ) {
          const currentItems = (docRef as { items: UnlinkedOccurrencePayload[] }).items;
          const updatedItems = currentItems.filter((item) => item.id !== occurrenceToDeleteId);
          await setSotStateDocWithRetry(SOT_STATE_DOC.ocorrenciasDesvinculadas, { items: updatedItems });
        }
      } else {
        const departureRecord = await getDepartureRecord(occurrenceToDeleteId);
        if (departureRecord) {
          await upsertDepartureRecord({
            ...departureRecord,
            ocorrencias: "",
            ocorrenciasRubrica: "",
          });
        }
      }
    } catch (error) {
      console.error(`[OcorrenciasPage] Erro ao excluir ocorrência ${occurrenceToDeleteId}:`, error);
      window.alert("Erro ao excluir ocorrência. Tente novamente.");
    } finally {
      setDeleting(false);
      setOccurrenceToDeleteId(null);
      setShowDeleteConfirmationModal(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/25">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">
              Ocorrências
            </h2>
            <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
              Registos de saídas e ocorrências avulsas (sem placa), mais recentes primeiro.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-sm shadow-sm sm:self-auto">
          <span className="font-medium text-[hsl(var(--foreground))]">{allOccurrences.length}</span>
          <span className="text-[hsl(var(--muted-foreground))]">
            {allOccurrences.length === 1 ? "registo" : "registos"}
          </span>
        </div>
      </div>

      {allOccurrences.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25 px-6 py-14 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-[hsl(var(--muted-foreground))]/60" aria-hidden />
          <p className="mt-3 text-sm font-medium text-[hsl(var(--foreground))]">
            Nenhuma ocorrência registrada
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            As ocorrências aparecem aqui quando são guardadas numa saída ou sem vincular placa.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
          <Table
            wrapperClassName="overflow-x-auto"
            className="min-w-[52rem] border-collapse"
          >
            <TableHeader className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/80 backdrop-blur-sm [&_tr]:bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[6.5rem] whitespace-nowrap">Data</TableHead>
                <TableHead className="w-[5.5rem] whitespace-nowrap">Hora</TableHead>
                <TableHead className="min-w-[12rem]">Descrição</TableHead>
                <TableHead className="w-[6.5rem]">Placa</TableHead>
                <TableHead className="min-w-[8rem]">Motorista</TableHead>
                <TableHead className="w-[8.5rem]">Rubrica</TableHead>
                <TableHead className="w-[4.5rem] text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:nth-child(odd)]:bg-transparent [&_tr:nth-child(even)]:bg-[hsl(var(--muted))]/20">
              {allOccurrences.map((occurrence) => {
                const [datePart, timePart] = occurrence.timestamp.split(" ");
                return (
                  <TableRow
                    key={occurrence.id}
                    className="group border-[hsl(var(--border))]/60 transition-colors hover:bg-[hsl(var(--accent))]/30"
                  >
                    <TableCell className="whitespace-nowrap font-medium tabular-nums text-[hsl(var(--foreground))]">
                      {datePart}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-[hsl(var(--muted-foreground))]">
                      {timePart ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="line-clamp-3 text-sm leading-snug text-[hsl(var(--foreground))]">
                        {occurrence.description}
                      </p>
                      {occurrence.isUnlinked ? (
                        <span className="mt-1.5 inline-flex rounded-md bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          Sem placa
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {occurrence.placa ? (
                        <span className="inline-flex rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-0.5 font-mono text-xs font-semibold tracking-wide">
                          {occurrence.placa}
                        </span>
                      ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-sm",
                          occurrence.motorista === "—"
                            ? "text-[hsl(var(--muted-foreground))]"
                            : "font-medium text-[hsl(var(--foreground))]",
                        )}
                      >
                        {occurrence.motorista}
                      </span>
                    </TableCell>
                    <TableCell>
                      <RubricaCell rubricas={occurrence.rubricas} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir ocorrência"
                        className="h-8 w-8 rounded-lg opacity-70 transition-opacity group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600"
                        onClick={() => handleDeleteClick(occurrence.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showDeleteConfirmationModal} onOpenChange={setShowDeleteConfirmationModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                className="absolute right-4 top-4 h-8 w-8 p-0"
                onClick={() => setShowDeleteConfirmationModal(false)}
              >
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
              <Button variant="outline" onClick={() => setShowDeleteConfirmationModal(false)} disabled={deleting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button variant="default" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
