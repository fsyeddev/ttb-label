/**
 * Pipeline eval tests — validate the full validation engine against fixture cases.
 * These tests mock Gemini extraction (tested separately via live evals) and focus
 * on the correctness of the validation logic end-to-end.
 */
import { describe, it, expect } from 'vitest';
import { validateSpiritsLabel } from '@/lib/validators/spirits';
import type { ApplicationData, ExtractionResult, FieldStatus, OverallStatus, COLAField } from '@/types/cola';

// Load fixtures
import allClear from './fixtures/ground-truth/old-tom-distillery.json';
import abvMismatch from './fixtures/ground-truth/abv-mismatch.json';
import wrongWarning from './fixtures/ground-truth/wrong-gov-warning.json';
import brandCaseMismatch from './fixtures/ground-truth/brand-name-case-mismatch.json';
import missingWarning from './fixtures/ground-truth/missing-gov-warning.json';
import importMissingOrigin from './fixtures/ground-truth/import-missing-origin.json';

type Fixture = {
  id: string;
  description: string;
  formData: ApplicationData;
  mockExtraction: ExtractionResult;
  expectedOverall: OverallStatus;
  expectedFields: Record<COLAField, FieldStatus>;
};

const FIXTURES: Fixture[] = [
  allClear,
  abvMismatch,
  wrongWarning,
  brandCaseMismatch,
  missingWarning,
  importMissingOrigin,
] as Fixture[];

function getOverall(fields: { status: FieldStatus }[]): OverallStatus {
  if (fields.some((f) => f.status === 'fail')) return 'FAIL';
  if (fields.some((f) => f.status === 'warning')) return 'REVIEW';
  return 'PASS';
}

describe('Validation pipeline — fixture-based eval', () => {
  for (const fixture of FIXTURES) {
    it(`[${fixture.id}] ${fixture.description}`, () => {
      const { fields } = validateSpiritsLabel(fixture.formData, fixture.mockExtraction);
      const overall = getOverall(fields);

      // Check overall status
      expect(overall, `Overall status for "${fixture.id}"`).toBe(fixture.expectedOverall);

      // Check per-field expected status
      for (const field of fields) {
        const expected = fixture.expectedFields[field.field];
        if (expected) {
          expect(
            field.status,
            `Field "${field.field}" in "${fixture.id}": expected ${expected}, got ${field.status}`
          ).toBe(expected);
        }
      }
    });
  }
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('Validation pipeline — edge cases', () => {
  const baseForm: ApplicationData = {
    brand_name: 'Test Brand',
    class_type: 'Vodka',
    abv: '40% Alc./Vol.',
    net_contents: '750 mL',
    bottler_name: 'Test Bottler',
    bottler_address: 'Test City, TX 75001',
    country_of_origin: 'USA',
    is_import: false,
  };

  const baseExtraction: ExtractionResult = {
    brand_name: 'Test Brand',
    class_type: 'Vodka',
    abv: '40% Alc./Vol.',
    net_contents: '750 mL',
    bottler_name: 'Test Bottler',
    bottler_address: 'Test City, TX 75001',
    country_of_origin: 'USA',
    government_warning:
      'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.',
    confidence: 'high',
  };

  it('passes a fully matching label', () => {
    const { fields } = validateSpiritsLabel(baseForm, baseExtraction);
    const allPass = fields.every((f) => f.status === 'pass');
    expect(allPass).toBe(true);
  });

  it('fails when ABV is completely missing from label', () => {
    const { fields } = validateSpiritsLabel(baseForm, { ...baseExtraction, abv: null });
    const abv = fields.find((f) => f.field === 'abv');
    expect(abv?.status).toBe('fail');
  });

  it('fails when net contents is missing from label', () => {
    const { fields } = validateSpiritsLabel(baseForm, { ...baseExtraction, net_contents: null });
    const nc = fields.find((f) => f.field === 'net_contents');
    expect(nc?.status).toBe('fail');
  });

  it('handles 1L vs 1000mL as matching net contents', () => {
    const { fields } = validateSpiritsLabel(
      { ...baseForm, net_contents: '1 L' },
      { ...baseExtraction, net_contents: '1000 mL' }
    );
    const nc = fields.find((f) => f.field === 'net_contents');
    expect(nc?.status).toBe('pass');
  });

  it('proof/percent conversion: 80 Proof matches 40% ABV', () => {
    const { fields } = validateSpiritsLabel(
      { ...baseForm, abv: '40% Alc./Vol.' },
      { ...baseExtraction, abv: '80 Proof' }
    );
    const abv = fields.find((f) => f.field === 'abv');
    expect(abv?.status).toBe('pass');
  });

  it('domestic product gets pass for country of origin regardless', () => {
    const { fields } = validateSpiritsLabel(
      { ...baseForm, is_import: false },
      { ...baseExtraction, country_of_origin: null }
    );
    const coo = fields.find((f) => f.field === 'country_of_origin');
    expect(coo?.status).toBe('pass');
  });

  it('import without country_of_origin on label fails', () => {
    const { fields } = validateSpiritsLabel(
      { ...baseForm, is_import: true, country_of_origin: 'France' },
      { ...baseExtraction, country_of_origin: null }
    );
    const coo = fields.find((f) => f.field === 'country_of_origin');
    expect(coo?.status).toBe('fail');
  });
});

// ─── Compliance advisories — pipeline interaction ────────────────────────────
//
// These verify the architectural rule that advisories never affect the
// PASS/FAIL/REVIEW headline. A green PASS coexisting with multiple advisories
// is the desired outcome; a FAIL with advisories is independent.

describe('Validation pipeline — advisories never affect overall status', () => {
  const baseForm: ApplicationData = {
    brand_name: 'Test Brand',
    class_type: 'Vodka',
    abv: '40% Alc./Vol.',
    net_contents: '750 mL',
    bottler_name: 'Test Bottler',
    bottler_address: 'Test City, TX 75001',
    country_of_origin: 'USA',
    is_import: false,
  };

  const baseExtraction: ExtractionResult = {
    brand_name: 'Test Brand',
    class_type: 'Vodka',
    abv: '40% Alc./Vol.',
    net_contents: '750 mL',
    bottler_name: 'Test Bottler',
    bottler_address: 'Test City, TX 75001',
    country_of_origin: 'USA',
    government_warning:
      'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.',
    production_statement: 'Distilled by Test Bottler',
    confidence: 'high',
  };

  it('pipeline_passing_label_with_one_advisory — green PASS coexists with non-standard bottle size', () => {
    const { fields, advisories } = validateSpiritsLabel(
      { ...baseForm, net_contents: '600 mL' },
      { ...baseExtraction, net_contents: '600 mL' }
    );
    expect(getOverall(fields)).toBe('PASS');
    expect(advisories.some((a) => a.id === 'bottle-size-non-standard')).toBe(true);
  });

  it('pipeline_failing_label_with_advisories_independent — FAIL coexists with advisories without contamination', () => {
    const { fields, advisories } = validateSpiritsLabel(
      { ...baseForm, abv: '40% Alc./Vol.', net_contents: '600 mL' },
      { ...baseExtraction, abv: '50% Alc./Vol.', net_contents: '600 mL' }
    );
    expect(getOverall(fields)).toBe('FAIL');
    // Advisory still surfaced; the FAIL came from the cross-validation layer only.
    expect(advisories.some((a) => a.id === 'bottle-size-non-standard')).toBe(true);
  });

  it('pipeline_no_advisories_for_perfect_label — clean label and form yields empty advisories array', () => {
    const { fields, advisories } = validateSpiritsLabel(baseForm, baseExtraction);
    expect(getOverall(fields)).toBe('PASS');
    expect(advisories).toEqual([]);
  });
});
