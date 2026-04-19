/**
 * Opções de layout do PDF do RDV (carro-quebrado), configuráveis antes de gerar.
 */
export interface RelatorioDiarioViaturasPdfLayoutOptions {
  /** Margens da página A4 (mm), aplicadas em todos os lados (ver `RDV_PDF_MARGIN_MM_MIN` / `MAX`). */
  marginMm: number;
  /**
   * Largura da imagem rasterizada no PDF, em % da largura útil (entre margens).
   * 100 = usar toda a área útil; valores menores centram uma faixa mais estreita.
   */
  imageWidthPercent: number;
  /** Escala do html2canvas (mais = mais nitidez, ficheiro maior). */
  html2canvasScale: number;
  /** Multiplicador da fonte e do padding das tabelas do corpo (inject no clone). */
  tableContentScale: number;
  /** Tamanho da fonte do bloco de assinatura (pt). */
  signatureFontPt: number;
  /** Multiplicador do espaço acima da assinatura (sobre 2,5rem × 1,3). */
  signatureMarginScale: number;
  /**
   * Deslocamento horizontal do bloco raster no PDF (mm). Positivo = direita; negativo = esquerda,
   * em relação à posição centrada na área útil.
   */
  contentOffsetXMm: number;
  /**
   * Deslocamento vertical do bloco raster em cada página (mm). Positivo = para baixo; negativo = para cima,
   * em relação ao topo da área útil (abaixo da margem superior).
   */
  contentOffsetYMm: number;
  /**
   * Deslocamento vertical só do cabeçalho institucional (Marinha / HNMD / Divisão de Transporte), em mm,
   * em relação à faixa verde e à tabela: positivo desce (aproxima da tabela); negativo sobe (afasta).
   */
  mainTitleOffsetMm: number;
}

/** Valores iniciais e de «Restaurar padrões» no modal PDF do RDV (carro-quebrado). */
export const DEFAULT_RDV_PDF_LAYOUT: RelatorioDiarioViaturasPdfLayoutOptions = {
  marginMm: 10,
  imageWidthPercent: 95,
  html2canvasScale: 6,
  tableContentScale: 1,
  signatureFontPt: 8,
  signatureMarginScale: 1.3,
  contentOffsetXMm: 0,
  contentOffsetYMm: 10,
  /** Neutro por omissão: valores negativos sobem o bloco e cortam ascendentes no html2canvas. */
  mainTitleOffsetMm: 0,
};

/**
 * Deslocamento horizontal (mm) relativamente ao centro na área útil: intervalo permitido para a imagem
 * caber na folha A4 (0 … 210 − largura da imagem).
 */
/** Margens da página no PDF (mm): mínimo baixo para ganhar área útil; máximo alargado. */
export const RDV_PDF_MARGIN_MM_MIN = 2;
export const RDV_PDF_MARGIN_MM_MAX = 20;

export function getRdvPdfContentOffsetXMmBounds(params: {
  marginMm: number;
  imageWidthPercent: number;
}): { min: number; max: number } {
  const margin = clamp(params.marginMm, RDV_PDF_MARGIN_MM_MIN, RDV_PDF_MARGIN_MM_MAX);
  const pct = clamp(params.imageWidthPercent, 50, 100);
  const contentW = 210 - margin * 2;
  const imageW = contentW * (pct / 100);
  const imgX0 = margin + (contentW - imageW) / 2;
  return {
    min: -imgX0,
    max: 210 - imageW - imgX0,
  };
}

/**
 * Deslocamento vertical (mm) da imagem no PDF: `imgY = margem + offset`, com fatia de altura até `contentH`.
 * Caso extremo (1.ª página com fatia a toda a altura útil): offset ∈ [−margem, +margem].
 */
export function getRdvPdfContentOffsetYMmBounds(marginMm: number): { min: number; max: number } {
  const m = clamp(marginMm, RDV_PDF_MARGIN_MM_MIN, RDV_PDF_MARGIN_MM_MAX);
  const contentH = 297 - m * 2;
  return {
    min: -m,
    max: 297 - contentH - m,
  };
}

export function clampRdvPdfLayout(
  raw: Partial<RelatorioDiarioViaturasPdfLayoutOptions>,
): RelatorioDiarioViaturasPdfLayoutOptions {
  const d = DEFAULT_RDV_PDF_LAYOUT;
  const marginMm = clamp(raw.marginMm ?? d.marginMm, RDV_PDF_MARGIN_MM_MIN, RDV_PDF_MARGIN_MM_MAX);
  const imageWidthPercent = clamp(raw.imageWidthPercent ?? d.imageWidthPercent, 50, 100);
  const offX = getRdvPdfContentOffsetXMmBounds({ marginMm, imageWidthPercent });
  const offY = getRdvPdfContentOffsetYMmBounds(marginMm);

  return {
    marginMm,
    imageWidthPercent,
    html2canvasScale: clamp(raw.html2canvasScale ?? d.html2canvasScale, 1, 6),
    tableContentScale: clamp(raw.tableContentScale ?? d.tableContentScale, 0.75, 1.5),
    signatureFontPt: clamp(raw.signatureFontPt ?? d.signatureFontPt, 5, 12),
    signatureMarginScale: clamp(raw.signatureMarginScale ?? d.signatureMarginScale, 0.5, 2),
    contentOffsetXMm: clamp(raw.contentOffsetXMm ?? d.contentOffsetXMm, offX.min, offX.max),
    contentOffsetYMm: clamp(raw.contentOffsetYMm ?? d.contentOffsetYMm, offY.min, offY.max),
    mainTitleOffsetMm: clamp(raw.mainTitleOffsetMm ?? d.mainTitleOffsetMm, -18, 18),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
