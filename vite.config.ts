import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
/** Base em produção: CI define VITE_BASE_PATH=/<nome-do-repo>/; local usa fallback. */
function productionBase(): string {
  const raw = process.env.VITE_BASE_PATH?.trim();
  if (raw) {
    const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
    return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
  }
  return "/SOT2.0/";
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: mode === "production" ? productionBase() : "/",
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        mobile: path.resolve(__dirname, "mobile.html"),
      },
    },
  },
  server: {
    /** Porta de desenvolvimento (evita 5173/5174 se estiverem bloqueadas ou ocupadas). */
    port: 3000,
    /** true = localhost + acesso na rede local; se 3000 estiver ocupada, o Vite tenta a seguinte. */
    host: true,
    strictPort: false,
  },
}));
