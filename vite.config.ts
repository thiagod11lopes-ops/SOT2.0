import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  server: {
    port: 5174,
    host: true,
  },
}));
