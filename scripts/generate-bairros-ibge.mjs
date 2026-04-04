/**
 * Gera src/data/bairrosPorCidade.json a partir do shapefile IBGE CD2022,
 * unido a src/data/bairrosSuplementoPorCidade.json (municípios do RJ que não
 * aparecem na malha de bairros CD2022 ou vêm sem polígonos).
 * Executar: node scripts/generate-bairros-ibge.mjs
 */
import shp from "shpjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const IBGE_BAIRROS_URL =
  "https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/bairros/shp/BR/BR_bairros_CD2022.zip";

const metroRioCities = [
  "Rio de Janeiro",
  "Belford Roxo",
  "Duque de Caxias",
  "Guapimirim",
  "Itaboraí",
  "Itaguaí",
  "Japeri",
  "Magé",
  "Maricá",
  "Mesquita",
  "Nilópolis",
  "Niterói",
  "Nova Iguaçu",
  "Paracambi",
  "Queimados",
  "São Gonçalo",
  "São João de Meriti",
  "Seropédica",
  "Tanguá",
];

const res = await fetch(IBGE_BAIRROS_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const buf = await res.arrayBuffer();
const parsed = await shp(buf);
const collection = Array.isArray(parsed) ? parsed[0] : parsed;

const cityMap = {};
for (const cityName of metroRioCities) cityMap[cityName] = new Set();

for (const feature of collection.features) {
  const cityName = feature.properties?.NM_MUN;
  const neighborhoodName = feature.properties?.NM_BAIRRO;
  if (!cityName || !neighborhoodName || !cityMap[cityName]) continue;
  cityMap[cityName].add(String(neighborhoodName).trim());
}

const supplementPath = path.join(root, "src", "data", "bairrosSuplementoPorCidade.json");
let supplement = {};
if (fs.existsSync(supplementPath)) {
  supplement = JSON.parse(fs.readFileSync(supplementPath, "utf8"));
}

function mergeCityNeighborhoods(cityName, fromIbge) {
  const extra = supplement[cityName];
  if (!extra || !Array.isArray(extra)) return fromIbge;
  const set = new Set(fromIbge);
  for (const n of extra) {
    const t = String(n).trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const normalized = {};
for (const cityName of metroRioCities) {
  const fromIbge = Array.from(cityMap[cityName]);
  normalized[cityName] = mergeCityNeighborhoods(cityName, fromIbge);
}

const outDir = path.join(root, "src", "data");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "bairrosPorCidade.json");
fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2), "utf8");

console.log("Escrito:", outPath);
for (const cityName of metroRioCities) {
  console.log(`  ${cityName}: ${normalized[cityName].length} bairros`);
}
