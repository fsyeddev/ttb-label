// Pure helpers shared by the homepage form components. Lives here (not in
// the .tsx files) so evals can import them without pulling React into the
// node test environment.

export type AbvUnit = 'percent' | 'proof';

/**
 * Allow only digits and at most one decimal point. Strips other characters
 * silently — we never want a non-numeric character to land in component state
 * for a numeric-only field. Empty string remains empty.
 */
export function sanitizeNumericInput(raw: string): string {
  const stripped = raw.replace(/[^0-9.]/g, '');
  const firstDot = stripped.indexOf('.');
  if (firstDot === -1) return stripped;
  return stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '');
}

/**
 * Combine the user's typed ABV value with the selected unit into the free-text
 * format the existing backend already accepts (e.g., "45% Alc./Vol." or "90 Proof").
 */
export function serializeAbv(value: string, unit: AbvUnit): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (unit === 'percent') return `${trimmed}% Alc./Vol.`;
  return `${trimmed} Proof`;
}
