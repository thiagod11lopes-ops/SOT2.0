export function parseHhMm(value: string): { h: number; m: number } | null {
  const t = value.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return { h, m: min };
}

export function normalize24hTime(value: string) {
  let digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 1 && digits[0] >= "3" && digits[0] <= "9") {
    digits = `0${digits[0]}`;
  }
  if (digits.length === 0) return "";
  if (digits.length <= 2) return digits;
  if (digits.length === 3) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
  const h = Math.min(Number(digits.slice(0, 2)), 23);
  const m = Math.min(Number(digits.slice(2, 4)), 59);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
