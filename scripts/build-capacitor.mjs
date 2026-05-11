/**
 * Build do shell mobile para Capacitor.
 *
 * 1. Corre `vite build` com base="/" (Capacitor serve a partir da raiz do WebView).
 * 2. Cria pasta `dist-capacitor/` (limpa).
 * 3. Copia todo o `dist/` para `dist-capacitor/`.
 * 4. Sobrescreve `dist-capacitor/index.html` com o conteúdo de `dist/mobile.html`,
 *    para que o WebView abra directamente o shell mobile (e não o desktop).
 *
 * Uso: `npm run build:capacitor`
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");
const distCap = resolve(root, "dist-capacitor");

console.log("[capacitor] Vite build (base=/)...");
execSync("npx vite build", {
  stdio: "inherit",
  env: { ...process.env, VITE_BASE_PATH: "/" },
  cwd: root,
});

if (!existsSync(dist)) {
  console.error(`[capacitor] Pasta ${dist} não foi gerada pelo Vite. A abortar.`);
  process.exit(1);
}

console.log(`[capacitor] A preparar ${distCap}...`);
try {
  rmSync(distCap, { recursive: true, force: true });
} catch (e) {
  console.warn("[capacitor] Falha a apagar dist-capacitor antigo:", e);
}
mkdirSync(distCap, { recursive: true });

/**
 * Cópia recursiva manual ficheiro-a-ficheiro. Mais lenta que `cpSync`, mas evita o
 * crash STATUS_STACK_BUFFER_OVERRUN (0xC0000409) observado em Node no Windows quando
 * a directoria de origem contém vários ficheiros grandes em sub-pastas.
 */
function copyDirectoryRecursive(srcDir, dstDir) {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcEntry = join(srcDir, entry.name);
    const dstEntry = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(dstEntry, { recursive: true });
      copyDirectoryRecursive(srcEntry, dstEntry);
    } else if (entry.isFile()) {
      mkdirSync(dirname(dstEntry), { recursive: true });
      copyFileSync(srcEntry, dstEntry);
    }
  }
}

copyDirectoryRecursive(dist, distCap);

const mobileHtmlPath = resolve(distCap, "mobile.html");
const indexHtmlPath = resolve(distCap, "index.html");
if (!existsSync(mobileHtmlPath)) {
  console.error(`[capacitor] ${mobileHtmlPath} não existe — o build do Vite mudou de saída?`);
  process.exit(1);
}
const mobileHtml = readFileSync(mobileHtmlPath, "utf8");
writeFileSync(indexHtmlPath, mobileHtml, "utf8");

const totalFiles = (function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else if (entry.isFile()) n += 1;
  }
  return n;
})(distCap);
console.log(`[capacitor] dist-capacitor pronto (${totalFiles} ficheiros). Próximo passo: \`npm run cap:android:sync\`.`);
void statSync; // referenciado por compat futura
