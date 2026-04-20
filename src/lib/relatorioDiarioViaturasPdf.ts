import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  buildRdvStandaloneHtmlDocument,
  RDV_PDF_TABLE_CELL_PAD_H_PX,
  RDV_PDF_TABLE_CELL_PAD_V_PX,
  RDV_PDF_TABLE_FONT_PT,
} from "./relatorioDiarioViaturasExportPrep";
import {
  type RelatorioDiarioViaturasPdfLayoutOptions,
  DEFAULT_RDV_PDF_LAYOUT,
  clampRdvPdfLayout,
} from "./relatorioDiarioViaturasPdfLayout";

export type { RelatorioDiarioViaturasPdfLayoutOptions } from "./relatorioDiarioViaturasPdfLayout";
export { DEFAULT_RDV_PDF_LAYOUT, clampRdvPdfLayout } from "./relatorioDiarioViaturasPdfLayout";

function pdfContentWidthMm(marginMm: number): number {
  return 210 - marginMm * 2;
}

function pdfContentHeightMm(marginMm: number): number {
  return 297 - marginMm * 2;
}

function pdfImageWidthMm(layout: RelatorioDiarioViaturasPdfLayoutOptions): number {
  const usable = pdfContentWidthMm(layout.marginMm);
  return usable * (layout.imageWidthPercent / 100);
}

/**
 * html2canvas (1.4.x) não interpreta `oklch()` em alguns contextos. No clone usado
 * para rasterizar, reforçamos cores em rgb/hex (o iframe já usa só RDV_EXPORT_STYLES).
 */
function injectRdvPdfSafeColors(
  clonedDoc: Document,
  layout: RelatorioDiarioViaturasPdfLayoutOptions,
): void {
  const style = clonedDoc.createElement("style");
  style.setAttribute("data-rdv-pdf-fix", "1");
  const s = layout.tableContentScale;
  const padV = RDV_PDF_TABLE_CELL_PAD_V_PX * s;
  const padH = RDV_PDF_TABLE_CELL_PAD_H_PX * s;
  const fs = RDV_PDF_TABLE_FONT_PT * s;
  const sigPt = layout.signatureFontPt;
  const sigMt = 1.3 * layout.signatureMarginScale;
  const titleOffMm = Number.isFinite(layout.mainTitleOffsetMm) ? layout.mainTitleOffsetMm : 0;
  style.textContent = `
    /* Folha RDV_EXPORT_STYLES usa margin:12mm no body — isso rouba espaço e corta o topo face às margens do PDF. */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #ffffff !important;
    }
    .rdv-export-root, .rdv-export-root * {
      box-shadow: none !important;
      outline-color: #0f172a !important;
    }
    .rdv-export-root {
      background-color: #ffffff !important;
      color: #0f172a !important;
      -webkit-font-smoothing: subpixel-antialiased !important;
      text-rendering: geometricPrecision !important;
      box-sizing: border-box !important;
      padding-top: 4mm !important;
      padding-bottom: 12mm !important;
    }
    .rdv-export-root table {
      border-color: #0f172a !important;
    }
    .rdv-export-root thead {
      background-color: transparent !important;
      border-color: #0f172a !important;
    }
    .rdv-export-root thead th {
      background-color: rgba(226, 240, 217, 0.9) !important;
      border-color: #0f172a !important;
      color: #334155 !important;
    }
    .rdv-export-root tbody tr:nth-child(odd) td {
      background-color: #ffffff !important;
    }
    .rdv-export-root tbody tr:nth-child(even) td {
      background-color: #f1f5f9 !important;
    }
    .rdv-export-root .rdv-section-bar {
      background-color: #e2f0d9 !important;
      border-color: #0f172a !important;
      color: #0f172a !important;
    }
    .rdv-export-root .rdv-summary-merged {
      background-color: #f1f5f9 !important;
    }
    /* flow-root evita colapso de margem do título com o pai (no iframe não há Tailwind). */
    .rdv-export-root .rdv-pdf-header-shell {
      display: flow-root !important;
      overflow: visible !important;
      line-height: 1.35 !important;
      padding-top: 1mm !important;
    }
    .rdv-export-root .rdv-pdf-main-title h1 {
      line-height: 1.35 !important;
      padding-top: 0.15em !important;
      box-sizing: border-box !important;
    }
    .rdv-export-root .rdv-pdf-main-title h2 {
      display: block !important;
      margin: 0 !important;
      line-height: 1.4 !important;
      font-size: 10pt !important;
      font-weight: normal !important;
      color: #0f172a !important;
      text-align: center !important;
    }
    /* translateY: a posição da faixa e da tabela mantém-se; o título aproxima-se ou afasta-se delas. */
    .rdv-export-root .rdv-pdf-main-title {
      display: block !important;
      position: relative !important;
      z-index: 5 !important;
      margin-top: 0 !important;
      margin-bottom: 3mm !important;
      padding-bottom: 0.5mm !important;
      transform: translateY(${titleOffMm}mm) !important;
      box-sizing: border-box !important;
    }
    /* A faixa verde (h3) vem depois no DOM: sem z-index/margem, pode cobrir a última linha do bloco institucional. */
    .rdv-export-root .rdv-pdf-header-shell > h3 {
      position: relative !important;
      z-index: 1 !important;
      margin-top: 10px !important;
    }
    .rdv-export-root .rdv-pdf-body table {
      font-size: ${fs}pt !important;
    }
    .rdv-export-root .rdv-pdf-body table th,
    .rdv-export-root .rdv-pdf-body table td {
      font-size: ${fs}pt !important;
      text-align: center !important;
      vertical-align: middle !important;
      line-height: 1.1 !important;
      padding: ${padV}px ${padH}px !important;
    }
    .rdv-export-root .rdv-pdf-body table th > .rdv-pdf-cell-inner,
    .rdv-export-root .rdv-pdf-body table td > .rdv-pdf-cell-inner {
      position: relative !important;
      top: -0.1em !important;
    }
    .rdv-export-root .rdv-pdf-body .rdv-section-bar {
      font-size: ${fs}pt !important;
      text-align: center !important;
    }
    .rdv-export-root .rdv-pdf-body .rdv-pdf-signature-block {
      font-size: ${sigPt}pt !important;
      display: block !important;
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
      margin-top: calc(2.5rem * ${sigMt}) !important;
      margin-bottom: 5mm !important;
      padding-bottom: 6mm !important;
      text-align: center !important;
      line-height: 1.45 !important;
      overflow: visible !important;
    }
    .rdv-export-root .rdv-pdf-body .rdv-pdf-signature-block p {
      font-size: ${sigPt}pt !important;
      text-align: center !important;
      line-height: 1.45 !important;
      margin: 0.2em 0 !important;
      padding-bottom: 0.15em !important;
    }
  `;
  clonedDoc.head.appendChild(style);
}

/** Garante o deslocamento do título institucional no clone do html2canvas (transform + BFC no pai). */
function applyMainTitleOffsetToHtml2CanvasClone(
  clonedDoc: Document,
  clonedElement: HTMLElement,
  layout: RelatorioDiarioViaturasPdfLayoutOptions,
): void {
  const n = Number.isFinite(layout.mainTitleOffsetMm) ? layout.mainTitleOffsetMm : 0;
  const doc = clonedElement.ownerDocument ?? clonedDoc;
  const title = doc.querySelector(".rdv-pdf-main-title");
  if (title instanceof HTMLElement) {
    title.style.setProperty("margin-top", "0", "important");
    title.style.setProperty("margin-bottom", "3mm", "important");
    title.style.setProperty("position", "relative", "important");
    title.style.setProperty("z-index", "5", "important");
    title.style.setProperty("transform", `translateY(${n}mm)`, "important");
  }
  const shell = doc.querySelector(".rdv-pdf-header-shell");
  if (shell instanceof HTMLElement) {
    shell.style.setProperty("display", "flow-root", "important");
  }
}

/**
 * O clone fica dentro de iframe; sem isto o html2canvas usa só a altura “visível”
 * e o tbody (linhas) fica de fora da captura.
 */
function expandCloneForFullCapture(clonedElement: HTMLElement): void {
  clonedElement.style.overflow = "visible";
  clonedElement.style.maxHeight = "none";
  clonedElement.style.height = "auto";

  clonedElement.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.style.overflow = "visible";
    el.style.maxHeight = "none";
  });

  /** Espaço extra no fim do clone: html2canvas pode cortar a última linha (assinatura). */
  const bottomSafetyPx = 56;
  clonedElement.style.paddingBottom = `${bottomSafetyPx}px`;

  const total = clonedElement.scrollHeight;
  if (total > 0) {
    clonedElement.style.minHeight = `${total}px`;
    clonedElement.style.height = `${total}px`;
  }
}

type RdvPdfPageSlice = {
  slice: HTMLCanvasElement;
  sliceHeightMm: number;
  nextOffsetMm: number;
};

/**
 * Extrai uma faixa horizontal do canvas raster (mesma lógica que {@link addCanvasToPdfA4}).
 */
function clampPdfAxis(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Onde o jsPDF coloca a fatia (mm, origem no canto superior esquerdo da página A4). */
function pdfPageImagePlacementMm(
  layout: RelatorioDiarioViaturasPdfLayoutOptions,
  sliceHeightMm: number,
): { imgXMm: number; imgYMm: number; imageWMm: number } {
  const margin = layout.marginMm;
  const contentW = pdfContentWidthMm(margin);
  const imageW = pdfImageWidthMm(layout);
  const imgX0 = margin + (contentW - imageW) / 2;
  const imgX = clampPdfAxis(imgX0 + layout.contentOffsetXMm, 0, 210 - imageW);
  const imgY = clampPdfAxis(margin + layout.contentOffsetYMm, 0, 297 - sliceHeightMm);
  return { imgXMm: imgX, imgYMm: imgY, imageWMm: imageW };
}

function extractRdvPdfPageSliceCanvas(
  canvas: HTMLCanvasElement,
  layout: RelatorioDiarioViaturasPdfLayoutOptions,
  offsetMm: number,
): RdvPdfPageSlice | null {
  const margin = layout.marginMm;
  const contentH = pdfContentHeightMm(margin);
  const imageW = pdfImageWidthMm(layout);
  const totalHeightMm = (canvas.height * imageW) / canvas.width;

  if (offsetMm >= totalHeightMm - 0.02) {
    return null;
  }

  const sliceHeightMm = Math.min(contentH, totalHeightMm - offsetMm);
  const srcY = (offsetMm / totalHeightMm) * canvas.height;
  const srcH = (sliceHeightMm / totalHeightMm) * canvas.height;

  const hPx = Math.max(1, Math.round(srcH));
  const yPx = Math.min(Math.floor(srcY), Math.max(0, canvas.height - 1));

  const slice = document.createElement("canvas");
  slice.width = canvas.width;
  slice.height = hPx;
  const ctx = slice.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D não disponível para o PDF.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, slice.width, slice.height);
  const drawH = Math.min(hPx, canvas.height - yPx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, yPx, canvas.width, drawH, 0, 0, canvas.width, drawH);

  return { slice, sliceHeightMm, nextOffsetMm: offsetMm + sliceHeightMm };
}

/**
 * Corta o canvas em faixas horizontais e cola no PDF, uma faixa por página A4,
 * com margens. Evita o método antigo (imagem inteira com Y negativo), que
 * repetia e distorcia o conteúdo.
 */
function addCanvasToPdfA4(pdf: jsPDF, canvas: HTMLCanvasElement, layout: RelatorioDiarioViaturasPdfLayoutOptions): void {
  let offsetMm = 0;
  let pageIndex = 0;

  while (true) {
    const part = extractRdvPdfPageSliceCanvas(canvas, layout, offsetMm);
    if (!part) break;

    if (pageIndex > 0) {
      pdf.addPage();
    }

    const sliceData = part.slice.toDataURL("image/png");
    const { imgXMm, imgYMm, imageWMm } = pdfPageImagePlacementMm(layout, part.sliceHeightMm);
    pdf.addImage(sliceData, "PNG", imgXMm, imgYMm, imageWMm, part.sliceHeightMm);

    offsetMm = part.nextOffsetMm;
    pageIndex += 1;
  }
}

async function loadRdvExportInIframe(htmlDoc: string): Promise<{
  iframe: HTMLIFrameElement;
  root: HTMLElement;
}> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "rdv-pdf-capture");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-99999px;top:0;width:210mm;height:12000px;border:0;margin:0;padding:0;";
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Não foi possível preparar o PDF."));
    };
    iframe.addEventListener("load", done, { once: true });
    iframe.addEventListener("error", fail, { once: true });
    iframe.srcdoc = htmlDoc;
    queueMicrotask(() => {
      const d = iframe.contentDocument;
      const r = d?.getElementById("rdv-export-root") ?? d?.querySelector(".rdv-export-root");
      if (r && d?.readyState === "complete") done();
    });
  });

  const doc = iframe.contentDocument;
  if (!doc) {
    throw new Error("Documento do iframe indisponível.");
  }

  const deadline = performance.now() + 3000;
  let root: HTMLElement | null = null;
  while (performance.now() < deadline) {
    root =
      (doc.getElementById("rdv-export-root") as HTMLElement | null) ??
      (doc.querySelector(".rdv-export-root") as HTMLElement | null);
    if (root) break;
    await new Promise<void>((r) => {
      requestAnimationFrame(() => r());
    });
  }
  if (!root) {
    throw new Error("Conteúdo RDV não encontrado.");
  }

  if (doc.fonts?.ready) {
    await doc.fonts.ready.catch(() => {});
  }

  void root.offsetHeight;

  return { iframe, root };
}

/**
 * Rasteriza o **mesmo** HTML que o export Word (.html): iframe isolado + RDV_EXPORT_STYLES.
 * @param options.html2canvasScale — se definido, substitui o valor de `layout` na captura.
 * @param options.headerDateIso — data no cabeçalho do PDF (yyyy-mm-dd), alinhada com o ficheiro gerado.
 */
export async function captureRelatorioDiarioViaturasToCanvas(
  element: HTMLElement,
  layout: RelatorioDiarioViaturasPdfLayoutOptions,
  options?: { html2canvasScale?: number; headerDateIso?: string },
): Promise<HTMLCanvasElement> {
  const scale = options?.html2canvasScale ?? layout.html2canvasScale;
  const htmlDoc = buildRdvStandaloneHtmlDocument(element, {
    headerDateIso: options?.headerDateIso,
  });
  let iframe: HTMLIFrameElement | null = null;

  try {
    const { iframe: frame, root } = await loadRdvExportInIframe(htmlDoc);
    iframe = frame;

    const captureWidth = Math.ceil(
      Math.max(root.scrollWidth, root.clientWidth, root.offsetWidth),
    );
    const captureHeight = Math.ceil(
      Math.max(root.scrollHeight, root.clientHeight, root.offsetHeight),
    );

    return await html2canvas(root, {
      scale,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: "#ffffff",
      foreignObjectRendering: false,
      onclone: (clonedDoc, clonedElement) => {
        injectRdvPdfSafeColors(clonedDoc, layout);
        applyMainTitleOffsetToHtml2CanvasClone(clonedDoc, clonedElement as HTMLElement, layout);
        expandCloneForFullCapture(clonedElement as HTMLElement);
      },
    });
  } finally {
    iframe?.remove();
  }
}

export type RdvPdfPage1PreviewResult = {
  dataUrl: string;
  imgXMm: number;
  imgYMm: number;
  imageWMm: number;
  sliceHeightMm: number;
};

export type RdvPdfPage1PreviewOptions = {
  /**
   * Se definido, limita a escala html2canvas (mais rápido, mas deixa de coincidir com o PDF).
   * Por omissão usa a mesma escala que «Gerar PDF».
   */
  maxHtml2canvasScale?: number;
};

/**
 * 1.ª página como no PDF: mesma captura html2canvas (escala por omissão igual), mesma fatia e
 * as mesmas coordenadas mm que {@link addCanvasToPdfA4} usa no jsPDF.
 */
export async function buildRelatorioDiarioViaturasPdfPage1Preview(
  element: HTMLElement,
  layout: RelatorioDiarioViaturasPdfLayoutOptions,
  options?: RdvPdfPage1PreviewOptions,
): Promise<RdvPdfPage1PreviewResult> {
  const clamped = clampRdvPdfLayout(layout);
  const maxCap = options?.maxHtml2canvasScale;
  const scale =
    maxCap !== undefined ? Math.min(clamped.html2canvasScale, maxCap) : clamped.html2canvasScale;

  const canvas = await captureRelatorioDiarioViaturasToCanvas(element, clamped, {
    html2canvasScale: scale,
  });

  const first = extractRdvPdfPageSliceCanvas(canvas, clamped, 0);
  const contentH = pdfContentHeightMm(clamped.marginMm);
  const slice = first?.slice ?? canvas;
  const sliceHeightMm = first ? first.sliceHeightMm : contentH;

  const { imgXMm, imgYMm, imageWMm } = pdfPageImagePlacementMm(clamped, sliceHeightMm);
  const dataUrl = slice.toDataURL("image/png");

  return { dataUrl, imgXMm, imgYMm, imageWMm, sliceHeightMm };
}

/**
 * Rasteriza o **mesmo** HTML que o export Word (.html): iframe isolado + RDV_EXPORT_STYLES.
 */
export type DownloadRelatorioDiarioViaturasPdfOptions = {
  /** Cabeçalho do relatório nesta captura (yyyy-mm-dd). */
  headerDateIso?: string;
};

function saveRdvPdf(pdf: jsPDF, filenameLabel: string): void {
  const safe = filenameLabel.trim() || "SemData";
  pdf.save(`${safe}.pdf`);
}

export async function downloadRelatorioDiarioViaturasPdf(
  element: HTMLElement,
  filenameDate: string,
  layout: RelatorioDiarioViaturasPdfLayoutOptions = DEFAULT_RDV_PDF_LAYOUT,
  options?: DownloadRelatorioDiarioViaturasPdfOptions,
): Promise<void> {
  const canvas = await captureRelatorioDiarioViaturasToCanvas(element, layout, {
    headerDateIso: options?.headerDateIso,
  });

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  addCanvasToPdfA4(pdf, canvas, layout);
  saveRdvPdf(pdf, filenameDate);
}

/**
 * Gera um único PDF com uma secção RDV por data (cada data começa numa nova folha A4).
 */
export async function downloadRelatorioDiarioViaturasPdfMerged(
  element: HTMLElement,
  filenameLabel: string,
  headerDateIsos: string[],
  layout: RelatorioDiarioViaturasPdfLayoutOptions = DEFAULT_RDV_PDF_LAYOUT,
): Promise<void> {
  const list = [...new Set(headerDateIsos.map((d) => d.trim()).filter(Boolean))];
  if (list.length === 0) {
    throw new Error("Nenhuma data informada para gerar o PDF.");
  }

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

  for (let i = 0; i < list.length; i++) {
    const iso = list[i];
    const canvas = await captureRelatorioDiarioViaturasToCanvas(element, layout, {
      headerDateIso: iso,
    });
    if (i > 0) {
      pdf.addPage();
    }
    addCanvasToPdfA4(pdf, canvas, layout);
  }

  saveRdvPdf(pdf, filenameLabel);
}
