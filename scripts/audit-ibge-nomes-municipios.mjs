import shp from "shpjs";

const IBGE_BAIRROS_URL =
  "https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/bairros/shp/BR/BR_bairros_CD2022.zip";

const busca = ["Queimados", "Magé", "Mage", "Guapimirim", "Itaguaí", "Itaguai", "Maricá", "Marica", "Seropédica", "Seropedica", "Paracambi"];

const res = await fetch(IBGE_BAIRROS_URL);
const buf = await res.arrayBuffer();
const parsed = await shp(buf);
const collection = Array.isArray(parsed) ? parsed[0] : parsed;

const porNome = new Map();
for (const feature of collection.features) {
  const p = feature.properties;
  if (!p?.NM_MUN) continue;
  const nm = String(p.NM_MUN);
  if (!porNome.has(nm)) porNome.set(nm, { uf: p.CD_UF, count: 0 });
  porNome.get(nm).count++;
}

for (const b of busca) {
  const keys = [...porNome.keys()].filter((k) => k === b || k.includes(b) || k.normalize("NFD").replace(/\p{M}/gu, "") === b.normalize("NFD").replace(/\p{M}/gu, ""));
  console.log(`Busca "${b}":`, keys);
}

const rj33 = [...porNome.entries()].filter(([, v]) => String(v.uf) === "33");
console.log("\nTotal municípios únicos RJ (CD_UF=33):", rj33.length);
