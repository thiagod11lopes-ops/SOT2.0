/** Pré-processamento de rubricas PNG para embed nítido em PDF (saídas administrativas / ambulância). */

const embedCache = new Map<string, string>();

function readUint32Be(binary: string, offset: number): number {
  return (
    ((binary.charCodeAt(offset) & 0xff) << 24) |
    ((binary.charCodeAt(offset + 1) & 0xff) << 16) |
    ((binary.charCodeAt(offset + 2) & 0xff) << 8) |
    (binary.charCodeAt(offset + 3) & 0xff)
  ) >>> 0;
}

function parsePngDimensionsFromDataUrl(dataUrl: string): { w: number; h: number } | null {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    const binary = atob(base64);
    if (binary.length < 24 || binary.charCodeAt(0) !== 0x89) return null;
    const w = readUint32Be(binary, 16);
    const h = readUint32Be(binary, 20);
    if (w <= 0 || h <= 0) return null;
    return { w, h };
  } catch {
    return null;
  }
}

/** Escala em pixels (2×) para impressão mais nítida ao aumentar o tamanho no PDF. */
const PDF_RUBRICA_PIXEL_UPSCALE = 2;

/**
 * Reamostra a PNG em resolução maior antes do jsPDF, evitando rubrica «mole» ao dobrar o tamanho.
 * Fora do browser devolve o data URL original.
 */
export async function prepareRubricaDataUrlForPdf(dataUrl: string): Promise<string> {
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith("data:image/")) return trimmed;
  const cached = embedCache.get(trimmed);
  if (cached) return cached;

  if (typeof document === "undefined") return trimmed;

  const enhanced = await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.naturalWidth || parsePngDimensionsFromDataUrl(trimmed)?.w || 0;
      const srcH = img.naturalHeight || parsePngDimensionsFromDataUrl(trimmed)?.h || 0;
      if (srcW <= 0 || srcH <= 0) {
        resolve(trimmed);
        return;
      }
      const outW = Math.min(4096, Math.round(srcW * PDF_RUBRICA_PIXEL_UPSCALE));
      const outH = Math.min(4096, Math.round(srcH * PDF_RUBRICA_PIXEL_UPSCALE));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(trimmed);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, outW, outH);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(trimmed);
    img.src = trimmed;
  });

  embedCache.set(trimmed, enhanced);
  return enhanced;
}

export async function prepareRubricaDataUrlMapForPdf(urls: Iterable<string>): Promise<Map<string, string>> {
  const unique = [...new Set([...urls].map((u) => u.trim()).filter((u) => u.startsWith("data:image/")))];
  const entries = await Promise.all(
    unique.map(async (raw) => [raw, await prepareRubricaDataUrlForPdf(raw)] as const),
  );
  return new Map(entries);
}

/** Embed PNG sem recompressão agressiva — melhor definição na coluna Rubrica. */
export function addRubricaPngToPdf(
  doc: import("jspdf").jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  wMm: number,
  hMm: number,
): void {
  try {
    doc.addImage(dataUrl, "PNG", x, y, wMm, hMm, undefined, "NONE");
  } catch {
    try {
      doc.addImage(dataUrl, "PNG", x, y, wMm, hMm);
    } catch {
      /* ignore */
    }
  }
}
