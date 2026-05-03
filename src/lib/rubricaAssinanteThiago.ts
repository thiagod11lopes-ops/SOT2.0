/** Nome no catálogo de motoristas que usa a rubrica PNG na área de assinatura (lista de saídas). */
const ASSINANTE_RUBRICA_THIAGO = "2°SG Thiago Lopes";
const ASSINANTE_RUBRICA_THIAGO_ALIASES = ["SG Thiago Lopes", "SG Thiago"];

function normalizeAssinanteName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isAssinanteRubricaThiago(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const normalized = normalizeAssinanteName(name);
  if (normalized === normalizeAssinanteName(ASSINANTE_RUBRICA_THIAGO)) return true;
  return ASSINANTE_RUBRICA_THIAGO_ALIASES.some(
    (alias) => normalized === normalizeAssinanteName(alias),
  );
}

/** URL servida pelo Vite (`public/Rubrica.png`); respeita `base` em produção. */
export function rubricaThiagoPublicUrl(): string {
  const base = import.meta.env.BASE_URL;
  return base.endsWith("/") ? `${base}Rubrica.png` : `${base}/Rubrica.png`;
}

export async function fetchRubricaThiagoAsDataUrl(): Promise<string | null> {
  try {
    const r = await fetch(rubricaThiagoPublicUrl());
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
