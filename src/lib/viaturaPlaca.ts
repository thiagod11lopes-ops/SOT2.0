/** Primeira placa listada no campo «viaturas» (mesma regra que «Iniciar saída» / GPS). */
export function primaryPlacaFromViaturasField(field: string): string {
  const part = field
    .split(/[;,/|]+/)
    .map((x) => x.trim())
    .find(Boolean);
  return part ?? "";
}
