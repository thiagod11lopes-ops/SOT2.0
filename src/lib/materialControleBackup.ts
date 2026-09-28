import { buildXlsx, readXlsxSheets } from "./xlsxWorkbook";
import {
  materialMovimentoIsoFromDateAndTime,
  newMaterialId,
  normalizeMaterialControleDoc,
  type MaterialControleDoc,
  type MaterialEmprestimo,
  type MaterialItem,
  type MaterialItemStatus,
  type MaterialMovimento,
  type MaterialMovimentoTipo,
  type MaterialPlanilha,
} from "./materialControleStorage";

const SHEET_ORGS = "Organizações";
const SHEET_ITEMS = "Materiais";
const SHEET_MOVES = "Movimentos";
const SHEET_LOANS = "Empréstimos";

function excelSerial(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

function isoFromCell(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    if (Number.isNaN(utc.getTime())) return null;
    return new Date(
      utc.getUTCFullYear(),
      utc.getUTCMonth(),
      utc.getUTCDate(),
      utc.getUTCHours(),
      utc.getUTCMinutes(),
      utc.getUTCSeconds(),
    ).toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/.exec(text);
  if (br) {
    return materialMovimentoIsoFromDateAndTime(
      `${br[3]}-${br[2]}-${br[1]}`,
      br[4] ? `${br[4]}:${br[5]}` : "12:00",
    );
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function qty(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const parsed = Number.parseFloat(text(value).replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function sheetKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function rowsOf(sheets: Map<string, (string | number | null)[][]>, name: string) {
  for (const [sheetName, rows] of sheets) {
    if (sheetKey(sheetName) === sheetKey(name)) return rows;
  }
  return null;
}

function objects(rows: (string | number | null)[][] | null): Record<string, string | number | null>[] {
  if (!rows || rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((cell) => text(cell));
  return rows.slice(1).filter((row) => row.some((cell) => text(cell) !== "")).map((row) => {
    const record: Record<string, string | number | null> = {};
    headers.forEach((header, index) => {
      if (header) record[header] = row[index] ?? null;
    });
    return record;
  });
}

export function buildMaterialBackup(doc: MaterialControleDoc): Blob {
  const orgs = doc.planilhas.map((planilha) => [
    planilha.nome,
    excelSerial(planilha.createdAt),
    excelSerial(planilha.updatedAt),
    planilha.id,
  ]);
  const items = doc.planilhas.flatMap((planilha) =>
    planilha.items.map((item) => [
      planilha.nome,
      item.nome,
      item.quantidade,
      item.unidade,
      item.observacao,
      item.status === "baixa" ? "Baixa" : "Ativo",
      excelSerial(item.baixaAt),
      item.baixaMotivo,
      excelSerial(item.createdAt),
      excelSerial(item.updatedAt),
      item.id,
      planilha.id,
    ]),
  );
  const moves = doc.planilhas.flatMap((planilha) =>
    planilha.items.flatMap((item) =>
      item.movimentos.map((movimento) => [
        planilha.nome,
        item.nome,
        movimento.tipo === "entrada" ? "Entrada" : "Retirada",
        movimento.quantidade,
        movimento.responsavel,
        excelSerial(movimento.at),
        movimento.observacao,
        movimento.id,
        item.id,
      ]),
    ),
  );
  const loans = doc.planilhas.flatMap((planilha) =>
    planilha.items.flatMap((item) =>
      item.emprestimos.map((emprestimo) => [
        planilha.nome,
        item.nome,
        emprestimo.quantidade,
        emprestimo.responsavel,
        excelSerial(emprestimo.emprestadoEm),
        excelSerial(emprestimo.devolverEm),
        excelSerial(emprestimo.devolvidoEm),
        emprestimo.id,
        item.id,
      ]),
    ),
  );

  return buildXlsx([
    {
      name: SHEET_ORGS,
      tabColor: "FF1C2430",
      widths: [32, 22, 22, 38],
      headers: ["Nome", "Criada em", "Atualizada em", "ID"],
      rows: orgs,
      dateColumns: [1, 2],
    },
    {
      name: SHEET_ITEMS,
      tabColor: "FF334155",
      widths: [28, 32, 14, 12, 36, 12, 22, 28, 22, 22, 38, 38],
      headers: [
        "Organização",
        "Material",
        "Quantidade",
        "Unidade",
        "Observação",
        "Status",
        "Baixa em",
        "Motivo da baixa",
        "Criado em",
        "Atualizado em",
        "ID",
        "ID da organização",
      ],
      rows: items,
      dateColumns: [6, 8, 9],
    },
    {
      name: SHEET_MOVES,
      tabColor: "FF0F766E",
      widths: [28, 32, 14, 14, 28, 22, 36, 38, 38],
      headers: ["Organização", "Material", "Tipo", "Quantidade", "Responsável", "Data e hora", "Observação", "ID", "ID do material"],
      rows: moves,
      dateColumns: [5],
    },
    {
      name: SHEET_LOANS,
      tabColor: "FFC2410C",
      widths: [28, 32, 14, 28, 22, 22, 22, 38, 38],
      headers: [
        "Organização",
        "Material",
        "Quantidade",
        "Quem pegou",
        "Data do empréstimo",
        "Entrega prevista",
        "Devolvido em",
        "ID",
        "ID do material",
      ],
      rows: loans,
      dateColumns: [4, 5, 6],
    },
  ]);
}

export async function parseMaterialBackup(buffer: ArrayBuffer): Promise<MaterialControleDoc> {
  const sheets = await readXlsxSheets(buffer);
  const orgSheet = rowsOf(sheets, SHEET_ORGS);
  const itemSheet = rowsOf(sheets, SHEET_ITEMS);
  if (!orgSheet && !itemSheet) {
    throw new Error("Este arquivo não é um backup do estoque.");
  }
  const orgRows = objects(orgSheet);
  const itemRows = objects(itemSheet);

  const planilhas = new Map<string, MaterialPlanilha>();
  for (const row of orgRows) {
    const nome = text(row.Nome);
    if (!nome) continue;
    const id = text(row.ID) || newMaterialId();
    const now = new Date().toISOString();
    planilhas.set(id, {
      id,
      nome,
      items: [],
      createdAt: isoFromCell(row["Criada em"]) ?? now,
      updatedAt: isoFromCell(row["Atualizada em"]) ?? now,
    });
  }

  const byOrgName = new Map<string, string>();
  for (const planilha of planilhas.values()) byOrgName.set(sheetKey(planilha.nome), planilha.id);

  const items = new Map<string, { planilhaId: string; item: MaterialItem }>();
  for (const row of itemRows) {
    const nome = text(row.Material);
    if (!nome) continue;
    let planilhaId = text(row["ID da organização"]);
    if (!planilhas.has(planilhaId)) planilhaId = byOrgName.get(sheetKey(text(row.Organização))) ?? "";
    if (!planilhaId || !planilhas.has(planilhaId)) {
      const orgName = text(row.Organização) || "Organização";
      planilhaId = byOrgName.get(sheetKey(orgName)) ?? newMaterialId();
      if (!planilhas.has(planilhaId)) {
        const now = new Date().toISOString();
        planilhas.set(planilhaId, { id: planilhaId, nome: orgName, items: [], createdAt: now, updatedAt: now });
        byOrgName.set(sheetKey(orgName), planilhaId);
      }
    }
    const id = text(row.ID) || newMaterialId();
    const now = new Date().toISOString();
    const status: MaterialItemStatus = sheetKey(text(row.Status)) === "baixa" ? "baixa" : "ativo";
    const item: MaterialItem = {
      id,
      nome,
      quantidade: qty(row.Quantidade),
      unidade: text(row.Unidade),
      observacao: text(row["Observação"]),
      status,
      baixaAt: isoFromCell(row["Baixa em"]),
      baixaMotivo: text(row["Motivo da baixa"]),
      movimentos: [],
      emprestimos: [],
      createdAt: isoFromCell(row["Criado em"]) ?? now,
      updatedAt: isoFromCell(row["Atualizado em"]) ?? now,
    };
    items.set(id, { planilhaId, item });
    planilhas.get(planilhaId)?.items.push(item);
  }

  for (const row of objects(rowsOf(sheets, SHEET_MOVES))) {
    const itemId = text(row["ID do material"]);
    const found = items.get(itemId);
    if (!found) continue;
    const tipo: MaterialMovimentoTipo = sheetKey(text(row.Tipo)) === "entrada" ? "entrada" : "saida";
    const at = isoFromCell(row["Data e hora"]) ?? new Date().toISOString();
    const movimento: MaterialMovimento = {
      id: text(row.ID) || newMaterialId(),
      tipo,
      quantidade: qty(row.Quantidade),
      responsavel: text(row["Responsável"]) || "—",
      at,
      observacao: text(row["Observação"]),
    };
    found.item.movimentos.push(movimento);
  }

  for (const row of objects(rowsOf(sheets, SHEET_LOANS))) {
    const itemId = text(row["ID do material"]);
    const found = items.get(itemId);
    if (!found) continue;
    const emprestimo: MaterialEmprestimo = {
      id: text(row.ID) || newMaterialId(),
      quantidade: qty(row.Quantidade),
      responsavel: text(row["Quem pegou"]) || "—",
      emprestadoEm: isoFromCell(row["Data do empréstimo"]) ?? new Date().toISOString(),
      devolverEm: isoFromCell(row["Entrega prevista"]),
      devolvidoEm: isoFromCell(row["Devolvido em"]),
    };
    if (emprestimo.quantidade <= 0) continue;
    found.item.emprestimos.push(emprestimo);
  }

  return normalizeMaterialControleDoc({ planilhas: [...planilhas.values()] });
}
