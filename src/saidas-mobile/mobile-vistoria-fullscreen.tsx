import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isCompleteDatePtBr, ptBrToIsoDate } from "../lib/dateFormat";
import { listMotoristasComServicoOuRotinaNoDia } from "../lib/detalheServicoDayMarkers";
import { loadDetalheServicoBundleFromIdb, type DetalheServicoBundle } from "../lib/detalheServicoBundle";
import {
  appendVistoriaInspection,
  CHECKLIST_ITEMS,
  emptyChecklist,
  emptyChecklistNotes,
  formatIsoDatePtBr,
  type InspectionAnswer,
  isoDateFromDate,
  nomesMotoristaVistoriaEquivalentes,
  normalizeDriverKey,
  parseIsoDate,
  resolveViaturasParaMotoristaEscala,
  readVistoriaAssignments,
  readVistoriaInspections,
  type VistoriaChecklist,
  type VistoriaChecklistNotes,
  type VistoriaInspection,
} from "../lib/vistoriaInspectionShared";
import { Button } from "../components/ui/button";
import { useSaidasMobileFilterDate } from "./saidas-mobile-filter-date-context";
import { MOBILE_MODAL_OVERLAY_CLASS } from "./mobileModalOverlayClass";
import { RubricaSignaturePad, type RubricaSignaturePadHandle } from "./rubrica-signature-pad";

function addDaysToIso(iso: string, delta: number): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + delta);
  return isoDateFromDate(d);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Vista mobile (Android/iOS): fluxo alinhado à aba Vistoriar — dia, viaturas com S + responsabilidade,
 * formulário e rubrica ao gravar.
 */
export function MobileVistoriaFullscreen({ open, onOpenChange }: Props) {
  const { filterDatePtBr } = useSaidasMobileFilterDate();
  const [view, setView] = useState<"list" | "form">("list");
  const [listRefresh, setListRefresh] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => isoDateFromDate(new Date()));
  const [rubricaPadKey, setRubricaPadKey] = useState(0);
  const [bundle, setBundle] = useState<DetalheServicoBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);

  const [formMotorista, setFormMotorista] = useState("");
  const [formViatura, setFormViatura] = useState("");
  const [inspectionAnswer, setInspectionAnswer] = useState<InspectionAnswer | "">("");
  const [inspectionChecklist, setInspectionChecklist] = useState<VistoriaChecklist>(() => emptyChecklist());
  const [inspectionChecklistNotes, setInspectionChecklistNotes] = useState<VistoriaChecklistNotes>(() =>
    emptyChecklistNotes(),
  );

  const [rubricaOpen, setRubricaOpen] = useState(false);
  const rubricaPadRef = useRef<RubricaSignaturePadHandle>(null);
  const rubricaTitleId = useId();

  const assignments = useMemo(() => (open ? readVistoriaAssignments() : []), [open, listRefresh]);
  const inspections = useMemo(() => (open ? readVistoriaInspections() : []), [open, listRefresh]);

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
    if (!open) {
      setView("list");
      setRubricaOpen(false);
      return;
    }
    setListRefresh((k) => k + 1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBundleLoading(true);
    void loadDetalheServicoBundleFromIdb().then((b) => {
      if (cancelled) return;
      setBundle(b);
      setBundleLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function inspectionFeitaPara(motorista: string, viatura: string): boolean {
    return inspections.some(
      (i) =>
        i.inspectionDate === selectedDate &&
        nomesMotoristaVistoriaEquivalentes(i.motorista, motorista) &&
        i.viatura.trim() === viatura.trim(),
    );
  }

  function openForm(motorista: string, viatura: string) {
    setFormMotorista(motorista);
    setFormViatura(viatura);
    const existing = inspections
      .filter(
        (i) =>
          nomesMotoristaVistoriaEquivalentes(i.motorista, motorista) && i.viatura.trim() === viatura.trim(),
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    setInspectionAnswer(existing?.viaturaNaOficina ?? "");
    setInspectionChecklist(existing?.checklist ?? emptyChecklist());
    setInspectionChecklistNotes(existing?.checklistNotes ?? emptyChecklistNotes());
    setView("form");
  }

  function handlePedirSalvar() {
    if (inspectionAnswer !== "Sim" && inspectionAnswer !== "Não") {
      window.alert("Marque Sim ou Não em «Viatura na Oficina?».");
      return;
    }
    const pending = CHECKLIST_ITEMS.find(({ key }) => inspectionChecklist[key] === "");
    if (pending) {
      window.alert(`Marque OK ou Alterações para «${pending.label}».`);
      return;
    }
    setRubricaPadKey((k) => k + 1);
    setRubricaOpen(true);
  }

  function commitRubricaESalvar() {
    const drawn = rubricaPadRef.current?.getDataUrl() ?? "";
    const novo: VistoriaInspection = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      motorista: formMotorista,
      viatura: formViatura,
      inspectionDate: selectedDate,
      viaturaNaOficina: inspectionAnswer as InspectionAnswer,
      checklist: inspectionChecklist,
      checklistNotes: inspectionChecklistNotes,
      createdAt: Date.now(),
      rubrica: drawn.trim() ? drawn : undefined,
    };
    appendVistoriaInspection(novo);
    setRubricaOpen(false);
    setView("list");
    setListRefresh((k) => k + 1);
    rubricaPadRef.current?.clearPad();
  }

  if (!open) return null;

  return (
    <>
      <div
        className="pointer-events-auto fixed inset-0 z-[500] flex justify-center bg-black/50 px-3 backdrop-blur-[2px] min-[480px]:px-4"
        role="dialog"
        aria-modal="true"
        aria-label="Vistoria"
        style={{
          paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))",
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        <div
          className="flex h-full min-h-0 w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-2xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-3 pb-2 pt-1 min-[480px]:px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Vistoria
            </p>
            <h2 className="truncate text-lg font-bold">
              {view === "list" ? "Calendário e viaturas" : "Preencher vistoria"}
            </h2>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 active:scale-[0.98]"
            aria-label="Fechar vistoria"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </button>
          </header>

          {view === "list" ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3 min-[480px]:px-4">
            <p className="mb-2 text-sm text-[hsl(var(--muted-foreground))]">Data da vistoria</p>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label="Dia anterior"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 active:scale-[0.97]"
                onClick={() => setSelectedDate((d) => addDaysToIso(d, -1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || selectedDate)}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-center text-base font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/50"
              />
              <button
                type="button"
                aria-label="Dia seguinte"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 active:scale-[0.97]"
                onClick={() => setSelectedDate((d) => addDaysToIso(d, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <label className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]">
                <Calendar className="h-5 w-5" aria-hidden />
                <input
                  type="date"
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
          ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2 min-[480px]:px-4">
            <button
              type="button"
              className="mb-3 text-sm font-medium text-[hsl(var(--primary))] underline-offset-2 active:underline"
              onClick={() => setView("list")}
            >
              ← Voltar à lista
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
              <p className="text-sm font-medium">Viatura na Oficina?</p>
              <div className="flex flex-wrap gap-4">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mobile-vistoria-oficina"
                    checked={inspectionAnswer === "Sim"}
                    onChange={() => setInspectionAnswer("Sim")}
                    className="h-5 w-5 accent-[hsl(var(--primary))]"
                  />
                  Sim
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mobile-vistoria-oficina"
                    checked={inspectionAnswer === "Não"}
                    onChange={() => setInspectionAnswer("Não")}
                    className="h-5 w-5 accent-[hsl(var(--primary))]"
                  />
                  Não
                </label>
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
                  <div className="mb-2 flex flex-wrap gap-4">
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`mobile-vistoria-${item.key}`}
                        checked={inspectionChecklist[item.key] === "OK"}
                        onChange={() =>
                          setInspectionChecklist((prev) => ({
                            ...prev,
                            [item.key]: "OK",
                          }))
                        }
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
                      Alterações
                    </label>
                  </div>
                  <label className="block text-xs text-[hsl(var(--muted-foreground))]">Observações</label>
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
                    placeholder="Opcional"
                    className="mt-1 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base text-[hsl(var(--foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
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
                variant="outline"
                className="min-h-12 flex-1 rounded-xl text-base font-medium"
                onClick={() => setView("list")}
              >
                Cancelar
              </Button>
              <Button type="button" className="min-h-12 flex-1 rounded-xl text-base font-semibold" onClick={handlePedirSalvar}>
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
            if (e.target === e.currentTarget) setRubricaOpen(false);
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) setRubricaOpen(false);
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
              Desenhe a rubrica com o dedo no ecrã (Android/iOS). Pode deixar em branco e confirmar se não for necessário
              desenho.
            </p>
            <div className="h-[min(40vh,280px)] w-full min-h-[200px] touch-none">
              <RubricaSignaturePad ref={rubricaPadRef} key={rubricaPadKey} />
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() => rubricaPadRef.current?.clearPad()}
              >
                Limpar
              </Button>
              <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => setRubricaOpen(false)}>
                Voltar ao formulário
              </Button>
              <Button type="button" className="min-h-11 rounded-xl font-semibold" onClick={commitRubricaESalvar}>
                Confirmar e guardar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
