import {
  newMaterialId,
  type MaterialControleDoc,
  type MaterialItem,
  type MaterialPlanilha,
} from "./materialControleStorage";

export const ARMARIO_1_PLANILHA_NOME = "Armário 1";

/** Inventário inicial do Armário 1 (relação fornecida pela operação). */
const ARMARIO_1_ITENS: { nome: string; quantidade: number }[] = [
  { nome: "Filtro de cabine Mercedes bens", quantidade: 4 },
  { nome: "Filtro Bi-Combustivel GIO8/1(Flex)", quantidade: 1 },
  { nome: "Filtro de óleo lubrificante tecfil PEL676 (sprinter)", quantidade: 4 },
  { nome: "Filtro de óleo lubrificante VOX LE119 (Doblô)", quantidade: 1 },
  { nome: "Filtro de óleo lubrificante WEGA WO330 (Ducato)", quantidade: 4 },
  { nome: "Palheta auto impact", quantidade: 9 },
  { nome: "Palheta BOSCH AEROFIT", quantidade: 9 },
  { nome: "Palheta automance SW", quantidade: 3 },
  { nome: "Óleo lubrificante 10w40 LUBRAX", quantidade: 59 },
  { nome: "Óleo lubrificante 5w30 PANTHER", quantidade: 12 },
  { nome: "Óleo lubrificante 5w20 HAVOLINE", quantidade: 8 },
  { nome: "Óleo lubrificante 15w40 URANIA", quantidade: 9 },
  { nome: "Óleo lubrificante hidráulico 10w TUTELA", quantidade: 1 },
  { nome: "Óleo lubrificante 15w40 SELENIA", quantidade: 1 },
  { nome: "Óleo lubrificante 15w40 SYNTIUM", quantidade: 1 },
  { nome: "Filtro de óleo lubrificante VOX Ducato Jumper LB657", quantidade: 1 },
  { nome: "Filtro de óleo lubrificante WEGA WO370 Santana", quantidade: 2 },
  { nome: "Filtro de óleo lubrificante WEGA WO205 clio", quantidade: 2 },
  { nome: "Filtro de óleo lubrificante WEGA WUNI 0001 Ford ka", quantidade: 1 },
  { nome: "Filtro de óleo lubrificante WEGA WOE 912 doblô 1.8", quantidade: 1 },
  { nome: "Filtro de óleo lubrificante WEGA WO 120 doblô 1.4", quantidade: 6 },
  { nome: "Filtro de óleo lubrificante tecfil psl55 CIVIC", quantidade: 1 },
  { nome: "Filtro de óleo lubrificante WEGA WO 421 Ducato ambulância", quantidade: 6 },
  { nome: "Filtro de óleo lubrificante WEGA 330 Ducato ambulância", quantidade: 3 },
  { nome: "Filtro de óleo lubrificante tecfil psl156 Ducato", quantidade: 3 },
  { nome: "Óleo lubrificante 20w50 HAVOLINE", quantidade: 10 },
  { nome: "Fluido para arrefecimento anticorrosivo EVOQUE", quantidade: 15 },
  { nome: "Filtro de ar WEGA WR317 Ducato ambulância", quantidade: 1 },
  { nome: "Vaselina líquida automotiva", quantidade: 3 },
  { nome: "Jogo de tapete", quantidade: 1 },
  { nome: "Massa para rejunte drywall 5 kg", quantidade: 1 },
  { nome: "Tinta cinza médio MAZA esmalte sintético 3,6 litros", quantidade: 1 },
  { nome: "Capa de voltante", quantidade: 2 },
  { nome: "Extintor de incêndio vazio", quantidade: 1 },
];

function normalizePlanilhaNome(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildArmario1Planilha(): MaterialPlanilha {
  const now = new Date().toISOString();
  const items: MaterialItem[] = ARMARIO_1_ITENS.map((row) => ({
    id: newMaterialId(),
    nome: row.nome,
    quantidade: row.quantidade,
    unidade: "",
    observacao: "",
    status: "ativo",
    baixaAt: null,
    baixaMotivo: "",
    createdAt: now,
    updatedAt: now,
  }));
  return {
    id: newMaterialId(),
    nome: ARMARIO_1_PLANILHA_NOME,
    items,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Garante a planilha «Armário 1» com o inventário inicial quando ainda não existir.
 */
export function applyMaterialControleSeeds(doc: MaterialControleDoc): {
  doc: MaterialControleDoc;
  changed: boolean;
} {
  const target = normalizePlanilhaNome(ARMARIO_1_PLANILHA_NOME);
  const exists = doc.planilhas.some((p) => normalizePlanilhaNome(p.nome) === target);
  if (exists) return { doc, changed: false };
  return {
    doc: { planilhas: [...doc.planilhas, buildArmario1Planilha()] },
    changed: true,
  };
}
