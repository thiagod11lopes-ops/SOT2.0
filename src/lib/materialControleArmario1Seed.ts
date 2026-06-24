import {
  newMaterialId,
  type MaterialControleDoc,
  type MaterialItem,
  type MaterialPlanilha,
} from "./materialControleStorage";

export const ARMARIO_1_PLANILHA_NOME = "Armário 1";
export const ARMARIO_2_PLANILHA_NOME = "Armário 2";

type SeedItem = {
  nome: string;
  quantidade: number;
  observacao?: string;
};

/** Inventário inicial do Armário 1. */
const ARMARIO_1_ITENS: SeedItem[] = [
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

/** Inventário inicial do Armário 2. */
const ARMARIO_2_ITENS: SeedItem[] = [
  { nome: "Óleo lubrificante 5w30 PANTHER", quantidade: 2 },
  { nome: "Óleo lubrificante 5w30 IPIRANGA", quantidade: 8 },
  { nome: "Óleo lubrificante 10w30 LUBRAX", quantidade: 8 },
  { nome: "Parafusadeira BOSCH", quantidade: 1 },
  { nome: "Conjunto de chave CATRACA caixa vermelha", quantidade: 1 },
  { nome: "Lâmpadas amarela", quantidade: 14 },
  { nome: "Lâmpada branca", quantidade: 3 },
  { nome: "Chave de mandril", quantidade: 2 },
  { nome: "Bateria portátil VONDER", quantidade: 1 },
  { nome: "Testador de bateria", quantidade: 1 },
  { nome: "Jogo de bronca de ferro incompleta", quantidade: 1 },
  { nome: "Gaveta adesiva", quantidade: 2 },
  { nome: "Suporte de manual de lixa", quantidade: 1 },
  { nome: "Pé da televisão", quantidade: 4, observacao: "2 de cada televisão" },
  { nome: "Amperímetro", quantidade: 1 },
  { nome: "Inversor", quantidade: 2 },
  { nome: "Fechador automático de porta", quantidade: 1 },
  { nome: "Caixa de piloto para quadro branco", quantidade: 5 },
  { nome: "Grampeador gigante", quantidade: 1 },
  { nome: "Óculos de segurança", quantidade: 5 },
  { nome: "Bomba de combustível SEINECA SEI0002", quantidade: 1 },
  { nome: "Chave geral de ambulância", quantidade: 2 },
  { nome: "Chave geral de ambulância sprinter velha", quantidade: 3 },
  { nome: "Cabo HDMI", quantidade: 2 },
  { nome: "Sensor de estacionamento", quantidade: 1 },
  { nome: "Sacola de plástico com canetas, lápis e grampos", quantidade: 1 },
  { nome: "Maleta de broca e bucha", quantidade: 1 },
  { nome: "Multímetro", quantidade: 2 },
  { nome: "Lâmpada H4", quantidade: 3 },
  { nome: "Lâmpada H7", quantidade: 3 },
  { nome: "Organizador de fio", quantidade: 1 },
  { nome: "Peças do aspirador que queimou", quantidade: 1 },
  { nome: "Jet branco fosco", quantidade: 1 },
  { nome: "Jet branco", quantidade: 1 },
  { nome: "Jet preto", quantidade: 1 },
  { nome: "Caixa de arrebite", quantidade: 1 },
  { nome: "Pastilha de freio MAHTRA PF5MT01", quantidade: 4 },
  { nome: "Rolo de fio", quantidade: 1 },
  { nome: "Caixa do ROKU", quantidade: 1 },
  { nome: "Maleta de catraca pequena cor preta", quantidade: 1 },
  { nome: "Maleta de chave catraca com 5 peças", quantidade: 1 },
  { nome: "Maleta preta de parafusadeira de impacto GENAI", quantidade: 1 },
  { nome: "Maleta preta martelete", quantidade: 1 },
  { nome: "Maleta amarela de catraca média/grande", quantidade: 1 },
  { nome: "Cabo HDMI pequeno", quantidade: 1 },
  { nome: "Tomada de sobrepor dupla", quantidade: 5 },
  { nome: "Correia POLY V", quantidade: 1 },
  { nome: "Macaco", quantidade: 1 },
  { nome: "Chave de canhão 14", quantidade: 4 },
  { nome: "Chave de canhão 15", quantidade: 1 },
  { nome: "TV Philco", quantidade: 1 },
  { nome: "Cabo de carregador", quantidade: 1 },
  { nome: "Suporte de parede de celular", quantidade: 2 },
  { nome: "Comando de ar condicionado", quantidade: 1 },
  { nome: "Cafeteira", quantidade: 1 },
  { nome: "Chaves reservas das viaturas", quantidade: 1, observacao: "COFRE" },
  { nome: "Rádio", quantidade: 1 },
  { nome: "Celular e carregador Lenox", quantidade: 1 },
  { nome: "Documento das viaturas", quantidade: 1 },
  { nome: "Envelope pardo lacrado", quantidade: 1 },
  { nome: "Câmera digital", quantidade: 1 },
  { nome: "GPS", quantidade: 3 },
  { nome: "Suporte do gps", quantidade: 1 },
];

const PLANILHA_SEEDS: { nome: string; itens: SeedItem[] }[] = [
  { nome: ARMARIO_1_PLANILHA_NOME, itens: ARMARIO_1_ITENS },
  { nome: ARMARIO_2_PLANILHA_NOME, itens: ARMARIO_2_ITENS },
];

function normalizePlanilhaNome(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildPlanilhaFromSeed(nome: string, itens: SeedItem[]): MaterialPlanilha {
  const now = new Date().toISOString();
  const items: MaterialItem[] = itens.map((row) => ({
    id: newMaterialId(),
    nome: row.nome,
    quantidade: row.quantidade,
    unidade: "",
    observacao: row.observacao ?? "",
    status: "ativo",
    baixaAt: null,
    baixaMotivo: "",
    movimentos: [],
    createdAt: now,
    updatedAt: now,
  }));
  return {
    id: newMaterialId(),
    nome,
    items,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Garante as planilhas seed («Armário 1», «Armário 2», …) quando ainda não existirem.
 */
export function applyMaterialControleSeeds(doc: MaterialControleDoc): {
  doc: MaterialControleDoc;
  changed: boolean;
} {
  const existing = new Set(doc.planilhas.map((p) => normalizePlanilhaNome(p.nome)));
  const toAdd: MaterialPlanilha[] = [];

  for (const seed of PLANILHA_SEEDS) {
    const key = normalizePlanilhaNome(seed.nome);
    if (existing.has(key)) continue;
    toAdd.push(buildPlanilhaFromSeed(seed.nome, seed.itens));
    existing.add(key);
  }

  if (toAdd.length === 0) return { doc, changed: false };
  return {
    doc: { planilhas: [...doc.planilhas, ...toAdd] },
    changed: true,
  };
}
