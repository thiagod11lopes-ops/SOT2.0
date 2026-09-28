type SheetInput = {
  name: string;
  tabColor: string;
  widths: number[];
  headers: string[];
  rows: (string | number | null)[][];
  dateColumns: number[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function xmlEscape(value: string): string {
  let clean = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)) continue;
    clean += ch;
  }
  return clean
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blobPart(data: Uint8Array): BlobPart {
  return data.slice().buffer as ArrayBuffer;
}

function colName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1C2430"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FB"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;
}

function sheetXml(sheet: SheetInput): string {
  const dateCols = new Set(sheet.dateColumns);
  const lastCol = colName(Math.max(sheet.headers.length - 1, 0));
  const lastRow = sheet.rows.length + 1;
  const cols = sheet.widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const header = sheet.headers
    .map((header, index) => `<c r="${colName(index)}1" t="inlineStr" s="1"><is><t>${xmlEscape(header)}</t></is></c>`)
    .join("");
  const body = sheet.rows
    .map((row, rowIndex) => {
      const excelRow = rowIndex + 2;
      const zebra = rowIndex % 2 === 1;
      const cells = sheet.headers
        .map((_, index) => {
          const value = row[index];
          if (value === null || value === undefined || value === "") return "";
          const ref = `${colName(index)}${excelRow}`;
          if (dateCols.has(index) && typeof value === "number") {
            return `<c r="${ref}" s="${zebra ? 5 : 3}"><v>${value}</v></c>`;
          }
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}" s="${zebra ? 4 : 2}"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr" s="${zebra ? 4 : 2}"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
        })
        .join("");
      return `<row r="${excelRow}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><tabColor rgb="${sheet.tabColor}"/></sheetPr>
  <dimension ref="A1:${lastCol}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData><row r="1" ht="22" customHeight="1">${header}</row>${body}</sheetData>
  <autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`;
}

function workbookXml(sheets: SheetInput[]): string {
  const list = sheets
    .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${list}</sheets>
</workbook>`;
}

function workbookRels(sheets: SheetInput[]): string {
  const sheetsRels = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  const styleId = sheets.length + 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetsRels}
  <Relationship Id="rId${styleId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function contentTypes(sheets: SheetInput[]): string {
  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${overrides}
</Types>`;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    u32(view, 0, 0x04034b50);
    u16(view, 4, 20);
    u32(view, 14, crc);
    u32(view, 18, file.data.length);
    u32(view, 22, file.data.length);
    u16(view, 26, name.length);
    local.set(name, 30);
    parts.push(local, file.data);

    const cen = new Uint8Array(46 + name.length);
    const cenView = new DataView(cen.buffer);
    u32(cenView, 0, 0x02014b50);
    u16(cenView, 4, 20);
    u16(cenView, 6, 20);
    u32(cenView, 16, crc);
    u32(cenView, 20, file.data.length);
    u32(cenView, 24, file.data.length);
    u16(cenView, 28, name.length);
    u32(cenView, 42, offset);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + file.data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  u32(endView, 0, 0x06054b50);
  u16(endView, 8, files.length);
  u16(endView, 10, files.length);
  u32(endView, 12, centralSize);
  u32(endView, 16, offset);
  return new Blob([...parts.map(blobPart), ...central.map(blobPart), blobPart(end)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function buildXlsx(sheets: SheetInput[]): Blob {
  const files = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes(sheets)) },
    {
      name: "_rels/.rels",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
      ),
    },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml(sheets)) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels(sheets)) },
    { name: "xl/styles.xml", data: encoder.encode(stylesXml()) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encoder.encode(sheetXml(sheet)),
    })),
  ];
  return zipStore(files);
}

type ZipEntry = { name: string; method: number; data: Uint8Array };

function findEocd(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= start; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  return -1;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([blobPart(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buffer);
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error("Arquivo Excel inválido.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Arquivo Excel inválido.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
    if (!data) throw new Error("Arquivo Excel inválido.");
    entries.push({ name, method, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function tags(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", name));
}

function textOf(node: Element): string {
  return tags(node, "t")
    .map((item) => item.textContent ?? "")
    .join("");
}

function parseSheet(xml: string, shared: string[]): (string | number | null)[][] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rows = tags(doc, "row");
  return rows.map((row) => {
    const cells = tags(row, "c");
    const values: (string | number | null)[] = [];
    for (const cell of cells) {
      const ref = cell.getAttribute("r") ?? "";
      const index = colIndex(ref);
      const type = cell.getAttribute("t");
      let value: string | number | null = null;
      if (type === "inlineStr") value = textOf(cell);
      else if (type === "s") {
        const raw = tags(cell, "v")[0]?.textContent ?? "";
        value = shared[Number(raw)] ?? "";
      } else if (type === "str") value = tags(cell, "v")[0]?.textContent ?? "";
      else {
        const raw = tags(cell, "v")[0]?.textContent ?? "";
        if (raw !== "") value = Number.isFinite(Number(raw)) ? Number(raw) : raw;
      }
      while (values.length < index) values.push(null);
      values[index] = value;
    }
    return values;
  });
}

function sharedStrings(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return tags(doc, "si").map((item) => textOf(item));
}

export async function readXlsxSheets(buffer: ArrayBuffer): Promise<Map<string, (string | number | null)[][]>> {
  const entries = await unzip(buffer);
  const byName = new Map(entries.map((entry) => [entry.name.replace(/\\/g, "/"), decoder.decode(entry.data)]));
  const workbook = byName.get("xl/workbook.xml");
  const rels = byName.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new Error("Arquivo Excel inválido.");
  const shared = byName.has("xl/sharedStrings.xml") ? sharedStrings(byName.get("xl/sharedStrings.xml")!) : [];
  const workbookDoc = new DOMParser().parseFromString(workbook, "application/xml");
  const relDoc = new DOMParser().parseFromString(rels, "application/xml");
  const targets = new Map<string, string>();
  for (const rel of tags(relDoc, "Relationship")) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) targets.set(id, target.replace(/^\//, "").replace(/^xl\//, ""));
  }
  const sheets = new Map<string, (string | number | null)[][]>();
  for (const sheet of tags(workbookDoc, "sheet")) {
    const name = sheet.getAttribute("name") ?? "";
    const id =
      sheet.getAttribute("r:id") ||
      sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ||
      "";
    const target = targets.get(id);
    if (!name || !target) continue;
    const xml = byName.get(`xl/${target}`);
    if (!xml) continue;
    sheets.set(name, parseSheet(xml, shared));
  }
  return sheets;
}
