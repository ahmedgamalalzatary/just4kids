/**
 * Kuwaiti numbers are commonly typed as eight local digits. Keep the stored form international: prefix a bare
 * eight-digit number with +965, and leave anything that already carries a country code exactly as typed.
 */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 8 ? `+965${digits}` : trimmed;
}
