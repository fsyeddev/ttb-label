import Papa from 'papaparse';
import type { ApplicationData } from '@/types/cola';
import type { ParseResult } from './json-import';

// Map of accepted CSV column header variants → canonical field names
const HEADER_MAP: Record<string, keyof ApplicationData> = {
  brand_name: 'brand_name',
  brand: 'brand_name',
  'brand name': 'brand_name',
  class_type: 'class_type',
  class: 'class_type',
  type: 'class_type',
  'class/type': 'class_type',
  'class type': 'class_type',
  designation: 'class_type',
  abv: 'abv',
  'alcohol by volume': 'abv',
  'alcohol content': 'abv',
  'alc/vol': 'abv',
  net_contents: 'net_contents',
  'net contents': 'net_contents',
  volume: 'net_contents',
  size: 'net_contents',
  bottler_name: 'bottler_name',
  'bottler name': 'bottler_name',
  'producer name': 'bottler_name',
  bottler: 'bottler_name',
  producer: 'bottler_name',
  bottler_address: 'bottler_address',
  'bottler address': 'bottler_address',
  'producer address': 'bottler_address',
  address: 'bottler_address',
  country_of_origin: 'country_of_origin',
  'country of origin': 'country_of_origin',
  country: 'country_of_origin',
  government_warning: 'government_warning',
  'government warning': 'government_warning',
  warning: 'government_warning',
  is_import: 'is_import',
  import: 'is_import',
  imported: 'is_import',
  aged_years: 'aged_years',
  'aged years': 'aged_years',
  age: 'aged_years',
};

const REQUIRED_FIELDS: (keyof ApplicationData)[] = [
  'brand_name', 'class_type', 'abv', 'net_contents', 'bottler_name', 'bottler_address',
];

export function parseCSVImport(raw: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const result = Papa.parse<Record<string, string>>(raw.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (result.errors.length > 0) {
    return { data: null, errors: result.errors.map((e) => `CSV parse error: ${e.message}`), warnings };
  }

  if (!result.data || result.data.length === 0) {
    return { data: null, errors: ['CSV file is empty or has no data rows.'], warnings };
  }

  // Use first row only (single application per CSV for v1)
  const row = result.data[0];
  const mapped: Partial<Record<keyof ApplicationData, string>> = {};

  for (const [header, value] of Object.entries(row)) {
    const canonicalKey = HEADER_MAP[header.toLowerCase().trim()];
    if (canonicalKey) {
      mapped[canonicalKey] = value?.trim() ?? '';
    } else {
      warnings.push(`Unrecognized CSV column "${header}" will be ignored.`);
    }
  }

  // Parse optional numeric aged_years (used by the whisky aging advisory, 27 CFR 5.40).
  let agedYears: number | undefined;
  const agedRaw = mapped.aged_years;
  if (agedRaw && agedRaw.trim()) {
    const n = Number(agedRaw);
    if (Number.isFinite(n) && n >= 0) {
      agedYears = n;
    } else {
      warnings.push(`"aged_years" must be a non-negative number; got "${agedRaw}".`);
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!mapped[field]?.trim()) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  if (errors.length > 0) {
    return { data: null, errors, warnings };
  }

  const data: ApplicationData = {
    brand_name: mapped.brand_name ?? '',
    class_type: mapped.class_type ?? '',
    abv: mapped.abv ?? '',
    net_contents: mapped.net_contents ?? '',
    bottler_name: mapped.bottler_name ?? '',
    bottler_address: mapped.bottler_address ?? '',
    country_of_origin: mapped.country_of_origin ?? '',
    government_warning: mapped.government_warning ?? '',
    is_import: ['true', '1', 'yes'].includes((mapped.is_import ?? '').toLowerCase()),
    aged_years: agedYears,
  };

  return { data, errors: [], warnings };
}
