import autoTable from "jspdf-autotable";
import type { Styles, Table } from "jspdf-autotable";
import { jsPDF } from "jspdf";
import type { DetalheServicoFeriasPeriodo } from "./detalheServicoBundle";

type JsPDFWithLastTable = jsPDF & { lastAutoTable?: Table };

/** Alinhado ao estado da grelha em `detalhe-servico-sheet.tsx`. */
export type DetalheServicoSheetSnapshot = {
  rows: string[];
  cells: Record<string, Record<string, string>>;
};

/** Campos de assinatura / identificação abaixo da tabela «Dias não trabalhados». */
export type DetalheServicoRodapeAssinatura = {
  nome: string;
  postoGraduacao: string;
  funcao: string;
};

export interface DetalheServicoMotoristaPdfParams {
  monthYear: string;
  sheet: DetalheServicoSheetSnapshot;
  tableEditable: boolean;
  showRoTokens?: boolean;
  prevMonthSheet: DetalheServicoSheetSnapshot | null;
  /** Colunas com fundo cinza manual (chaves `motorista`, `YYYY-MM-DD`, cargaHoraria, …) — alinhado a `detalhe-servico-sheet.tsx`. */
  columnGray: Record<string, boolean>;
  /** Linha de assinatura + Nome, Posto/Graduação e Função (centralizado no PDF). */
  rodapeAssinatura: DetalheServicoRodapeAssinatura;
  /** Férias do mês atual por motorista (chave normalizada). */
  feriasForMonth?: Record<string, DetalheServicoFeriasPeriodo[]>;
}

function parseMonthYearValue(value: string): { year: number; monthIndex: number } | null {
  const parts = value.split("-");
  if (parts.length < 2) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { year: y, monthIndex: m - 1 };
}

function getPreviousMonthKey(monthYear: string): string {
  const p = parseMonthYearValue(monthYear);
  if (!p) return monthYear;
  const d = new Date(p.year, p.monthIndex - 1, 1);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type DayMeta = { day: number; date: Date; isWeekend: boolean };

function buildMonthDays(year: number, monthIndex: number): DayMeta[] {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const out: DayMeta[] = [];
  for (let day = 1; day <= last; day++) {
    const date = new Date(year, monthIndex, day);
    const wd = date.getDay();
    out.push({ day, date, isWeekend: wd === 0 || wd === 6 });
  }
  return out;
}

function letraDiaSemana(date: Date): string {
  const nome = date.toLocaleDateString("pt-PT", { weekday: "long" });
  return nome.charAt(0).toLocaleUpperCase("pt-PT");
}

const KEY_MOTORISTA = "motorista";
const KEY_CARGA_HORARIA = "cargaHoraria";
const KEY_NUM_SERVICOS = "numServicos";
const KEY_NUM_ROTINAS = "numRotinas";
const CROSSED_TOKEN_PREFIX = "__X__";

const COLUNAS_EXTRAS_EDICAO = [
  { key: KEY_CARGA_HORARIA, titulo: "Carga Horária" },
  { key: KEY_NUM_SERVICOS, titulo: "Nº de Serviços" },
  { key: KEY_NUM_ROTINAS, titulo: "Nº de Rotinas" },
] as const;

function cellContainsWorkToken(raw: string): boolean {
  const tokens = raw
    .trim()
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  return tokens.some((t) => t === "S" || t === "RO");
}

function stripCrossedPrefixForDisplay(raw: string): string {
  return raw
    .trim()
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .map((t) => (t.startsWith(CROSSED_TOKEN_PREFIX) ? t.slice(CROSSED_TOKEN_PREFIX.length) : t))
    .join(" ");
}

function stripRoTokens(raw: string): string {
  const tokens = raw
    .trim()
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const withoutRo = tokens.filter((t) => t.toUpperCase() !== "RO");
  return withoutRo.join(" ");
}

function listDiasSemMarcacaoSingleRow(
  snapshot: DetalheServicoSheetSnapshot,
  rowId: string,
  prevYear: number,
  prevMonthIndex: number,
  prevDays: DayMeta[],
): number[] {
  const out: number[] = [];
  for (const { day } of prevDays) {
    const dk = dateKey(prevYear, prevMonthIndex, day);
    const raw = snapshot.cells[rowId]?.[dk] ?? "";
    if (!cellContainsWorkToken(raw)) out.push(day);
  }
  return out;
}

function isMotoristaCargaHorariaAutomatica(motorista: string): boolean {
  const nome = motorista.toUpperCase().trim();
  return nome.includes("RM1") || /^FC(?:\b|[-\s])/.test(nome);
}

function isMotoristaFC(motorista: string): boolean {
  const nome = motorista.trim().toUpperCase();
  // Considera apenas FC como iniciais/posto no início do nome (ex.: "FC-Hélio", "FC Silva").
  return /^FC(?:\b|[-\s])/.test(nome);
}

function normalizeMotoristaName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function parseIsoDateLocal(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isDayInFeriasPeriods(
  year: number,
  monthIndex: number,
  day: number,
  periods: DetalheServicoFeriasPeriodo[] | undefined,
): boolean {
  if (!periods?.length) return false;
  const t = new Date(year, monthIndex, day);
  t.setHours(0, 0, 0, 0);
  for (const p of periods) {
    const a = parseIsoDateLocal(p.inicio);
    const b = parseIsoDateLocal(p.fim);
    if (!a || !b) continue;
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    if (a > b) continue;
    if (t >= a && t <= b) return true;
  }
  return false;
}

function tallyDayCellTokens(
  rowCells: Record<string, string>,
  motoristaDisplay: string,
  year: number,
  monthIndex: number,
  days: DayMeta[],
  feriasForMonth: Record<string, DetalheServicoFeriasPeriodo[]>,
): { s: number; ro: number; horas: number } {
  const feriasPeriods = feriasForMonth[normalizeMotoristaName(motoristaDisplay)];
  let s = 0;
  let ro = 0;
  for (const { day } of days) {
    if (isDayInFeriasPeriods(year, monthIndex, day, feriasPeriods)) continue;
    const dk = dateKey(year, monthIndex, day);
    const raw = (rowCells[dk] ?? "").trim();
    if (!raw) continue;
    const tokens = raw
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    for (const t of tokens) {
      if (t === "RO") ro += 1;
      else if (t === "S") s += 1;
    }
  }
  return { s, ro, horas: s * 24 + ro * 8 };
}

function parseHorasCargaTexto(s: string): number | null {
  const m = s.trim().match(/[\d.,]+/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Ex.: «MARÇO DE 2025» para o cabeçalho do PDF. */
export function formatDetalheServicoPdfMonthYear(monthYear: string): string {
  const parsed = parseMonthYearValue(monthYear);
  if (!parsed) return monthYear;
  const { year, monthIndex } = parsed;
  const d = new Date(year, monthIndex, 1);
  const monthName = d.toLocaleDateString("pt-PT", { month: "long" });
  return `${monthName.toLocaleUpperCase("pt-PT")} DE ${year}`;
}

function formatMonthYearTitlePt(monthKey: string): string {
  const p = parseMonthYearValue(monthKey);
  if (!p) return monthKey;
  const { year, monthIndex } = p;
  const s = new Date(year, monthIndex, 1).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toLocaleUpperCase("pt-PT") + s.slice(1);
}

type JsPDFWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

const MARGIN = 10;

/** Distância da borda superior da folha A4 à linha de base da primeira linha do título (mm). */
const PDF_TITULO_DIST_TOPO_MM = 7;
/** Espaçamento entre linhas consecutivas do título institucional (mm). */
const PDF_TITULO_ENTRE_LINHAS_MM = 5.5;
/** Espaço entre a última linha do título e o topo da primeira tabela (mm). */
const PDF_TITULO_PARA_TABELA_MM = 1.5;
/** Espaço após o fim da primeira tabela antes do subtítulo «Dias não trabalhados» (mm). */
const PDF_APOS_TABELA1_MM = 6;
/** Espaço entre o subtítulo «Dias não trabalhados» e a segunda tabela (mm). */
const PDF_SUBTITULO_PARA_TABELA2_MM = 3;
/** Espaço após a 2.ª tabela antes do bloco de assinatura (mm). */
const PDF_APOS_TABELA2_RODAPE_MM = 6;
/** Distância da linha de base do último texto do rodapé (valor de «Função», se existir) à borda inferior da folha A4 (mm). */
const PDF_RODAPE_FUNCAO_DIST_BORDA_INFERIOR_MM = 7;
/** Largura da linha de assinatura (mm). */
const PDF_RODAPE_LINHA_ASSINATURA_MM = 72;

/** Tailwind `neutral-200` — mesmo tom da grelha (fins de semana / coluna cinza). */
const BG_NEUTRAL_200: [number, number, number] = [229, 231, 235];
const BG_WHITE: [number, number, number] = [255, 255, 255];
/** Cabeçalhos das colunas extra quando não cinzas: `muted/0.25` na UI. */
const BG_EXTRA_HEAD_MUTED: [number, number, number] = [243, 244, 246];

/** Mesmo tamanho de letra e padding nas duas tabelas do PDF (grelha + dias não trabalhados). */
const PDF_TABELA_FONT_PT = 8;
const PDF_TABELA_CELL_PADDING_MM = 1.5;
/** Grelha visível (títulos e células). */
const PDF_TABELA_LINE_WIDTH_MM = 0.2;
const PDF_TABELA_LINE_COLOR: [number, number, number] = [55, 55, 55];

/** Base tipográfica partilhada (o plugin usa 10 pt por omissão se não ficar explícito em cada célula). */
const PDF_TABELA_BASE_STYLES = {
  font: "helvetica" as const,
  fontSize: PDF_TABELA_FONT_PT,
  textColor: [20, 20, 20] as [number, number, number],
};

/** Altura mínima só para a linha de títulos da grelha (duas linhas: letra do dia + número). */
const PDF_TABELA_MIN_ALTURA_CABECALHO_MM = 8;

function aplicarFonteUniformePdfTabela(
  section: "head" | "body" | "foot",
  styles: Partial<Styles>,
  fontPt: number,
  cellPad: number,
): void {
  styles.font = PDF_TABELA_BASE_STYLES.font;
  styles.fontSize = fontPt;
  styles.fontStyle = section === "head" ? "bold" : "normal";
  styles.textColor = PDF_TABELA_BASE_STYLES.textColor;
  styles.cellPadding = cellPad;
}

/** Estimativa do espaço vertical (mm) do bloco de assinatura (linha + textos). */
function estimateRodapeBlockMm(rodape: DetalheServicoRodapeAssinatura): number {
  const vals = [rodape.nome, rodape.postoGraduacao, rodape.funcao]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  if (vals.length === 0) return 0;
  return PDF_APOS_TABELA2_RODAPE_MM + 6 + 4 + vals.length * 10;
}

/**
 * Reduz fonte/padding das tabelas para caber numa única folha A4 paisagem (título + 2 tabelas + rodapé).
 * `yAfterTitle` = coordenada Y (mm) do início da 1.ª tabela.
 */
function computeSinglePageTableMetrics(
  pageH: number,
  yAfterTitle: number,
  rowCount1: number,
  rowCount2: number,
  rodapeMm: number,
): { fontPt: number; cellPad: number; headMin: number } {
  const roomBelowTitle = pageH - PDF_RODAPE_FUNCAO_DIST_BORDA_INFERIOR_MM - yAfterTitle;
  const gaps =
    PDF_APOS_TABELA1_MM + 10 + PDF_SUBTITULO_PARA_TABELA2_MM + Math.max(rodapeMm, 4) + 2;
  const usable = roomBelowTitle - gaps;
  const n1 = Math.max(1, rowCount1);
  const n2 = Math.max(1, rowCount2);
  const estTable1 = 11 + n1 * 5;
  const estTable2 = n2 * 4.8 + 2;
  const totalEst = estTable1 + estTable2;
  if (totalEst <= usable || usable <= 24) {
    return {
      fontPt: PDF_TABELA_FONT_PT,
      cellPad: PDF_TABELA_CELL_PADDING_MM,
      headMin: PDF_TABELA_MIN_ALTURA_CABECALHO_MM,
    };
  }
  const scale = Math.max(0.52, Math.min(1, usable / totalEst));
  const fontPt = Math.max(5, Math.round(PDF_TABELA_FONT_PT * scale * 2) / 2);
  const cellPad = Math.max(0.35, Math.min(PDF_TABELA_CELL_PADDING_MM, PDF_TABELA_CELL_PADDING_MM * scale));
  const headMin = Math.max(5, fontPt + 1.5);
  return { fontPt, cellPad, headMin };
}

/** Altura desde a linha horizontal de assinatura até à linha de base do último texto (mm). */
function measureRodapeHeightFromLinhaAssinaturaAteUltimaLinha(
  doc: jsPDF,
  valoresPreenchidos: string[],
  textMaxW: number,
  fontPt: number,
  lineH: number,
  gapB: number,
): number {
  let h = 6;
  doc.setFontSize(fontPt);
  for (let i = 0; i < valoresPreenchidos.length; i++) {
    const lines = doc.splitTextToSize(valoresPreenchidos[i]!, textMaxW, { fontSize: fontPt });
    const toDraw = lines.length > 0 ? lines : [valoresPreenchidos[i]!];
    h += toDraw.length * lineH;
    if (i < valoresPreenchidos.length - 1) h += gapB;
  }
  return h;
}

/** Linha de assinatura + textos (só preenchidos), centrados — **sempre na mesma página** que a 2.ª tabela; comprime se faltar espaço. Última linha de texto com `PDF_RODAPE_FUNCAO_DIST_BORDA_INFERIOR_MM` à borda inferior. */
function drawRodapeAssinaturaPdf(
  doc: jsPDF,
  pageW: number,
  tableBottomY: number,
  rodape: DetalheServicoRodapeAssinatura,
): void {
  const nome = String(rodape.nome ?? "").trim();
  const posto = String(rodape.postoGraduacao ?? "").trim();
  const funcao = String(rodape.funcao ?? "").trim();

  const valoresPreenchidos = [nome, posto, funcao].filter((v) => v.length > 0);
  if (valoresPreenchidos.length === 0) return;

  const centerX = pageW / 2;
  const pageH = doc.internal.pageSize.getHeight();
  const textMaxW = Math.min(110, pageW - 2 * MARGIN);
  const lastBaselineY = pageH - PDF_RODAPE_FUNCAO_DIST_BORDA_INFERIOR_MM;
  const minYLinhaAssinatura = tableBottomY + PDF_APOS_TABELA2_RODAPE_MM;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);

  let fontPt = 9;
  let lineH = 3.6;
  let gapEntreBlocos = 2.2;
  for (let s = 0; s < 40; s++) {
    lineH = Math.max(2.4, fontPt * 0.4);
    gapEntreBlocos = Math.max(1, fontPt * 0.28);
    const hBlock = measureRodapeHeightFromLinhaAssinaturaAteUltimaLinha(
      doc,
      valoresPreenchidos,
      textMaxW,
      fontPt,
      lineH,
      gapEntreBlocos,
    );
    const yLinha = lastBaselineY - hBlock;
    if (yLinha >= minYLinhaAssinatura || fontPt <= 5) break;
    fontPt = Math.max(5, Math.round((fontPt - 0.5) * 2) / 2);
  }

  lineH = Math.max(2.4, fontPt * 0.4);
  gapEntreBlocos = Math.max(1, fontPt * 0.28);
  const hBlock = measureRodapeHeightFromLinhaAssinaturaAteUltimaLinha(
    doc,
    valoresPreenchidos,
    textMaxW,
    fontPt,
    lineH,
    gapEntreBlocos,
  );
  let y = lastBaselineY - hBlock;

  doc.setDrawColor(55, 55, 55);
  doc.setLineWidth(0.25);
  const half = PDF_RODAPE_LINHA_ASSINATURA_MM / 2;
  doc.line(centerX - half, y, centerX + half, y);
  y += 6;

  doc.setFontSize(fontPt);
  for (let i = 0; i < valoresPreenchidos.length; i++) {
    const display = valoresPreenchidos[i]!;
    const lines = doc.splitTextToSize(display, textMaxW, { fontSize: fontPt });
    const toDraw = lines.length > 0 ? lines : [display];
    for (const line of toDraw) {
      doc.text(line, centerX, y, { align: "center" });
      y += lineH;
    }
    if (i < valoresPreenchidos.length - 1) y += gapEntreBlocos;
  }
}

/**
 * PDF com cabeçalho institucional e as duas tabelas (grelha do mês + dias não trabalhados).
 */
export function downloadDetalheServicoMotoristaPdf(params: DetalheServicoMotoristaPdfParams): void {
  const {
    monthYear,
    sheet,
    tableEditable,
    showRoTokens = true,
    prevMonthSheet,
    columnGray,
    rodapeAssinatura,
    feriasForMonth,
  } = params;
  const parsed = parseMonthYearValue(monthYear);
  if (!parsed) {
    downloadDetalheServicoMotoristaPdfHeadersOnly(monthYear);
    return;
  }
  const { year, monthIndex } = parsed;
  const days = buildMonthDays(year, monthIndex);
  const prevMonthKey = getPreviousMonthKey(monthYear);
  const prevParsed = parseMonthYearValue(prevMonthKey);
  const prevDays =
    prevParsed ? buildMonthDays(prevParsed.year, prevParsed.monthIndex) : [];

  const headRow: string[] = ["Motorista"];
  for (const { day, date } of days) {
    headRow.push(`${letraDiaSemana(date)}\n${day}`);
  }
  if (tableEditable) {
    for (const { titulo } of COLUNAS_EXTRAS_EDICAO) {
      headRow.push(titulo);
    }
  }

  const body1: string[][] = [];
  const feriasCellMap: Record<string, { isFerias: boolean; isMiddle: boolean; hasPrev: boolean; hasNext: boolean }> = {};
  if (sheet.rows.length === 0) {
    const emptyRow = Array(headRow.length).fill("—");
    emptyRow[0] = "Sem linhas";
    body1.push(emptyRow);
  } else {
    for (const rowId of sheet.rows) {
      const rowCells = sheet.cells[rowId] ?? {};
      const motoristaVal = rowCells[KEY_MOTORISTA] ?? "";
      const cargaAutoPorMotorista = isMotoristaCargaHorariaAutomatica(motoristaVal);
      const motorFerias = (feriasForMonth ?? {})[normalizeMotoristaName(motoristaVal)];
      const rowCellsForPdf = showRoTokens
        ? rowCells
        : Object.fromEntries(
            Object.entries(rowCells).map(([k, v]) => [k, stripRoTokens(v ?? "")]),
          );
      const tallyForPdf = tallyDayCellTokens(
        rowCellsForPdf,
        motoristaVal,
        year,
        monthIndex,
        days,
        feriasForMonth ?? {},
      );
      const cells: string[] = [motoristaVal.trim() || "—"];
      const rowIndex = body1.length;
      const lastCalendarDay = days[days.length - 1]?.day ?? 31;
      for (const { day } of days) {
        const dk = dateKey(year, monthIndex, day);
        const isFerias = isDayInFeriasPeriods(year, monthIndex, day, motorFerias);
        if (!isFerias) {
          const rawCell = stripCrossedPrefixForDisplay(rowCells[dk] ?? "");
          cells.push((showRoTokens ? rawCell : stripRoTokens(rawCell)).trim() || "");
          continue;
        }
        const hasPrev = day > 1 && isDayInFeriasPeriods(year, monthIndex, day - 1, motorFerias);
        const hasNext =
          day < lastCalendarDay && isDayInFeriasPeriods(year, monthIndex, day + 1, motorFerias);
        let start = day;
        let end = day;
        while (start > 1 && isDayInFeriasPeriods(year, monthIndex, start - 1, motorFerias)) start -= 1;
        while (end < lastCalendarDay && isDayInFeriasPeriods(year, monthIndex, end + 1, motorFerias)) end += 1;
        const middle = Math.floor((start + end) / 2);
        const isMiddle = day === middle;
        const colIndex = day;
        feriasCellMap[`${rowIndex}:${colIndex}`] = { isFerias, isMiddle, hasPrev, hasNext };
        cells.push(isMiddle ? "FÉRIAS" : "");
      }
      if (tableEditable) {
        for (const { key: cellKey } of COLUNAS_EXTRAS_EDICAO) {
          let v = rowCells[cellKey] ?? "";
          if (cellKey === KEY_CARGA_HORARIA && cargaAutoPorMotorista) v = String(tallyForPdf.horas);
          else if (cellKey === KEY_NUM_SERVICOS) v = String(tallyForPdf.s);
          else if (cellKey === KEY_NUM_ROTINAS) v = String(tallyForPdf.ro);
          else if (cellKey === KEY_CARGA_HORARIA && !cargaAutoPorMotorista) {
            const n = parseHorasCargaTexto(rowCells[KEY_CARGA_HORARIA] ?? "");
            v = n !== null ? String(n) : v;
          }
          cells.push(v);
        }
      }
      body1.push(cells);
    }
  }

  const body2: string[][] = [];
  if (!prevMonthSheet || prevMonthSheet.rows.length === 0) {
    body2.push([
      "—",
      !prevMonthSheet
        ? "Sem dados guardados para o mês anterior."
        : "Sem linhas na grelha desse mês.",
    ]);
  } else if (prevParsed) {
    const prevMonthRowsFC = prevMonthSheet.rows.filter((rowId) =>
      isMotoristaFC((prevMonthSheet.cells[rowId]?.[KEY_MOTORISTA] ?? "").trim()),
    );
    if (prevMonthRowsFC.length === 0) {
      body2.push(["—", "Sem motoristas com FC no mês anterior."]);
    } else {
    const rowNums: number[][] = [];
    for (const rowId of prevMonthRowsFC) {
      rowNums.push(
        listDiasSemMarcacaoSingleRow(
          prevMonthSheet,
          rowId,
          prevParsed.year,
          prevParsed.monthIndex,
          prevDays,
        ),
      );
    }
    let maxLen = 0;
    for (const nums of rowNums) {
      if (nums.length > maxLen) maxLen = nums.length;
    }
    if (maxLen === 0) maxLen = 1;

    for (let i = 0; i < prevMonthRowsFC.length; i++) {
      const rowId = prevMonthRowsFC[i]!;
      const nome = (prevMonthSheet.cells[rowId]?.[KEY_MOTORISTA] ?? "").trim() || "—";
      const nums = rowNums[i]!;
      const row: string[] = [nome];
      if (nums.length === 0) {
        row.push("—");
        for (let p = 1; p < maxLen; p++) row.push("");
      } else {
        for (let j = 0; j < maxLen; j++) {
          row.push(j < nums.length ? String(nums[j]) : "");
        }
      }
      body2.push(row);
    }
    }
  }
  if (body2.length === 0) {
    body2.push(["—", "—"]);
  }

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "landscape",
  }) as JsPDFWithAutoTable;
  const pageW = doc.internal.pageSize.getWidth();
  const centerX = pageW / 2;
  let y = PDF_TITULO_DIST_TOPO_MM;

  const lines = [
    "MARINHA DO BRASIL",
    "HOSPITAL NAVAL MARCÍLIO DIAS",
    "DETALHE DE SERVIÇO DE MOTORISTA",
    formatDetalheServicoPdfMonthYear(monthYear),
  ];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i]!, centerX, y, { align: "center" });
    if (i < lines.length - 1) y += PDF_TITULO_ENTRE_LINHAS_MM;
  }
  y += PDF_TITULO_PARA_TABELA_MM;

  const pageH = doc.internal.pageSize.getHeight();
  const rodapeMmEst = estimateRodapeBlockMm(rodapeAssinatura);
  const metrics = computeSinglePageTableMetrics(
    pageH,
    y,
    body1.length,
    body2.length,
    rodapeMmEst,
  );

  const cellSt = {
    ...PDF_TABELA_BASE_STYLES,
    fontSize: metrics.fontPt,
    fontStyle: "normal" as const,
    cellPadding: metrics.cellPad,
    overflow: "linebreak" as const,
    valign: "middle" as const,
  };

  autoTable(doc, {
    startY: y,
    head: [headRow],
    body: body1,
    margin: { left: MARGIN, right: MARGIN },
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    tableLineWidth: PDF_TABELA_LINE_WIDTH_MM,
    tableLineColor: PDF_TABELA_LINE_COLOR,
    styles: {
      ...cellSt,
      fillColor: BG_WHITE,
    },
    bodyStyles: {
      ...cellSt,
      fillColor: BG_WHITE,
    },
    alternateRowStyles: {
      ...cellSt,
      fillColor: BG_WHITE,
    },
    headStyles: {
      ...PDF_TABELA_BASE_STYLES,
      fontSize: metrics.fontPt,
      fontStyle: "bold",
      cellPadding: metrics.cellPad,
      overflow: "linebreak",
      valign: "middle",
      halign: "center",
      minCellHeight: metrics.headMin,
    },
    theme: "grid",
    tableWidth: "auto",
    didParseCell: (data) => {
      aplicarFonteUniformePdfTabela(data.section, data.cell.styles, metrics.fontPt, metrics.cellPad);
      const colIdx = data.column.index;
      const cg = columnGray ?? {};

      if (data.section === "head") {
        data.cell.styles.halign = "center";
        data.cell.styles.valign = "middle";
        if (colIdx === 0) {
          data.cell.styles.fillColor = cg[KEY_MOTORISTA] ? BG_NEUTRAL_200 : BG_WHITE;
        } else if (colIdx <= days.length) {
          const dm = days[colIdx - 1]!;
          const dk = dateKey(year, monthIndex, dm.day);
          const grayCol = !!(cg[dk] || dm.isWeekend);
          data.cell.styles.fillColor = grayCol ? BG_NEUTRAL_200 : BG_WHITE;
        } else if (tableEditable) {
          const extra = COLUNAS_EXTRAS_EDICAO[colIdx - 1 - days.length];
          if (extra) {
            data.cell.styles.fillColor = cg[extra.key] ? BG_NEUTRAL_200 : BG_EXTRA_HEAD_MUTED;
          }
        }
        return;
      }

      if (data.section === "body") {
        if (colIdx === 0) {
          data.cell.styles.halign = "left";
          data.cell.styles.fillColor = cg[KEY_MOTORISTA] ? BG_NEUTRAL_200 : BG_WHITE;
        } else if (colIdx <= days.length) {
          const f = feriasCellMap[`${data.row.index}:${colIdx}`];
          if (f?.isFerias) {
            data.cell.styles.halign = "center";
            data.cell.styles.fillColor = BG_NEUTRAL_200;
            data.cell.styles.fontStyle = f.isMiddle ? "bold" : "normal";
            data.cell.styles.lineWidth = {
              top: PDF_TABELA_LINE_WIDTH_MM,
              bottom: PDF_TABELA_LINE_WIDTH_MM,
              left: f.hasPrev ? 0 : PDF_TABELA_LINE_WIDTH_MM,
              right: f.hasNext ? 0 : PDF_TABELA_LINE_WIDTH_MM,
            };
            return;
          }
          data.cell.styles.halign = "center";
          const dm = days[colIdx - 1]!;
          const dk = dateKey(year, monthIndex, dm.day);
          const grayCol = !!(cg[dk] || dm.isWeekend);
          data.cell.styles.fillColor = grayCol ? BG_NEUTRAL_200 : BG_WHITE;
        } else if (tableEditable) {
          data.cell.styles.halign = "center";
          const extra = COLUNAS_EXTRAS_EDICAO[colIdx - 1 - days.length];
          if (extra) {
            data.cell.styles.fillColor = cg[extra.key] ? BG_NEUTRAL_200 : BG_WHITE;
          }
        }
      }
    },
  });

  const finalY1 = doc.lastAutoTable?.finalY ?? y + 40;
  let y2 = finalY1 + PDF_APOS_TABELA1_MM;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Dias não trabalhados do mês de ${formatMonthYearTitlePt(prevMonthKey)}`,
    MARGIN,
    y2,
  );
  y2 += PDF_SUBTITULO_PARA_TABELA2_MM;

  doc.setFont(PDF_TABELA_BASE_STYLES.font, "normal");
  doc.setFontSize(metrics.fontPt);

  autoTable(doc, {
    startY: y2,
    body: body2,
    showHead: false,
    margin: { left: MARGIN, right: MARGIN },
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    tableLineWidth: PDF_TABELA_LINE_WIDTH_MM,
    tableLineColor: PDF_TABELA_LINE_COLOR,
    styles: {
      ...cellSt,
      fillColor: BG_WHITE,
    },
    bodyStyles: {
      ...cellSt,
      fillColor: BG_WHITE,
    },
    alternateRowStyles: {
      ...cellSt,
      fillColor: [252, 252, 252],
    },
    theme: "grid",
    tableWidth: "auto",
    didParseCell: (data) => {
      aplicarFonteUniformePdfTabela("body", data.cell.styles, metrics.fontPt, metrics.cellPad);
    },
  });

  const docLt = doc as JsPDFWithLastTable;
  const lastAt = docLt.lastAutoTable;
  const finalY2 =
    typeof lastAt?.finalY === "number" && Number.isFinite(lastAt.finalY)
      ? lastAt.finalY
      : y2 + 24;

  const totalPages = doc.getNumberOfPages();
  let endPage = totalPages;
  if (
    lastAt?.startPageNumber != null &&
    lastAt.pageNumber != null &&
    lastAt.startPageNumber > 0 &&
    lastAt.pageNumber > 0
  ) {
    endPage = lastAt.startPageNumber + lastAt.pageNumber - 1;
  }
  doc.setPage(Math.min(endPage, totalPages));

  drawRodapeAssinaturaPdf(doc, pageW, finalY2, rodapeAssinatura);

  const slug = monthYear.replace(/[^\d-]/g, "") || "mes";
  doc.save(`detalhe-servico-motorista-${slug}.pdf`);
}

function downloadDetalheServicoMotoristaPdfHeadersOnly(monthYear: string): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const centerX = pageW / 2;
  let y = PDF_TITULO_DIST_TOPO_MM;
  const lines = [
    "MARINHA DO BRASIL",
    "HOSPITAL NAVAL MARCÍLIO DIAS",
    "DETALHE DE SERVIÇO DE MOTORISTA",
    formatDetalheServicoPdfMonthYear(monthYear),
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  for (let i = 0; i < lines.length; i++) {
    doc.text(lines[i]!, centerX, y, { align: "center" });
    if (i < lines.length - 1) y += PDF_TITULO_ENTRE_LINHAS_MM + 1;
  }
  const slug = monthYear.replace(/[^\d-]/g, "") || "mes";
  doc.save(`detalhe-servico-motorista-${slug}.pdf`);
}
