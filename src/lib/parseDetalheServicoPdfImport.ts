import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { DetalheServicoSheetSnapshot } from "./generateDetalheServicoMotoristaPdf";

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

type TextItem = { str: string; x: number; y: number };

type ImportResult = {
  monthYear: string | null;
  sheet: DetalheServicoSheetSnapshot;
};

function parseMonthInput(value: string): { year: number; monthIndex: number } {
  const [y, m] = value.split("-").map(Number);
  return { year: y, monthIndex: (m || 1) - 1 };
}

function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildMonthDays(year: number, monthIndex: number): number[] {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const out: number[] = [];
  for (let day = 1; day <= last; day++) out.push(day);
  return out;
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePtUpper(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function parseMonthYearFromPdfText(text: string): string | null {
  const clean = normalizePtUpper(text);
  const monthMap: Record<string, number> = {
    JANEIRO: 1,
    FEVEREIRO: 2,
    MARCO: 3,
    ABRIL: 4,
    MAIO: 5,
    JUNHO: 6,
    JULHO: 7,
    AGOSTO: 8,
    SETEMBRO: 9,
    OUTUBRO: 10,
    NOVEMBRO: 11,
    DEZEMBRO: 12,
  };
  const m = clean.match(
    /\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(\d{4})\b/,
  );
  if (!m) return null;
  const month = monthMap[m[1]!] ?? 0;
  const year = Number(m[2]);
  if (!month || !Number.isFinite(year)) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function groupRowsByY(items: TextItem[], tolerance = 2.2): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows.find((r) => Math.abs(r[0]!.y - item.y) <= tolerance);
    if (row) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

function readTableRows(items: TextItem[], monthYear: string): DetalheServicoSheetSnapshot {
  const { year, monthIndex } = parseMonthInput(monthYear);
  const monthDays = buildMonthDays(year, monthIndex);

  const motoristaHeader = items.find((it) => it.str.trim().toUpperCase() === "MOTORISTA");
  if (!motoristaHeader) {
    throw new Error("Não foi possível localizar o cabeçalho da tabela no PDF.");
  }

  const subtitle = items.find((it) => normalizePtUpper(it.str).includes("DIAS NAO TRABALHADOS DO MES DE"));
  const subtitleY = subtitle?.y ?? -Infinity;

  const headerCandidates = items.filter((it) => Math.abs(it.y - motoristaHeader.y) <= 3.2);
  const dayXs = headerCandidates
    .map((it) => ({ x: it.x, n: Number(it.str.trim()) }))
    .filter((it) => Number.isInteger(it.n) && it.n >= 1 && it.n <= 31)
    .sort((a, b) => a.x - b.x)
    .map((it) => it.x);
  const uniqueDayXs = [...new Set(dayXs.map((x) => Math.round(x * 10) / 10))].sort((a, b) => a - b);
  if (uniqueDayXs.length < monthDays.length) {
    throw new Error("Não foi possível identificar todas as colunas de dia no PDF.");
  }
  const dayColumnsX = uniqueDayXs.slice(0, monthDays.length);
  const firstDayX = dayColumnsX[0]!;

  const tableItems = items.filter(
    (it) =>
      it.y < motoristaHeader.y - 1 &&
      it.y > subtitleY + 1 &&
      !normalizePtUpper(it.str).includes("DIAS NAO TRABALHADOS DO MES DE"),
  );
  const groupedRows = groupRowsByY(tableItems);

  const rows: string[] = [];
  const cells: Record<string, Record<string, string>> = {};

  for (const row of groupedRows) {
    const leftTokens = row.filter((it) => it.x < firstDayX - 2);
    const motorista = leftTokens.map((it) => it.str.trim()).filter(Boolean).join(" ").trim();
    if (!motorista) continue;
    if (normalizePtUpper(motorista).includes("SEM LINHAS")) continue;

    const rowId = newRowId();
    const rowCells: Record<string, string> = { motorista };
    for (let i = 0; i < monthDays.length; i++) {
      const day = monthDays[i]!;
      const x = dayColumnsX[i]!;
      const token = row
        .filter((it) => Math.abs(it.x - x) <= 3.2)
        .map((it) => it.str.trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (token && token !== "—") {
        rowCells[dateKey(year, monthIndex, day)] = token.toUpperCase();
      }
    }
    rows.push(rowId);
    cells[rowId] = rowCells;
  }

  if (rows.length === 0) {
    throw new Error("Não foi possível extrair linhas de motorista do PDF.");
  }
  return { rows, cells };
}

export async function parseDetalheServicoPdfImport(file: File, fallbackMonthYear: string): Promise<ImportResult> {
  const bytes = await file.arrayBuffer();
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const text = await page.getTextContent();
  const items: TextItem[] = text.items
    .map((it) => {
      if (!("str" in it) || !("transform" in it)) return null;
      const transform = it.transform as number[];
      return {
        str: String(it.str ?? ""),
        x: Number(transform[4] ?? 0),
        y: Number(transform[5] ?? 0),
      } satisfies TextItem;
    })
    .filter((it): it is TextItem => it !== null && it.str.trim().length > 0);

  const allText = items.map((it) => it.str).join(" ");
  const monthYear = parseMonthYearFromPdfText(allText) ?? fallbackMonthYear;
  const sheet = readTableRows(items, monthYear);
  return { monthYear, sheet };
}

