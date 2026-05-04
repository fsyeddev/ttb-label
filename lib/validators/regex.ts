// Regex-based exact/format validators for fields that have strict format requirements
import { levenshtein } from './semantic';

export const GOVERNMENT_WARNING_OFFICIAL =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

// Maximum Levenshtein distance between extracted and official government warning
// text (after `joinHyphens` normalization) that still routes to `warning` rather
// than `fail`. Beyond this, the deviation is treated as obvious garbage that
// agents should not have to manually review.
//
// The official text is 218 characters; 10 chars ≈ 4.6%, so the user-facing
// rule of thumb is "more than ~5% off the official text → automatic fail".
// See docs/specs/govwarn-100pct-threshold.md (BUG-08 refinement).
const MAX_WARNING_DISTANCE = 10;

// ABV: matches "45% Alc./Vol.", "40% alc. by vol.", "45 % Alc. by Vol.", "80 Proof", etc.
const ABV_PATTERN = /^\d{1,2}(\.\d{1,2})?(\s)?%(\s)?(alc\.?(\s)?(\/|\s)?vol\.?|alc\.?\s+by\s+vol\.?)/i;
const PROOF_PATTERN = /^\d{1,3}(\.\d{1,2})?\s*proof/i;
// Standalone % with no qualifier — still extract numeric value
const ABV_BARE_PATTERN = /(\d{1,2}(?:\.\d{1,2})?)(\s)?%/;

// Net contents: "750 mL", "1 L", "1.75 L", "375 ml", "50 ml", "1 liter", "750ml"
const NET_CONTENTS_PATTERN = /^\d+(\.\d+)?\s*(ml|milliliter|liter|litre|l|fl\.?\s*oz\.?|ounce)/i;

/**
 * Validate ABV format. Returns the numeric ABV value if valid, null otherwise.
 */
export function parseABV(value: string): { numeric: number; valid: boolean; normalized: string } | null {
  const trimmed = value.trim();

  const abvMatch = trimmed.match(ABV_BARE_PATTERN);
  if (!abvMatch) {
    if (PROOF_PATTERN.test(trimmed)) {
      const proofVal = parseFloat(trimmed);
      return { numeric: proofVal / 2, valid: true, normalized: `${(proofVal / 2).toFixed(1)}% Alc./Vol.` };
    }
    return null;
  }

  const numeric = parseFloat(abvMatch[1]);
  if (numeric < 0.5 || numeric > 95) return null;

  return {
    numeric,
    valid: ABV_PATTERN.test(trimmed),
    normalized: `${numeric}% Alc./Vol.`,
  };
}

/**
 * Compare two ABV strings numerically (tolerates formatting differences).
 * Returns true if they represent the same alcohol percentage within 0.1%.
 */
export function compareABV(submitted: string, extracted: string): { match: boolean; note?: string } {
  const a = parseABV(submitted);
  const b = parseABV(extracted);

  if (!a || !b) {
    return {
      match: false,
      note: !a ? 'Submitted ABV format not recognized' : 'Extracted ABV format not recognized',
    };
  }

  const diff = Math.abs(a.numeric - b.numeric);
  if (diff > 0.1) {
    return {
      match: false,
      note: `ABV mismatch: submitted ${a.numeric}% vs label ${b.numeric}%`,
    };
  }

  return { match: true };
}

/**
 * Validate and compare net contents. Normalizes units before comparing.
 */
export function compareNetContents(submitted: string, extracted: string): { match: boolean; note?: string } {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/milliliter[s]?/, 'ml')
      .replace(/liter[s]?|litre[s]?/, 'l')
      .replace(/floz|fl\.oz\.|fluidounce[s]?/, 'floz');

  if (norm(submitted) === norm(extracted)) return { match: true };

  // Try converting mL ↔ L
  const mlMatch = (s: string) => s.match(/^([\d.]+)\s*ml/i);
  const lMatch = (s: string) => s.match(/^([\d.]+)\s*l(?!o)/i); // l but not loz

  const subMl = mlMatch(submitted.trim());
  const extMl = mlMatch(extracted.trim());
  const subL = lMatch(submitted.trim());
  const extL = lMatch(extracted.trim());

  const toMl = (s: RegExpMatchArray | null, l: RegExpMatchArray | null) => {
    if (s) return parseFloat(s[1]);
    if (l) return parseFloat(l[1]) * 1000;
    return null;
  };

  const subVal = toMl(subMl, subL);
  const extVal = toMl(extMl, extL);

  if (subVal !== null && extVal !== null && Math.abs(subVal - extVal) < 1) {
    return { match: true };
  }

  return {
    match: false,
    note: `Net contents mismatch: submitted "${submitted}" vs label "${extracted}"`,
  };
}

/**
 * Compare government warning against the official statutory text.
 *
 * Outcomes (see docs/specs/govwarn-100pct-threshold.md, BUG-08):
 *
 *   Structural hard fails (independent of the distance buckets):
 *     - extracted is null/empty                              → fail
 *     - "GOVERNMENT WARNING" (uppercase) not present         → fail
 *
 *   Text-comparison branch (Levenshtein distance after `joinHyphens` normalization):
 *     - distance == 0                                        → pass
 *     - 1 ≤ distance ≤ MAX_WARNING_DISTANCE                  → warning
 *     - distance > MAX_WARNING_DISTANCE                      → fail
 *
 * Bias intentional: false-positive flags are cheaper than false-negative
 * passes for statutorily exact text. The distance ceiling protects against
 * the inverse problem — completely-different or severely-truncated wording
 * landing in the warning bucket and forcing agents to manually review garbage.
 */
export function compareGovernmentWarning(submitted: string | null, extracted: string | null): {
  match: boolean;
  status: 'pass' | 'fail' | 'warning';
  note?: string;
} {
  if (!extracted) {
    return { match: false, status: 'fail', note: 'Government warning not found on label' };
  }

  const ext = extracted.trim();

  // Hard fail #1: prefix CAPS check. Note this gates on "GOVERNMENT WARNING"
  // (no colon) so a missing colon falls through into the equality check below
  // and produces a warning, not a misleading "must be ALL CAPS" failure.
  if (!ext.includes('GOVERNMENT WARNING')) {
    if (/government warning/i.test(ext)) {
      return {
        match: false,
        status: 'fail',
        note: '"GOVERNMENT WARNING:" must appear in all capital letters. Found incorrect capitalization.',
      };
    }
    return { match: false, status: 'fail', note: '"GOVERNMENT WARNING:" prefix not found on label.' };
  }

  // Strip line-break hyphens before comparing.
  // Matches a hyphen between two letters with optional surrounding whitespace:
  // "CONSUMP- TION" → "CONSUMPTION", "CONSUMP-TION" → "CONSUMPTION", "GEN- ERAL" → "GENERAL"
  const joinHyphens = (s: string) => s.replace(/([A-Za-z])\s*-\s*([A-Za-z])/g, '$1$2').replace(/\s+/g, ' ').trim();

  const officialNorm = joinHyphens(GOVERNMENT_WARNING_OFFICIAL);
  const extractedNorm = joinHyphens(ext);

  if (officialNorm === extractedNorm) {
    return { match: true, status: 'pass' };
  }

  const distance = levenshtein(officialNorm, extractedNorm);
  const charWord = distance === 1 ? 'character' : 'characters';

  if (distance > MAX_WARNING_DISTANCE) {
    return {
      match: false,
      status: 'fail',
      note: `Government warning text differs from required TTB language by ${distance} ${charWord} (more than ~5% off official). Hard fail — not a routine OCR variation.`,
    };
  }

  return {
    match: false,
    status: 'warning',
    note: `Government warning text differs from required TTB language by ${distance} ${charWord}. Manual review required — the warning text is statutorily exact.`,
  };
}
