import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// Em produção, base = nome do repositório no GitHub Pages (ex.: /SOT2.0/).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: mode === "production" ? "/SOT2.0/" : "/",
  server: {
    port: 5174,
    host: true,
  },
}));
