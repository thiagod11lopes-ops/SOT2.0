import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Settings2, Trash2, X } from "lucide-react";
import { useCatalogItems } from "../context/catalog-items-context";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { isoDateToPtBr } from "../lib/dateFormat";
import { cn } from "../lib/utils";
import {
  clampRdvPdfLayout,
  DEFAULT_RDV_PDF_LAYOUT,
  getRdvPdfContentOffsetXMmBounds,
  getRdvPdfContentOffsetYMmBounds,
  RDV_PDF_MARGIN_MM_MAX,
  RDV_PDF_MARGIN_MM_MIN,
  type RelatorioDiarioViaturasPdfLayoutOptions,
} from "../lib/relatorioDiarioViaturasPdfLayout";
import type { RdvPdfPage1PreviewResult } from "../lib/relatorioDiarioViaturasPdf";
import {
  countResumoSituacao,
  emptyAdmRow,
  emptyAmbRow,
  RDV_STATUS_OPTIONS,
  type RdvRowAdm,
  type RdvRowAmb,
  type RdvStatus,
  weekdayPtBrFromIsoDate,
} from "../lib/relatorioDiarioViaturasModel";
import {
  isoDateFromDate,
  loadRdvDay,
  loadRdvDayForEdit,
  markRdvPdfSaved,
  persistRdvDraft,
  RDV_STORAGE_EVENT,
  replicateRdvContentToFutureDates,
} from "../lib/relatorioDiarioViaturasStorage";

function clearCarroQuebradoHash() {
  window.location.hash = "";
}

function goToRdvCalendar() {
  window.location.hash = "#/carro-quebrado";
}

/** Primeiro dia civil estritamente depois de `yyyy-mm-dd` (meio-dia local evita DST). */
function dateAfterReportIso(iso: string): Date {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const f = new Date();
    f.setDate(f.getDate() + 1);
    return f;
  }
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    const f = new Date();
    f.setDate(f.getDate() + 1);
    return f;
  }
  d.setDate(d.getDate() + 1);
  if (Number.isNaN(d.getTime())) {
    const f = new Date();
    f.setDate(f.getDate() + 1);
    return f;
  }
  return d;
}

const PT_BR_MONTH_ABBR = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
] as const;

function joinDaysLabel(days: number[]): string {
  if (days.length <= 1) return String(days[0] ?? "");
  if (days.length === 2) return `${days[0]} e ${days[1]}`;
  return `${days.slice(0, -1).join(",")} e ${days[days.length - 1]}`;
}

function monthAbbr(month: number): string {
  const m = Math.trunc(month);
  if (m < 1 || m > 12) return "MES";
  return PT_BR_MONTH_ABBR[m - 1];
}

/** Uma data: 18ABR2026; várias no mesmo mês: 18,19 e 20ABR2026; meses diferentes: DDMMMYYYY_DDMMMYYYY. */
function formatMergedPdfFilenameLabel(isos: string[]): string {
  const parsed = isos
    .map((iso) => {
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      return {
        year: Number.parseInt(m[1], 10),
        month: Number.parseInt(m[2], 10),
        day: Number.parseInt(m[3], 10),
      };
    })
    .filter((x): x is { year: number; month: number; day: number } => x !== null);

  if (parsed.length === 0) return "SemData";
  if (parsed.length === 1) {
    const p = parsed[0];
    return `${p.day}${monthAbbr(p.month)}${p.year}`;
  }

  const first = parsed[0];
  const sameMonthYear = parsed.every((x) => x.year === first.year && x.month === first.month);
  if (sameMonthYear) {
    return `${joinDaysLabel(parsed.map((x) => x.day))}${monthAbbr(first.month)}${first.year}`;
  }

  return parsed.map((x) => `${x.day}${monthAbbr(x.month)}${x.year}`).join("_");
}

/** Cores só em hex/rgb — evita oklch no html2canvas ao gerar PDF. */
const tableFrame = cn(
  "w-full border-collapse border border-[#0f172a] text-[9pt]",
  "[&_th]:border [&_td]:border [&_th]:border-[#0f172a] [&_td]:border-[#0f172a]",
  "[&_th]:bg-[rgba(226,240,217,0.9)] [&_th]:p-1 [&_td]:p-1",
);

const sectionBar = cn(
  "rdv-section-bar",
  "mt-4 border border-b-0 border-[#0f172a] bg-[#e2f0d9] px-2 py-1 text-left text-[9pt] font-bold",
);

/** Largura mínima da coluna OBSERVAÇÃO (ambulâncias e administrativas). */
const rdvObsColMinAmb = "min-w-[13.2rem] w-[13.2rem]";
const rdvOficinaCol = "w-[3.5rem] min-w-[3.5rem] text-center align-middle";

/** Remove fundos com `hsl(var(--muted))` dos componentes de tabela (oklch no tema). */
const rdvTableHeaderClass =
  "!border-0 !border-b-0 !bg-transparent [&_tr]:!bg-transparent [&_tr:hover]:!bg-transparent";
const rdvTableBodyClass =
  "[&_tr:nth-child(odd)]:!bg-white [&_tr:nth-child(even)]:!bg-[#f1f5f9] [&_tr:hover]:!bg-inherit";
const rdvTableRowClass = "hover:!bg-inherit";

const cellInput = cn(
  "w-full min-w-0 border-0 bg-transparent p-0.5 text-center text-[9pt] text-inherit outline-none",
  "focus:ring-1 focus:ring-[#3b82f6]/50",
);

const cellInputLeft = cn(cellInput, "text-left");

function situacaoCellClass(s: RdvStatus): string {
  if (s === "Operando") return "font-bold text-[#15803d]";
  if (s === "Inoperante") return "font-bold text-[#dc2626]";
  if (s === "Destacada") return "font-bold text-[#2563eb]";
  return "";
}

function parseNonNegativeInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

/** Placas únicas do catálogo (ordem alfabética, ignora maiúsculas na deduplicação). */
function rdvSortedPlacasUnique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const p = raw.trim();
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  out.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return out;
}

/** Opções do `<select>`: catálogo + valor da linha se ainda não existir no catálogo (mantém dados antigos). */
function rdvPlacaSelectOptions(catalogSorted: string[], rowPlaca: string): string[] {
  const cur = rowPlaca.trim();
  if (!cur) return catalogSorted;
  if (catalogSorted.some((p) => p.toLowerCase() === cur.toLowerCase())) return catalogSorted;
  return [rowPlaca.trim(), ...catalogSorted];
}

/** Valor controlado: usa a grafia do catálogo quando há equivalência sem diferenciar maiúsculas. */
function rdvPlacaSelectValue(rowPlaca: string, catalogSorted: string[]): string {
  const cur = rowPlaca.trim();
  if (!cur) return "";
  const hit = catalogSorted.find((p) => p.toLowerCase() === cur.toLowerCase());
  return hit ?? cur;
}

export type RelatorioDiarioViaturasPageProps = {
  initialReportDate: string;
};

function RdvDiagonalTarja({ salva }: { salva: boolean }) {
  return (
    <div
      className="rdv-no-pdf pointer-events-none absolute inset-0 z-[6] flex items-center justify-center overflow-hidden select-none"
      aria-hidden
    >
      <span
        className={cn(
          "-rotate-[24deg] whitespace-nowrap text-[clamp(1.25rem,5vw,2.75rem)] font-black uppercase tracking-[0.42em]",
          salva ? "text-emerald-600/20" : "text-rose-600/20",
        )}
      >
        {salva ? "SALVO" : "PENDENTE"}
      </span>
    </div>
  );
}

function RdvTableTarjaShell({ salva, children }: { salva: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <RdvDiagonalTarja salva={salva} />
    </div>
  );
}

export function RelatorioDiarioViaturasPage({ initialReportDate }: RelatorioDiarioViaturasPageProps) {
  const assinaturaSelectId = useId();
  const { items: catalogItems } = useCatalogItems();
  const motoristasCadastrados = useMemo(
    () => catalogItems.motoristas.map((m) => m.trim()).filter(Boolean),
    [catalogItems.motoristas],
  );

  const placasAmbulanciasCatalogo = useMemo(
    () => rdvSortedPlacasUnique(catalogItems.ambulancias),
    [catalogItems.ambulancias],
  );
  const placasAdministrativasCatalogo = useMemo(
    () => rdvSortedPlacasUnique(catalogItems.viaturasAdministrativas),
    [catalogItems.viaturasAdministrativas],
  );

  const [reportDate, setReportDate] = useState(initialReportDate);
  const [rdvInitial] = useState(() => loadRdvDayForEdit(initialReportDate));
  const [rowsAmb, setRowsAmb] = useState<RdvRowAmb[]>(() => rdvInitial.data.rowsAmb);
  const [rowsAdm, setRowsAdm] = useState<RdvRowAdm[]>(() => rdvInitial.data.rowsAdm);

  /** Nome na linha de assinatura do relatório (escolhido no select «Assinar»). */
  const [assinaturaNome, setAssinaturaNome] = useState(() => rdvInitial.data.assinaturaNome);

  useEffect(() => {
    if (assinaturaNome && !motoristasCadastrados.includes(assinaturaNome)) {
      setAssinaturaNome("");
    }
  }, [motoristasCadastrados, assinaturaNome]);

  const diaSemana = useMemo(() => weekdayPtBrFromIsoDate(reportDate), [reportDate]);

  const [efetivoAmb, setEfetivoAmb] = useState(() => rdvInitial.data.efetivoAmb);
  const [efetivoAdm, setEfetivoAdm] = useState(() => rdvInitial.data.efetivoAdm);
  const [resumoUti, setResumoUti] = useState(() => rdvInitial.data.resumoUti);
  const [resumoUsb, setResumoUsb] = useState(() => rdvInitial.data.resumoUsb);

  /** `true` após «Gerar PDF» com sucesso; controla tarja SALVO / PENDENTE. */
  const [pdfSalvo, setPdfSalvo] = useState(() => rdvInitial.data.pdfSalvo);

  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    const { data, filledFromPreviousIso } = loadRdvDayForEdit(reportDate);
    setRowsAmb(data.rowsAmb);
    setRowsAdm(data.rowsAdm);
    setAssinaturaNome(data.assinaturaNome);
    setEfetivoAmb(data.efetivoAmb);
    setEfetivoAdm(data.efetivoAdm);
    setResumoUti(data.resumoUti);
    setResumoUsb(data.resumoUsb);
    setPdfSalvo(data.pdfSalvo);
    skipNextPersistRef.current = true;
    if (filledFromPreviousIso) {
      persistRdvDraft(reportDate, {
        rowsAmb: data.rowsAmb,
        rowsAdm: data.rowsAdm,
        assinaturaNome: data.assinaturaNome,
        efetivoAmb: data.efetivoAmb,
        efetivoAdm: data.efetivoAdm,
        resumoUti: data.resumoUti,
        resumoUsb: data.resumoUsb,
        pdfSalvo: false,
      });
    }
  }, [reportDate]);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      persistRdvDraft(reportDate, {
        rowsAmb,
        rowsAdm,
        assinaturaNome,
        efetivoAmb,
        efetivoAdm,
        resumoUti,
        resumoUsb,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [reportDate, rowsAmb, rowsAdm, assinaturaNome, efetivoAmb, efetivoAdm, resumoUti, resumoUsb]);

  useEffect(() => {
    const onStorage = () => setPdfSalvo(loadRdvDay(reportDate).pdfSalvo);
    window.addEventListener(RDV_STORAGE_EVENT, onStorage);
    return () => window.removeEventListener(RDV_STORAGE_EVENT, onStorage);
  }, [reportDate]);

  const pdfRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfPreGerarOpen, setPdfPreGerarOpen] = useState(false);
  const [pdfReplicateOpen, setPdfReplicateOpen] = useState(false);
  const [replicateMonth, setReplicateMonth] = useState(() => dateAfterReportIso(initialReportDate));
  const [replicateSelected, setReplicateSelected] = useState<Date[] | undefined>(undefined);
  const [pdfLayout, setPdfLayout] = useState<RelatorioDiarioViaturasPdfLayoutOptions>(() => ({
    ...DEFAULT_RDV_PDF_LAYOUT,
  }));
  const [pdfConfigOpen, setPdfConfigOpen] = useState(false);
  const [pdfLayoutDraft, setPdfLayoutDraft] = useState<RelatorioDiarioViaturasPdfLayoutOptions>(() => ({
    ...DEFAULT_RDV_PDF_LAYOUT,
  }));

  const [pdfPreview, setPdfPreview] = useState<RdvPdfPage1PreviewResult | null>(null);
  const [pdfPreviewBusy, setPdfPreviewBusy] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);

  const pdfLayoutDraftKey = useMemo(
    () => JSON.stringify(pdfLayoutDraft),
    [
      pdfLayoutDraft.marginMm,
      pdfLayoutDraft.imageWidthPercent,
      pdfLayoutDraft.html2canvasScale,
      pdfLayoutDraft.tableContentScale,
      pdfLayoutDraft.signatureFontPt,
      pdfLayoutDraft.signatureMarginScale,
      pdfLayoutDraft.contentOffsetXMm,
      pdfLayoutDraft.contentOffsetYMm,
      pdfLayoutDraft.mainTitleOffsetMm,
    ],
  );

  const rdvPdfPreviewDigest = useMemo(
    () =>
      JSON.stringify({
        reportDate,
        assinaturaNome,
        efetivoAmb,
        efetivoAdm,
        resumoUti,
        resumoUsb,
        rowsAmb,
        rowsAdm,
      }),
    [
      reportDate,
      assinaturaNome,
      efetivoAmb,
      efetivoAdm,
      resumoUti,
      resumoUsb,
      rowsAmb,
      rowsAdm,
    ],
  );

  const pdfPreviewPaper = useMemo(() => {
    const g = clampRdvPdfLayout(pdfLayoutDraft);
    const paperW = 220;
    const paperH = paperW * (297 / 210);
    return {
      g,
      paperW,
      paperH,
      mX: paperW * (g.marginMm / 210),
      mY: paperH * (g.marginMm / 297),
    };
  }, [pdfLayoutDraftKey]);

  const pdfContentOffsetXBounds = useMemo(
    () =>
      getRdvPdfContentOffsetXMmBounds({
        marginMm: pdfLayoutDraft.marginMm,
        imageWidthPercent: pdfLayoutDraft.imageWidthPercent,
      }),
    [pdfLayoutDraft.marginMm, pdfLayoutDraft.imageWidthPercent],
  );

  const pdfContentOffsetYBounds = useMemo(
    () => getRdvPdfContentOffsetYMmBounds(pdfLayoutDraft.marginMm),
    [pdfLayoutDraft.marginMm],
  );

  useEffect(() => {
    setPdfLayoutDraft((d) => {
      const c = Math.min(pdfContentOffsetXBounds.max, Math.max(pdfContentOffsetXBounds.min, d.contentOffsetXMm));
      return c === d.contentOffsetXMm ? d : { ...d, contentOffsetXMm: c };
    });
  }, [pdfContentOffsetXBounds.min, pdfContentOffsetXBounds.max]);

  useEffect(() => {
    setPdfLayoutDraft((d) => {
      const c = Math.min(pdfContentOffsetYBounds.max, Math.max(pdfContentOffsetYBounds.min, d.contentOffsetYMm));
      return c === d.contentOffsetYMm ? d : { ...d, contentOffsetYMm: c };
    });
  }, [pdfContentOffsetYBounds.min, pdfContentOffsetYBounds.max]);

  useEffect(() => {
    if (!pdfConfigOpen) {
      setPdfPreview(null);
      setPdfPreviewError(null);
      setPdfPreviewBusy(false);
      return;
    }

    const el = pdfRef.current;
    if (!el) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
        void (async () => {
        setPdfPreviewBusy(true);
        setPdfPreviewError(null);
        try {
          const { buildRelatorioDiarioViaturasPdfPage1Preview } = await import("../lib/relatorioDiarioViaturasPdf");
          const frame = await buildRelatorioDiarioViaturasPdfPage1Preview(el, clampRdvPdfLayout(pdfLayoutDraft));
          if (!cancelled) setPdfPreview(frame);
        } catch (e) {
          if (!cancelled) {
            setPdfPreview(null);
            setPdfPreviewError(e instanceof Error ? e.message : "Falha na pré-visualização.");
          }
        } finally {
          if (!cancelled) setPdfPreviewBusy(false);
        }
      })();
    }, 380);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pdfConfigOpen, pdfLayoutDraftKey, rdvPdfPreviewDigest]);

  const countAmb = useMemo(() => countResumoSituacao(rowsAmb), [rowsAmb]);
  const countAdm = useMemo(() => countResumoSituacao(rowsAdm), [rowsAdm]);

  const totalOperando = countAmb.Operando + countAdm.Operando;
  const totalInoperante = countAmb.Inoperante + countAdm.Inoperante;
  const totalDestacada = countAmb.Destacada + countAdm.Destacada;
  const efetivoTotal = efetivoAmb + efetivoAdm;

  function patchAmb(id: string, patch: Partial<RdvRowAmb>) {
    setRowsAmb((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function patchAdm(id: string, patch: Partial<RdvRowAdm>) {
    setRowsAdm((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeAmb(id: string) {
    setRowsAmb((prev) => prev.filter((r) => r.id !== id));
  }

  function removeAdm(id: string) {
    setRowsAdm((prev) => prev.filter((r) => r.id !== id));
  }

  useEffect(() => {
    if (!pdfPreGerarOpen && !pdfReplicateOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPdfPreGerarOpen(false);
      setPdfReplicateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pdfPreGerarOpen, pdfReplicateOpen]);

  function uniqueSortedRdvIsos(isos: string[]): string[] {
    return [...new Set(isos.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
  }

  function draftForPdfMark(iso: string) {
    if (iso === reportDate) {
      return {
        rowsAmb,
        rowsAdm,
        assinaturaNome,
        efetivoAmb,
        efetivoAdm,
        resumoUti,
        resumoUsb,
      };
    }
    const snap = loadRdvDay(iso);
    return {
      rowsAmb: snap.rowsAmb,
      rowsAdm: snap.rowsAdm,
      assinaturaNome: snap.assinaturaNome,
      efetivoAmb: snap.efetivoAmb,
      efetivoAdm: snap.efetivoAdm,
      resumoUti: snap.resumoUti,
      resumoUsb: snap.resumoUsb,
    };
  }

  async function runGerarPdfForManyDates(dates: string[]) {
    const el = pdfRef.current;
    if (!el) return;
    const list = uniqueSortedRdvIsos(dates);
    if (list.length === 0) return;
    setPdfBusy(true);
    try {
      const { downloadRelatorioDiarioViaturasPdf, downloadRelatorioDiarioViaturasPdfMerged } = await import(
        "../lib/relatorioDiarioViaturasPdf"
      );
      if (list.length === 1) {
        const iso = list[0];
        await downloadRelatorioDiarioViaturasPdf(el, formatMergedPdfFilenameLabel(list), pdfLayout, {
          headerDateIso: iso,
        });
      } else {
        await downloadRelatorioDiarioViaturasPdfMerged(
          el,
          formatMergedPdfFilenameLabel(list),
          list,
          pdfLayout,
        );
      }
      for (const iso of list) {
        markRdvPdfSaved(iso, draftForPdfMark(iso));
        if (iso === reportDate) setPdfSalvo(true);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  function openPdfPreGerarModal() {
    setPdfPreGerarOpen(true);
  }

  function confirmReplicateThenPdf() {
    const futureIsos = uniqueSortedRdvIsos(
      (replicateSelected ?? []).map((d) => isoDateFromDate(d)).filter((iso) => iso > reportDate),
    );
    replicateRdvContentToFutureDates(reportDate, futureIsos, {
      rowsAmb,
      rowsAdm,
      assinaturaNome,
      efetivoAmb,
      efetivoAdm,
      resumoUti,
      resumoUsb,
    });
    setPdfReplicateOpen(false);
    setReplicateSelected(undefined);
    void runGerarPdfForManyDates([reportDate, ...futureIsos]);
  }

  function zerarPlanilha() {
    if (
      !window.confirm(
        "Zerar planilha: todas as situações passam a «Operando», as observações são apagadas e a coluna Oficina é desmarcada. Deseja continuar?",
      )
    ) {
      return;
    }
    setRowsAmb((rows) =>
      rows.map((r) => ({
        ...r,
        situacao: "Operando" as RdvStatus,
        observacao: "",
        naOficina: false,
      })),
    );
    setRowsAdm((rows) =>
      rows.map((r) => ({
        ...r,
        situacao: "Operando" as RdvStatus,
        observacao: "",
        naOficina: false,
      })),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          RDV — Relatório Diário de Viaturas
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => goToRdvCalendar()}>
            Calendário
          </Button>
          <Button type="button" variant="outline" onClick={() => clearCarroQuebradoHash()}>
            Voltar ao sistema
          </Button>
        </div>
      </div>

      <div
        id="rdv-conteudo-pdf"
        ref={pdfRef}
        className="mx-auto max-w-[273mm] rounded-sm border border-[#cbd5e1] bg-white p-3 text-[#0f172a] shadow-sm sm:p-4 md:p-6"
      >
        <div className="rdv-pdf-header-shell mb-3 text-center text-[10pt] leading-tight">
          <div className="rdv-pdf-main-title">
            <h1 className="m-0 text-[11pt] font-bold">MARINHA DO BRASIL</h1>
            <h2 className="m-0 text-[10pt] font-normal">HOSPITAL NAVAL MARCÍLIO DIAS</h2>
            <h2 className="m-0 text-[10pt] font-normal">DIVISÃO DE TRANSPORTE</h2>
          </div>
          <h3 className="rdv-pdf-header-title-row mx-auto mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border border-[#0f172a] bg-[#e2f0d9] px-3 py-1.5 text-[10pt] font-bold">
            <span>RELATÓRIO DIÁRIO DE VIATURAS</span>
            <label className="relative inline-block min-w-[6.5rem] cursor-pointer align-middle">
              <span className="block text-center font-bold underline decoration-dotted">
                {isoDateToPtBr(reportDate) || "—"}
              </span>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next !== reportDate) {
                    persistRdvDraft(reportDate, {
                      rowsAmb,
                      rowsAdm,
                      assinaturaNome,
                      efetivoAmb,
                      efetivoAdm,
                      resumoUti,
                      resumoUsb,
                    });
                  }
                  setReportDate(next);
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Data do relatório (dd/mm/aaaa)"
              />
            </label>
            <span className="rdv-pdf-header-weekday whitespace-nowrap">({diaSemana})</span>
          </h3>
        </div>

        <div className="rdv-pdf-body">
        <RdvTableTarjaShell salva={pdfSalvo}>
        <Table wrapperClassName="overflow-visible" className={tableFrame}>
          <TableHeader className={rdvTableHeaderClass}>
            <TableRow className={cn("hover:bg-transparent", rdvTableRowClass)}>
              <TableHead rowSpan={2} className="w-[15%] align-middle text-[#334155]">
                TIPO
              </TableHead>
              <TableHead rowSpan={2} className="align-middle text-[#334155]">
                EFETIVO
              </TableHead>
              <TableHead colSpan={3} className="text-center text-[#334155]">
                SITUAÇÃO GERAL DAS VIATURAS DOTADAS NO HNMD
              </TableHead>
              <TableHead colSpan={2} className="text-center text-[#334155]">
                OUTROS
              </TableHead>
            </TableRow>
            <TableRow className={cn("hover:bg-transparent", rdvTableRowClass)}>
              <TableHead className="text-[#334155]">OPERANDO</TableHead>
              <TableHead className="text-[#334155]">INOPERANTE</TableHead>
              <TableHead className="text-[#334155]">DESTACADA</TableHead>
              <TableHead className="text-[#334155]">UTI MÓVEL</TableHead>
              <TableHead className="text-[#334155]">USB</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={rdvTableBodyClass}>
            <TableRow className={rdvTableRowClass}>
              <TableCell className="text-left font-bold">AMBULÂNCIA(S)</TableCell>
              <TableCell>
                <input
                  type="number"
                  min={0}
                  className={cellInput}
                  value={efetivoAmb}
                  onChange={(e) => setEfetivoAmb(parseNonNegativeInt(e.target.value, efetivoAmb))}
                />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAmb.Operando} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAmb.Inoperante} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAmb.Destacada} />
              </TableCell>
              <TableCell>
                <input
                  type="number"
                  min={0}
                  className={cellInput}
                  value={resumoUti}
                  onChange={(e) => setResumoUti(parseNonNegativeInt(e.target.value, resumoUti))}
                />
              </TableCell>
              <TableCell>
                <input
                  type="number"
                  min={0}
                  className={cellInput}
                  value={resumoUsb}
                  onChange={(e) => setResumoUsb(parseNonNegativeInt(e.target.value, resumoUsb))}
                />
              </TableCell>
            </TableRow>
            <TableRow className={rdvTableRowClass}>
              <TableCell className="text-left font-bold">ADMINISTRATIVA</TableCell>
              <TableCell>
                <input
                  type="number"
                  min={0}
                  className={cellInput}
                  value={efetivoAdm}
                  onChange={(e) => setEfetivoAdm(parseNonNegativeInt(e.target.value, efetivoAdm))}
                />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAdm.Operando} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAdm.Inoperante} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={countAdm.Destacada} />
              </TableCell>
              <TableCell colSpan={2} className="rdv-summary-merged bg-[#f1f5f9]" />
            </TableRow>
            <TableRow className={cn("font-bold", rdvTableRowClass)}>
              <TableCell className="text-left">TOTAL</TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={efetivoTotal} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={totalOperando} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={totalInoperante} />
              </TableCell>
              <TableCell>
                <input type="text" readOnly className={cellInput} value={totalDestacada} />
              </TableCell>
              <TableCell colSpan={2} className="rdv-summary-merged bg-[#f1f5f9]" />
            </TableRow>
          </TableBody>
        </Table>
        </RdvTableTarjaShell>

        <div className={sectionBar}>AMBULÂNCIAS:</div>
        <RdvTableTarjaShell salva={pdfSalvo}>
        <Table
          wrapperClassName="max-w-full overflow-x-auto"
          id="rdv-tabela-ambulancias"
          className={cn(tableFrame, "table-fixed border-t-0")}
        >
          <TableHeader className={rdvTableHeaderClass}>
            <TableRow className={cn("hover:bg-transparent", rdvTableRowClass)}>
              <TableHead className="w-8 text-[#334155]">#</TableHead>
              <TableHead className="w-[80px] text-[#334155]">TIPO</TableHead>
              <TableHead className="w-[120px] text-[#334155]">PLACA</TableHead>
              <TableHead className="w-[76px] text-[#334155]">ANO</TableHead>
              <TableHead className="w-[120px] text-[#334155]">SITUAÇÃO</TableHead>
              <TableHead className="w-[70px] text-[#334155]">VIDA ÚTIL</TableHead>
              <TableHead className="w-[100px] text-[#334155]">ESPECIFICAÇÃO</TableHead>
              <TableHead className={cn("text-[#334155]", rdvObsColMinAmb)}>OBSERVAÇÃO</TableHead>
              <TableHead className={cn("rdv-col-oficina text-[#334155]", rdvOficinaCol)}>OFICINA</TableHead>
              <TableHead className="w-[50px] text-[#334155]">AÇÃO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={rdvTableBodyClass}>
            {rowsAmb.map((row, idx) => (
              <TableRow key={row.id} className={rdvTableRowClass}>
                <TableCell>
                  <input type="text" readOnly className={cellInput} value={idx + 1} />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInputLeft}
                    value={row.tipo}
                    onChange={(e) => patchAmb(row.id, { tipo: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <select
                    className={cn(cellInput, "cursor-pointer bg-transparent font-normal")}
                    value={rdvPlacaSelectValue(row.placa, placasAmbulanciasCatalogo)}
                    onChange={(e) => patchAmb(row.id, { placa: e.target.value })}
                  >
                    <option value="">
                      {placasAmbulanciasCatalogo.length === 0 ? "Cadastre ambulâncias em Frota" : "—"}
                    </option>
                    {rdvPlacaSelectOptions(placasAmbulanciasCatalogo, row.placa).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={1990}
                    className={cellInput}
                    value={row.ano}
                    onChange={(e) => patchAmb(row.id, { ano: e.target.value })}
                  />
                </TableCell>
                <TableCell className={situacaoCellClass(row.situacao)} data-rdv-sit={row.situacao}>
                  <select
                    className={cn(
                      "w-full min-w-0 border-0 bg-transparent p-0.5 text-center text-[9pt] font-bold outline-none",
                      situacaoCellClass(row.situacao),
                    )}
                    value={row.situacao}
                    onChange={(e) => patchAmb(row.id, { situacao: e.target.value as RdvStatus })}
                  >
                    {RDV_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={2000}
                    className={cellInput}
                    value={row.vidaUtil}
                    onChange={(e) => patchAmb(row.id, { vidaUtil: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInput}
                    value={row.especificacao}
                    onChange={(e) => patchAmb(row.id, { especificacao: e.target.value })}
                  />
                </TableCell>
                <TableCell className={rdvObsColMinAmb}>
                  <input
                    className={cellInputLeft}
                    value={row.observacao}
                    onChange={(e) => patchAmb(row.id, { observacao: e.target.value })}
                  />
                </TableCell>
                <TableCell className={cn("rdv-col-oficina", rdvOficinaCol)}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[#334155]"
                    checked={row.naOficina}
                    onChange={(e) => patchAmb(row.id, { naOficina: e.target.checked })}
                    aria-label={
                      row.placa.trim()
                        ? `Viatura ${row.placa} na oficina`
                        : "Viatura na oficina"
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    className="rdv-no-pdf inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35"
                    aria-label={
                      row.placa.trim()
                        ? `Remover ambulância (${row.placa})`
                        : "Remover ambulância"
                    }
                    onClick={() => removeAmb(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </RdvTableTarjaShell>
        <div className="mt-1 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rdv-no-pdf"
            onClick={() => setRowsAmb((p) => [...p, emptyAmbRow()])}
          >
            + Adicionar Ambulância
          </Button>
        </div>

        <div className={cn(sectionBar, "mt-4")}>ADMINISTRATIVAS:</div>
        <RdvTableTarjaShell salva={pdfSalvo}>
        <Table
          wrapperClassName="max-w-full overflow-x-auto"
          id="rdv-tabela-administrativas"
          className={cn(tableFrame, "table-fixed border-t-0")}
        >
          <TableHeader className={rdvTableHeaderClass}>
            <TableRow className={cn("hover:bg-transparent", rdvTableRowClass)}>
              <TableHead className="w-8 text-[#334155]">#</TableHead>
              <TableHead className="w-[80px] text-[#334155]">TIPO</TableHead>
              <TableHead className="w-[120px] text-[#334155]">PLACA</TableHead>
              <TableHead className="w-[76px] text-[#334155]">ANO</TableHead>
              <TableHead className="w-[120px] text-[#334155]">SITUAÇÃO</TableHead>
              <TableHead className="w-[70px] text-[#334155]">VIDA ÚTIL</TableHead>
              <TableHead className="w-[100px] text-[#334155]">ESPECIFICAÇÃO</TableHead>
              <TableHead className={cn("text-[#334155]", rdvObsColMinAmb)}>OBSERVAÇÃO</TableHead>
              <TableHead className={cn("rdv-col-oficina text-[#334155]", rdvOficinaCol)}>OFICINA</TableHead>
              <TableHead className="w-[50px] text-[#334155]">AÇÃO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={rdvTableBodyClass}>
            {rowsAdm.map((row, idx) => (
              <TableRow key={row.id} className={rdvTableRowClass}>
                <TableCell>
                  <input type="text" readOnly className={cellInput} value={idx + 1} />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInputLeft}
                    value={row.tipo}
                    onChange={(e) => patchAdm(row.id, { tipo: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <select
                    className={cn(cellInput, "cursor-pointer bg-transparent font-normal")}
                    value={rdvPlacaSelectValue(row.placa, placasAdministrativasCatalogo)}
                    onChange={(e) => patchAdm(row.id, { placa: e.target.value })}
                  >
                    <option value="">
                      {placasAdministrativasCatalogo.length === 0
                        ? "Cadastre viaturas adm. em Frota"
                        : "—"}
                    </option>
                    {rdvPlacaSelectOptions(placasAdministrativasCatalogo, row.placa).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={1990}
                    className={cellInput}
                    value={row.ano}
                    onChange={(e) => patchAdm(row.id, { ano: e.target.value })}
                  />
                </TableCell>
                <TableCell className={situacaoCellClass(row.situacao)} data-rdv-sit={row.situacao}>
                  <select
                    className={cn(
                      "w-full min-w-0 border-0 bg-transparent p-0.5 text-center text-[9pt] font-bold outline-none",
                      situacaoCellClass(row.situacao),
                    )}
                    value={row.situacao}
                    onChange={(e) => patchAdm(row.id, { situacao: e.target.value as RdvStatus })}
                  >
                    {RDV_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={2000}
                    className={cellInput}
                    value={row.vidaUtil}
                    onChange={(e) => patchAdm(row.id, { vidaUtil: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <input
                    className={cellInput}
                    value={row.especificacao}
                    onChange={(e) => patchAdm(row.id, { especificacao: e.target.value })}
                  />
                </TableCell>
                <TableCell className={rdvObsColMinAmb}>
                  <input
                    className={cellInputLeft}
                    value={row.observacao}
                    onChange={(e) => patchAdm(row.id, { observacao: e.target.value })}
                  />
                </TableCell>
                <TableCell className={cn("rdv-col-oficina", rdvOficinaCol)}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[#334155]"
                    checked={row.naOficina}
                    onChange={(e) => patchAdm(row.id, { naOficina: e.target.checked })}
                    aria-label={
                      row.placa.trim()
                        ? `Viatura ${row.placa} na oficina`
                        : "Viatura na oficina"
                    }
                  />
                </TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    className="rdv-no-pdf inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35"
                    aria-label={
                      row.placa.trim()
                        ? `Remover viatura administrativa (${row.placa})`
                        : "Remover viatura administrativa"
                    }
                    onClick={() => removeAdm(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </RdvTableTarjaShell>
        <div className="mt-1 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rdv-no-pdf"
            onClick={() => setRowsAdm((p) => [...p, emptyAdmRow()])}
          >
            + Adicionar Administrativa
          </Button>
        </div>

        <div className="rdv-pdf-signature-block mt-10 text-center text-[10pt]">
          <p className="m-0">_____________________________________</p>
          <p className="m-0.5 min-h-[1.25rem]">{assinaturaNome.trim() || "—"}</p>
          <p className="m-0">Divisão de Transporte</p>
        </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[273mm] flex-wrap items-center justify-center gap-3 pb-6 sm:gap-4">
        <Button type="button" variant="outline" className="shrink-0" onClick={zerarPlanilha}>
          Zerar Planilha
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          title="Configuração do PDF"
          aria-label="Abrir configuração do PDF"
          onClick={() => {
            setPdfLayoutDraft({ ...pdfLayout });
            setPdfConfigOpen(true);
          }}
        >
          <Settings2 className="h-4 w-4" aria-hidden />
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={assinaturaSelectId} className="text-sm font-medium text-[hsl(var(--foreground))]">
            Assinar
          </label>
          <select
            id={assinaturaSelectId}
            className={cn(
              "min-w-[12rem] max-w-[min(100vw-2rem,20rem)] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))] outline-none",
              "focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60",
            )}
            value={motoristasCadastrados.some((m) => m === assinaturaNome) ? assinaturaNome : ""}
            disabled={motoristasCadastrados.length === 0}
            onChange={(e) => setAssinaturaNome(e.target.value)}
          >
            <option value="">
              {motoristasCadastrados.length === 0 ? "Cadastre motoristas em Frota e Pessoal" : "Selecione o motorista…"}
            </option>
            {motoristasCadastrados.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={openPdfPreGerarModal} disabled={pdfBusy}>
          {pdfBusy ? "A gerar PDF…" : "Gerar PDF"}
        </Button>
      </div>

      {typeof document !== "undefined" && pdfPreGerarOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setPdfPreGerarOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="rdv-pdf-pregen-title"
                className="relative w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 pt-5 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 pr-1">
                  <h2 id="rdv-pdf-pregen-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
                    Gerar PDF
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    aria-label="Fechar"
                    onClick={() => setPdfPreGerarOpen(false)}
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </Button>
                </div>
                <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Como deseja Gerar o arquivo?</p>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => {
                      setPdfPreGerarOpen(false);
                      setReplicateMonth(dateAfterReportIso(reportDate));
                      setReplicateSelected(undefined);
                      setPdfReplicateOpen(true);
                    }}
                  >
                    Gerar Multiplas Datas
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => {
                      setPdfPreGerarOpen(false);
                      void runGerarPdfForManyDates([reportDate]);
                    }}
                  >
                    Gerar PDF
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== "undefined" && pdfReplicateOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setPdfReplicateOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="rdv-pdf-repl-title"
                className="max-h-[min(92vh,36rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="rdv-pdf-repl-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  Datas para repetir o conteúdo
                </h2>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                  Selecione um ou mais dias <strong className="text-[hsl(var(--foreground))]">após{" "}
                  {isoDateToPtBr(reportDate)}</strong>. O mesmo preenchimento será guardado para cada data; em cada dia o
                  cabeçalho usará a data correta.
                </p>
                <div className="mt-4 flex justify-center">
                  <Calendar
                    mode="multiple"
                    month={replicateMonth}
                    onMonthChange={setReplicateMonth}
                    selected={replicateSelected}
                    onSelect={setReplicateSelected}
                    disabled={(d) => isoDateFromDate(d) <= reportDate}
                    className="shadow-md"
                  />
                </div>
                {replicateSelected && replicateSelected.length > 0 ? (
                  <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                    Selecionado:{" "}
                    {[...replicateSelected]
                      .sort((a, b) => a.getTime() - b.getTime())
                      .map((d) => isoDateToPtBr(isoDateFromDate(d)))
                      .join(", ")}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Nenhuma data extra — só será gerado o PDF deste dia.</p>
                )}
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPdfReplicateOpen(false);
                      setPdfPreGerarOpen(true);
                    }}
                  >
                    Voltar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPdfReplicateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={confirmReplicateThenPdf}>
                    Replicar e gerar PDF
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {pdfConfigOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setPdfConfigOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="rdv-pdf-config-title"
                className="max-h-[min(92vh,44rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="rdv-pdf-config-title" className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  PDF do relatório
                </h2>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                  Ajuste margens, nitidez e tipografia antes de usar «Gerar PDF». Os valores são guardados até fechar a
                  página.
                </p>

                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)] lg:items-start">
                  <div className="order-2 min-w-0 space-y-4 text-sm lg:order-1">
                  <div className="space-y-1">
                    <label className="font-medium text-[hsl(var(--foreground))]" htmlFor="rdv-pdf-margin">
                      Margens da página (mm)
                    </label>
                    <input
                      id="rdv-pdf-margin"
                      type="range"
                      min={RDV_PDF_MARGIN_MM_MIN}
                      max={RDV_PDF_MARGIN_MM_MAX}
                      step={1}
                      className="w-full"
                      value={pdfLayoutDraft.marginMm}
                      onChange={(e) =>
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          marginMm: Number.parseInt(e.target.value, 10) || d.marginMm,
                        }))
                      }
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{pdfLayoutDraft.marginMm} mm</p>
                  </div>
                  <div className="space-y-1">
                    <label
                      className="font-medium text-[hsl(var(--foreground))]"
                      htmlFor="rdv-pdf-title-off"
                      title="Só as três linhas institucionais. A faixa verde e a tabela ficam fixas. Positivo: o título desce (aproxima-se da tabela). Negativo: sobe (afasta-se da tabela)."
                    >
                      Título institucional ↔ tabela (mm)
                    </label>
                    <input
                      id="rdv-pdf-title-off"
                      type="range"
                      min={-14}
                      max={14}
                      step={0.5}
                      className="w-full"
                      value={pdfLayoutDraft.mainTitleOffsetMm}
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value);
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          mainTitleOffsetMm: Number.isFinite(v) ? v : d.mainTitleOffsetMm,
                        }));
                      }}
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {(pdfLayoutDraft.mainTitleOffsetMm > 0 ? "+" : "") +
                        pdfLayoutDraft.mainTitleOffsetMm.toLocaleString("pt-BR", {
                          minimumFractionDigits: Number.isInteger(pdfLayoutDraft.mainTitleOffsetMm * 2) ? 0 : 1,
                          maximumFractionDigits: 1,
                        })}{" "}
                      mm — {pdfLayoutDraft.mainTitleOffsetMm > 0 ? "↓ tabela" : pdfLayoutDraft.mainTitleOffsetMm < 0 ? "↑ afasta" : "neutro"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[hsl(var(--foreground))]" htmlFor="rdv-pdf-imgw">
                      Largura da imagem no PDF (% da área útil)
                    </label>
                    <input
                      id="rdv-pdf-imgw"
                      type="range"
                      min={50}
                      max={100}
                      step={1}
                      className="w-full"
                      value={pdfLayoutDraft.imageWidthPercent}
                      onChange={(e) =>
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          imageWidthPercent: Number.parseInt(e.target.value, 10) || d.imageWidthPercent,
                        }))
                      }
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{pdfLayoutDraft.imageWidthPercent}%</p>
                  </div>
                  <div className="space-y-1">
                    <label
                      className="font-medium text-[hsl(var(--foreground))]"
                      htmlFor="rdv-pdf-h2c"
                      title="Valores mais altos melhoram o texto, mas demoram mais e aumentam o ficheiro."
                    >
                      Nitidez (escala html2canvas)
                    </label>
                    <input
                      id="rdv-pdf-h2c"
                      type="range"
                      min={1}
                      max={6}
                      step={0.5}
                      className="w-full"
                      value={pdfLayoutDraft.html2canvasScale}
                      onChange={(e) =>
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          html2canvasScale: Number.parseFloat(e.target.value) || d.html2canvasScale,
                        }))
                      }
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {Number.isInteger(pdfLayoutDraft.html2canvasScale)
                        ? String(pdfLayoutDraft.html2canvasScale)
                        : pdfLayoutDraft.html2canvasScale.toLocaleString("pt-BR", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[hsl(var(--foreground))]" htmlFor="rdv-pdf-table">
                      Tamanho do texto nas tabelas (multiplicador)
                    </label>
                    <input
                      id="rdv-pdf-table"
                      type="range"
                      min={0.75}
                      max={1.5}
                      step={0.05}
                      className="w-full"
                      value={pdfLayoutDraft.tableContentScale}
                      onChange={(e) =>
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          tableContentScale: Number.parseFloat(e.target.value) || d.tableContentScale,
                        }))
                      }
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {pdfLayoutDraft.tableContentScale.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      ×
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[hsl(var(--foreground))]" htmlFor="rdv-pdf-sigpt">
                      Texto da assinatura (pt)
                    </label>
                    <input
                      id="rdv-pdf-sigpt"
                      type="range"
                      min={5}
                      max={12}
                      step={0.5}
                      className="w-full"
                      value={pdfLayoutDraft.signatureFontPt}
                      onChange={(e) =>
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          signatureFontPt: Number.parseFloat(e.target.value) || d.signatureFontPt,
                        }))
                      }
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {pdfLayoutDraft.signatureFontPt.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}{" "}
                      pt
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[hsl(var(--foreground))]" htmlFor="rdv-pdf-sigmt">
                      Espaço acima da assinatura (multiplicador)
                    </label>
                    <input
                      id="rdv-pdf-sigmt"
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      className="w-full"
                      value={pdfLayoutDraft.signatureMarginScale}
                      onChange={(e) =>
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          signatureMarginScale: Number.parseFloat(e.target.value) || d.signatureMarginScale,
                        }))
                      }
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {pdfLayoutDraft.signatureMarginScale.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      ×
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label
                      className="font-medium text-[hsl(var(--foreground))]"
                      htmlFor="rdv-pdf-offx"
                      title="Relativo ao centro na área útil. Os limites dependem das margens e da % de largura da imagem (o máximo à direita aumenta quando a imagem é mais estreita)."
                    >
                      Posição horizontal do conteúdo (mm)
                    </label>
                    <input
                      id="rdv-pdf-offx"
                      type="range"
                      min={pdfContentOffsetXBounds.min}
                      max={pdfContentOffsetXBounds.max}
                      step={0.5}
                      className="w-full"
                      value={Math.min(
                        pdfContentOffsetXBounds.max,
                        Math.max(pdfContentOffsetXBounds.min, pdfLayoutDraft.contentOffsetXMm),
                      )}
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value);
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          contentOffsetXMm: Number.isFinite(v) ? v : d.contentOffsetXMm,
                        }));
                      }}
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {(pdfLayoutDraft.contentOffsetXMm > 0 ? "+" : "") +
                        pdfLayoutDraft.contentOffsetXMm.toLocaleString("pt-BR", {
                          minimumFractionDigits: Number.isInteger(pdfLayoutDraft.contentOffsetXMm * 2) ? 0 : 1,
                          maximumFractionDigits: 1,
                        })}{" "}
                      mm (permitido{" "}
                      {pdfContentOffsetXBounds.min.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      …{" "}
                      {pdfContentOffsetXBounds.max.toLocaleString("pt-BR", { maximumFractionDigits: 1 })})
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label
                      className="font-medium text-[hsl(var(--foreground))]"
                      htmlFor="rdv-pdf-offy"
                      title="Positivo desloca o conteúdo para baixo; negativo, para cima (relativamente ao topo da área útil)."
                    >
                      Posição vertical do conteúdo (mm)
                    </label>
                    <input
                      id="rdv-pdf-offy"
                      type="range"
                      min={pdfContentOffsetYBounds.min}
                      max={pdfContentOffsetYBounds.max}
                      step={0.5}
                      className="w-full"
                      value={Math.min(
                        pdfContentOffsetYBounds.max,
                        Math.max(pdfContentOffsetYBounds.min, pdfLayoutDraft.contentOffsetYMm),
                      )}
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value);
                        setPdfLayoutDraft((d) => ({
                          ...d,
                          contentOffsetYMm: Number.isFinite(v) ? v : d.contentOffsetYMm,
                        }));
                      }}
                    />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {(pdfLayoutDraft.contentOffsetYMm > 0 ? "+" : "") +
                        pdfLayoutDraft.contentOffsetYMm.toLocaleString("pt-BR", {
                          minimumFractionDigits: Number.isInteger(pdfLayoutDraft.contentOffsetYMm * 2) ? 0 : 1,
                          maximumFractionDigits: 1,
                        })}{" "}
                      mm (permitido{" "}
                      {pdfContentOffsetYBounds.min.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} …{" "}
                      {pdfContentOffsetYBounds.max.toLocaleString("pt-BR", { maximumFractionDigits: 1 })})
                    </p>
                  </div>
                  </div>

                  <div className="order-1 flex w-full flex-col items-center gap-2 lg:order-2 lg:w-auto lg:max-w-[260px] lg:sticky lg:top-1 lg:self-start">
                    <p className="text-center text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      Folha A4 — 1.ª página (igual ao PDF)
                    </p>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[#94a3b8]/25 p-4">
                      <div
                        className="relative mx-auto overflow-hidden bg-[hsl(var(--background))] shadow-md ring-1 ring-black/10 dark:bg-white"
                        style={{
                          width: pdfPreviewPaper.paperW,
                          height: pdfPreviewPaper.paperH,
                          boxSizing: "border-box",
                        }}
                      >
                        <div
                          className="pointer-events-none absolute z-0 border border-dashed border-slate-400/70"
                          style={{
                            left: pdfPreviewPaper.mX,
                            top: pdfPreviewPaper.mY,
                            right: pdfPreviewPaper.mX,
                            bottom: pdfPreviewPaper.mY,
                          }}
                          aria-hidden
                          title="Área útil (entre margens)"
                        />
                        {pdfPreviewBusy ? (
                          <div className="absolute inset-0 z-[2] flex items-center justify-center bg-white/85 text-xs text-[hsl(var(--muted-foreground))] backdrop-blur-[1px] dark:bg-white/90">
                            A gerar…
                          </div>
                        ) : null}
                        {pdfPreviewError ? (
                          <div className="absolute inset-0 z-[2] flex items-center justify-center p-2 text-center text-xs text-red-600">
                            {pdfPreviewError}
                          </div>
                        ) : null}
                        {!pdfPreviewBusy && !pdfPreviewError && !pdfPreview ? (
                          <div className="absolute inset-0 z-[2] flex items-center justify-center p-2 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                            Aguarde a pré-visualização.
                          </div>
                        ) : null}
                        {pdfPreview ? (
                          <img
                            src={pdfPreview.dataUrl}
                            alt="Pré-visualização da primeira página do PDF"
                            className="absolute z-[1] m-0 block border-0 p-0"
                            style={{
                              left: (pdfPreview.imgXMm * pdfPreviewPaper.paperW) / 210,
                              top: (pdfPreview.imgYMm * pdfPreviewPaper.paperH) / 297,
                              width: (pdfPreview.imageWMm * pdfPreviewPaper.paperW) / 210,
                              height: (pdfPreview.sliceHeightMm * pdfPreviewPaper.paperH) / 297,
                              objectFit: "fill",
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                    <p className="max-w-[260px] text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                      Mesma rasterização, fatia e posição em mm que o jsPDF (escala html2canvas igual a «Gerar PDF»).
                      Tracejado: área útil entre margens.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setPdfConfigOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPdfLayoutDraft({ ...DEFAULT_RDV_PDF_LAYOUT })}
                  >
                    Restaurar padrões
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setPdfLayout(clampRdvPdfLayout(pdfLayoutDraft));
                      setPdfConfigOpen(false);
                    }}
                  >
                    Guardar
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
