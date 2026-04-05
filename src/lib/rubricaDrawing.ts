/** Rubrica guardada como PNG (data URL) após desenho manual no mobile. */
export function isRubricaImageDataUrl(value: string | undefined | null): boolean {
  const s = String(value ?? "").trim();
  return s.startsWith("data:image/");
}
