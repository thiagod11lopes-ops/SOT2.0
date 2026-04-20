import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isCompleteDatePtBr, isoDateToPtBr, normalizeDatePtBr, ptBrToIsoDate } from "../lib/dateFormat";
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
  appendVistoriaInspection,
  CHECKLIST_ITEMS,
  checklistComOkPorDefeito,
  applySituacaoVtrPendingPrefillForViatura,
  autoResolveAdministrativeRedundanciesOnCommonSave,
  autoResolveCommonRedundanciesOnAdministrativeSave,
  emptyChecklist,
  emptyChecklistNotes,
  formatIsoDatePtBr,
  isViaturaLocalizacao,
  isoDateFromDate,
  primeiroLabelAnotacoesSemObservacao,
  findLatestInspectionForFormPrefill,
  segmentarObservacaoAdmin,
  VIATURA_LOCALIZACAO_OPCOES,
  type ViaturaLocalizacao,
  nomesMotoristaVistoriaEquivalentes,
  normalizeDriverKey,
  parseIsoDate,
  resolveViaturasParaMotoristaEscala,
  readVistoriaAssignments,
  readVistoriaInspections,
  type ChecklistKey,
  type VistoriaChecklist,
  type VistoriaChecklistNotes,
  type VistoriaInspection,
} from "../lib/vistoriaInspectionShared";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { mergeViaturasCatalog, isValueInCatalog, useCatalogItems } from "../context/catalog-items-context";
import { useSaidasMobileFilterDate } from "./saidas-mobile-filter-date-context";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";
import { RubricaSignaturePad, type RubricaSignaturePadHandle } from "./rubrica-signature-pad";
import {
  ensureVistoriaCloudStateSyncStarted,
  isVistoriaCloudStateHydrated,
  subscribeVistoriaCloudStateChange,
} from "../lib/vistoriaCloudState";

function addDaysToIso(iso: string, delta: number): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + delta);
  return isoDateFromDate(d);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fluxo avulso: após senha no layout, escolhe-se viatura e abre-se o formulário para este motorista (sem exigir «S» na escala). */
  administrativeVistoriadorMotorista?: string | null;
};

function newInspectionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `vistoria-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Vista mobile (Android/iOS): fluxo alinhado à aba Vistoriar — dia, viaturas com S + responsabilidade.
 * «Na Oficina» / «Destacada»: modal de rubrica ao escolher a opção; «Confirmar e guardar» grava e fecha o painel.
 * «A Bordo»: «Salvar vistoria» abre o modal; «Confirmar e guardar» grava e fecha o painel.
 */
export function MobileVistoriaFullscreen({
  open,
  onOpenChange,
  administrativeVistoriadorMotorista = null,
}: Props) {
  const { filterDatePtBr } = useSaidasMobileFilterDate();
  const { items: catalogItems } = useCatalogItems();
  const viaturasCatalogo = useMemo(() => {
    const v = mergeViaturasCatalog(catalogItems);
    return [...v].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [catalogItems]);
  const [view, setView] = useState<"list" | "adminViatura" | "form">("list");
  const [adminViaturaDraft, setAdminViaturaDraft] = useState("");
  const [listRefresh, setListRefresh] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => isoDateFromDate(new Date()));
  const [vistoriaDatePtBr, setVistoriaDatePtBr] = useState(() =>
    isoDateToPtBr(isoDateFromDate(new Date())),
  );
  const [rubricaPadKey, setRubricaPadKey] = useState(0);
  const [bundle, setBundle] = useState<DetalheServicoBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const [formMotorista, setFormMotorista] = useState("");
  const [formViatura, setFormViatura] = useState("");
  const [localizacaoViatura, setLocalizacaoViatura] = useState<ViaturaLocalizacao>("A Bordo");
  const [inspectionChecklist, setInspectionChecklist] = useState<VistoriaChecklist>(() => emptyChecklist());
  const [inspectionChecklistNotes, setInspectionChecklistNotes] = useState<VistoriaChecklistNotes>(() =>
    emptyChecklistNotes(),
  );

  const [rubricaOpen, setRubricaOpen] = useState(false);
  const [avisoObservacaoItemLabel, setAvisoObservacaoItemLabel] = useState<string | null>(null);
  const [saveSuccessOpen, setSaveSuccessOpen] = useState(false);
  const successCloseTimerRef = useRef<number | null>(null);
  const rubricaModalIntentRef = useRef<"captureNaoAbordo" | "finalizeAbordo" | null>(null);
  const rubricaPadRef = useRef<RubricaSignaturePadHandle>(null);
  const rubricaTitleId = useId();
  const avisoObservacaoTitleId = useId();
  const confirmOkClearsNoteTitleId = useId();
  const [confirmOkClearsNote, setConfirmOkClearsNote] = useState<{ key: ChecklistKey; label: string } | null>(null);
  const adminFormSnapshotRef = useRef<{
    checklist: VistoriaChecklist;
    notes: VistoriaChecklistNotes;
    source: VistoriaInspection | null;
  } | null>(null);

  const assignments = useMemo(() => (open ? readVistoriaAssignments() : []), [open, listRefresh]);
  const inspections = useMemo(() => (open ? readVistoriaInspections() : []), [open, listRefresh]);
  const cloudHydrated = isVistoriaCloudStateHydrated();
  const calendarReady = cloudHydrated && !bundleLoading;

  const viaturasPorMotorista = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of assignments) {
      const key = normalizeDriverKey(a.motorista);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a.viatura);
    }
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...new Set(list.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
      );
    }
    return map;
  }, [assignments]);

  const isAdminSession = Boolean(administrativeVistoriadorMotorista?.trim());

  const viaturasSugeridasAdmin = useMemo(() => {
    const m = administrativeVistoriadorMotorista?.trim();
    if (!m) return [];
    return resolveViaturasParaMotoristaEscala(m, viaturasPorMotorista);
  }, [administrativeVistoriadorMotorista, viaturasPorMotorista]);

  const motoristasComSRelevantes = useMemo(() => {
    if (!bundle) return [];
    const marcados = listMotoristasComServicoOuRotinaNoDia(bundle, selectedDate);
    const byNorm = new Map<string, string>();
    for (const row of marcados) {
      if (!row.servico) continue;
      const name = row.motorista.trim();
      if (!name) continue;
      const nk = normalizeDriverKey(name);
      if (!nk) continue;
      if (!byNorm.has(nk)) byNorm.set(nk, name);
    }
    return [...byNorm.values()]
      .filter((name) => resolveViaturasParaMotoristaEscala(name, viaturasPorMotorista).length > 0)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [bundle, selectedDate, viaturasPorMotorista]);

  /** Data da vistoria = data do filtro das saídas (dd/mm/aaaa) sempre que abrir o painel ou mudar o filtro. */
  useEffect(() => {
    if (!open) return;
    if (isCompleteDatePtBr(filterDatePtBr)) {
      const iso = ptBrToIsoDate(filterDatePtBr);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) setSelectedDate(iso);
    }
  }, [open, filterDatePtBr]);

  useEffect(() => {
    setVistoriaDatePtBr(isoDateToPtBr(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    if (!open) {
      if (successCloseTimerRef.current) {
        window.clearTimeout(successCloseTimerRef.current);
        successCloseTimerRef.current = null;
      }
      setSaveSuccessOpen(false);
      setView("list");
      setRubricaOpen(false);
      setAvisoObservacaoItemLabel(null);
      setAdminViaturaDraft("");
      return;
    }
    ensureVistoriaCloudStateSyncStarted();
    setListRefresh((k) => k + 1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unsub = subscribeVistoriaCloudStateChange(() => setListRefresh((k) => k + 1));
    return () => unsub();
  }, [open]);

  useEffect(() => {
    if (!open || !administrativeVistoriadorMotorista?.trim()) return;
    if (view === "form") return;
    const m = administrativeVistoriadorMotorista.trim();
    setView("adminViatura");
    const vtrs = resolveViaturasParaMotoristaEscala(m, viaturasPorMotorista);
    setAdminViaturaDraft((prev) => (prev.trim() ? prev : vtrs.length === 1 ? vtrs[0] : ""));
  }, [open, administrativeVistoriadorMotorista, viaturasPorMotorista, view]);

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
    if (!open) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    setBundleLoading(true);
    if (isOnline && isFirebaseOnlyOnlineActive()) {
      void (async () => {
        try {
          await ensureFirebaseAuth();
          if (cancelled) return;
          unsub = subscribeSotStateDoc(
            SOT_STATE_DOC.detalheServico,
            (payload) => {
              if (cancelled) return;
              setBundle(normalizeDetalheServicoBundle(payload));
              setBundleLoading(false);
            },
            (err) => {
              console.error("[SOT] Firestore detalhe serviço (vistoria mobile):", err);
              if (!cancelled) setBundleLoading(false);
            },
            { ignoreCachedSnapshotWhenOnline: true },
          );
        } catch (e) {
          console.error("[SOT] Firebase auth (detalhe serviço vistoria mobile):", e);
          if (cancelled) return;
          const b = await loadDetalheServicoBundleFromIdb();
          if (cancelled) return;
          setBundle(b);
          setBundleLoading(false);
        }
      })();
    } else {
      void loadDetalheServicoBundleFromIdb().then((b) => {
        if (cancelled) return;
        setBundle(b);
        setBundleLoading(false);
      });
    }
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [open, isOnline]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /** Nem OK nem Anotações: assume OK (estado vazio ou dados antigos). */
  useEffect(() => {
    if (view !== "form" || !open) return;
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
  }, [view, open]);

  function inspectionFeitaPara(motorista: string, viatura: string): boolean {
    return inspections.some(
      (i) =>
        i.inspectionDate === selectedDate &&
        nomesMotoristaVistoriaEquivalentes(i.motorista, motorista) &&
        i.viatura.trim() === viatura.trim(),
    );
  }

  function abrirFormularioAdministrativo() {
    const motorista = administrativeVistoriadorMotorista?.trim() ?? "";
    const viatura = adminViaturaDraft.trim();
    if (!motorista) {
      window.alert("Motorista em falta.");
      return;
    }
    if (!viatura) {
      window.alert("Selecione a viatura.");
      return;
    }
    if (!isValueInCatalog(viatura, viaturasCatalogo)) {
      window.alert("A viatura deve constar do catálogo (definições no sistema principal).");
      return;
    }
    openForm(motorista, viatura);
  }

  function openForm(motorista: string, viatura: string) {
    const motoristaRef = motorista.trim();
    const viaturaRef = viatura.trim();
    setFormMotorista(motoristaRef);
    setFormViatura(viaturaRef);
    const existing = findLatestInspectionForFormPrefill(inspections, motoristaRef, viaturaRef);
    const baseChecklist = checklistComOkPorDefeito({ ...emptyChecklist(), ...(existing?.checklist ?? {}) });
    const baseNotes = { ...emptyChecklistNotes(), ...(existing?.checklistNotes ?? {}) };
    const { checklist: nextChecklist, notes: nextNotes } = applySituacaoVtrPendingPrefillForViatura({
      inspections,
      viatura: viaturaRef,
      baseChecklist,
      baseNotes,
    });
    if (isAdminSession) {
      adminFormSnapshotRef.current = {
        checklist: { ...nextChecklist },
        notes: { ...nextNotes },
        source: existing ?? null,
      };
    } else {
      adminFormSnapshotRef.current = null;
    }
    setLocalizacaoViatura(
      isViaturaLocalizacao(existing?.localizacaoViatura) ? existing.localizacaoViatura : "A Bordo",
    );
    setInspectionChecklist(nextChecklist);
    setInspectionChecklistNotes(nextNotes);
    setView("form");
  }

  function handleSelectChecklistOk(itemKey: ChecklistKey, itemLabel: string) {
    const note = String(inspectionChecklistNotes[itemKey] ?? "").trim();
    if (note !== "") {
      setConfirmOkClearsNote({ key: itemKey, label: itemLabel });
      return;
    }
    setInspectionChecklist((prev) => ({ ...prev, [itemKey]: "OK" }));
    setInspectionChecklistNotes((prev) => ({ ...prev, [itemKey]: "" }));
  }

  function confirmProceedOkClearsNote() {
    if (!confirmOkClearsNote) return;
    const k = confirmOkClearsNote.key;
    setInspectionChecklist((prev) => ({ ...prev, [k]: "OK" }));
    setInspectionChecklistNotes((prev) => ({ ...prev, [k]: "" }));
    setConfirmOkClearsNote(null);
  }

  function handleLocalizacaoChange(opt: ViaturaLocalizacao) {
    setLocalizacaoViatura(opt);
    if (opt === "Na Oficina" || opt === "Destacada") {
      rubricaModalIntentRef.current = "captureNaoAbordo";
      setRubricaPadKey((k) => k + 1);
      setRubricaOpen(true);
    }
  }

  function closeRubricaModalSemConfirmar() {
    rubricaModalIntentRef.current = null;
    setRubricaOpen(false);
  }

  function handlePedirSalvar() {
    if (!cloudHydrated) {
      window.alert("A sincronização de vistoria ainda está carregando. Aguarde alguns segundos e tente novamente.");
      return;
    }
    if (!isViaturaLocalizacao(localizacaoViatura)) {
      window.alert("Marque uma opção em «Localização da Viatura».");
      return;
    }
    const pending = CHECKLIST_ITEMS.find(({ key }) => inspectionChecklist[key] === "");
    if (pending) {
      window.alert(`Marque OK ou Anotações para «${pending.label}».`);
      return;
    }
    const semObs = primeiroLabelAnotacoesSemObservacao(inspectionChecklist, inspectionChecklistNotes);
    if (semObs) {
      setAvisoObservacaoItemLabel(semObs);
      return;
    }

    if (localizacaoViatura === "A Bordo") {
      rubricaModalIntentRef.current = "finalizeAbordo";
      setRubricaPadKey((k) => k + 1);
      setRubricaOpen(true);
      return;
    }

    rubricaModalIntentRef.current = "captureNaoAbordo";
    setRubricaPadKey((k) => k + 1);
    setRubricaOpen(true);
  }

  function finalizeVistoria(rubricaDataUrl: string | undefined) {
    if (!isViaturaLocalizacao(localizacaoViatura)) return;
    if (!isVistoriaCloudStateHydrated()) {
      window.alert("A sincronização de vistoria ainda está carregando. Aguarde alguns segundos e tente novamente.");
      return;
    }
    const motoristaRef = formMotorista.trim();
    const viaturaRef = formViatura.trim();
    if (!motoristaRef || !viaturaRef) return;
    const rubricaTrim = rubricaDataUrl?.trim() ? rubricaDataUrl : undefined;
    const createdAt = (() => {
      const parsed = parseIsoDate(selectedDate);
      return parsed ? parsed.getTime() : 0;
    })();
    const base: Omit<
      VistoriaInspection,
      | "rubrica"
      | "vistoriaAdministrativa"
      | "rubricaAdministrativa"
      | "prefillSourceInspectionId"
      | "prefillMotorista"
      | "prefillInspectionDate"
      | "itensAlteradosAdministracao"
      | "observacaoSegmentacaoAdmin"
    > = {
      id: newInspectionId(),
      motorista: motoristaRef,
      viatura: viaturaRef,
      inspectionDate: selectedDate,
      localizacaoViatura,
      checklist: inspectionChecklist,
      checklistNotes: inspectionChecklistNotes,
      createdAt,
      origemMobile: true,
    };
    let novo: VistoriaInspection;
    if (isAdminSession) {
      const snap = adminFormSnapshotRef.current;
      const itensAlterados: ChecklistKey[] = [];
      const observacaoSegmentacaoAdmin: Partial<Record<ChecklistKey, { plain: string; italic: string }>> = {};
      if (snap) {
        for (const { key } of CHECKLIST_ITEMS) {
          const clChanged = snap.checklist[key] !== inspectionChecklist[key];
          const ntChanged = (snap.notes[key] ?? "").trim() !== (inspectionChecklistNotes[key] ?? "").trim();
          if (clChanged || ntChanged) {
            itensAlterados.push(key);
            if (ntChanged) {
              observacaoSegmentacaoAdmin[key] = segmentarObservacaoAdmin(
                snap.notes[key] ?? "",
                inspectionChecklistNotes[key] ?? "",
              );
            }
          }
        }
      }
      const src = snap?.source ?? null;
      novo = {
        ...base,
        vistoriaAdministrativa: true,
        rubricaAdministrativa: rubricaTrim,
        prefillSourceInspectionId: src?.id,
        prefillMotorista: src?.motorista,
        prefillInspectionDate: src?.inspectionDate,
        itensAlteradosAdministracao: itensAlterados.length ? itensAlterados : undefined,
        observacaoSegmentacaoAdmin:
          Object.keys(observacaoSegmentacaoAdmin).length > 0 ? observacaoSegmentacaoAdmin : undefined,
      };
    } else {
      novo = { ...base, rubrica: rubricaTrim };
    }
    adminFormSnapshotRef.current = null;
    if (isAdminSession) {
      autoResolveCommonRedundanciesOnAdministrativeSave({
        inspections,
        viatura: viaturaRef,
        checklist: inspectionChecklist,
        notes: inspectionChecklistNotes,
      });
    } else {
      autoResolveAdministrativeRedundanciesOnCommonSave({
        inspections,
        viatura: viaturaRef,
        checklist: inspectionChecklist,
        notes: inspectionChecklistNotes,
      });
    }
    appendVistoriaInspection(novo);
    rubricaModalIntentRef.current = null;
    setRubricaOpen(false);
    setListRefresh((k) => k + 1);
    rubricaPadRef.current?.clearPad();
    setSaveSuccessOpen(true);
    if (successCloseTimerRef.current) window.clearTimeout(successCloseTimerRef.current);
    successCloseTimerRef.current = window.setTimeout(() => {
      successCloseTimerRef.current = null;
      setSaveSuccessOpen(false);
      onOpenChange(false);
    }, 2000);
  }

  function commitRubricaESalvar() {
    const intent = rubricaModalIntentRef.current;
    const drawn = rubricaPadRef.current?.getDataUrl() ?? "";

    if (intent === "finalizeAbordo") {
      if (!isViaturaLocalizacao(localizacaoViatura) || localizacaoViatura !== "A Bordo") {
        rubricaModalIntentRef.current = null;
        return;
      }
      const pend = CHECKLIST_ITEMS.find(({ key }) => inspectionChecklist[key] === "");
      if (pend) {
        window.alert(`Marque OK ou Anotações para «${pend.label}».`);
        return;
      }
      const semObs = primeiroLabelAnotacoesSemObservacao(inspectionChecklist, inspectionChecklistNotes);
      if (semObs) {
        setAvisoObservacaoItemLabel(semObs);
        return;
      }
      rubricaModalIntentRef.current = null;
      finalizeVistoria(drawn || undefined);
      return;
    }

    if (!isViaturaLocalizacao(localizacaoViatura)) {
      rubricaModalIntentRef.current = null;
      return;
    }
    if (localizacaoViatura === "A Bordo") {
      rubricaModalIntentRef.current = null;
      return;
    }

    const pend = CHECKLIST_ITEMS.find(({ key }) => inspectionChecklist[key] === "");
    if (pend) {
      window.alert(
        `Preencha o checklist no formulário e marque OK ou Anotações em «${pend.label}» antes de confirmar.`,
      );
      return;
    }
    const semObs = primeiroLabelAnotacoesSemObservacao(inspectionChecklist, inspectionChecklistNotes);
    if (semObs) {
      setAvisoObservacaoItemLabel(semObs);
      return;
    }

    rubricaModalIntentRef.current = null;
    finalizeVistoria(drawn || undefined);
  }

  if (!open) return null;

  const modalStackObscuresMain =
    rubricaOpen || Boolean(avisoObservacaoItemLabel) || Boolean(confirmOkClearsNote) || saveSuccessOpen;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[500] flex justify-center bg-black/50 px-3 backdrop-blur-[2px] min-[480px]:px-4",
          modalStackObscuresMain ? "pointer-events-none" : "pointer-events-auto",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={isAdminSession ? "Vistoria administrativa" : "Vistoria"}
        style={{
          paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))",
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        <div
          className="pointer-events-auto flex h-full min-h-0 w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-2xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-3 pb-2 pt-1 min-[480px]:px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              {isAdminSession ? "Vistoria administrativa" : "Vistoria"}
            </p>
            <h2 className="truncate text-lg font-bold">
              {view === "list"
                ? "Calendário e viaturas"
                : view === "adminViatura"
                  ? "Viatura da vistoria"
                  : "Preencher vistoria"}
            </h2>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm active:scale-[0.98]"
            aria-label="Fechar vistoria"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </button>
          </header>
          {!cloudHydrated ? (
            <div className="mx-3 mt-3 rounded-xl border border-amber-500/70 bg-amber-100/85 px-3 py-2 text-xs font-medium text-amber-900 min-[480px]:mx-4">
              Sincronizando dados de vistoria... aguarde para salvar com seguranca.
            </div>
          ) : null}

          {view === "list" ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3 min-[480px]:px-4">
            {!calendarReady ? (
              <div className="mb-4 rounded-2xl border border-[hsl(var(--primary))]/35 bg-[hsl(var(--primary))]/8 p-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-5 w-5 animate-spin rounded-full border-2 border-[hsl(var(--primary))]/25 border-t-[hsl(var(--primary))]"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      Carregando calendario da vistoria...
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Aguarde a sincronizacao para iniciar com seguranca.
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--primary))]/15">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-[hsl(var(--primary))]/55" />
                </div>
              </div>
            ) : null}
            <p className="mb-2 text-sm text-[hsl(var(--muted-foreground))]">Data da vistoria</p>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label="Dia anterior"
                disabled={!calendarReady}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm active:scale-[0.97]"
                onClick={() => setSelectedDate((d) => addDaysToIso(d, -1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                disabled={!calendarReady}
                value={vistoriaDatePtBr}
                onChange={(e) => {
                  const v = normalizeDatePtBr(e.target.value);
                  setVistoriaDatePtBr(v);
                  if (isCompleteDatePtBr(v)) {
                    const iso = ptBrToIsoDate(v);
                    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) setSelectedDate(iso);
                  }
                }}
                placeholder="dd/mm/aaaa"
                autoComplete="off"
                aria-label="Data da vistoria"
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-center text-base font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/50"
              />
              <button
                type="button"
                aria-label="Dia seguinte"
                disabled={!calendarReady}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm active:scale-[0.97]"
                onClick={() => setSelectedDate((d) => addDaysToIso(d, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <label className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm">
                <Calendar className="h-5 w-5" aria-hidden />
                <input
                  type="date"
                  disabled={!calendarReady}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value || selectedDate)}
                />
              </label>
            </div>

            <div className="mb-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/12 px-3 py-2.5">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                Motoristas e viaturas — {formatIsoDatePtBr(selectedDate)}
              </p>
              <p className="mt-1 text-xs leading-snug text-[hsl(var(--muted-foreground))]">
                Lista alinhada ao dia do filtro das Saídas. Mostra quem tem <strong>S</strong> no Detalhe de Serviço e
                viatura vinculada em Vistoria (computador).
              </p>
            </div>

            {bundleLoading ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">A carregar escala de serviço…</p>
            ) : !bundle ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Não foi possível carregar o Detalhe de Serviço. Abra o sistema principal uma vez para sincronizar.
              </p>
            ) : motoristasComSRelevantes.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Nenhum motorista com <strong>S</strong> nesta data e com viatura em Responsabilidade de Vistoria.
              </p>
            ) : (
              <ul className="space-y-3" role="list">
                {motoristasComSRelevantes.map((motorista) => {
                  const vtrs = resolveViaturasParaMotoristaEscala(motorista, viaturasPorMotorista);
                  return (
                    <li
                      key={motorista}
                      className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 p-3 shadow-sm"
                    >
                      <p className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">{motorista}</p>
                      <div className="flex flex-wrap gap-2">
                        {vtrs.map((viatura) => {
                          const ok = inspectionFeitaPara(motorista, viatura);
                          return (
                            <button
                              key={`${motorista}-${viatura}`}
                              type="button"
                              className={
                                ok
                                  ? "min-h-11 rounded-xl border border-emerald-600/90 bg-emerald-500 px-3 py-2 text-sm font-semibold text-white active:scale-[0.98]"
                                  : "min-h-11 rounded-xl border border-red-600/90 bg-red-500 px-3 py-2 text-sm font-semibold text-white active:scale-[0.98]"
                              }
                              onClick={() => openForm(motorista, viatura)}
                            >
                              {viatura}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
              Viaturas em verde já têm vistoria guardada para {formatIsoDatePtBr(selectedDate)}. Toque para abrir o
              formulário.
            </p>
          </div>
          ) : view === "adminViatura" ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3 min-[480px]:px-4">
            <p className="mb-3 text-sm leading-snug text-[hsl(var(--muted-foreground))]">
              Vistoria avulsa: não exige <strong>S</strong> no Detalhe de Serviço. Escolha a viatura e abra o
              formulário para o vistoriador indicado.
            </p>
            <div className="mb-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/12 px-3 py-2.5">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                Vistoriador: {administrativeVistoriadorMotorista?.trim() ?? "—"}
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Data da vistoria: {formatIsoDatePtBr(selectedDate)} (alinhada ao filtro das Saídas).
              </p>
            </div>
            <label className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]">Viatura</label>
            <select
              className="mb-3 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
              value={adminViaturaDraft}
              onChange={(e) => setAdminViaturaDraft(e.target.value)}
              aria-label="Viatura da vistoria administrativa"
            >
              <option value="">— Selecionar viatura —</option>
              {viaturasCatalogo.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {viaturasSugeridasAdmin.length > 0 ? (
              <p className="mb-4 text-xs leading-snug text-[hsl(var(--muted-foreground))]">
                Viaturas associadas em Responsabilidade de Vistoria (computador):{" "}
                <span className="font-medium text-[hsl(var(--foreground))]">{viaturasSugeridasAdmin.join(", ")}</span>
              </p>
            ) : (
              <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
                Nenhuma viatura vinculada a este nome nas atribuições — escolha no catálogo acima.
              </p>
            )}
            <Button
              type="button"
              className="min-h-12 w-full rounded-xl text-base font-semibold"
              onClick={abrirFormularioAdministrativo}
            >
              Abrir formulário
            </Button>
          </div>
          ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2 min-[480px]:px-4">
            <button
              type="button"
              className="mb-3 text-sm font-medium text-[hsl(var(--primary))] underline-offset-2 active:underline"
              onClick={() => setView(isAdminSession ? "adminViatura" : "list")}
            >
              {isAdminSession ? "← Voltar" : "← Voltar à lista"}
            </button>
            <div className="mb-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/15 p-3 text-sm">
              <p>
                <span className="font-semibold">Data:</span> {formatIsoDatePtBr(selectedDate)}
              </p>
              <p>
                <span className="font-semibold">Motorista:</span> {formMotorista}
              </p>
              <p>
                <span className="font-semibold">Viatura:</span> {formViatura}
              </p>
            </div>

            <div className="mb-4 space-y-2 rounded-2xl border border-[hsl(var(--border))] p-3">
              <p className="text-sm font-medium">Localização da Viatura</p>
              <div className="flex flex-wrap gap-4">
                {VIATURA_LOCALIZACAO_OPCOES.map((opt) => (
                  <label key={opt} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="mobile-vistoria-localizacao"
                      checked={localizacaoViatura === opt}
                      onChange={() => handleLocalizacaoChange(opt)}
                      className="h-5 w-5 accent-[hsl(var(--primary))]"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <p className="mb-2 text-sm font-medium">Checklist</p>
            <div className="space-y-3 pb-2">
              {CHECKLIST_ITEMS.map((item) => (
                <div
                  key={item.key}
                  className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 p-3"
                >
                  <p className="mb-2 text-sm font-medium">{item.label}</p>
                  <div
                    className="mb-2 flex flex-wrap gap-4"
                    role="radiogroup"
                    aria-label={`${item.label}: OK ou Anotações`}
                  >
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`mobile-vistoria-${item.key}`}
                        checked={inspectionChecklist[item.key] === "OK"}
                        onChange={() => handleSelectChecklistOk(item.key, item.label)}
                        className="h-5 w-5 accent-[hsl(var(--primary))]"
                      />
                      OK
                    </label>
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`mobile-vistoria-${item.key}`}
                        checked={inspectionChecklist[item.key] === "Alterações"}
                        onChange={() =>
                          setInspectionChecklist((prev) => ({
                            ...prev,
                            [item.key]: "Alterações",
                          }))
                        }
                        className="h-5 w-5 accent-[hsl(var(--primary))]"
                      />
                      Anotações
                    </label>
                  </div>
                  <label className="block text-xs text-[hsl(var(--muted-foreground))]">Observações do item</label>
                  <input
                    type="text"
                    enterKeyHint="next"
                    autoComplete="off"
                    value={inspectionChecklistNotes[item.key]}
                    onChange={(e) =>
                      setInspectionChecklistNotes((prev) => ({
                        ...prev,
                        [item.key]: e.target.value,
                      }))
                    }
                    disabled={inspectionChecklist[item.key] === "OK"}
                    placeholder="Opcional"
                    className="mt-1 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
            </div>

            <div
              className="flex shrink-0 gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 px-3 py-3 backdrop-blur-md min-[480px]:px-4"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
            >
              <Button
                type="button"
                className={`min-h-12 flex-1 rounded-xl text-base font-semibold ${
                  isAdminSession
                    ? "border border-red-600/90 bg-red-500 text-white"
                    : "border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                }`}
                onClick={() => setView(isAdminSession ? "adminViatura" : "list")}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className={`min-h-12 flex-1 rounded-xl text-base font-semibold ${
                  isAdminSession
                    ? "border border-emerald-600/90 bg-emerald-500 text-white"
                    : ""
                } ${!cloudHydrated ? "cursor-not-allowed opacity-60" : ""}`}
                onClick={handlePedirSalvar}
                disabled={!cloudHydrated}
              >
                Salvar vistoria
              </Button>
            </div>
          </div>
          )}
        </div>
      </div>

      {rubricaOpen ? (
        <div
          className={`${MOBILE_MODAL_OVERLAY_CLASS} z-[550]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={rubricaTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeRubricaModalSemConfirmar();
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) closeRubricaModalSemConfirmar();
          }}
        >
          <div
            className="max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={rubricaTitleId} className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              Rubrica
            </h2>
            <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
              Na imagem guardada, o nome do motorista fica por baixo da linha; desenhe a rubrica na área branca. Confirmar grava
              a vistoria e regressa ao ecrã inicial. Preencha o checklist antes de confirmar (em «Na Oficina» ou
              «Destacada», use «Voltar ao formulário» se ainda faltar o checklist). Pode deixar o traço em branco se não
              for necessário.
            </p>
            <div className="flex h-[min(40vh,280px)] w-full min-h-[200px] touch-none flex-col">
              <RubricaSignaturePad
                ref={rubricaPadRef}
                key={rubricaPadKey}
                motoristaLabel={formMotorista.trim()}
                className="h-full min-h-0 w-full"
              />
            </div>
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="flex w-full max-w-sm justify-center gap-2">
                <Button
                  type="button"
                  className="min-h-11 w-[48%] rounded-xl border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))]"
                  onClick={() => rubricaPadRef.current?.clearPad()}
                >
                  Limpar
                </Button>
                <Button
                  type="button"
                  className="min-h-11 w-[48%] rounded-xl border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))]"
                  onClick={closeRubricaModalSemConfirmar}
                >
                  Voltar ao formulário
                </Button>
              </div>
              <Button
                type="button"
                className="min-h-11 w-full rounded-xl border border-emerald-600/90 bg-emerald-500 font-semibold text-white"
                onClick={commitRubricaESalvar}
              >
                Confirmar e guardar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {avisoObservacaoItemLabel ? (
        <div
          className={`${MOBILE_MODAL_OVERLAY_CLASS} z-[560]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={avisoObservacaoTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAvisoObservacaoItemLabel(null);
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) setAvisoObservacaoItemLabel(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={avisoObservacaoTitleId} className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              Observações em falta
            </h2>
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
              O item «{avisoObservacaoItemLabel}» está em <strong>Anotações</strong>. Preencha o campo{" "}
              <strong>Observações do item</strong> com o detalhe necessário antes de continuar.
            </p>
            <Button
              type="button"
              className="min-h-11 w-full rounded-xl border border-[hsl(var(--primary))] bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))]"
              onClick={() => setAvisoObservacaoItemLabel(null)}
            >
              Entendi
            </Button>
          </div>
        </div>
      ) : null}
      {confirmOkClearsNote ? (
        <div
          className={`${MOBILE_MODAL_OVERLAY_CLASS} z-[565]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={confirmOkClearsNoteTitleId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOkClearsNote(null);
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) setConfirmOkClearsNote(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={confirmOkClearsNoteTitleId} className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              Aviso
            </h2>
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
              Ao marcar <strong>OK</strong> no item «{confirmOkClearsNote.label}», o conteúdo que introduziu em{" "}
              <strong>Observações do item</strong> será apagado. Deseja continuar?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="min-h-11 w-full rounded-xl border-2 border-emerald-700 bg-emerald-500 px-4 text-base font-semibold text-white shadow-sm active:bg-emerald-700"
                style={{ WebkitTapHighlightColor: "transparent" }}
                onClick={() => setConfirmOkClearsNote(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="min-h-11 w-full rounded-xl border-2 border-red-700 bg-red-500 px-4 text-base font-semibold text-white shadow-sm active:bg-red-700"
                style={{ WebkitTapHighlightColor: "transparent" }}
                onClick={confirmProceedOkClearsNote}
              >
                Continuar e apagar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {saveSuccessOpen ? (
        <div
          className={`${MOBILE_MODAL_OVERLAY_CLASS} z-[570]`}
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[hsl(var(--primary))] bg-[hsl(var(--card))] p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
              Vistoria salva com sucesso
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              A vistoria foi registrada e já está disponível na tabela <strong>Situação das VTR</strong>.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
