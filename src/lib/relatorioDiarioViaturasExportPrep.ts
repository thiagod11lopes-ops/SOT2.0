/**
 * Prepara o RDV para exportação Word/HTML e para rasterização em PDF:
 * mesmo DOM + mesmas folhas de estilo que o ficheiro .html descarregado.
 */

import { isoDateToPtBr } from "./dateFormat";
import { weekdayPtBrFromIsoDate } from "./relatorioDiarioViaturasModel";

/** Tamanho do texto nas tabelas do corpo do PDF (≈5.85pt +30%). */
export const RDV_PDF_TABLE_FONT_PT = 5.85 * 1.3;
/** Padding vertical/horizontal das células no PDF (4px/6px +30%). */
export const RDV_PDF_TABLE_CELL_PAD_V_PX = 4 * 1.3;
export const RDV_PDF_TABLE_CELL_PAD_H_PX = 6 * 1.3;

export const RDV_EXPORT_STYLES = `
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 12mm; background: #fff; }
  .rdv-export-root { max-width: 210mm; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; }
  th, td { border: 1px solid #0f172a; padding: 4px 6px; vertical-align: top; }
  thead th { background: rgba(226,240,217,0.95); color: #334155; font-weight: bold; }
  tbody tr:nth-child(odd) td { background: #fff; }
  tbody tr:nth-child(even) td { background: #f1f5f9; }
  .rdv-section-bar { background: #e2f0d9; border: 1px solid #0f172a; border-bottom: none; padding: 6px 8px; font-weight: bold; margin-top: 12px; }
  .rdv-summary-merged { background: #f1f5f9 !important; }
  h1 { font-size: 11pt; margin: 0; text-align: center; }
  h2 { font-size: 10pt; font-weight: normal; margin: 0; text-align: center; }
  h3 { font-size: 10pt; margin: 8px auto 0; text-align: center; border: 1px solid #0f172a; background: #e2f0d9; padding: 6px; max-width: 100%; }
  /* Faixa verde do título: espaço entre título, data e (dia da semana) — iframe de PDF não carrega Tailwind. */
  .rdv-pdf-header-shell > h3.rdv-pdf-header-title-row,
  .rdv-pdf-header-shell > h3 {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    justify-content: center !important;
    column-gap: 0.65rem !important;
    row-gap: 0.35rem !important;
    padding: 7px 12px !important;
  }
  td[data-rdv-sit="Operando"] span { color: #15803d; font-weight: bold; }
  td[data-rdv-sit="Inoperante"] span { color: #dc2626; font-weight: bold; }
  td[data-rdv-sit="Destacada"] span { color: #2563eb; font-weight: bold; }
  /* Conteúdo agrupado para subir só o interior da célula (sem transform na célula). */
  .rdv-pdf-body table th > .rdv-pdf-cell-inner,
  .rdv-pdf-body table td > .rdv-pdf-cell-inner {
    position: relative;
    top: -0.1em;
    display: inline-block;
    max-width: 100%;
    text-align: inherit;
    box-sizing: border-box;
    vertical-align: baseline;
  }
  .rdv-pdf-body table {
    font-size: ${RDV_PDF_TABLE_FONT_PT}pt;
  }
  .rdv-pdf-body table th,
  .rdv-pdf-body table td {
    font-size: ${RDV_PDF_TABLE_FONT_PT}pt;
    padding: ${RDV_PDF_TABLE_CELL_PAD_V_PX}px ${RDV_PDF_TABLE_CELL_PAD_H_PX}px;
    vertical-align: middle;
    text-align: center;
    line-height: 1.1;
  }
  /* Coluna OFICINA: ✓ (sem quadrado) centrado na célula. */
  .rdv-pdf-body table th.rdv-col-oficina,
  .rdv-pdf-body table td.rdv-col-oficina {
    text-align: center;
    vertical-align: middle;
  }
  .rdv-pdf-body table td.rdv-col-oficina > .rdv-pdf-cell-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 1.15em;
    top: 0;
    box-sizing: border-box;
  }
  .rdv-pdf-body .rdv-section-bar {
    font-size: ${RDV_PDF_TABLE_FONT_PT}pt;
  }
  /* Assinatura no PDF: centrada; espaço acima ≈ mt-10 (2,5rem) +30%. */
  .rdv-pdf-body .rdv-pdf-signature-block {
    display: block;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    margin-left: auto;
    margin-right: auto;
    margin-top: calc(2.5rem * 1.3);
    margin-bottom: 4mm;
    padding-bottom: 5mm;
    line-height: 1.45;
    text-align: center;
  }
  .rdv-pdf-body .rdv-pdf-signature-block p {
    text-align: center;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.45;
  }
`;

function removeAcaoColumns(clone: HTMLElement): void {
  for (const id of ["rdv-tabela-ambulancias", "rdv-tabela-administrativas"]) {
    const table = clone.querySelector(`#${id}`);
    if (!table) continue;
    table.querySelectorAll("thead tr th:last-child, tbody tr td:last-child").forEach((el) => {
      el.remove();
    });
    /** Mantém colunas alinhadas ao remover a última célula (AÇÃO). */
    const lastCol = table.querySelector("colgroup > col:last-child");
    lastCol?.remove();
  }
}

function removeNoExportElements(clone: HTMLElement): void {
  clone.querySelectorAll(".rdv-no-pdf").forEach((el) => {
    el.remove();
  });
}

/**
 * `cloneNode` não copia bem o estado dos `<select>` controlados pelo React; o clone pode ficar com
 * `selectedIndex` errado e o PDF perde placas / situação. Copia `value` do DOM vivo antes de achatar.
 */
function syncSelectValuesFromSource(sourceRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const src = sourceRoot.querySelectorAll("select");
  const dst = cloneRoot.querySelectorAll("select");
  const n = Math.min(src.length, dst.length);
  for (let i = 0; i < n; i++) {
    const s = src[i] as HTMLSelectElement;
    const d = dst[i] as HTMLSelectElement;
    d.value = s.value;
  }
}

/** Texto visível do `<select>` para export/PDF (não depender só de `options[selectedIndex].text`). */
function getSelectExportText(sel: HTMLSelectElement): string {
  const fromSelected = sel.selectedOptions?.[0];
  if (fromSelected) {
    const t = (fromSelected.textContent ?? "").trim();
    if (t) return t;
  }
  const v = sel.value?.trim() ?? "";
  if (v) {
    const found = Array.from(sel.options).find((o) => o.value === v);
    if (found) return (found.textContent ?? "").trim();
    return v;
  }
  const idx = sel.selectedIndex;
  if (idx >= 0 && sel.options[idx]) {
    return (sel.options[idx].textContent ?? "").trim();
  }
  return "";
}

function flattenFormControls(root: HTMLElement): void {
  const doc = root.ownerDocument ?? document;

  root.querySelectorAll("input").forEach((node) => {
    const input = node as HTMLInputElement;
    if (input.type === "hidden") return;

    if (input.type === "checkbox") {
      const span = doc.createElement("span");
      /** Só o traço interior (✓); sem quadrado ☑/☐. */
      span.textContent = input.checked ? "\u2713" : "";
      span.setAttribute("aria-label", input.checked ? "Na oficina: sim" : "Na oficina: não");
      input.replaceWith(span);
      return;
    }

    /** Cabeçalho RDV: já existe um span com dd/mm/aaaa; não duplicar ao substituir o input date. */
    if (input.type === "date") {
      const headerLabel = input.closest(".rdv-pdf-header-shell h3 label.relative");
      if (headerLabel) {
        const dateVis = headerLabel.querySelector("span.block");
        const iso = input.value.trim();
        if (dateVis && iso) dateVis.textContent = isoDateToPtBr(iso) || dateVis.textContent || "—";
        else if (iso) {
          const fallback = doc.createElement("span");
          fallback.className = "block text-center font-bold underline decoration-dotted";
          fallback.textContent = isoDateToPtBr(iso) || "—";
          input.replaceWith(fallback);
          return;
        }
        input.remove();
        return;
      }
    }

    const span = doc.createElement("span");
    if (input.type === "date" && input.value) {
      const [y, m, d] = input.value.split("-");
      span.textContent = d && m && y ? `${d}/${m}/${y}` : input.value;
    } else {
      span.textContent = input.value;
    }
    input.replaceWith(span);
  });

  root.querySelectorAll("select").forEach((node) => {
    const sel = node as HTMLSelectElement;
    const span = doc.createElement("span");
    span.textContent = getSelectExportText(sel);
    sel.replaceWith(span);
  });

  root.querySelectorAll("textarea").forEach((node) => {
    const ta = node as HTMLTextAreaElement;
    const span = doc.createElement("span");
    span.textContent = ta.value;
    ta.replaceWith(span);
  });
}

/** Envolve o conteúdo de cada th/td do corpo do PDF num span, para deslocar só o texto (sem transform na célula). */
function wrapRdvPdfTableCellContents(root: HTMLElement): void {
  const cells = root.querySelectorAll<HTMLTableCellElement>(".rdv-pdf-body table th, .rdv-pdf-body table td");
  const doc = root.ownerDocument ?? document;
  for (const cell of cells) {
    if (cell.querySelector(":scope > .rdv-pdf-cell-inner")) continue;
    const inner = doc.createElement("span");
    inner.className = "rdv-pdf-cell-inner";
    while (cell.firstChild) {
      inner.appendChild(cell.firstChild);
    }
    cell.appendChild(inner);
  }
}

export type BuildRdvStandaloneHtmlOptions = {
  /** Data do relatório no cabeçalho (yyyy-mm-dd), antes de achatar inputs para o PDF. */
  headerDateIso?: string;
};

/** Ajusta data e dia da semana no clone (inputs ainda presentes). */
export function patchRdvExportHeaderDate(root: HTMLElement, iso: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return;
  const t = iso.trim();
  const dateIn = root.querySelector("input[type='date']");
  if (dateIn instanceof HTMLInputElement) dateIn.value = t;
  const label = root.querySelector(".rdv-pdf-header-shell h3 label.relative");
  const dateVis = label?.querySelector("span.block");
  if (dateVis) dateVis.textContent = isoDateToPtBr(t) || "—";
  const weekdayEl = root.querySelector(".rdv-pdf-header-weekday");
  if (weekdayEl) {
    const w = weekdayPtBrFromIsoDate(t);
    weekdayEl.textContent = w ? `(${w})` : "";
  }
}

/**
 * Mesmo HTML completo que o descarregamento Word (.html): isolado, sem Tailwind da app.
 */
export function buildRdvStandaloneHtmlDocument(
  element: HTMLElement,
  options?: BuildRdvStandaloneHtmlOptions,
): string {
  const clone = element.cloneNode(true) as HTMLElement;
  syncSelectValuesFromSource(element, clone);
  removeNoExportElements(clone);
  removeAcaoColumns(clone);
  if (options?.headerDateIso) {
    patchRdvExportHeaderDate(clone, options.headerDateIso);
  }
  flattenFormControls(clone);
  wrapRdvPdfTableCellContents(clone);

  const inner = clone.innerHTML;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório Diário de Viaturas</title>
<style>${RDV_EXPORT_STYLES}</style>
</head>
<body>
<div id="rdv-export-root" class="rdv-export-root">
${inner}
</div>
</body>
</html>`;
}
