import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Em GitHub Pages: defina VITE_BASE_PATH=/nome-do-repo/ no CI ou .env.production */
function basePath(): string {
  const raw = process.env.VITE_BASE_PATH?.trim();
  if (raw) {
    const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
    return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
  }
  return "/";
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: mode === "production" ? basePath() : "/",
  server: { host: true, port: 3010 },
}));
