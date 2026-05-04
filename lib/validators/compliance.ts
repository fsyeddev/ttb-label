// Compliance advisories — informational TTB-rule checks on the label itself.
//
// These run alongside the cross-validation field checks but are independent:
// advisories never affect overallStatus. A green PASS verdict can coexist with
// any number of advisories. See docs/specs/compliance-advisories.md for the
// architectural rationale (cross-validation vs. compliance advisories).

import type { ApplicationData, ExtractionResult, ComplianceFlag } from '@/types/cola';
import { normalize } from './semantic';

// 27 CFR 5.47 — approved standards of fill for distilled spirits, in mL.
// Updated 2020 to add 700 mL alongside the legacy list.
const APPROVED_SPIRITS_FILL_SIZES_ML = [50, 100, 200, 355, 375, 500, 700, 750, 1000, 1750];
const BOTTLE_SIZE_TOLERANCE_ML = 2;

// 27 CFR 5.36 — approved producer-attribution phrasings.
const APPROVED_PRODUCTION_PHRASES = [
  'distilled by',
  'bottled by',
  'produced by',
  'imported by',
  'distilled and bottled by',
  'produced and bottled by',
  'manufactured by',
  'blended by',
];

// Class-membership triggers for the statement-of-composition advisory (27 CFR 5.39).
const COMPOSITION_TRIGGER_KEYWORDS = [
  'liqueur',
  'cordial',
  'distilled spirits specialty',
  'flavored',
];

/**
 * Parse a net-contents string to milliliters.
 * Handles "750 mL", "750ml", "1 L", "1.75 L". Returns null on unparseable input.
 */
function parseNetContentsToMl(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.trim().toLowerCase();
  const mlMatch = s.match(/^([\d.]+)\s*ml\b/);
  if (mlMatch) return parseFloat(mlMatch[1]);
  const lMatch = s.match(/^([\d.]+)\s*(?:l|liter|litre)s?\b/);
  if (lMatch) return parseFloat(lMatch[1]) * 1000;
  return null;
}

/**
 * 27 CFR 5.47 — bottle-size compliance for distilled spirits.
 * Flags volumes outside the approved fill list (±2 mL OCR tolerance).
 */
export function checkBottleSize(extraction: ExtractionResult): ComplianceFlag | null {
  const ml = parseNetContentsToMl(extraction.net_contents);
  if (ml === null) return null; // unparseable — cross-validation handles missing/garbled net_contents

  const onApprovedList = APPROVED_SPIRITS_FILL_SIZES_ML.some(
    (approved) => Math.abs(ml - approved) <= BOTTLE_SIZE_TOLERANCE_ML
  );
  if (onApprovedList) return null;

  return {
    id: 'bottle-size-non-standard',
    severity: 'warning',
    title: `Non-standard bottle size: ${extraction.net_contents}`,
    detail: `${extraction.net_contents} is not on the approved standards-of-fill list for distilled spirits (50, 100, 200, 355, 375, 500, 700, 750, 1000, 1750 mL).`,
    cfrReference: '27 CFR 5.47',
    relatedField: 'net_contents',
  };
}

/**
 * 27 CFR 5.40 — age statement requirement for whisky aged under 4 years.
 *
 * Fires only when the agent supplies a known-young age via aged_years AND no
 * age statement was found on the label. A label image alone cannot prove age,
 * so we rely on the agent-submitted value as the trigger.
 */
export function checkAgeStatement(
  extraction: ExtractionResult,
  formData: ApplicationData
): ComplianceFlag | null {
  const classText = normalize(extraction.class_type ?? formData.class_type);
  const isWhisky = classText.includes('whisky') || classText.includes('whiskey');
  if (!isWhisky) return null;

  if (typeof formData.aged_years !== 'number' || formData.aged_years >= 4) return null;

  if (extraction.age_statement && extraction.age_statement.trim()) return null;

  return {
    id: 'age-statement-missing',
    severity: 'review-required',
    title: 'Age statement may be required',
    detail: `Application indicates the spirit is aged ${formData.aged_years} year(s). Whisky aged under 4 years must carry an age statement on the label, but none was detected.`,
    cfrReference: '27 CFR 5.40',
    relatedField: 'class_type',
  };
}

/**
 * 27 CFR 5.39 — statement of composition for liqueurs, cordials, specialty,
 * and flavored variants. Flags missing composition text.
 */
export function checkStatementOfComposition(extraction: ExtractionResult): ComplianceFlag | null {
  const classText = normalize(extraction.class_type);
  if (!classText) return null;
  const triggers = COMPOSITION_TRIGGER_KEYWORDS.some((kw) => classText.includes(kw));
  if (!triggers) return null;

  if (extraction.statement_of_composition && extraction.statement_of_composition.trim()) return null;

  return {
    id: 'composition-statement-missing',
    severity: 'warning',
    title: 'Statement of composition not found',
    detail: `Class "${extraction.class_type}" requires a statement of composition (e.g., "Cinnamon-flavored whisky with natural flavors"). None was detected on the label.`,
    cfrReference: '27 CFR 5.39',
    relatedField: 'class_type',
  };
}

/**
 * 27 CFR 5.36 — state or country of distillation indicator.
 *
 * Fires when:
 *  - class includes "straight" AND no state-of-distillation phrase was extracted, OR
 *  - product is imported AND no country/state-of-distillation phrase was extracted
 *    (and no country_of_origin extracted either).
 */
export function checkStateOfDistillation(
  extraction: ExtractionResult,
  formData: ApplicationData
): ComplianceFlag | null {
  const classText = normalize(extraction.class_type ?? formData.class_type);
  const isStraight = classText.includes('straight');
  const isImport = formData.is_import === true;

  const hasStatePhrase = !!(extraction.state_of_distillation && extraction.state_of_distillation.trim());
  const hasCountry = !!(extraction.country_of_origin && extraction.country_of_origin.trim());

  if (isStraight && !hasStatePhrase) {
    return {
      id: 'state-of-distillation-missing-straight',
      severity: 'warning',
      title: 'State of distillation not found',
      detail: `"${extraction.class_type ?? formData.class_type}" is a "straight" designation, which requires the state of distillation to be stated on the label.`,
      cfrReference: '27 CFR 5.36',
      relatedField: 'class_type',
    };
  }

  if (isImport && !hasStatePhrase && !hasCountry) {
    return {
      id: 'country-of-distillation-missing-import',
      severity: 'warning',
      title: 'Country of distillation not found on imported label',
      detail: 'Imported distilled spirits must show the country of distillation/origin on the label. None was detected.',
      cfrReference: '27 CFR 5.36',
      relatedField: 'country_of_origin',
    };
  }

  return null;
}

/**
 * 27 CFR 5.36 — production-statement phrasing.
 *
 * If a production_statement was extracted but doesn't begin with an approved
 * phrasing (e.g., "Made by..." instead of "Distilled by..."), surface as info.
 * If no production_statement was extracted at all but a producer is named,
 * surface as a warning.
 */
export function checkProductionStatement(extraction: ExtractionResult): ComplianceFlag | null {
  const stmt = extraction.production_statement?.trim() ?? '';

  if (!stmt) {
    if (extraction.bottler_name && extraction.bottler_name.trim()) {
      return {
        id: 'production-statement-missing',
        severity: 'warning',
        title: 'Production statement not found',
        detail: 'A bottler/producer is named but no "Distilled by", "Bottled by", "Produced by", or similar production attribution was detected.',
        cfrReference: '27 CFR 5.36',
        relatedField: 'bottler_name',
      };
    }
    return null;
  }

  const stmtLower = stmt.toLowerCase();
  const startsWithApproved = APPROVED_PRODUCTION_PHRASES.some((phrase) => stmtLower.startsWith(phrase));
  if (startsWithApproved) return null;

  return {
    id: 'production-statement-non-standard',
    severity: 'info',
    title: 'Non-standard production statement',
    detail: `"${stmt}" does not begin with a TTB-approved production phrasing (e.g., "Distilled by", "Bottled by", "Produced by", "Imported by"). Verify this is acceptable.`,
    cfrReference: '27 CFR 5.36',
    relatedField: 'bottler_name',
  };
}

/**
 * Fanciful-name detection. If the extracted brand text contains the submitted
 * brand plus extra trailing words, surface those words as a potential fanciful
 * name (e.g., extracted "Jack Daniel's Tennessee Fire" minus submitted
 * "Jack Daniel's" → "Tennessee Fire"). Info-severity only.
 *
 * In normal operation Gemini's extraction prompt strips fanciful names from
 * brand_name, so this rule fires mostly as a safety net for extraction misbehavior.
 */
export function checkFancifulName(
  extraction: ExtractionResult,
  formData: ApplicationData
): ComplianceFlag | null {
  const submitted = normalize(formData.brand_name);
  const extracted = normalize(extraction.brand_name);
  if (!submitted || !extracted) return null;
  if (submitted === extracted) return null;
  if (extracted.length <= submitted.length) return null;

  // Require the extracted text to start with the submitted brand followed by a space,
  // so we only flag genuine "submitted + trailing words" cases.
  if (!extracted.startsWith(submitted + ' ')) return null;

  // Recover the trailing words from the original (non-normalized) extraction
  // so the candidate keeps its original casing.
  const original = extraction.brand_name?.trim() ?? '';
  const candidate = original.slice(formData.brand_name.trim().length).trim();
  if (!candidate) return null;

  return {
    id: 'fanciful-name-candidate',
    severity: 'info',
    title: 'Possible fanciful name detected',
    detail: `Label brand text appears to include "${candidate}" beyond the submitted brand "${formData.brand_name}". Confirm whether this is a fanciful/expression name that belongs in a separate field.`,
    cfrReference: '27 CFR 5.34',
    relatedField: 'brand_name',
  };
}

/**
 * Run all compliance advisory checks. Order is fixed for deterministic output.
 * Null results are filtered out; the returned array is what the UI renders.
 */
export function runComplianceChecks(
  formData: ApplicationData,
  extraction: ExtractionResult
): ComplianceFlag[] {
  const checks = [
    checkBottleSize(extraction),
    checkAgeStatement(extraction, formData),
    checkStatementOfComposition(extraction),
    checkStateOfDistillation(extraction, formData),
    checkProductionStatement(extraction),
    checkFancifulName(extraction, formData),
  ];
  return checks.filter((flag): flag is ComplianceFlag => flag !== null);
}
