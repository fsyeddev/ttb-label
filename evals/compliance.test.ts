/**
 * Compliance advisory eval suite — one describe block per rule, plus the orchestrator.
 * Mirrors the test cases enumerated in docs/specs/compliance-advisories.md.
 *
 * Advisories are independent of the cross-validation FieldResult layer; these tests
 * exercise the rule functions in isolation. Pipeline-level interaction (advisories
 * never affect overallStatus) is tested in pipeline.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  checkBottleSize,
  checkAgeStatement,
  checkStatementOfComposition,
  checkStateOfDistillation,
  checkProductionStatement,
  checkFancifulName,
  runComplianceChecks,
} from '@/lib/validators/compliance';
import type { ApplicationData, ExtractionResult } from '@/types/cola';

const BASE_EXTRACTION: ExtractionResult = {
  brand_name: 'Test Brand',
  class_type: 'Vodka',
  abv: '40% Alc./Vol.',
  net_contents: '750 mL',
  bottler_name: 'Test Bottler',
  bottler_address: 'Test City, TX 75001',
  country_of_origin: 'USA',
  government_warning: null,
  age_statement: null,
  statement_of_composition: null,
  state_of_distillation: null,
  production_statement: 'Distilled by Test Bottler',
  confidence: 'high',
};

const BASE_FORM: ApplicationData = {
  brand_name: 'Test Brand',
  class_type: 'Vodka',
  abv: '40% Alc./Vol.',
  net_contents: '750 mL',
  bottler_name: 'Test Bottler',
  bottler_address: 'Test City, TX 75001',
  country_of_origin: 'USA',
  is_import: false,
};

// ─── Bottle size — 27 CFR 5.47 ──────────────────────────────────────────────

describe('checkBottleSize', () => {
  it('bottle_750ml_no_advisory', () => {
    expect(checkBottleSize({ ...BASE_EXTRACTION, net_contents: '750 mL' })).toBeNull();
  });

  it('bottle_700ml_no_advisory — added to approved list in 2020', () => {
    expect(checkBottleSize({ ...BASE_EXTRACTION, net_contents: '700 mL' })).toBeNull();
  });

  it('bottle_600ml_warning', () => {
    const flag = checkBottleSize({ ...BASE_EXTRACTION, net_contents: '600 mL' });
    expect(flag).not.toBeNull();
    expect(flag?.severity).toBe('warning');
    expect(flag?.cfrReference).toBe('27 CFR 5.47');
  });

  it('bottle_1L_no_advisory — 1 L normalizes to 1000 mL', () => {
    expect(checkBottleSize({ ...BASE_EXTRACTION, net_contents: '1 L' })).toBeNull();
  });

  it('bottle_unit_normalization — 1.75 L matches 1750 mL', () => {
    expect(checkBottleSize({ ...BASE_EXTRACTION, net_contents: '1.75 L' })).toBeNull();
  });

  it('bottle_ocr_tolerance — 751 mL within ±2 mL → null', () => {
    expect(checkBottleSize({ ...BASE_EXTRACTION, net_contents: '751 mL' })).toBeNull();
  });

  it('bottle_mL_outside_tolerance — 760 mL → warning', () => {
    expect(checkBottleSize({ ...BASE_EXTRACTION, net_contents: '760 mL' })?.severity).toBe('warning');
  });

  it('bottle_unparseable_returns_null — does not double-fail when net_contents is garbled', () => {
    // Cross-validation layer already flags missing/garbled net_contents as a field FAIL.
    expect(checkBottleSize({ ...BASE_EXTRACTION, net_contents: null })).toBeNull();
    expect(checkBottleSize({ ...BASE_EXTRACTION, net_contents: 'foo' })).toBeNull();
  });
});

// ─── Age statement — 27 CFR 5.40 ────────────────────────────────────────────

describe('checkAgeStatement', () => {
  it('age_young_bourbon_no_label_age_warning', () => {
    const flag = checkAgeStatement(
      { ...BASE_EXTRACTION, class_type: 'Bourbon Whiskey', age_statement: null },
      { ...BASE_FORM, class_type: 'Bourbon Whiskey', aged_years: 2 }
    );
    expect(flag).not.toBeNull();
    expect(flag?.severity).toBe('review-required');
    expect(flag?.cfrReference).toBe('27 CFR 5.40');
  });

  it('age_old_bourbon_no_advisory — 8 years, no on-label statement → null', () => {
    expect(
      checkAgeStatement(
        { ...BASE_EXTRACTION, class_type: 'Bourbon Whiskey', age_statement: null },
        { ...BASE_FORM, class_type: 'Bourbon Whiskey', aged_years: 8 }
      )
    ).toBeNull();
  });

  it('age_non_whisky_no_advisory — Vodka regardless of age', () => {
    expect(
      checkAgeStatement(
        { ...BASE_EXTRACTION, class_type: 'Vodka', age_statement: null },
        { ...BASE_FORM, class_type: 'Vodka', aged_years: 1 }
      )
    ).toBeNull();
  });

  it('age_young_with_label_age_no_advisory — agent says 2 yr, label states "Aged 2 Years"', () => {
    expect(
      checkAgeStatement(
        { ...BASE_EXTRACTION, class_type: 'Bourbon Whiskey', age_statement: 'Aged 2 Years' },
        { ...BASE_FORM, class_type: 'Bourbon Whiskey', aged_years: 2 }
      )
    ).toBeNull();
  });

  it('age_no_aged_years_supplied_no_advisory — no trigger without agent input', () => {
    expect(
      checkAgeStatement(
        { ...BASE_EXTRACTION, class_type: 'Bourbon Whiskey', age_statement: null },
        { ...BASE_FORM, class_type: 'Bourbon Whiskey' }
      )
    ).toBeNull();
  });
});

// ─── Statement of composition — 27 CFR 5.39 ─────────────────────────────────

describe('checkStatementOfComposition', () => {
  it('composition_liqueur_with_text_no_advisory', () => {
    expect(
      checkStatementOfComposition({
        ...BASE_EXTRACTION,
        class_type: 'Cinnamon Liqueur',
        statement_of_composition: 'Cinnamon-flavored whisky with natural flavors',
      })
    ).toBeNull();
  });

  it('composition_liqueur_missing_warning', () => {
    const flag = checkStatementOfComposition({
      ...BASE_EXTRACTION,
      class_type: 'Cinnamon Liqueur',
      statement_of_composition: null,
    });
    expect(flag).not.toBeNull();
    expect(flag?.severity).toBe('warning');
    expect(flag?.cfrReference).toBe('27 CFR 5.39');
  });

  it('composition_specialty_missing_warning', () => {
    expect(
      checkStatementOfComposition({
        ...BASE_EXTRACTION,
        class_type: 'Distilled Spirits Specialty',
        statement_of_composition: null,
      })?.severity
    ).toBe('warning');
  });

  it('composition_bourbon_no_advisory — not a triggering class', () => {
    expect(
      checkStatementOfComposition({
        ...BASE_EXTRACTION,
        class_type: 'Bourbon Whiskey',
        statement_of_composition: null,
      })
    ).toBeNull();
  });
});

// ─── State / country of distillation — 27 CFR 5.36 ──────────────────────────

describe('checkStateOfDistillation', () => {
  it('state_straight_with_state_no_advisory', () => {
    expect(
      checkStateOfDistillation(
        {
          ...BASE_EXTRACTION,
          class_type: 'Kentucky Straight Bourbon Whiskey',
          state_of_distillation: 'Distilled in Kentucky',
        },
        { ...BASE_FORM, class_type: 'Kentucky Straight Bourbon Whiskey' }
      )
    ).toBeNull();
  });

  it('state_straight_missing_warning', () => {
    const flag = checkStateOfDistillation(
      { ...BASE_EXTRACTION, class_type: 'Straight Rye Whiskey', state_of_distillation: null },
      { ...BASE_FORM, class_type: 'Straight Rye Whiskey' }
    );
    expect(flag?.severity).toBe('warning');
    expect(flag?.cfrReference).toBe('27 CFR 5.36');
  });

  it('state_imported_with_country_no_advisory', () => {
    expect(
      checkStateOfDistillation(
        {
          ...BASE_EXTRACTION,
          class_type: 'Scotch Whisky',
          state_of_distillation: 'Product of Scotland',
          country_of_origin: 'Scotland',
        },
        { ...BASE_FORM, class_type: 'Scotch Whisky', is_import: true }
      )
    ).toBeNull();
  });

  it('state_imported_missing_warning', () => {
    const flag = checkStateOfDistillation(
      {
        ...BASE_EXTRACTION,
        class_type: 'Vodka',
        state_of_distillation: null,
        country_of_origin: null,
      },
      { ...BASE_FORM, class_type: 'Vodka', is_import: true }
    );
    expect(flag?.severity).toBe('warning');
  });
});

// ─── Production statement — 27 CFR 5.36 ─────────────────────────────────────

describe('checkProductionStatement', () => {
  it('production_distilled_by_no_advisory', () => {
    expect(
      checkProductionStatement({
        ...BASE_EXTRACTION,
        production_statement: 'Distilled by Old Tom Distillery',
      })
    ).toBeNull();
  });

  it('production_produced_and_bottled_by_no_advisory', () => {
    expect(
      checkProductionStatement({
        ...BASE_EXTRACTION,
        production_statement: 'Produced and bottled by ABC Spirits',
      })
    ).toBeNull();
  });

  it('production_imported_by_no_advisory', () => {
    expect(
      checkProductionStatement({
        ...BASE_EXTRACTION,
        production_statement: 'Imported by Acme Imports, NY',
      })
    ).toBeNull();
  });

  it('production_made_by_info', () => {
    const flag = checkProductionStatement({
      ...BASE_EXTRACTION,
      production_statement: 'Made by Old Tom Distillery',
    });
    expect(flag?.severity).toBe('info');
    expect(flag?.id).toBe('production-statement-non-standard');
  });

  it('production_missing_warning — producer named but no production phrase', () => {
    const flag = checkProductionStatement({
      ...BASE_EXTRACTION,
      bottler_name: 'Old Tom Distillery',
      production_statement: null,
    });
    expect(flag?.severity).toBe('warning');
  });

  it('production_missing_no_producer_no_advisory — neither producer nor statement → null', () => {
    expect(
      checkProductionStatement({
        ...BASE_EXTRACTION,
        bottler_name: null,
        production_statement: null,
      })
    ).toBeNull();
  });
});

// ─── Fanciful name detection — 27 CFR 5.34 ──────────────────────────────────

describe('checkFancifulName', () => {
  it('fanciful_jack_daniels_tennessee_fire — surfaces "Tennessee Fire" as info', () => {
    const flag = checkFancifulName(
      { ...BASE_EXTRACTION, brand_name: "Jack Daniel's Tennessee Fire" },
      { ...BASE_FORM, brand_name: "Jack Daniel's" }
    );
    expect(flag?.severity).toBe('info');
    expect(flag?.detail).toContain('Tennessee Fire');
  });

  it("fanciful_exact_match_no_advisory — Tito's Vodka == Tito's Vodka", () => {
    expect(
      checkFancifulName(
        { ...BASE_EXTRACTION, brand_name: "Tito's Vodka" },
        { ...BASE_FORM, brand_name: "Tito's Vodka" }
      )
    ).toBeNull();
  });

  it('fanciful_extracted_subset_no_advisory — extracted shorter than submitted', () => {
    expect(
      checkFancifulName(
        { ...BASE_EXTRACTION, brand_name: "Jack Daniel's" },
        { ...BASE_FORM, brand_name: "Jack Daniel's Old No. 7" }
      )
    ).toBeNull();
  });

  it('fanciful_null_extraction_no_advisory', () => {
    expect(
      checkFancifulName(
        { ...BASE_EXTRACTION, brand_name: null },
        { ...BASE_FORM, brand_name: "Jack Daniel's" }
      )
    ).toBeNull();
  });
});

// ─── Orchestrator ───────────────────────────────────────────────────────────

describe('runComplianceChecks', () => {
  it('orchestrator_no_advisories_returns_empty — clean label and form', () => {
    const advisories = runComplianceChecks(BASE_FORM, BASE_EXTRACTION);
    expect(advisories).toEqual([]);
  });

  it('orchestrator_multiple_advisories_returned — bottle size + age + composition', () => {
    const form: ApplicationData = {
      ...BASE_FORM,
      class_type: 'Cinnamon Liqueur', // triggers composition rule
      aged_years: 2,                   // arms age rule (but only fires for whisky — not relevant here)
    };
    const extraction: ExtractionResult = {
      ...BASE_EXTRACTION,
      class_type: 'Cinnamon Liqueur',
      net_contents: '600 mL',          // triggers bottle-size rule
      statement_of_composition: null,  // triggers composition rule
      production_statement: 'Made by ABC', // triggers production-statement non-standard rule
    };
    const advisories = runComplianceChecks(form, extraction);
    const ids = advisories.map((a) => a.id);
    expect(ids).toContain('bottle-size-non-standard');
    expect(ids).toContain('composition-statement-missing');
    expect(ids).toContain('production-statement-non-standard');
    expect(advisories.length).toBeGreaterThanOrEqual(3);
  });

  it('orchestrator_young_whisky_triple — bottle size + age statement + state of distillation', () => {
    const form: ApplicationData = {
      ...BASE_FORM,
      class_type: 'Straight Rye Whiskey',
      aged_years: 2,
    };
    const extraction: ExtractionResult = {
      ...BASE_EXTRACTION,
      class_type: 'Straight Rye Whiskey',
      net_contents: '600 mL',
      age_statement: null,
      state_of_distillation: null,
    };
    const advisories = runComplianceChecks(form, extraction);
    const ids = advisories.map((a) => a.id);
    expect(ids).toContain('bottle-size-non-standard');
    expect(ids).toContain('age-statement-missing');
    expect(ids).toContain('state-of-distillation-missing-straight');
  });
});
