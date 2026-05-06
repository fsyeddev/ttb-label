// Pure-function evals for the UI redesign (w01 / w02 / w03).
// Lives at the unit-function layer because the repo's vitest config runs in
// node (no jsdom). DOM-level interactions are smoke-tested manually in the
// dev server. See:
//   docs/specs/homepage-redesign.md
//   docs/specs/verifying-screen.md
//   docs/specs/results-redesign.md

import { describe, it, expect } from 'vitest';
import {
  sanitizeNumericInput,
  serializeAbv,
  serializeNetContents,
  parseAbvString,
  extractNumericPart,
} from '@/lib/ui/form-helpers';
import { deriveStages, progressRatio } from '@/lib/ui/verifying';
import { compareCompanyName } from '@/lib/validators/semantic';
import { validateSpiritsLabel } from '@/lib/validators/spirits';
import type { ApplicationData, ExtractionResult } from '@/types/cola';

// ─── sanitizeNumericInput ───────────────────────────────────────────────────

describe('sanitizeNumericInput — homepage ABV / Net Contents', () => {
  it('keeps digits as-is', () => {
    expect(sanitizeNumericInput('45')).toBe('45');
    expect(sanitizeNumericInput('750')).toBe('750');
  });

  it('strips letters and symbols', () => {
    expect(sanitizeNumericInput('45abc')).toBe('45');
    expect(sanitizeNumericInput('$45%')).toBe('45');
  });

  it('keeps a single decimal point', () => {
    expect(sanitizeNumericInput('40.5')).toBe('40.5');
  });

  it('drops repeated decimal points after the first and clamps to 2 dp', () => {
    // First dot wins; subsequent dots are stripped from the decimal tail and
    // the result is clamped to 2 decimal places.
    expect(sanitizeNumericInput('40.5.7')).toBe('40.57');
    expect(sanitizeNumericInput('1.2.3.4')).toBe('1.23');
  });

  it('caps decimal precision at 2 places (truncate, do not round)', () => {
    expect(sanitizeNumericInput('99.99')).toBe('99.99');
    expect(sanitizeNumericInput('99.999')).toBe('99.99');
    expect(sanitizeNumericInput('40.5670')).toBe('40.56');
  });

  it('keeps leading zero values', () => {
    expect(sanitizeNumericInput('0.5')).toBe('0.5');
  });

  it('preserves a trailing dot mid-typing (e.g., user typed "40.")', () => {
    expect(sanitizeNumericInput('40.')).toBe('40.');
  });

  it('returns empty for fully-non-numeric input', () => {
    expect(sanitizeNumericInput('abc')).toBe('');
    expect(sanitizeNumericInput('')).toBe('');
  });
});

// ─── parseAbvString — JSON / CSV import ─────────────────────────────────────

describe('parseAbvString — splits imported ABV string into value + unit', () => {
  it('parses "45% Alc./Vol." as percent unit with numeric value 45', () => {
    expect(parseAbvString('45% Alc./Vol.')).toEqual({ value: '45', unit: 'percent' });
  });

  it('parses "70 Proof" as proof unit with numeric value 70', () => {
    expect(parseAbvString('70 Proof')).toEqual({ value: '70', unit: 'proof' });
  });

  it('handles decimals on either side of the unit', () => {
    expect(parseAbvString('45.5% Alc./Vol.')).toEqual({ value: '45.5', unit: 'percent' });
    expect(parseAbvString('0.5 Proof')).toEqual({ value: '0.5', unit: 'proof' });
  });

  it('defaults to percent when no unit token is present', () => {
    expect(parseAbvString('45')).toEqual({ value: '45', unit: 'percent' });
  });

  it('handles empty / null inputs without throwing', () => {
    expect(parseAbvString('')).toEqual({ value: '', unit: 'percent' });
    expect(parseAbvString(null)).toEqual({ value: '', unit: 'percent' });
    expect(parseAbvString(undefined)).toEqual({ value: '', unit: 'percent' });
  });

  it('proof detection is case-insensitive', () => {
    expect(parseAbvString('80 PROOF').unit).toBe('proof');
    expect(parseAbvString('80 proof').unit).toBe('proof');
  });
});

// ─── extractNumericPart — Net Contents import ───────────────────────────────

describe('extractNumericPart — strips units from imported numeric strings', () => {
  it('extracts the numeric token from "750 mL"', () => {
    expect(extractNumericPart('750 mL')).toBe('750');
  });

  it('extracts "0" from "0 mL"', () => {
    expect(extractNumericPart('0 mL')).toBe('0');
  });

  it('extracts decimals like "1.5 mL"', () => {
    expect(extractNumericPart('1.5 mL')).toBe('1.5');
  });

  it('returns empty when no numeric token is present', () => {
    expect(extractNumericPart('mL')).toBe('');
    expect(extractNumericPart('')).toBe('');
    expect(extractNumericPart(null)).toBe('');
  });
});

// ─── serializeAbv ───────────────────────────────────────────────────────────

describe('serializeAbv — ABV unit toggle', () => {
  it('appends % Alc./Vol. when unit is percent', () => {
    expect(serializeAbv('45', 'percent')).toBe('45% Alc./Vol.');
  });

  it('appends Proof when unit is proof', () => {
    expect(serializeAbv('90', 'proof')).toBe('90 Proof');
  });

  it('returns empty string for empty value', () => {
    expect(serializeAbv('', 'percent')).toBe('');
    expect(serializeAbv('   ', 'proof')).toBe('');
  });

  it('trims surrounding whitespace before formatting', () => {
    expect(serializeAbv('  45  ', 'percent')).toBe('45% Alc./Vol.');
  });
});

// ─── serializeNetContents — submit-time mL append ───────────────────────────

describe('serializeNetContents — adds " mL" so submit matches OCR output', () => {
  it('appends " mL" to a digits-only value', () => {
    expect(serializeNetContents('750')).toBe('750 mL');
  });

  it('appends " mL" to a decimal value', () => {
    expect(serializeNetContents('1.75')).toBe('1.75 mL');
  });

  it('returns empty for empty input (no stray " mL" alone)', () => {
    expect(serializeNetContents('')).toBe('');
    expect(serializeNetContents('   ')).toBe('');
  });

  it('trims surrounding whitespace before appending', () => {
    expect(serializeNetContents('  750  ')).toBe('750 mL');
  });
});

// ─── verifying screen — deriveStages / progressRatio ────────────────────────

describe('deriveStages — verifying screen progression', () => {
  it('starts with stage 1 in progress at t=0', () => {
    const stages = deriveStages(0, false);
    expect(stages[0].status).toBe('current');
    expect(stages.slice(1).every((s) => s.status === 'pending')).toBe(true);
  });

  it('advances to stage 2 at 1.0s', () => {
    const stages = deriveStages(1000, false);
    expect(stages[0].status).toBe('done');
    expect(stages[1].status).toBe('current');
  });

  it('advances to stage 3 at 2.0s', () => {
    const stages = deriveStages(2000, false);
    expect(stages.slice(0, 2).every((s) => s.status === 'done')).toBe(true);
    expect(stages[2].status).toBe('current');
    expect(stages[3].status).toBe('pending');
  });

  it('holds stage 4 in progress at and beyond 3.0s', () => {
    const stages3 = deriveStages(3000, false);
    expect(stages3[3].status).toBe('current');
    const stages10 = deriveStages(10000, false);
    expect(stages10[3].status).toBe('current');
  });

  it('flips all stages to done when finished is true regardless of elapsed', () => {
    const stages = deriveStages(400, true);
    expect(stages.every((s) => s.status === 'done')).toBe(true);
  });

  it('progressRatio reaches 100% only when all stages are done', () => {
    expect(progressRatio(deriveStages(0, false))).toBeLessThan(0.5);
    expect(progressRatio(deriveStages(3000, false))).toBeLessThan(1);
    expect(progressRatio(deriveStages(0, true))).toBe(1);
  });
});

// ─── compareCompanyName — casing passes in the pipeline ─────────────────────

describe('w03 results-redesign casing — pipeline integration (casing now passes per BUG-10)', () => {
  const baseExtraction: ExtractionResult = {
    brand_name: 'Old Cypress Distillery',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol.',
    net_contents: '750 mL',
    bottler_name: 'OLD CYPRESS DISTILLERY', // casing-only divergence
    bottler_address: 'Louisville, KY',
    country_of_origin: null,
    government_warning:
      'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.',
  };

  const baseForm: ApplicationData = {
    brand_name: 'Old Cypress Distillery',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol.',
    net_contents: '750 mL',
    bottler_name: 'Old Cypress Distillery',
    bottler_address: 'Louisville, KY',
    country_of_origin: '',
    is_import: false,
  };

  it('casing-only bottler name passes cleanly (case not regulated — BUG-10)', () => {
    const { fields } = validateSpiritsLabel(baseForm, baseExtraction);
    const bottler = fields.find((f) => f.field === 'bottler_name');
    expect(bottler?.status).toBe('pass');
  });

  it('overall verdict is clean PASS when only casing differs on company-name field', () => {
    const { fields } = validateSpiritsLabel(baseForm, baseExtraction);
    const hasFail = fields.some((f) => f.status === 'fail');
    const hasWarning = fields.some((f) => f.status === 'warning');
    expect(hasFail).toBe(false);
    expect(hasWarning).toBe(false);
  });

  it('exact-case match remains a clean PASS with no note', () => {
    const r = compareCompanyName('Old Cypress Distillery', 'Old Cypress Distillery', 'Brand Name');
    expect(r.status).toBe('pass');
    expect(r.note).toBeUndefined();
  });
});
