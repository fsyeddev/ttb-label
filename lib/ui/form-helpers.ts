// Pure helpers shared by the homepage form components. Lives here (not in
// the .tsx files) so evals can import them without pulling React into the
// node test environment.

export type AbvUnit = 'percent' | 'proof';

/**
 * Allow only digits and at most one decimal point, with at most two decimal
 * places. Strips other characters silently — we never want a non-numeric
 * character to land in component state for a numeric-only field.
 */
export function sanitizeNumericInput(raw: string): string {
  const stripped = raw.replace(/[^0-9.]/g, '');
  const firstDot = stripped.indexOf('.');
  if (firstDot === -1) return stripped;
  const intPart = stripped.slice(0, firstDot);
  const decPart = stripped.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
  return intPart + '.' + decPart;
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

/**
 * Append the implicit "mL" unit to the digits-only net-contents input before
 * submission. The form input is numeric-only, but the validator + extractor
 * compare unit-bearing strings ("750 mL") — without this, a fresh form entry
 * of "750" would FAIL against the OCR's "750 mL".
 */
export function serializeNetContents(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `${trimmed} mL`;
}

/**
 * Parse an imported ABV string back into the (numeric value, unit) pair the
 * form holds in state. Examples:
 *   "45% Alc./Vol." → { value: "45",  unit: "percent" }
 *   "70 Proof"      → { value: "70",  unit: "proof"   }
 *   "0.5 Proof"     → { value: "0.5", unit: "proof"   }
 *   "45"            → { value: "45",  unit: "percent" }   (default to percent when no unit token)
 *   ""              → { value: "",    unit: "percent" }
 */
export function parseAbvString(raw: string | null | undefined): { value: string; unit: AbvUnit } {
  const trimmed = (raw ?? '').trim();
  const numMatch = trimmed.match(/(\d+(?:\.\d+)?)/);
  const value = numMatch ? numMatch[1] : '';
  const unit: AbvUnit = /proof/i.test(trimmed) ? 'proof' : 'percent';
  return { value, unit };
}

/**
 * Pull the first numeric token out of an imported free-text value (e.g.,
 * "750 mL" → "750", "1.5 mL" → "1.5", "0 mL" → "0"). Used to clean imported
 * net-contents values so they can populate the digits-only input field.
 *
 * Note: this does NOT do unit conversion. An imported "1 L" becomes "1",
 * not "1000" — the form's mL suffix assumes the input was already in mL.
 * Unit-aware import is a follow-up if needed.
 */
export function extractNumericPart(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  const m = trimmed.match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : '';
}
