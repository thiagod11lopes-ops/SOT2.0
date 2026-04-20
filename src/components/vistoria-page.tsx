import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useCatalogItems } from "../context/catalog-items-context";
import { listMotoristasComServicoOuRotinaNoDia } from "../lib/detalheServicoDayMarkers";
import {
  loadDetalheServicoBundleFromIdb,
  normalizeDetalheServicoBundle,
  type DetalheServicoBundle,
} from "../lib/detalheServicoBundle";
import { ensureFirebaseAuth } from "../lib/firebase/auth";
import { SOT_STATE_DOC, subscribeSotStateDoc } from "../lib/firebase/sotStateFirestore";
import { isFirebaseOnlyOnlineActive } from "../lib/firebaseOnlyOnlinePolicy";
import {
  CHECKLIST_ITEMS,
  checklistComOkPorDefeito,
  type ChecklistKey,
  applySituacaoVtrPendingPrefillForViatura,
  autoResolveAdministrativeRedundanciesOnCommonSave,
  autoResolveOlderPendingRowsOnSave,
  emptyChecklist,
  emptyChecklistNotes,
  formatIsoDatePtBr,
  isViaturaLocalizacao,
  isoDateFromDate,
  VIATURA_LOCALIZACAO_OPCOES,
  type ViaturaLocalizacao,
  nomesMotoristaVistoriaEquivalentes,
  normalizeDriverKey,
  parseIsoDate,
  readVistoriaAssignments,
  resolveViaturasParaMotoristaEscala,
  readVistoriaInspections,
  primeiroLabelAnotacoesSemObservacao,
  segmentarObservacaoAdmin,
  findLatestInspectionForFormPrefill,
  type VistoriaAssignment,
  type VistoriaChecklist,
  type VistoriaChecklistNotes,
  type VistoriaInspection,
} from "../lib/vistoriaInspectionShared";
import {
  ensureVistoriaCloudStateSyncStarted,
  getVistoriaCloudState,
  isVistoriaCloudStateHydrated,
  subscribeVistoriaCloudStateChange,
  type IssueControl,
  type ResolvedIssue,
  updateVistoriaCloudState,
} from "../lib/vistoriaCloudState";
import { buildViaturasPorMotoristaMap, getVistoriaCalendarDayTintForIso } from "../lib/vistoriaCalendarTint";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { TabsList } from "./ui/tabs";

const vistoriaSubTabs = ["Vistoriar", "Estado das Viaturas", "Prioridades", "Responsabilidade de Vistoria"] as const;
const ESTADO_VTR_CUTOFF_KEY = "sot_estado_vtr_cutoff_v1";
const ESTADO_VTR_DELETED_MAP_KEY = "sot_estado_vtr_deleted_rows_v1";

function startOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthLabelPtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function issueRowKey(rowId: string): string {
  return rowId;
}

type VtrSituacaoPendenteRow = {
  rowId: string;
  inspectionId: string;
  viatura: string;
  motorista: string;
  inspectionDate: string;
  itemKey: ChecklistKey;
  itemLabel: string;
  observacao: string;
  vistoriaAdministrativa: boolean;
  prefillMotorista?: string;
  prefillInspectionDate?: string;
  observacaoPlain?: string;
  observacaoItalic?: string;
  /** Só na Situação das VTR: mostrar data/nome da administrativa em baixo quando este item foi alterado na administrativa. */
  exibirBlocoAdminDataMotorista?: boolean;
  relatedIssueRefs: Array<{ inspectionId: string; itemKey: ChecklistKey }>;
};

type RowIssueControlState = {
  problemMarked: boolean;
  priorityMarked: boolean;
  printMarked: boolean;
};

type EstadoViaturaRow = {
  rowId: string;
  inspectionId: string;
  viatura: string;
  inspectionDate: string;
  createdAt: number;
  observacoes: string;
  rubrica: string;
  rowKind: "item" | "localizacao";
  itemKey?: ChecklistKey;
};

function loadOrCreateEstadoVtrCutoffMs(): number {
  if (typeof localStorage === "undefined") return Date.now();
  try {
    const now = Date.now();
    const raw = localStorage.getItem(ESTADO_VTR_CUTOFF_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      // Protege contra cutoff inválido no futuro (relógio/sessão antigos), que esconderia toda a tabela.
      if (parsed <= now + 60_000) return parsed;
    }
    localStorage.setItem(ESTADO_VTR_CUTOFF_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function loadEstadoVtrDeletedMap(): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(ESTADO_VTR_DELETED_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function renderAnotacaoSituacao(row: VtrSituacaoPendenteRow): ReactNode {
  if (row.observacaoPlain !== undefined || row.observacaoItalic !== undefined) {
    const p = row.observacaoPlain ?? "";
    const i = row.observacaoItalic ?? "";
    if (!p.trim() && !i.trim()) return "—";
    return (
      <span className="whitespace-pre-wrap">
        {p}
        {i ? <em className="font-bold italic text-[hsl(var(--foreground))]">{i}</em> : null}
      </span>
    );
  }
  if (row.observacao.trim()) return <span className="whitespace-pre-wrap">{row.observacao}</span>;
  return "—";
}


/** Agrupa por `${viatura.toLowerCase()}::${itemKey}` — resolve chave mesmo se a placa tiver ":" no texto. */
function parseVtrSituacaoGroupKey(groupKey: string): { vNorm: string; itemKey: ChecklistKey } | null {
  for (const { key } of CHECKLIST_ITEMS) {
    const suffix = `::${key}`;
    if (groupKey.endsWith(suffix)) {
      return { vNorm: groupKey.slice(0, -suffix.length), itemKey: key };
    }
  }
  return null;
}

/**
 * Situação das VTR: cada linha usa sempre o texto do último formulário comum e do último administrativo
 * para o item (sem um apagar o outro). Referências antigas continuam ligadas em `relatedIssueRefs` para Resolver.
 */
function buildVtrSituacaoPendenteRow(args: {
  groupKey: string;
  viatura: string;
  itemKey: ChecklistKey;
  itemLabel: string;
  latestCommon: VistoriaInspection | undefined;
  latestAdmin: VistoriaInspection | undefined;
  relatedIssueRefs: Array<{ inspectionId: string; itemKey: ChecklistKey }>;
}): VtrSituacaoPendenteRow {
  const lc = args.latestCommon;
  const la = args.latestAdmin;
  const { itemKey } = args;

  if (!lc && !la) {
    throw new Error("Situação das VTR: linha sem vistoria comum nem administrativa.");
  }

  const newestOverall =
    lc && la ? (lc.createdAt >= la.createdAt ? lc : la) : lc ?? la!;

  const exibirBlocoAdminDataMotorista =
    la != null && la.itensAlteradosAdministracao?.includes(itemKey) === true;

  let motorista: string;
  let inspectionDate: string;
  let prefillMotorista: string | undefined;
  let prefillInspectionDate: string | undefined;
  let observacao = "";
  let observacaoPlain: string | undefined;
  let observacaoItalic: string | undefined;

  if (lc && la) {
    const commonRaw = String(lc.checklistNotes[itemKey] ?? "");
    const adminRaw = String(la.checklistNotes[itemKey] ?? "");
    /** Mesma regra da gravação administrativa: prefixo comum + acrescento; evita «AAA» + itálico «AAA BBB». */
    const split = segmentarObservacaoAdmin(commonRaw, adminRaw);

    prefillMotorista = lc.motorista;
    prefillInspectionDate = lc.inspectionDate;

    if (exibirBlocoAdminDataMotorista) {
      inspectionDate = la.inspectionDate;
      motorista = la.motorista;
    } else {
      inspectionDate = newestOverall.inspectionDate;
      motorista = newestOverall.motorista;
      prefillMotorista = undefined;
      prefillInspectionDate = undefined;
    }

    observacaoPlain = split.plain;
    observacaoItalic = split.italic;
    observacao = "";
  } else if (lc) {
    motorista = lc.motorista;
    inspectionDate = lc.inspectionDate;
    observacao = String(lc.checklistNotes[itemKey] ?? "").trim();
  } else {
    const ins = la!;
    motorista = ins.motorista;
    inspectionDate = ins.inspectionDate;
    prefillMotorista = ins.prefillMotorista;
    prefillInspectionDate = ins.prefillInspectionDate;
    const seg = ins.observacaoSegmentacaoAdmin?.[itemKey];
    if (seg && (seg.plain !== undefined || seg.italic !== undefined)) {
      observacaoPlain = (seg.plain ?? "").trim();
      observacaoItalic = (seg.italic ?? "").trim();
    } else {
      observacao = String(ins.checklistNotes[itemKey] ?? "").trim();
    }
  }

  return {
    rowId: args.groupKey,
    inspectionId: newestOverall.id,
    viatura: args.viatura,
    motorista,
    inspectionDate,
    itemKey,
    itemLabel: args.itemLabel,
    observacao,
    vistoriaAdministrativa: Boolean(la && (!lc || la.createdAt > lc.createdAt)),
    prefillMotorista,
    prefillInspectionDate,
    observacaoPlain,
    observacaoItalic,
    exibirBlocoAdminDataMotorista: Boolean(lc && la && exibirBlocoAdminDataMotorista),
    relatedIssueRefs: args.relatedIssueRefs,
  };
}

export function VistoriaPage() {
  const { items } = useCatalogItems();
  const applyingCloudRef = useRef(false);
  const cloudReadyRef = useRef(false);
  const [activeSubTab, setActiveSubTab] = useState<string>(vistoriaSubTabs[0]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [selectedMotorista, setSelectedMotorista] = useState("");
  const [selectedViatura, setSelectedViatura] = useState("");
  const [assignments, setAssignments] = useState<VistoriaAssignment[]>(() => readVistoriaAssignments());
  const [inspections, setInspections] = useState<VistoriaInspection[]>(() => readVistoriaInspections());
  const [resolvedIssues, setResolvedIssues] = useState<ResolvedIssue[]>(() => getVistoriaCloudState().resolvedIssues);
  const [issueControls, setIssueControls] = useState<IssueControl[]>(() => getVistoriaCloudState().issueControls);
  const [priorityOrderKeys, setPriorityOrderKeys] = useState<string[]>(() => getVistoriaCloudState().priorityOrderKeys);
  const [detalheServicoBundle, setDetalheServicoBundle] = useState<DetalheServicoBundle | null>(null);
  const [selectedInspectionDate, setSelectedInspectionDate] = useState(() => isoDateFromDate(new Date()));
  const [calendarCursorMonth, setCalendarCursorMonth] = useState(() => startOfLocalMonth(new Date()));
  const [driversModalOpen, setDriversModalOpen] = useState(false);
  const [motoristasComServicoData, setMotoristasComServicoData] = useState<string[]>([]);
  const [loadingServicoData, setLoadingServicoData] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionMotorista, setInspectionMotorista] = useState("");
  const [inspectionViatura, setInspectionViatura] = useState("");
  const [localizacaoViatura, setLocalizacaoViatura] = useState<ViaturaLocalizacao>("A Bordo");
  const [inspectionChecklist, setInspectionChecklist] = useState<VistoriaChecklist>(() => emptyChecklist());
  const inspectionFormDirtyRef = useRef(false);
  const [inspectionChecklistNotes, setInspectionChecklistNotes] = useState<VistoriaChecklistNotes>(() =>
    emptyChecklistNotes(),
  );
  const [draggingPriorityKey, setDraggingPriorityKey] = useState<string | null>(null);
  const [avisoObservacaoItemLabel, setAvisoObservacaoItemLabel] = useState<string | null>(null);
  const avisoObservacaoTitleId = useId();
  const [confirmOkClearsNote, setConfirmOkClearsNote] = useState<{ key: ChecklistKey; label: string } | null>(null);
  const confirmOkClearsNoteTitleId = useId();
  const [confirmDeleteEstadoRow, setConfirmDeleteEstadoRow] = useState<EstadoViaturaRow | null>(null);
  const confirmDeleteEstadoRowTitleId = useId();
  const [estadoVtrCutoffMs] = useState<number>(() => loadOrCreateEstadoVtrCutoffMs());
  const [estadoVtrDeletedMap, setEstadoVtrDeletedMap] = useState<Record<string, number>>(() => loadEstadoVtrDeletedMap());

  const viaturas = useMemo(() => {
    const merged = [...items.viaturasAdministrativas, ...items.ambulancias].map((v) => v.trim()).filter(Boolean);
    return [...new Set(merged)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items.viaturasAdministrativas, items.ambulancias]);

  useEffect(() => {
    ensureVistoriaCloudStateSyncStarted();
    const syncFromCloud = () => {
      if (!isVistoriaCloudStateHydrated()) return;
      const cloud = getVistoriaCloudState();
      applyingCloudRef.current = true;
      setAssignments(cloud.assignments);
      setInspections(cloud.inspections);
      setResolvedIssues(cloud.resolvedIssues);
      setIssueControls(cloud.issueControls);
      setPriorityOrderKeys(cloud.priorityOrderKeys);
      cloudReadyRef.current = true;
      queueMicrotask(() => {
        applyingCloudRef.current = false;
      });
    };
    if (isVistoriaCloudStateHydrated()) {
      syncFromCloud();
    }
    const unsub = subscribeVistoriaCloudStateChange(syncFromCloud);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!cloudReadyRef.current || applyingCloudRef.current) return;
    updateVistoriaCloudState((prev) => ({ ...prev, assignments }));
  }, [assignments]);
  useEffect(() => {
    if (!cloudReadyRef.current || applyingCloudRef.current) return;
    updateVistoriaCloudState((prev) => ({ ...prev, inspections }));
  }, [inspections]);
  useEffect(() => {
    if (!cloudReadyRef.current || applyingCloudRef.current) return;
    updateVistoriaCloudState((prev) => ({ ...prev, resolvedIssues }));
  }, [resolvedIssues]);
  useEffect(() => {
    if (!cloudReadyRef.current || applyingCloudRef.current) return;
    updateVistoriaCloudState((prev) => ({ ...prev, issueControls }));
  }, [issueControls]);
  useEffect(() => {
    if (!cloudReadyRef.current || applyingCloudRef.current) return;
    updateVistoriaCloudState((prev) => ({ ...prev, priorityOrderKeys }));
  }, [priorityOrderKeys]);

  /** Nem OK nem Anotações: assume OK. */
  useEffect(() => {
    if (!inspectionOpen) {
      inspectionFormDirtyRef.current = false;
      setAvisoObservacaoItemLabel(null);
      return;
    }
    setInspectionChecklist((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const { key } of CHECKLIST_ITEMS) {
        if (next[key] === "") {
          next[key] = "OK";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [inspectionOpen]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (activeSubTab !== "Vistoriar") return;
    const parsed = parseIsoDate(selectedInspectionDate);
    if (parsed) setCalendarCursorMonth(startOfLocalMonth(parsed));
  }, [activeSubTab, selectedInspectionDate]);

  useEffect(() => {
    if (activeSubTab !== "Vistoriar") return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    if (isOnline && isFirebaseOnlyOnlineActive()) {
      void (async () => {
        try {
          await ensureFirebaseAuth();
          if (cancelled) return;
          unsub = subscribeSotStateDoc(
            SOT_STATE_DOC.detalheServico,
            (payload) => {
              if (cancelled) return;
              setDetalheServicoBundle(normalizeDetalheServicoBundle(payload));
            },
            (err) => console.error("[SOT] Firestore detalhe serviço (vistoria):", err),
            { ignoreCachedSnapshotWhenOnline: true },
          );
        } catch (e) {
          console.error("[SOT] Firebase auth (detalhe serviço vistoria):", e);
          if (cancelled) return;
          const fallback = await loadDetalheServicoBundleFromIdb();
          if (cancelled) return;
          setDetalheServicoBundle(fallback);
        }
      })();
    } else {
      void loadDetalheServicoBundleFromIdb().then((bundle) => {
        if (cancelled) return;
        setDetalheServicoBundle(bundle);
      });
    }
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [activeSubTab, isOnline]);

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
  const viaturasPorMotorista = useMemo(() => buildViaturasPorMotoristaMap(assignments), [assignments]);
  /** Cores do calendário por estado das placas no modal «Motoristas com S...». */
  const calendarDayStateByIso = useMemo(() => {
    const map = new Map<string, "neutral" | "green" | "orange" | "red">();
    if (!detalheServicoBundle) return map;
    const y = calendarCursorMonth.getFullYear();
    const m = calendarCursorMonth.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      map.set(iso, getVistoriaCalendarDayTintForIso(iso, detalheServicoBundle, viaturasPorMotorista, inspections));
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

  /** Placas que já têm vínculo com qualquer motorista (não podem ser escolhidas de novo). */
  const viaturasJaVinculadasGlobalmente = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      const v = a.viatura.trim();
      if (v) set.add(v);
    }
    return set;
  }, [assignments]);

  useEffect(() => {
    if (selectedMotorista.trim().length === 0) return;
    setSelectedViatura((prev) => {
      const v = prev.trim();
      if (!v) return prev;
      if (viaturasJaVinculadasGlobalmente.has(v)) return "";
      return prev;
    });
  }, [selectedMotorista, viaturasJaVinculadasGlobalmente]);

  const canAdd =
    selectedMotorista.trim().length > 0 &&
    selectedViatura.trim().length > 0 &&
    !viaturasJaVinculadasGlobalmente.has(selectedViatura.trim());
  const resolvedIssueSet = useMemo(
    () => new Set(resolvedIssues.map((r) => `${r.inspectionId}:${r.itemKey}`)),
    [resolvedIssues],
  );
  const vtrSituacaoPendente = useMemo(() => {
    const sorted = [...inspections].sort((a, b) => b.createdAt - a.createdAt);
    const latestCommonByGk = new Map<string, VistoriaInspection>();
    const latestAdminByGk = new Map<string, VistoriaInspection>();
    const allGroupKeys = new Set<string>();

    for (const ins of sorted) {
      const vNorm = ins.viatura.trim().toLowerCase();
      if (!vNorm) continue;
      for (const { key } of CHECKLIST_ITEMS) {
        if (ins.checklist[key] !== "Alterações") continue;
        if (resolvedIssueSet.has(`${ins.id}:${key}`)) continue;
        const gk = `${vNorm}::${key}`;
        allGroupKeys.add(gk);
        const isAdmin = ins.vistoriaAdministrativa === true;
        if (!isAdmin && !latestCommonByGk.has(gk)) latestCommonByGk.set(gk, ins);
        if (isAdmin && !latestAdminByGk.has(gk)) latestAdminByGk.set(gk, ins);
      }
    }

    const grouped = new Map<string, VtrSituacaoPendenteRow>();

    for (const gk of allGroupKeys) {
      const parsed = parseVtrSituacaoGroupKey(gk);
      if (!parsed) continue;
      const { vNorm, itemKey } = parsed;
      const lc = latestCommonByGk.get(gk);
      const la = latestAdminByGk.get(gk);
      if (!lc && !la) continue;

      const label =
        CHECKLIST_ITEMS.find((x) => x.key === itemKey)?.label ??
        itemKey;
      const viatura = (lc ?? la!).viatura;

      const relatedIssueRefs: Array<{ inspectionId: string; itemKey: ChecklistKey }> = [];
      for (const inspection of inspections) {
        if (inspection.viatura.trim().toLowerCase() !== vNorm) continue;
        if (inspection.checklist[itemKey] !== "Alterações") continue;
        if (resolvedIssueSet.has(`${inspection.id}:${itemKey}`)) continue;
        relatedIssueRefs.push({ inspectionId: inspection.id, itemKey });
      }

      grouped.set(
        gk,
        buildVtrSituacaoPendenteRow({
          groupKey: gk,
          viatura,
          itemKey,
          itemLabel: label,
          latestCommon: lc,
          latestAdmin: la,
          relatedIssueRefs,
        }),
      );
    }

    for (const inspection of sorted) {
      const vistoriaAdministrativa = inspection.vistoriaAdministrativa === true;
      const temAlgumItemAlteracoes = CHECKLIST_ITEMS.some(({ key }) => inspection.checklist[key] === "Alterações");
      const localizacaoMobilePendente =
        inspection.origemMobile === true &&
        (inspection.localizacaoViatura === "Na Oficina" || inspection.localizacaoViatura === "Destacada") &&
        !resolvedIssueSet.has(`${inspection.id}:outros`);

      /**
       * Vistoria mobile com localização especial: gera linha explícita na Situação das VTR
       * para deixar rastreável na coluna de Anotação.
       */
      if (localizacaoMobilePendente) {
        const groupKey = `${inspection.viatura.trim().toLowerCase()}::mobile-localizacao`;
        if (!grouped.has(groupKey)) {
          const relatedIssueRefs: Array<{ inspectionId: string; itemKey: ChecklistKey }> = inspections
            .filter(
              (candidate) =>
                candidate.viatura.trim().toLowerCase() === inspection.viatura.trim().toLowerCase() &&
                candidate.origemMobile === true &&
                (candidate.localizacaoViatura === "Na Oficina" || candidate.localizacaoViatura === "Destacada") &&
                !resolvedIssueSet.has(`${candidate.id}:outros`),
            )
            .map((candidate) => ({ inspectionId: candidate.id, itemKey: "outros" as ChecklistKey }));
          grouped.set(groupKey, {
            rowId: groupKey,
            inspectionId: inspection.id,
            viatura: inspection.viatura,
            motorista: inspection.motorista,
            inspectionDate: inspection.inspectionDate,
            itemKey: "outros",
            itemLabel: "Situacao da viatura (mobile)",
            observacao: `Viatura marcada como ${inspection.localizacaoViatura}.`,
            vistoriaAdministrativa,
            relatedIssueRefs,
          });
        }
      }

      /** Vistoria só mobile, sem nenhum item em «Anotações»: entra na aba com linha de registo (chave «outros»). */
      if (
        inspection.origemMobile === true &&
        !temAlgumItemAlteracoes &&
        !resolvedIssueSet.has(`${inspection.id}:outros`)
      ) {
        const groupKey = `${inspection.viatura.trim().toLowerCase()}::outros`;
        if (!grouped.has(groupKey)) {
          const relatedIssueRefs: Array<{ inspectionId: string; itemKey: ChecklistKey }> = inspections
            .filter(
              (candidate) =>
                candidate.viatura.trim().toLowerCase() === inspection.viatura.trim().toLowerCase() &&
                candidate.origemMobile === true &&
                !CHECKLIST_ITEMS.some(({ key }) => candidate.checklist[key] === "Alterações") &&
                !resolvedIssueSet.has(`${candidate.id}:outros`),
            )
            .map((candidate) => ({ inspectionId: candidate.id, itemKey: "outros" as ChecklistKey }));
          grouped.set(groupKey, {
            rowId: groupKey,
            inspectionId: inspection.id,
            viatura: inspection.viatura,
            motorista: inspection.motorista,
            inspectionDate: inspection.inspectionDate,
            itemKey: "outros",
            itemLabel: "Registo de vistoria (mobile)",
            observacao: "Sem itens com anotações (todos OK).",
            vistoriaAdministrativa,
            relatedIssueRefs,
          });
        }
      }
    }
    const rows = [...grouped.values()];
    rows.sort((a, b) => {
      const byViatura = a.viatura.localeCompare(b.viatura, "pt-BR");
      if (byViatura !== 0) return byViatura;
      const byDate = a.inspectionDate.localeCompare(b.inspectionDate);
      if (byDate !== 0) return byDate;
      return a.itemLabel.localeCompare(b.itemLabel, "pt-BR");
    });
    return rows;
  }, [inspections, resolvedIssueSet]);


  const issueControlMap = useMemo(() => {
    const map = new Map<string, IssueControl>();
    for (const item of issueControls) map.set(`${item.inspectionId}:${item.itemKey}`, item);
    return map;
  }, [issueControls]);
  const getRowIssueControlState = useCallback(
    (row: VtrSituacaoPendenteRow): RowIssueControlState => {
      let foundAny = false;
      let problemMarked = true;
      let priorityMarked = false;
      let printMarked = false;
      for (const ref of row.relatedIssueRefs) {
        const control = issueControlMap.get(`${ref.inspectionId}:${ref.itemKey}`);
        if (!control) continue;
        foundAny = true;
        // Problema: conservador (desmarca só quando todos estão desmarcados por upsert da linha).
        problemMarked = problemMarked && control.problemMarked;
        // Prioridade/Imprimir: basta um marcado entre as refs da linha.
        priorityMarked = priorityMarked || control.priorityMarked;
        printMarked = printMarked || control.printMarked;
      }
      if (!foundAny) {
        return { problemMarked: true, priorityMarked: false, printMarked: false };
      }
      return { problemMarked, priorityMarked, printMarked };
    },
    [issueControlMap],
  );
  const vtrPrioridades = useMemo(
    () =>
      vtrSituacaoPendente.filter(
        (row) => getRowIssueControlState(row).priorityMarked === true,
      ),
    [vtrSituacaoPendente, getRowIssueControlState],
  );


  useEffect(() => {
    const pendingKeys = vtrPrioridades.map((r) => issueRowKey(r.rowId));
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
      vtrPrioridades.map((r) => [issueRowKey(r.rowId), r] as const),
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
      const k = issueRowKey(r.rowId);
      if (!seen.has(k)) ordered.push(r);
    }
    return ordered;
  }, [vtrPrioridades, priorityOrderKeys]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(ESTADO_VTR_DELETED_MAP_KEY, JSON.stringify(estadoVtrDeletedMap));
    } catch {
      /* ignore */
    }
  }, [estadoVtrDeletedMap]);

  const estadoViaturasRows = useMemo<EstadoViaturaRow[]>(() => {
    const effectiveCutoffMs = estadoVtrCutoffMs;
    const createdAtSafe = (ins: VistoriaInspection): number => {
      const n = Number(ins.createdAt);
      if (Number.isFinite(n) && n > 0) return n;
      const parsed = parseIsoDate(ins.inspectionDate);
      return parsed ? parsed.getTime() : 0;
    };
    const sorted = [...inspections]
      .filter((ins) => createdAtSafe(ins) >= effectiveCutoffMs)
      .sort((a, b) => createdAtSafe(b) - createdAtSafe(a));
    const latestByViaturaItem = new Map<string, EstadoViaturaRow>();
    const latestByViaturaLocalizacao = new Map<string, EstadoViaturaRow>();

    for (const ins of sorted) {
      const viatura = ins.viatura.trim();
      if (!viatura) continue;
      const rubricaRaw = String(
        ins.vistoriaAdministrativa === true ? (ins.rubricaAdministrativa ?? "") : (ins.rubrica ?? ""),
      ).trim();
      const rubrica = rubricaRaw
        ? rubricaRaw.startsWith("rubrica_ref:")
          ? "Rubrica em referência"
          : rubricaRaw
        : "";

      for (const item of CHECKLIST_ITEMS) {
        if (ins.checklist[item.key] !== "Alterações") continue;
        const rowId = `${viatura.toLowerCase()}::item::${item.key}`;
        if (latestByViaturaItem.has(rowId)) continue;
        const note = String(ins.checklistNotes[item.key] ?? "").trim();
        latestByViaturaItem.set(rowId, {
          rowId,
          inspectionId: ins.id,
          viatura,
          inspectionDate: ins.inspectionDate,
            createdAt: createdAtSafe(ins),
          observacoes: note ? `${item.label}: ${note}` : `${item.label}: sem observação`,
          rubrica,
          rowKind: "item",
          itemKey: item.key,
        });
      }

      // Linha de localização sempre reflete a última ação de localização da viatura.
      const localizacao = ins.localizacaoViatura;
      if (localizacao === "A Bordo" || localizacao === "Na Oficina" || localizacao === "Destacada") {
        const rowId = `${viatura.toLowerCase()}::localizacao`;
        if (!latestByViaturaLocalizacao.has(rowId)) {
          latestByViaturaLocalizacao.set(rowId, {
            rowId,
            inspectionId: ins.id,
            viatura,
            inspectionDate: ins.inspectionDate,
            createdAt: createdAtSafe(ins),
            observacoes: `Localização da viatura: ${localizacao}`,
            rubrica,
            rowKind: "localizacao",
          });
        }
      }
    }

    const rows = [...latestByViaturaItem.values(), ...latestByViaturaLocalizacao.values()].filter((row) => {
      const deletedAt = estadoVtrDeletedMap[row.rowId];
      if (!deletedAt) return true;
      return row.createdAt > deletedAt;
    });
    rows.sort((a, b) => {
      const byDate = b.inspectionDate.localeCompare(a.inspectionDate);
      if (byDate !== 0) return byDate;
      return a.viatura.localeCompare(b.viatura, "pt-BR");
    });
    return rows;
  }, [inspections, estadoVtrCutoffMs, estadoVtrDeletedMap]);

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

  function finalizeDeleteEstadoRow(row: EstadoViaturaRow) {
    const deletedAt = Date.now();
    setEstadoVtrDeletedMap((prev) => ({ ...prev, [row.rowId]: deletedAt }));
    const viaturaNorm = row.viatura.trim().toLowerCase();
    const targetItemKey = row.itemKey;
    updateVistoriaCloudState((prev) => ({
      ...prev,
      inspections: prev.inspections.map((ins) => {
        const sameViatura = ins.viatura.trim().toLowerCase() === viaturaNorm;
        if (!sameViatura) return ins;
        if (row.rowKind === "item" && targetItemKey) {
          if (ins.checklist[targetItemKey] !== "Alterações") return ins;
          return {
            ...ins,
            checklist: { ...ins.checklist, [targetItemKey]: "" },
            checklistNotes: { ...ins.checklistNotes, [targetItemKey]: "" },
          };
        }
        if (row.rowKind === "localizacao") {
          if (
            ins.localizacaoViatura === "A Bordo" ||
            ins.localizacaoViatura === "Na Oficina" ||
            ins.localizacaoViatura === "Destacada"
          ) {
            return { ...ins, localizacaoViatura: "A Bordo" };
          }
          return ins;
        }
        return ins;
      }),
      issueControls: prev.issueControls.filter((ctrl) => {
        const ins = prev.inspections.find((i) => i.id === ctrl.inspectionId);
        if (!ins) return false;
        const sameViatura = ins.viatura.trim().toLowerCase() === viaturaNorm;
        if (!sameViatura) return true;
        if (row.rowKind === "item" && targetItemKey) return ctrl.itemKey !== targetItemKey;
        if (row.rowKind === "localizacao") return ctrl.itemKey !== "outros";
        return ctrl.inspectionId !== row.inspectionId;
      }),
      resolvedIssues: prev.resolvedIssues.filter((res) => {
        const ins = prev.inspections.find((i) => i.id === res.inspectionId);
        if (!ins) return false;
        const sameViatura = ins.viatura.trim().toLowerCase() === viaturaNorm;
        if (!sameViatura) return true;
        if (row.rowKind === "item" && targetItemKey) return res.itemKey !== targetItemKey;
        if (row.rowKind === "localizacao") return res.itemKey !== "outros";
        return res.inspectionId !== row.inspectionId;
      }),
    }));
  }

  useEffect(() => {
    if (!inspectionOpen) return;
    if (inspectionFormDirtyRef.current) return;
    const viaturaRef = inspectionViatura.trim();
    const motoristaRef = inspectionMotorista.trim();
    if (!viaturaRef || !motoristaRef) return;
    const existing = findLatestInspectionForFormPrefill(inspections, motoristaRef, viaturaRef);
    const baseChecklist = checklistComOkPorDefeito({ ...emptyChecklist(), ...(existing?.checklist ?? {}) });
    const baseNotes = { ...emptyChecklistNotes(), ...(existing?.checklistNotes ?? {}) };
    const { checklist: nextChecklist, notes: nextNotes } = applySituacaoVtrPendingPrefillForViatura({
      inspections,
      viatura: viaturaRef,
      baseChecklist,
      baseNotes,
    });
    setLocalizacaoViatura(
      isViaturaLocalizacao(existing?.localizacaoViatura) ? existing.localizacaoViatura : "A Bordo",
    );
    setInspectionChecklist(nextChecklist);
    setInspectionChecklistNotes(nextNotes);
  }, [inspections, inspectionOpen, inspectionMotorista, inspectionViatura]);


  async function handleAddAssignment() {
    if (!canAdd) return;
    const motorista = selectedMotorista.trim();
    const viatura = selectedViatura.trim();
    const viaturaJaUsada = assignments.some((a) => a.viatura.trim() === viatura);
    if (viaturaJaUsada) {
      window.alert("Esta viatura já está vinculada a um motorista.");
      return;
    }
    try {
      await updateVistoriaCloudState((prev) => ({
        ...prev,
        assignments: [
          ...prev.assignments,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            motorista,
            viatura,
            createdAt: Date.now(),
          },
        ],
      }));
      setSelectedViatura("");
    } catch (err) {
      console.error("[SOT] Falha ao gravar vínculo de vistoria no Firebase:", err);
      window.alert("Falha ao salvar no Firebase. Verifique a conexão e tente novamente.");
    }
  }

  async function handleRemoveAssignment(id: string) {
    try {
      await updateVistoriaCloudState((prev) => ({
        ...prev,
        assignments: prev.assignments.filter((a) => a.id !== id),
      }));
    } catch (err) {
      console.error("[SOT] Falha ao remover vínculo de vistoria no Firebase:", err);
      window.alert("Falha ao salvar no Firebase. Verifique a conexão e tente novamente.");
    }
  }

  function handleOpenInspection(motorista: string, viatura: string) {
    inspectionFormDirtyRef.current = false;
    const motoristaRef = motorista.trim();
    const viaturaRef = viatura.trim();
    setInspectionMotorista(motoristaRef);
    setInspectionViatura(viaturaRef);
    const existing = findLatestInspectionForFormPrefill(inspections, motoristaRef, viaturaRef);
    setLocalizacaoViatura(
      isViaturaLocalizacao(existing?.localizacaoViatura) ? existing.localizacaoViatura : "A Bordo",
    );
    const baseChecklist = checklistComOkPorDefeito({ ...emptyChecklist(), ...(existing?.checklist ?? {}) });
    const baseNotes = { ...emptyChecklistNotes(), ...(existing?.checklistNotes ?? {}) };
    const { checklist: nextChecklist, notes: nextNotes } = applySituacaoVtrPendingPrefillForViatura({
      inspections,
      viatura: viaturaRef,
      baseChecklist,
      baseNotes,
    });
    setInspectionChecklist(nextChecklist);
    setInspectionChecklistNotes(nextNotes);
    setInspectionOpen(true);
  }

  async function handleSaveInspection() {
    const motoristaRef = inspectionMotorista.trim();
    const viaturaRef = inspectionViatura.trim();
    if (!inspectionOpen || !motoristaRef || !viaturaRef) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      window.alert("Sem conexão com a internet. A vistoria salva apenas no Firebase quando online.");
      return;
    }
    if (!isVistoriaCloudStateHydrated()) {
      window.alert("A sincronização de vistoria ainda está carregando. Aguarde alguns segundos e tente novamente.");
      return;
    }
    if (!isViaturaLocalizacao(localizacaoViatura)) {
      window.alert("Marque uma opção em «Localização da Viatura».");
      return;
    }
    const pendingChecklist = CHECKLIST_ITEMS.find(({ key }) => inspectionChecklist[key] === "");
    if (pendingChecklist) {
      window.alert(`Marque OK ou Anotações para "${pendingChecklist.label}".`);
      return;
    }
    const semObs = primeiroLabelAnotacoesSemObservacao(inspectionChecklist, inspectionChecklistNotes);
    if (semObs) {
      setAvisoObservacaoItemLabel(semObs);
      return;
    }
    autoResolveAdministrativeRedundanciesOnCommonSave({
      inspections,
      viatura: viaturaRef,
      checklist: inspectionChecklist,
      notes: inspectionChecklistNotes,
    });
    autoResolveOlderPendingRowsOnSave({
      inspections,
      viatura: viaturaRef,
      checklist: inspectionChecklist,
      origemMobile: false,
      localizacaoViatura,
    });
    try {
      await updateVistoriaCloudState((prev) => ({
        ...prev,
        inspections: [
          ...prev.inspections,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            motorista: motoristaRef,
            viatura: viaturaRef,
            inspectionDate: selectedInspectionDate,
            localizacaoViatura,
            checklist: inspectionChecklist,
            checklistNotes: inspectionChecklistNotes,
            createdAt: Date.now(),
            rubrica: "",
          },
        ],
      }));
      setInspectionOpen(false);
    } catch (err) {
      console.error("[SOT] Falha ao salvar vistoria no Firebase:", err);
      window.alert("Falha ao salvar no Firebase. Verifique a conexão e tente novamente.");
    }
  }

  function handleSelectChecklistOk(itemKey: ChecklistKey, itemLabel: string) {
    const note = String(inspectionChecklistNotes[itemKey] ?? "").trim();
    if (note !== "") {
      setConfirmOkClearsNote({ key: itemKey, label: itemLabel });
      return;
    }
    setInspectionChecklist((prev) => ({ ...prev, [itemKey]: "OK" }));
    setInspectionChecklistNotes((prev) => ({ ...prev, [itemKey]: "" }));
    inspectionFormDirtyRef.current = true;
  }

  function confirmProceedOkClearsNote() {
    if (!confirmOkClearsNote) return;
    const k = confirmOkClearsNote.key;
    setInspectionChecklist((prev) => ({ ...prev, [k]: "OK" }));
    setInspectionChecklistNotes((prev) => ({ ...prev, [k]: "" }));
    inspectionFormDirtyRef.current = true;
    setConfirmOkClearsNote(null);
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
                        viaturasJaVinculadasGlobalmente.has(viatura.trim());
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
                <strong>Responsabilidade de Vistoria</strong>. Verde: todas as placas do modal foram vistoriadas;
                laranja claro: pelo menos uma placa foi vistoriada; vermelho: nenhuma placa foi vistoriada.
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
                        ? "border-orange-300/90 bg-orange-200 text-slate-800 dark:text-slate-900"
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
                        const viaturasMotorista = resolveViaturasParaMotoristaEscala(motorista, viaturasPorMotorista);
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
                                        nomesMotoristaVistoriaEquivalentes(i.motorista, motorista) &&
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
      {activeSubTab === "Estado das Viaturas" ? (
        <Card>
          <CardHeader>
            <CardTitle>Estado das Viaturas</CardTitle>
          </CardHeader>
          <CardContent>
            {estadoViaturasRows.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhuma vistoria registrada no momento.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                <Table>
                  <TableHeader className="bg-[hsl(var(--muted))/0.35]">
                    <TableRow>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">VIATURA</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">DATA</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">OBSERVAÇÕES</TableHead>
                      <TableHead className="font-bold text-[hsl(var(--primary))]">RUBRICA</TableHead>
                      <TableHead className="text-right font-bold text-[hsl(var(--primary))]">AÇÕES</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estadoViaturasRows.map((row, index) => (
                      <TableRow key={row.rowId} className={index % 2 === 0 ? "bg-transparent" : "bg-[hsl(var(--muted))/0.15]"}>
                        <TableCell className="font-semibold">{row.viatura || "—"}</TableCell>
                        <TableCell>{formatIsoDatePtBr(row.inspectionDate)}</TableCell>
                        <TableCell>{row.observacoes ? <span className="whitespace-pre-wrap">{row.observacoes}</span> : "—"}</TableCell>
                        <TableCell>{row.rubrica ? <span className="whitespace-pre-wrap">{row.rubrica}</span> : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 w-8 border border-red-700/90 bg-red-600 p-0 text-white hover:bg-red-700"
                            aria-label="Excluir vistoria"
                            onClick={() => setConfirmDeleteEstadoRow(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
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
                Nenhum item marcado como prioridade no momento.
              </p>
            ) : (
              <ul className="space-y-2" role="list">
                {vtrPrioridadesOrdered.map((row, index) => {
                  const rk = issueRowKey(row.rowId);
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
                        <div className="whitespace-pre-wrap text-sm text-[hsl(var(--muted-foreground))]">
                          {renderAnotacaoSituacao(row)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
      {confirmDeleteEstadoRow ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={confirmDeleteEstadoRowTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteEstadoRow(null);
          }}
        >
          <Card className="w-full max-w-sm border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl">
            <CardHeader>
              <CardTitle id={confirmDeleteEstadoRowTitleId}>Confirmar exclusão</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Esta ação exclui permanentemente a vistoria selecionada.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 p-3 text-sm">
                <p>
                  <span className="font-semibold">Viatura:</span> {confirmDeleteEstadoRow.viatura || "—"}
                </p>
                <p>
                  <span className="font-semibold">Data:</span> {formatIsoDatePtBr(confirmDeleteEstadoRow.inspectionDate)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDeleteEstadoRow(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="flex-1 border border-red-700/90 bg-red-600 text-white hover:bg-red-700"
                  onClick={() => {
                    finalizeDeleteEstadoRow(confirmDeleteEstadoRow);
                    setConfirmDeleteEstadoRow(null);
                  }}
                >
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">Localização da Viatura</p>
                <div className="flex flex-wrap gap-4">
                  {VIATURA_LOCALIZACAO_OPCOES.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="vistoria-localizacao-viatura"
                        value={opt}
                        checked={localizacaoViatura === opt}
                        onChange={() => {
                          inspectionFormDirtyRef.current = true;
                          setLocalizacaoViatura(opt);
                        }}
                        className="accent-[hsl(var(--primary))]"
                      />
                      {opt}
                    </label>
                  ))}
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
                      <div className="flex gap-4" role="radiogroup" aria-label={`${item.label}: OK ou Anotações`}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`vistoria-${item.key}`}
                            value="OK"
                            checked={inspectionChecklist[item.key] === "OK"}
                            onChange={() => handleSelectChecklistOk(item.key, item.label)}
                          />
                          OK
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`vistoria-${item.key}`}
                            value="Alterações"
                            checked={inspectionChecklist[item.key] === "Alterações"}
                            onChange={() => {
                              inspectionFormDirtyRef.current = true;
                              setInspectionChecklist((prev) => ({
                                ...prev,
                                [item.key]: "Alterações",
                              }));
                            }}
                          />
                          Anotações
                        </label>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-[hsl(var(--muted-foreground))]">Observações do item</label>
                        <input
                          type="text"
                          value={inspectionChecklistNotes[item.key]}
                          onChange={(e) => {
                            inspectionFormDirtyRef.current = true;
                            setInspectionChecklistNotes((prev) => ({
                              ...prev,
                              [item.key]: e.target.value,
                            }));
                          }}
                          disabled={inspectionChecklist[item.key] === "OK"}
                          placeholder="Escreva observações deste item..."
                          className={`h-9 w-full rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm text-[hsl(var(--foreground))] shadow-sm placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60`}
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
      {inspectionOpen && avisoObservacaoItemLabel ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={avisoObservacaoTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAvisoObservacaoItemLabel(null);
          }}
        >
          <Card className="w-full max-w-md border-[hsl(var(--border))] shadow-2xl">
            <CardHeader>
              <CardTitle id={avisoObservacaoTitleId} className="text-lg">
                Observações em falta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                O item «{avisoObservacaoItemLabel}» está em <strong>Anotações</strong>. Preencha o campo{" "}
                <strong>Observações do item</strong> com o detalhe necessário antes de guardar.
              </p>
              <Button type="button" className="w-full" onClick={() => setAvisoObservacaoItemLabel(null)}>
                Entendi
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {inspectionOpen && confirmOkClearsNote ? (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={confirmOkClearsNoteTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOkClearsNote(null);
          }}
        >
          <Card className="w-full max-w-md border-[hsl(var(--border))] shadow-2xl">
            <CardHeader>
              <CardTitle id={confirmOkClearsNoteTitleId} className="text-lg">
                Apagar observações?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Ao escolher <strong>OK</strong>, o texto em <strong>Observações do item</strong> para «
                {confirmOkClearsNote.label}» será apagado. Deseja continuar?
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmOkClearsNote(null)}>
                  Cancelar
                </Button>
                <Button type="button" className="flex-1" onClick={confirmProceedOkClearsNote}>
                  Continuar e apagar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
