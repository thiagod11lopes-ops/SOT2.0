/**
 * URL da app SOT “principal” (desktop) no mesmo site.
 * Quando o bundle é publicado em `/m/`, o utilizador volta para a raiz do mesmo domínio.
 * Opcional: `VITE_PRIMARY_APP_URL` para apontar para outro domínio (ex.: Pages do repo principal).
 */
export function hrefSistemaPrincipalSot(): string | null {
  const explicit = import.meta.env.VITE_PRIMARY_APP_URL?.trim();
  if (explicit) return explicit;
  const base = import.meta.env.BASE_URL;
  if (!base.includes("/m/")) return null;
  const u = new URL(base, typeof window !== "undefined" ? window.location.origin : "https://localhost");
  u.pathname = u.pathname.replace(/\/m\/$/, "/");
  return u.href;
}
