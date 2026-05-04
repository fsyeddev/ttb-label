// 27 CFR Part 5 — COLA compliance rules for distilled spirits
// Validates that all required fields are present and meet TTB standards

import type { ApplicationData, ExtractionResult, FieldResult, COLAField } from '@/types/cola';
import { COLA_FIELD_LABELS } from '@/types/cola';
import { compareABV, compareNetContents, compareGovernmentWarning, GOVERNMENT_WARNING_OFFICIAL } from './regex';
import { compareTextField } from './semantic';

// Approved class/type designations from 27 CFR Part 5.22 and 5.35
// This is a representative subset — expand with full CFR list for production
export const APPROVED_CLASS_TYPES = [
  // Whisky — 27 CFR Part 5.22(b)
  'bourbon whisky', 'bourbon whiskey',
  'straight bourbon whisky', 'straight bourbon whiskey',
  'kentucky straight bourbon whisky', 'kentucky straight bourbon whiskey',
  'blended bourbon whisky', 'blended bourbon whiskey',
  'blend of straight bourbons', 'blend of straight bourbon whiskies', 'blend of straight bourbon whiskeys',
  'tennessee whisky', 'tennessee whiskey',
  'rye whisky', 'rye whiskey',
  'straight rye whisky', 'straight rye whiskey',
  'blended rye whisky', 'blended rye whiskey',
  'blend of straight rye whiskies', 'blend of straight rye whiskeys',
  'wheat whisky', 'wheat whiskey',
  'straight wheat whisky', 'straight wheat whiskey',
  'blended wheat whisky', 'blended wheat whiskey',
  'malt whisky', 'malt whiskey',
  'straight malt whisky', 'straight malt whiskey',
  'blended malt whisky', 'blended malt whiskey',
  'rye malt whisky', 'rye malt whiskey',
  'straight rye malt whisky', 'straight rye malt whiskey',
  'blended rye malt whisky', 'blended rye malt whiskey',
  'corn whisky', 'corn whiskey',
  'straight corn whisky', 'straight corn whiskey',
  'blended corn whisky', 'blended corn whiskey',
  'grain whisky', 'grain whiskey',
  'american whisky', 'american whiskey',
  'blended whisky', 'blended whiskey',
  'blend of straight whiskies', 'blend of straight whiskeys',
  'light whisky', 'light whiskey',
  'spirit whisky', 'spirit whiskey',
  'scotch whisky', 'scotch whiskey',
  'blended scotch whisky', 'blended scotch whiskey',
  'single malt scotch whisky', 'single malt scotch whiskey',
  'blended malt scotch whisky', 'blended malt scotch whiskey',
  'single grain scotch whisky', 'single grain scotch whiskey',
  'irish whisky', 'irish whiskey',
  'canadian whisky', 'canadian whiskey',
  'bottled-in-bond bourbon whisky', 'bottled-in-bond bourbon whiskey',
  'bottled in bond bourbon whisky', 'bottled in bond bourbon whiskey',
  // Gin — 27 CFR Part 5.22(c)
  'gin', 'distilled gin', 'dry gin', 'london dry gin',
  'compound gin', 'old tom gin', 'genever', 'geneva gin',
  // Vodka — 27 CFR Part 5.22(a)
  'vodka',
  // Rum — 27 CFR Part 5.22(f)
  'rum', 'light rum', 'dark rum', 'aged rum',
  'puerto rican rum', 'virgin islands rum', 'demerara rum', 'agricole rum',
  // Brandy — 27 CFR Part 5.22(d)
  'brandy', 'grape brandy', 'fruit brandy',
  'apple brandy', 'applejack', 'blended applejack',
  'cognac', 'armagnac', 'calvados', 'pisco', 'grappa',
  'marc brandy', 'pomace brandy', 'neutral brandy',
  'blend of straight brandies',
  // Tequila / Mezcal — 27 CFR Part 5.22(g)
  'tequila', 'blanco tequila', 'silver tequila', 'plata tequila',
  'joven tequila', 'gold tequila',
  'reposado tequila', 'añejo tequila', 'extra añejo tequila',
  'mezcal',
  // Cordials & Liqueurs — 27 CFR Part 5.22(h)
  'cordial', 'liqueur',
  'cinnamon liqueur', 'coffee liqueur', 'cream liqueur', 'fruit liqueur',
  'herbal liqueur', 'nut liqueur', 'orange liqueur',
  'triple sec', 'curacao', 'amaretto', 'schnapps', 'bitters',
  'sloe gin',
  // Other spirits
  'absinthe', 'aquavit', 'calvados', 'grappa', 'cachaça',
  'shochu', 'baijiu', 'palinka', 'pálinka',
  'neutral spirits', 'grain spirits', 'ethyl alcohol',
  'distilled spirits specialty',
];

function normalizeClassType(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function isApprovedClassType(classType: string): boolean {
  const normalized = normalizeClassType(classType);
  return APPROVED_CLASS_TYPES.some(
    (approved) => normalized === approved || normalized.includes(approved) || approved.includes(normalized)
  );
}

/**
 * Run all 27 CFR Part 5 compliance checks against extracted label data and submitted form data.
 * Returns one FieldResult per COLA field.
 */
export function validateSpiritsLabel(
  formData: ApplicationData,
  extraction: ExtractionResult
): FieldResult[] {
  const results: FieldResult[] = [];

  // 1. Brand Name — fuzzy match
  const brandResult = compareTextField(formData.brand_name, extraction.brand_name, 'Brand Name');
  results.push({
    field: 'brand_name',
    label: COLA_FIELD_LABELS.brand_name,
    submitted: formData.brand_name || '',
    extracted: extraction.brand_name,
    status: brandResult.status,
    note: brandResult.note,
  });

  // 2. Class / Type Designation — semantic match + CFR approval check
  const classResult = compareTextField(formData.class_type, extraction.class_type, 'Class/Type');
  let classNote = classResult.note;
  let classStatus = classResult.status;

  if (extraction.class_type && !isApprovedClassType(extraction.class_type)) {
    const unapprovedNote = `"${extraction.class_type}" may not be an approved TTB class/type designation under 27 CFR Part 5. Check that the label shows the legal class/type (e.g., "Cinnamon Liqueur"), not a fanciful name.`;
    if (classStatus === 'pass') {
      // Matched submitted text but the extracted value itself isn't a valid CFR designation
      classStatus = 'warning';
      classNote = unapprovedNote;
    } else {
      // Already fail or warning — keep the worse status, append context
      classNote = classNote ? `${classNote} ${unapprovedNote}` : unapprovedNote;
    }
  }

  results.push({
    field: 'class_type',
    label: COLA_FIELD_LABELS.class_type,
    submitted: formData.class_type || '',
    extracted: extraction.class_type,
    status: classStatus,
    note: classNote,
    complianceNote: 'Must be an approved designation per 27 CFR Part 5.22',
  });

  // 3. ABV — numeric regex comparison
  if (!extraction.abv) {
    results.push({
      field: 'abv',
      label: COLA_FIELD_LABELS.abv,
      submitted: formData.abv || '',
      extracted: null,
      status: 'fail',
      note: 'Alcohol by volume not found on label',
      complianceNote: 'ABV is mandatory on distilled spirits labels (27 CFR 5.52)',
    });
  } else {
    const abvResult = compareABV(formData.abv, extraction.abv);
    results.push({
      field: 'abv',
      label: COLA_FIELD_LABELS.abv,
      submitted: formData.abv || '',
      extracted: extraction.abv,
      status: abvResult.match ? 'pass' : 'fail',
      note: abvResult.note,
      complianceNote: 'Must be within 0.5% of actual content (27 CFR 5.52)',
    });
  }

  // 4. Net Contents — regex comparison with unit normalization
  if (!extraction.net_contents) {
    results.push({
      field: 'net_contents',
      label: COLA_FIELD_LABELS.net_contents,
      submitted: formData.net_contents || '',
      extracted: null,
      status: 'fail',
      note: 'Net contents not found on label',
      complianceNote: 'Net contents mandatory on distilled spirits labels (27 CFR 5.53)',
    });
  } else {
    const netResult = compareNetContents(formData.net_contents, extraction.net_contents);
    results.push({
      field: 'net_contents',
      label: COLA_FIELD_LABELS.net_contents,
      submitted: formData.net_contents || '',
      extracted: extraction.net_contents,
      status: netResult.match ? 'pass' : 'fail',
      note: netResult.note,
    });
  }

  // 5. Bottler / Producer Name — fuzzy
  const bottlerNameResult = compareTextField(formData.bottler_name, extraction.bottler_name, 'Bottler Name');
  results.push({
    field: 'bottler_name',
    label: COLA_FIELD_LABELS.bottler_name,
    submitted: formData.bottler_name || '',
    extracted: extraction.bottler_name,
    status: bottlerNameResult.status,
    note: bottlerNameResult.note,
    complianceNote: 'Bottler/producer name and address required (27 CFR 5.54)',
  });

  // 6. Bottler Address — fuzzy
  const bottlerAddrResult = compareTextField(formData.bottler_address, extraction.bottler_address, 'Bottler Address');
  results.push({
    field: 'bottler_address',
    label: COLA_FIELD_LABELS.bottler_address,
    submitted: formData.bottler_address || '',
    extracted: extraction.bottler_address,
    status: bottlerAddrResult.status,
    note: bottlerAddrResult.note,
  });

  // 7. Country of Origin — only required for imports; fuzzy match
  if (formData.is_import) {
    const originResult = compareTextField(
      formData.country_of_origin,
      extraction.country_of_origin,
      'Country of Origin'
    );
    results.push({
      field: 'country_of_origin',
      label: COLA_FIELD_LABELS.country_of_origin,
      submitted: formData.country_of_origin || '',
      extracted: extraction.country_of_origin,
      status: originResult.status,
      note: originResult.note,
      complianceNote: 'Required for imported products (27 CFR 5.56)',
    });
  } else {
    // Domestic — check if country is present; not mandatory but log if found
    results.push({
      field: 'country_of_origin',
      label: COLA_FIELD_LABELS.country_of_origin,
      submitted: formData.country_of_origin || 'USA',
      extracted: extraction.country_of_origin || 'USA',
      status: 'pass',
      note: 'Domestic product — country of origin not required',
    });
  }

  // 8. Government Warning — auto-checked against official TTB text (agent does not submit this)
  const warnResult = compareGovernmentWarning(GOVERNMENT_WARNING_OFFICIAL, extraction.government_warning);
  results.push({
    field: 'government_warning',
    label: COLA_FIELD_LABELS.government_warning,
    submitted: 'Auto-checked against official TTB text',
    extracted: extraction.government_warning,
    status: warnResult.status,
    note: warnResult.note,
    complianceNote:
      '"GOVERNMENT WARNING:" must appear in ALL CAPS; exact official language required (27 CFR 16.20)',
  });

  return results;
}
