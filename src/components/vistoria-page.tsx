import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCatalogItems } from "../context/catalog-items-context";
import { listMotoristasComServicoOuRotinaNoDia } from "../lib/detalheServicoDayMarkers";
import { buildVistoriaSituacaoImprimirPdf } from "../lib/generateVistoriaSituacaoPdf";
import { loadDetalheServicoBundleFromIdb, type DetalheServicoBundle } from "../lib/detalheServicoBundle";
import { isRubricaImageDataUrl } from "../lib/rubricaDrawing";
import {
  ASSIGNMENTS_STORAGE_KEY,
  CHECKLIST_ITEMS,
  type ChecklistKey,
  emptyChecklist,
  emptyChecklistNotes,
  formatIsoDatePtBr,
  type InspectionAnswer,
  INSPECTIONS_STORAGE_KEY,
  isoDateFromDate,
  normalizeDriverKey,
  parseIsoDate,
  readVistoriaAssignments,
  readVistoriaInspections,
  type VistoriaAssignment,
  type VistoriaChecklist,
  type VistoriaChecklistNotes,
  type VistoriaInspection,
} from "../lib/vistoriaInspectionShared";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { TabsList } from "./ui/tabs";

type ResolvedIssue = {
  id: string;
  inspectionId: string;
  itemKey: ChecklistKey;
  resolvedAt: number;
};
type IssueControl = {
  id: string;
  inspectionId: string;
  itemKey: ChecklistKey;
  problemMarked: boolean;
  priorityMarked: boolean;
  printMarked: boolean;
};

const RESOLVED_ISSUES_STORAGE_KEY = "sot_vistoria_resolved_issues_v1";
const ISSUE_CONTROLS_STORAGE_KEY = "sot_vistoria_issue_controls_v1";
const PRIORITY_ORDER_STORAGE_KEY = "sot_vistoria_priority_order_v1";
const vistoriaSubTabs = ["Vistoriar", "Situação das VTR", "Prioridades", "Responsabilidade de Vistoria"] as const;

function startOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthLabelPtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function readResolvedIssues(): ResolvedIssue[] {
  try {
    const raw = localStorage.getItem(RESOLVED_ISSUES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ResolvedIssue[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.inspectionId === "string" &&
        typeof item.itemKey === "string" &&
        typeof item.resolvedAt === "number",
    );
  } catch {
    return [];
  }
}

function readIssueControls(): IssueControl[] {
  try {
    const raw = localStorage.getItem(ISSUE_CONTROLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IssueControl[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.inspectionId === "string" &&
        typeof item.itemKey === "string" &&
        typeof item.problemMarked === "boolean" &&
        typeof item.priorityMarked === "boolean" &&
        typeof item.printMarked === "boolean",
    );
  } catch {
    return [];
  }
}

function readPriorityOrderKeys(): string[] {
  try {
    const raw = localStorage.getItem(PRIORITY_ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k) => typeof k === "string" && k.length > 0);
  } catch {
    return [];
  }
}

function issueRowKey(inspectionId: string, itemKey: ChecklistKey): string {
  return `${inspectionId}:${itemKey}`;
}

export function VistoriaPage() {
  const { items } = useCatalogItems();
  const [activeSubTab, setActiveSubTab] = useState<string>(vistoriaSubTabs[0]);
  const [selectedMotorista, setSelectedMotorista] = useState("");
  const [selectedViatura, setSelectedViatura] = useState("");
  const [assignments, setAssignments] = useState<VistoriaAssignment[]>(() => readVistoriaAssignments());
  const [inspections, setInspections] = useState<VistoriaInspection[]>(() => readVistoriaInspections());
  const [resolvedIssues, setResolvedIssues] = useState<ResolvedIssue[]>(() => readResolvedIssues());
  const [issueControls, setIssueControls] = useState<IssueControl[]>(() => readIssueControls());
  const [priorityOrderKeys, setPriorityOrderKeys] = useState<string[]>(() => readPriorityOrderKeys());
  const [detalheServicoBundle, setDetalheServicoBundle] = useState<DetalheServicoBundle | null>(null);
  const [selectedInspectionDate, setSelectedInspectionDate] = useState(() => isoDateFromDate(new Date()));
  const [calendarCursorMonth, setCalendarCursorMonth] = useState(() => startOfLocalMonth(new Date()));
  const [driversModalOpen, setDriversModalOpen] = useState(false);
  const [motoristasComServicoData, setMotoristasComServicoData] = useState<string[]>([]);
  const [loadingServicoData, setLoadingServicoData] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionMotorista, setInspectionMotorista] = useState("");
  const [inspectionViatura, setInspectionViatura] = useState("");
  const [inspectionAnswer, setInspectionAnswer] = useState<InspectionAnswer | "">("");
  const [inspectionChecklist, setInspectionChecklist] = useState<VistoriaChecklist>(() => emptyChecklist());
  const [inspectionChecklistNotes, setInspectionChecklistNotes] = useState<VistoriaChecklistNotes>(() =>
    emptyChecklistNotes(),
  );
  const [draggingPriorityKey, setDraggingPriorityKey] = useState<string | null>(null);

  const viaturas = useMemo(() => {
    const merged = [...items.viaturasAdministrativas, ...items.ambulancias].map((v) => v.trim()).filter(Boolean);
    return [...new Set(merged)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items.viaturasAdministrativas, items.ambulancias]);

  useEffect(() => {
    try {
      localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
    } catch {
      /* ignore */
    }
  }, [assignments]);
  useEffect(() => {
    try {
      localStorage.setItem(INSPECTIONS_STORAGE_KEY, JSON.stringify(inspections));
    } catch {
      /* ignore */
    }
  }, [inspections]);

  useEffect(() => {
    function syncFromStorage(): void {
      setInspections(readVistoriaInspections());
    }
    function onStorage(e: StorageEvent): void {
      if (e.key === INSPECTIONS_STORAGE_KEY || e.key === null) syncFromStorage();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("sot-vistoria-inspections-changed", syncFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sot-vistoria-inspections-changed", syncFromStorage);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(RESOLVED_ISSUES_STORAGE_KEY, JSON.stringify(resolvedIssues));
    } catch {
      /* ignore */
    }
  }, [resolvedIssues]);
  useEffect(() => {
    try {
      localStorage.setItem(ISSUE_CONTROLS_STORAGE_KEY, JSON.stringify(issueControls));
    } catch {
      /* ignore */
    }
  }, [issueControls]);
  useEffect(() => {
    try {
      localStorage.setItem(PRIORITY_ORDER_STORAGE_KEY, JSON.stringify(priorityOrderKeys));
    } catch {
      /* ignore */
    }
  }, [priorityOrderKeys]);

  useEffect(() => {
    if (activeSubTab !== "Vistoriar") return;
    const parsed = parseIsoDate(selectedInspectionDate);
    if (parsed) setCalendarCursorMonth(startOfLocalMonth(parsed));
  }, [activeSubTab]);

  useEffect(() => {
    if (activeSubTab !== "Vistoriar") return;
    let cancelled = false;
    void loadDetalheServicoBundleFromIdb().then((bundle) => {
      if (cancelled) return;
      setDetalheServicoBundle(bundle);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSubTab]);

  useEffect(() => {
    if (activeSubTab !== "Vistoriar" || !detalheServicoBundle) return;
    setLoadingServicoData(true);
    const marcados = listMotoristasComServicoOuRotinaNoDia(detalheServicoBundle, selectedInspectionDate);
    const somenteComS = marcados.filter((item) => item.servico).map((item) => item.motorista.trim());
    const unicos = [...new Set(somenteComS)].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
    setMotoristasComServicoData(unicos);
    setLoadingServicoData(false);
  }, [activeSubTab, detalheServicoBundle, selectedInspectionDate]);

  /** Uma linha por motorista; placas agrupadas na mesma célula (lado a lado). */
  const assignmentsGroupedByDriver = useMemo(() => {
    const map = new Map<string, VistoriaAssignment[]>();
    for (const a of assignments) {
      const nk = normalizeDriverKey(a.motorista);
      if (!nk) continue;
      if (!map.has(nk)) map.set(nk, []);
      map.get(nk)!.push(a);
    }
    const rows = [...map.entries()].map(([nk, list]) => {
      const sorted = [...list].sort((a, b) => a.viatura.localeCompare(b.viatura, "pt-BR"));
      const nameCandidates = [...new Set(sorted.map((x) => x.motorista.trim()))].filter(Boolean);
      const displayMotorista =
        nameCandidates.sort((a, b) => a.localeCompare(b, "pt-BR"))[0] ?? sorted[0].motorista;
      return { normalizedKey: nk, displayMotorista, assignments: sorted };
    });
    rows.sort((a, b) => a.displayMotorista.localeCompare(b.displayMotorista, "pt-BR"));
    return rows;
  }, [assignments]);
  const viaturasPorMotorista = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of assignments) {
      const key = normalizeDriverKey(a.motorista);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a.viatura);
    }
    for (const [key, viaturasMotorista] of map.entries()) {
      map.set(
        key,
        [...new Set(viaturasMotorista.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
      );
    }
    return map;
  }, [assignments]);
  /** Cores do calendário: só motoristas com S e com vínculo em Responsabilidade de Vistoria. */
  const calendarDayStateByIso = useMemo(() => {
    const map = new Map<string, "neutral" | "green" | "orange" | "red">();
    if (!detalheServicoBundle) return map;
    const y = calendarCursorMonth.getFullYear();
    const m = calendarCursorMonth.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const marcados = listMotoristasComServicoOuRotinaNoDia(detalheServicoBundle, iso);
      const motoristasComSMap = new Map<string, string>();
      for (const row of marcados) {
        if (!row.servico) continue;
        const name = row.motorista.trim();
        if (!name) continue;
        const nk = normalizeDriverKey(name);
        if (!nk) continue;
        if (!motoristasComSMap.has(nk)) motoristasComSMap.set(nk, name);
      }
      const relevant = [...motoristasComSMap.values()].filter(
        (name) => (viaturasPorMotorista.get(normalizeDriverKey(name))?.length ?? 0) > 0,
      );
      if (relevant.length === 0) {
        map.set(iso, "neutral");
        continue;
      }
      const motoristaFinalizouNoDia = (motorista: string): boolean => {
        const vtrs = viaturasPorMotorista.get(normalizeDriverKey(motorista)) ?? [];
        for (const v of vtrs) {
          const ok = inspections.some(
            (i) =>
              i.inspectionDate === iso &&
              normalizeDriverKey(i.motorista) === normalizeDriverKey(motorista) &&
              i.viatura.trim() === v.trim(),
          );
          if (!ok) return false;
        }
        return true;
      };
      const doneCount = relevant.filter(motoristaFinalizouNoDia).length;
      if (doneCount === relevant.length) map.set(iso, "green");
      else if (relevant.length > 1) map.set(iso, "orange");
      else map.set(iso, "red");
    }
    return map;
  }, [detalheServicoBundle, calendarCursorMonth, viaturasPorMotorista, inspections]);
  const calendarDays = useMemo(() => {
    const y = calendarCursorMonth.getFullYear();
    const m = calendarCursorMonth.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const pad = first.getDay();
    const total = Math.ceil((pad + daysInMonth) / 7) * 7;
    const out: Array<{ iso: string | null; day: number | null }> = [];
    for (let i = 0; i < total; i++) {
      if (i < pad) {
        out.push({ iso: null, day: null });
        continue;
      }
      const day = i - pad + 1;
      if (day > daysInMonth) {
        out.push({ iso: null, day: null });
        continue;
      }
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      out.push({ iso, day });
    }
    return out;
  }, [calendarCursorMonth]);

  const viaturasVinculadasAoMotoristaSelecionado = useMemo(() => {
    const m = selectedMotorista.trim();
    if (!m) return new Set<string>();
    const nk = normalizeDriverKey(m);
    const set = new Set<string>();
    for (const a of assignments) {
      if (normalizeDriverKey(a.motorista) === nk) set.add(a.viatura.trim());
    }
    return set;
  }, [assignments, selectedMotorista]);

  useEffect(() => {
    setSelectedViatura((prev) => {
      const v = prev.trim();
      if (!v) return prev;
      if (viaturasVinculadasAoMotoristaSelecionado.has(v)) return "";
      return prev;
    });
  }, [viaturasVinculadasAoMotoristaSelecionado]);

  const canAdd =
    selectedMotorista.trim().length > 0 &&
    selectedViatura.trim().length > 0 &&
    !viaturasVinculadasAoMotoristaSelecionado.has(selectedViatura.trim());
  const resolvedIssueSet = useMemo(
    () => new Set(resolvedIssues.map((r) => `${r.inspectionId}:${r.itemKey}`)),
    [resolvedIssues],
  );
  const latestInspectionByVehicle = useMemo(() => {
    const map = new Map<string, VistoriaInspection>();
    for (const inspection of inspections) {
      const key = inspection.viatura.trim().toLowerCase();
      if (!key) continue;
      const current = map.get(key);
      if (!current || inspection.createdAt > current.createdAt) map.set(key, inspection);
    }
    return map;
  }, [inspections]);
  const vtrSituacaoPendente = useMemo(() => {
    const rows: Array<{
      inspectionId: string;
      viatura: string;
      motorista: string;
      inspectionDate: string;
      itemKey: ChecklistKey;
      itemLabel: string;
      observacao: string;
    }> = [];
    for (const inspection of latestInspectionByVehicle.values()) {
      for (const { key, label } of CHECKLIST_ITEMS) {
        if (inspection.checklist[key] !== "Alterações") continue;
        if (resolvedIssueSet.has(`${inspection.id}:${key}`)) continue;
        rows.push({
          inspectionId: inspection.id,
          viatura: inspection.viatura,
          motorista: inspection.motorista,
          inspectionDate: inspection.inspectionDate,
          itemKey: key,
          itemLabel: label,
          observacao: inspection.checklistNotes[key].trim(),
        });
      }
    }
    rows.sort((a, b) => {
      const byViatura = a.viatura.localeCompare(b.viatura, "pt-BR");
      if (byViatura !== 0) return byViatura;
      return a.itemLabel.localeCompare(b.itemLabel, "pt-BR");
    });
    return rows;
  }, [latestInspectionByVehicle, resolvedIssueSet]);
  const issueControlMap = useMemo(() => {
    const map = new Map<string, IssueControl>();
    for (const item of issueControls) map.set(`${item.inspectionId}:${item.itemKey}`, item);
    return map;
  }, [issueControls]);
  const inspectionById = useMemo(() => {
    const map = new Map<string, VistoriaInspection>();
    for (const ins of inspections) map.set(ins.id, ins);
    return map;
  }, [inspections]);
  const vtrPrioridades = useMemo(
    () =>
      vtrSituacaoPendente.filter(
        (row) => issueControlMap.get(`${row.inspectionId}:${row.itemKey}`)?.priorityMarked === true,
      ),
    [vtrSituacaoPendente, issueControlMap],
  );

  useEffect(() => {
    const pendingKeys = vtrPrioridades.map((r) => issueRowKey(r.inspectionId, r.itemKey));
    const valid = new Set(pendingKeys);
    setPriorityOrderKeys((prev) => {
      const kept = prev.filter((k) => valid.has(k));
      const keptSet = new Set(kept);
      const extras = pendingKeys.filter((k) => !keptSet.has(k));
      const next = [...kept, ...extras];
      if (next.length === prev.length && next.every((k, i) => k === prev[i])) return prev;
      return next;
    });
  }, [vtrPrioridades]);

  const vtrPrioridadesOrdered = useMemo(() => {
    const map = new Map(
      vtrPrioridades.map((r) => [issueRowKey(r.inspectionId, r.itemKey), r] as const),
    );
    const seen = new Set<string>();
    const ordered: typeof vtrPrioridades = [];
    for (const k of priorityOrderKeys) {
      const row = map.get(k);
      if (row) {
        ordered.push(row);
        seen.add(k);
      }
    }
    for (const r of vtrPrioridades) {
      const k = issueRowKey(r.inspectionId, r.itemKey);
      if (!seen.has(k)) ordered.push(r);
    }
    return ordered;
  }, [vtrPrioridades, priorityOrderKeys]);

  function handlePriorityReorder(dragKey: string, targetKey: string) {
    if (dragKey === targetKey) return;
    setPriorityOrderKeys((prev) => {
      const from = prev.indexOf(dragKey);
      const to = prev.indexOf(targetKey);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleAddAssignment() {
    if (!canAdd) return;
    const motorista = selectedMotorista.trim();
    const viatura = selectedViatura.trim();
    const alreadyExists = assignments.some((a) => a.motorista === motorista && a.viatura === viatura);
    if (alreadyExists) {
      window.alert("Esta viatura já está cadastrada para este motorista.");
      return;
    }
    setAssignments((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        motorista,
        viatura,
        createdAt: Date.now(),
      },
    ]);
    setSelectedViatura("");
  }

  function handleRemoveAssignment(id: string) {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  function handleOpenInspection(motorista: string, viatura: string) {
    setInspectionMotorista(motorista);
    setInspectionViatura(viatura);
    const existing = inspections
      .filter((i) => i.motorista === motorista && i.viatura === viatura)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    setInspectionAnswer(existing?.viaturaNaOficina ?? "");
    setInspectionChecklist(existing?.checklist ?? emptyChecklist());
    setInspectionChecklistNotes(existing?.checklistNotes ?? emptyChecklistNotes());
    setInspectionOpen(true);
  }

  function handleSaveInspection() {
    if (!inspectionOpen || !inspectionMotorista || !inspectionViatura) return;
    if (inspectionAnswer !== "Sim" && inspectionAnswer !== "Não") {
      window.alert("Marque Sim ou Não em 'Viatura na Oficina?'.");
      return;
    }
    const pendingChecklist = CHECKLIST_ITEMS.find(({ key }) => inspectionChecklist[key] === "");
    if (pendingChecklist) {
      window.alert(`Marque OK ou Alterações para "${pendingChecklist.label}".`);
      return;
    }
    setInspections((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        motorista: inspectionMotorista,
        viatura: inspectionViatura,
        inspectionDate: selectedInspectionDate,
        viaturaNaOficina: inspectionAnswer,
        checklist: inspectionChecklist,
        checklistNotes: inspectionChecklistNotes,
        createdAt: Date.now(),
        rubrica: "",
      },
    ]);
    setInspectionOpen(false);
  }

  function handleResolveIssue(inspectionId: string, itemKey: ChecklistKey) {
    const k = `${inspectionId}:${itemKey}`;
    if (resolvedIssueSet.has(k)) return;
    setResolvedIssues((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        inspectionId,
        itemKey,
        resolvedAt: Date.now(),
      },
    ]);
  }

  function upsertIssueControl(inspectionId: string, itemKey: ChecklistKey, patch: Partial<IssueControl>) {
    const key = `${inspectionId}:${itemKey}`;
    const current = issueControlMap.get(key);
    const next: IssueControl = {
      id: current?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      inspectionId,
      itemKey,
      problemMarked: patch.problemMarked ?? current?.problemMarked ?? true,
      priorityMarked: patch.priorityMarked ?? current?.priorityMarked ?? false,
      printMarked: patch.printMarked ?? current?.printMarked ?? false,
    };
    setIssueControls((prev) => {
      const idx = prev.findIndex((x) => x.inspectionId === inspectionId && x.itemKey === itemKey);
      if (idx < 0) return [...prev, next];
      const clone = [...prev];
      clone[idx] = next;
      return clone;
    });
  }

  function handlePrintIssue(row: {
    inspectionDate: string;
    viatura: string;
    motorista: string;
    itemLabel: string;
    observacao: string;
    inspectionId: string;
    itemKey: ChecklistKey;
  }) {
    const control = issueControlMap.get(`${row.inspectionId}:${row.itemKey}`);
    const html = `
      <html>
        <head><title>Situação da VTR</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Situação da VTR</h2>
          <p><strong>Data da Vistoria:</strong> ${formatIsoDatePtBr(row.inspectionDate)}</p>
          <p><strong>Viatura:</strong> ${row.viatura}</p>
          <p><strong>Motorista:</strong> ${row.motorista}</p>
          <p><strong>Item com Anotação:</strong> ${row.itemLabel}</p>
          <p><strong>Anotação:</strong> ${row.observacao || "—"}</p>
          <p><strong>Marcar Problema:</strong> ${control?.problemMarked ? "Sim" : "Não"}</p>
          <p><strong>Prioridades:</strong> ${control?.priorityMarked ? "Marcado" : "Não"}</p>
          <p><strong>Imprimir:</strong> ${control?.printMarked ? "Marcado" : "Não"}</p>
        </body>
      </html>
    `;
    const win = window.open("", "_blank", "width=800,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  function handleGerarPdfSituacaoVtr() {
    const rowsComImprimir = vtrSituacaoPendente.filter(
      (row) => issueControlMap.get(`${row.inspectionId}:${row.itemKey}`)?.printMarked === true,
    );
    if (rowsComImprimir.length === 0) {
      window.alert("Nenhuma linha com Imprimir marcado.");
      return;
    }
    const pdfRows = rowsComImprimir.map((row) => ({
      inspectionDate: formatIsoDatePtBr(row.inspectionDate),
      viatura: row.viatura,
      motorista: row.motorista,
      itemLabel: row.itemLabel,
      observacao: row.observacao,
    }));
    const { doc, filename } = buildVistoriaSituacaoImprimirPdf(pdfRows);
    doc.save(filename);
  }

  return (
    <div className="space-y-4">
      <TabsList items={[...vistoriaSubTabs]} active={activeSubTab} onChange={setActiveSubTab} />
      {activeSubTab === "Responsabilidade de Vistoria" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Vistoria de Viaturas por Motorista</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-[hsl(var(--foreground))]">Motorista responsável</span>
                  <select
                    value={selectedMotorista}
                    onChange={(e) => setSelectedMotorista(e.target.value)}
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  >
                    <option value="">Selecione um motorista…</option>
                    {items.motoristas.map((motorista) => (
                      <option key={motorista} value={motorista}>
                        {motorista}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-medium text-[hsl(var(--foreground))]">Viatura para vistoria</span>
                  <select
                    value={selectedViatura}
                    onChange={(e) => setSelectedViatura(e.target.value)}
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  >
                    <option value="">Selecione uma viatura…</option>
                    {viaturas.map((viatura) => {
                      const bloqueada =
                        selectedMotorista.trim().length > 0 &&
                        viaturasVinculadasAoMotoristaSelecionado.has(viatura.trim());
                      return (
                        <option
                          key={viatura}
                          value={viatura}
                          disabled={bloqueada}
                          className={bloqueada ? "text-red-600" : undefined}
                          style={bloqueada ? { color: "rgb(220 38 38)" } : undefined}
                        >
                          {bloqueada ? `${viatura} (já vinculada)` : viatura}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <Button type="button" onClick={handleAddAssignment} disabled={!canAdd}>
                  Vincular
                </Button>
              </div>

              {items.motoristas.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Cadastre motoristas em <strong>Frota e Pessoal</strong> para iniciar os vínculos de vistoria.
                </p>
              ) : null}
              {viaturas.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Cadastre viaturas em <strong>Frota e Pessoal</strong> para iniciar os vínculos de vistoria.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Viaturas cadastradas por motorista</CardTitle>
            </CardHeader>
            <CardContent>
              {assignmentsGroupedByDriver.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum vínculo de vistoria cadastrado ainda.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                  <Table>
                    <TableHeader className="bg-[hsl(var(--muted))/0.35]">
                      <TableRow>
                        <TableHead className="font-bold text-[hsl(var(--primary))]">Motorista</TableHead>
                        <TableHead className="font-bold text-[hsl(var(--primary))]">Viaturas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignmentsGroupedByDriver.map((row, index) => (
                        <TableRow
                          key={row.normalizedKey}
                          className={index % 2 === 0 ? "bg-transparent" : "bg-[hsl(var(--muted))/0.15]"}
                        >
                          <TableCell className="align-top font-medium">{row.displayMotorista}</TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-wrap items-center gap-2">
                              {row.assignments.map((assignment) => (
                                <span
                                  key={assignment.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-0.5 text-sm shadow-sm"
                                >
                                  <span className="font-mono tabular-nums">{assignment.viatura}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-slate-500 hover:text-red-600"
                                    aria-label={`Remover vínculo ${assignment.motorista} - ${assignment.viatura}`}
                                    onClick={() => handleRemoveAssignment(assignment.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
      {activeSubTab === "Vistoriar" ? (
        <>
          <Card>
            <CardHeader className="border-b border-[hsl(var(--border))] bg-gradient-to-r from-[hsl(var(--primary))/0.14] via-[hsl(var(--muted))/0.2] to-[hsl(var(--primary))/0.08]">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[hsl(var(--primary))]" />
                <CardTitle className="text-lg text-[hsl(var(--primary))]">Calendário de Vistoria</CardTitle>
              </div>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Considera apenas motoristas com <strong>S</strong> no Detalhe de Serviço e com viatura em{" "}
                <strong>Responsabilidade de Vistoria</strong>. Verde: todos fizeram vistoria nas viaturas; laranja: há
                mais de um motorista com S e algum não finalizou; vermelho: um motorista com S e vistoria pendente.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.15] px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setCalendarCursorMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                    )
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="text-sm font-semibold capitalize text-[hsl(var(--primary))]">
                  {monthLabelPtBr(calendarCursorMonth)}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setCalendarCursorMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                    )
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                <span>Dom</span>
                <span>Seg</span>
                <span>Ter</span>
                <span>Qua</span>
                <span>Qui</span>
                <span>Sex</span>
                <span>Sáb</span>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((cell, idx) => {
                  if (!cell.iso || !cell.day) return <div key={`empty-${idx}`} className="h-12 rounded-lg border border-transparent" />;
                  const isSelected = cell.iso === selectedInspectionDate;
                  const dayState = calendarDayStateByIso.get(cell.iso) ?? "neutral";
                  const stateClass =
                    dayState === "green"
                      ? "border-emerald-500/80 bg-emerald-500 text-white"
                      : dayState === "orange"
                        ? "border-orange-500/80 bg-orange-500 text-white"
                        : dayState === "red"
                          ? "border-red-500/80 bg-red-500 text-white"
                          : "border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.2] text-[hsl(var(--foreground))]";
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => {
                        setSelectedInspectionDate(cell.iso!);
                        setDriversModalOpen(true);
                      }}
                      className={`h-12 rounded-lg border text-sm font-semibold shadow-sm transition-all hover:scale-[1.02] ${stateClass} ${isSelected ? "ring-2 ring-[hsl(var(--primary))] ring-offset-2" : ""}`}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
      {driversModalOpen && activeSubTab === "Vistoriar" ? (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
          <Card className="w-full max-w-4xl">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-[hsl(var(--border))]">
              <CardTitle>Motoristas com S na escala de serviço ({formatIsoDatePtBr(selectedInspectionDate)})</CardTitle>
              <Button type="button" variant="ghost" onClick={() => setDriversModalOpen(false)}>
                Fechar
              </Button>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-y-auto p-5">
              {loadingServicoData ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando escala de serviço…</p>
              ) : motoristasComServicoData.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Nenhum motorista com marcação <strong>S</strong> na data selecionada.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                  <Table>
                    <TableHeader className="bg-[hsl(var(--muted))/0.35]">
                      <TableRow>
                        <TableHead className="font-bold text-[hsl(var(--primary))]">Motorista</TableHead>
                        <TableHead className="font-bold text-[hsl(var(--primary))]">Viatura sob responsabilidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {motoristasComServicoData.map((motorista, index) => {
                        const viaturasMotorista = viaturasPorMotorista.get(normalizeDriverKey(motorista)) ?? [];
                        return (
                          <TableRow key={motorista} className={index % 2 === 0 ? "bg-transparent" : "bg-[hsl(var(--muted))/0.15]"}>
                            <TableCell className="font-medium">{motorista}</TableCell>
                            <TableCell>
                              {viaturasMotorista.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {viaturasMotorista.map((viatura) => {
                                    const vistoriaFeita = inspections.some(
                                      (i) =>
                                        i.inspectionDate === selectedInspectionDate &&
                                        normalizeDriverKey(i.motorista) === normalizeDriverKey(motorista) &&
                                        i.viatura.trim() === viatura.trim(),
                                    );
                                    return (
                                      <button
                                        key={`${motorista}-${viatura}`}
                                        type="button"
                                        onClick={() => {
                                          setDriversModalOpen(false);
                                          handleOpenInspection(motorista, viatura);
                                        }}
                                        className={
                                          vistoriaFeita
                                            ? "rounded-md border border-emerald-600/90 bg-emerald-500 px-2 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
                                            : "rounded-md border border-red-600/90 bg-red-500 px-2 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
                                        }
                                      >
                                        {viatura}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[hsl(var(--muted-foreground))]">
                                  Nenhuma viatura vinculada em Responsabilidade de Vistoria.
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {activeSubTab === "Situação das VTR" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle>Situação das VTR</CardTitle>
            <Button type="button" variant="outline" className="shrink-0" onClick={handleGerarPdfSituacaoVtr}>
              Gerar PDF
            </Button>
          </CardHeader>
          <CardContent>
            {vtrSituacaoPendente.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Não há itens pendentes no momento. Todas as alterações das vistorias atuais estão resolvidas.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                <Table>
                  <TableHeader className="bg-[hsl(var(--muted))/0.35]">
                    <TableRow>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Data da Vistoria</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Viatura</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Motorista</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Item com Anotação</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Anotação</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Rubrica</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Marcar Problema</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Prioridades</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">Imprimir</TableHead>
                      <TableHead className="text-right font-bold text-[hsl(var(--primary))]">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vtrSituacaoPendente.map((row, index) => {
                      const control = issueControlMap.get(`${row.inspectionId}:${row.itemKey}`);
                      const problemMarked = control?.problemMarked ?? true;
                      const priorityMarked = control?.priorityMarked ?? false;
                      const printMarked = control?.printMarked ?? false;
                      return (
                        <TableRow key={`${row.inspectionId}-${row.itemKey}`} className={index % 2 === 0 ? "bg-transparent" : "bg-[hsl(var(--muted))/0.15]"}>
                          <TableCell>{formatIsoDatePtBr(row.inspectionDate)}</TableCell>
                          <TableCell className="font-semibold">{row.viatura}</TableCell>
                          <TableCell>{row.motorista}</TableCell>
                          <TableCell>{row.itemLabel}</TableCell>
                          <TableCell>{row.observacao || "—"}</TableCell>
                          <TableCell className="max-w-[140px]">
                            {(() => {
                              const raw = inspectionById.get(row.inspectionId)?.rubrica;
                              const rubrica = typeof raw === "string" ? raw.trim() : "";
                              if (!rubrica) return <span className="text-[hsl(var(--muted-foreground))]">—</span>;
                              if (isRubricaImageDataUrl(rubrica)) {
                                return (
                                  <img
                                    src={rubrica}
                                    alt="Rubrica da vistoria"
                                    className="max-h-20 max-w-[128px] rounded border border-[hsl(var(--border))] object-contain bg-white"
                                  />
                                );
                              }
                              return <span className="text-sm">{rubrica}</span>;
                            })()}
                          </TableCell>
                          <TableCell>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={problemMarked}
                                onChange={(e) =>
                                  upsertIssueControl(row.inspectionId, row.itemKey, {
                                    problemMarked: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                              />
                              {problemMarked ? "Marcado" : "Não"}
                            </label>
                          </TableCell>
                          <TableCell>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={priorityMarked}
                                onChange={(e) =>
                                  upsertIssueControl(row.inspectionId, row.itemKey, {
                                    priorityMarked: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                              />
                              {priorityMarked ? "Marcado" : "Não"}
                            </label>
                          </TableCell>
                          <TableCell>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={printMarked}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  upsertIssueControl(row.inspectionId, row.itemKey, {
                                    printMarked: checked,
                                  });
                                  if (checked) handlePrintIssue(row);
                                }}
                                className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
                              />
                              {printMarked ? "Marcado" : "Não"}
                            </label>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button type="button" size="sm" onClick={() => handleResolveIssue(row.inspectionId, row.itemKey)}>
                              Resolver
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      {activeSubTab === "Prioridades" ? (
        <Card>
          <CardHeader>
            <CardTitle>Prioridades</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Arraste as linhas para alterar a ordem (1° no topo). A ordem é salva neste navegador.
            </p>
          </CardHeader>
          <CardContent>
            {vtrPrioridadesOrdered.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Nenhum item marcado como prioridade. Use a coluna Prioridades em <strong>Situação das VTR</strong> para
                incluir itens aqui.
              </p>
            ) : (
              <ul className="space-y-2" role="list">
                {vtrPrioridadesOrdered.map((row, index) => {
                  const rk = issueRowKey(row.inspectionId, row.itemKey);
                  const isDragging = draggingPriorityKey === rk;
                  return (
                    <li
                      key={rk}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", rk);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingPriorityKey(rk);
                      }}
                      onDragEnd={() => setDraggingPriorityKey(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const src = e.dataTransfer.getData("text/plain");
                        if (src) handlePriorityReorder(src, rk);
                      }}
                      className={`flex cursor-grab items-start gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm transition-opacity active:cursor-grabbing ${
                        isDragging ? "opacity-60" : ""
                      } ${index % 2 === 1 ? "bg-[hsl(var(--muted))/0.12]" : ""}`}
                    >
                      <span className="mt-0.5 min-w-[2.75rem] shrink-0 text-center text-sm font-bold tabular-nums text-[hsl(var(--primary))]">
                        {index + 1}°
                      </span>
                      <GripVertical
                        className="mt-1 h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-base font-semibold text-[hsl(var(--foreground))]">{row.viatura}</p>
                        <p className="whitespace-pre-wrap text-sm text-[hsl(var(--muted-foreground))]">
                          {row.observacao.trim() ? row.observacao : "—"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
      {inspectionOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-2 backdrop-blur-[3px]">
          <Card className="h-[95vh] w-[98vw] max-w-none overflow-hidden border-[hsl(var(--primary))]/25 bg-[hsl(var(--card))]/95 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <CardHeader className="border-b border-[hsl(var(--border))] bg-gradient-to-r from-[hsl(var(--primary))/0.18] via-[hsl(var(--muted))/0.2] to-[hsl(var(--primary))/0.08]">
              <CardTitle className="text-2xl font-bold tracking-tight text-[hsl(var(--primary))]">Iniciar vistoria</CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(95vh-5.5rem)] space-y-5 overflow-y-auto p-6">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.18] p-4 text-sm shadow-sm">
                <p>
                  <strong>Motorista:</strong> {inspectionMotorista}
                </p>
                <p>
                  <strong>Viatura:</strong> {inspectionViatura}
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.08] p-4 shadow-sm">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">Viatura na Oficina?</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="vistoria-viatura-na-oficina"
                      value="Sim"
                      checked={inspectionAnswer === "Sim"}
                      onChange={() => setInspectionAnswer("Sim")}
                    />
                    Sim
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="vistoria-viatura-na-oficina"
                      value="Não"
                      checked={inspectionAnswer === "Não"}
                      onChange={() => setInspectionAnswer("Não")}
                    />
                    Não
                  </label>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.08] p-4 shadow-sm">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">Checklist de vistoria</p>
                <div className="max-h-[56vh] space-y-3 overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                  {CHECKLIST_ITEMS.map((item) => (
                    <div
                      key={item.key}
                      className="grid gap-2 rounded-lg border border-[hsl(var(--border))]/70 bg-[hsl(var(--muted))/0.1] p-3 transition-colors hover:bg-[hsl(var(--muted))/0.18]"
                    >
                      <p className="text-sm font-medium">{item.label}</p>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`vistoria-${item.key}`}
                            value="OK"
                            checked={inspectionChecklist[item.key] === "OK"}
                            onChange={() =>
                              setInspectionChecklist((prev) => ({
                                ...prev,
                                [item.key]: "OK",
                              }))
                            }
                          />
                          OK
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`vistoria-${item.key}`}
                            value="Alterações"
                            checked={inspectionChecklist[item.key] === "Alterações"}
                            onChange={() =>
                              setInspectionChecklist((prev) => ({
                                ...prev,
                                [item.key]: "Alterações",
                              }))
                            }
                          />
                          Alterações
                        </label>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-[hsl(var(--muted-foreground))]">Observações</label>
                        <input
                          type="text"
                          value={inspectionChecklistNotes[item.key]}
                          onChange={(e) =>
                            setInspectionChecklistNotes((prev) => ({
                              ...prev,
                              [item.key]: e.target.value,
                            }))
                          }
                          placeholder="Escreva observações deste item..."
                          className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 pt-4 backdrop-blur">
                <Button type="button" variant="ghost" onClick={() => setInspectionOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleSaveInspection}>
                  Salvar vistoria
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
