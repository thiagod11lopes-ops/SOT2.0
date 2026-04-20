/** Rubrica guardada como PNG (data URL) após desenho manual no mobile. */
export function isRubricaImageDataUrl(value: string | undefined | null): boolean {
  const s = String(value ?? "").trim();
  return s.startsWith("data:image/");
}

export type VistoriaRubricaKind = "comum" | "administrativa";

const VISTORIA_RUBRICA_REF_PREFIX = "rubrica_ref:v1:";

export function buildVistoriaRubricaRef(inspectionId: string, kind: VistoriaRubricaKind): string {
  return `${VISTORIA_RUBRICA_REF_PREFIX}${kind}:${inspectionId.trim()}`;
}

export function parseVistoriaRubricaRef(
  value: string | undefined | null,
): { kind: VistoriaRubricaKind; inspectionId: string } | null {
  const s = String(value ?? "").trim();
  if (!s.startsWith(VISTORIA_RUBRICA_REF_PREFIX)) return null;
  const body = s.slice(VISTORIA_RUBRICA_REF_PREFIX.length);
  const sep = body.indexOf(":");
  if (sep <= 0) return null;
  const kindRaw = body.slice(0, sep);
  const inspectionId = body.slice(sep + 1).trim();
  if (!inspectionId) return null;
  if (kindRaw !== "comum" && kindRaw !== "administrativa") return null;
  return { kind: kindRaw, inspectionId };
}
