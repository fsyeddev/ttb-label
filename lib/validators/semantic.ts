// Semantic / fuzzy comparison for text fields where exact match is too strict
// Handles: case differences, punctuation, whitespace, common abbreviations

/**
 * Normalize a string for fuzzy comparison:
 * lowercase, collapse whitespace, strip punctuation variants
 */
export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[''`]/g, "'") // normalize apostrophes
    .replace(/[–—]/g, '-') // normalize dashes
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two strings are equivalent after normalization.
 * Handles the classic "STONE'S THROW" vs "Stone's Throw" case.
 */
export function fuzzyEqual(a: string | null, b: string | null): boolean {
  return normalize(a) === normalize(b);
}

/**
 * Check if one string contains the other (useful for partial address matches).
 */
export function fuzzyContains(haystack: string | null, needle: string | null): boolean {
  if (!haystack || !needle) return false;
  return normalize(haystack).includes(normalize(needle));
}

/**
 * Levenshtein edit distance between two raw strings.
 * Exposed as a magnitude signal for user-facing notes (e.g., "differs by N characters").
 * Callers control normalization — pass strings already normalized to whatever level
 * is appropriate for the comparison being reported.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Similarity ratio between 0 and 1 (1 = identical).
 */
export function similarity(a: string | null, b: string | null): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

/**
 * Strict-equality comparator for company-name fields (brand_name, bottler_name).
 * Two outcomes only — pass or fail. No similarity band, no casing warning.
 *
 *   pass: fuzzyEqual(submitted, extracted) is true (case/whitespace/apostrophe/
 *         dash differences are absorbed by `normalize()`).
 *   fail: anything else.
 *
 * Case is not regulated by TTB for these fields (27 CFR Part 5; the only
 * mandatory case rule is the "GOVERNMENT WARNING:" prefix in 27 CFR 16.21).
 * Wired only at brand_name and bottler_name call sites in spirits.ts.
 */
export function compareCompanyName(
  submitted: string | null,
  extracted: string | null,
  fieldLabel: string
): { match: boolean; status: 'pass' | 'fail'; note?: string } {
  if (!extracted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not found on label` };
  }
  if (!submitted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not provided in application` };
  }
  if (fuzzyEqual(submitted, extracted)) {
    return { match: true, status: 'pass' };
  }
  return {
    match: false,
    status: 'fail',
    note: `${fieldLabel} mismatch: submitted "${submitted}" vs label "${extracted}"`,
  };
}

/**
 * Address-aware comparator for bottler_address. Adds a substring branch on top
 * of the standard tiered comparison: when the application's submitted address
 * appears (case-insensitively) inside the extracted label address, treat as
 * pass — the label has all the substantive info plus more (e.g., postal code,
 * country), which is permitted under 27 CFR 5.36.
 */
export function compareAddressField(
  submitted: string | null,
  extracted: string | null,
  fieldLabel: string
): { match: boolean; status: 'pass' | 'fail' | 'warning'; note?: string } {
  if (!extracted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not found on label` };
  }
  if (!submitted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not provided in application` };
  }
  if (fuzzyEqual(submitted, extracted)) {
    return { match: true, status: 'pass' };
  }
  if (fuzzyContains(extracted, submitted)) {
    return {
      match: true,
      status: 'pass',
      note: 'Application address is contained within the label address — additional detail on the label (e.g., postal code, country) is acceptable.',
    };
  }
  // Fall back to the existing tiered similarity comparator so partial-overlap
  // cases that don't satisfy the substring rule still get the warning band.
  return compareTextField(submitted, extracted, fieldLabel);
}

/**
 * Compare two text fields and return a match result with a status.
 * - Exact normalized match → pass
 * - High similarity (≥0.85) → pass with note
 * - Medium similarity (0.6–0.85) → warning
 * - Low similarity (<0.6) → fail
 */
export function compareTextField(
  submitted: string | null,
  extracted: string | null,
  fieldLabel: string
): { match: boolean; status: 'pass' | 'fail' | 'warning'; note?: string } {
  if (!extracted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not found on label` };
  }
  if (!submitted) {
    return { match: false, status: 'fail', note: `${fieldLabel} not provided in application` };
  }

  if (fuzzyEqual(submitted, extracted)) {
    return { match: true, status: 'pass' };
  }

  const sim = similarity(submitted, extracted);

  if (sim >= 0.85) {
    return {
      match: true,
      status: 'pass',
      note: `Minor formatting difference: submitted "${submitted}" vs label "${extracted}"`,
    };
  }

  if (sim >= 0.6) {
    return {
      match: false,
      status: 'warning',
      note: `Possible mismatch in ${fieldLabel}: submitted "${submitted}" vs label "${extracted}"`,
    };
  }

  return {
    match: false,
    status: 'fail',
    note: `${fieldLabel} mismatch: submitted "${submitted}" vs label "${extracted}"`,
  };
}
