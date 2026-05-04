import type { ApplicationData } from '@/types/cola';

const REQUIRED_FIELDS: (keyof ApplicationData)[] = [
  'brand_name',
  'class_type',
  'abv',
  'net_contents',
  'bottler_name',
  'bottler_address',
];

export interface ParseResult {
  data: ApplicationData | null;
  errors: string[];
  warnings: string[];
}

export function parseJSONImport(raw: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { data: null, errors: ['Invalid JSON — could not parse file.'], warnings };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { data: null, errors: ['JSON must be an object with application fields.'], warnings };
  }

  const obj = parsed as Record<string, unknown>;

  // Check for required fields
  for (const field of REQUIRED_FIELDS) {
    if (!obj[field] || typeof obj[field] !== 'string' || !(obj[field] as string).trim()) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  if (errors.length > 0) {
    return { data: null, errors, warnings };
  }

  // Warn on unknown extra keys
  const knownKeys = new Set([
    'brand_name', 'class_type', 'abv', 'net_contents',
    'bottler_name', 'bottler_address', 'country_of_origin',
    'government_warning', 'is_import', 'applicant_name', 'permit_number',
  ]);
  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      warnings.push(`Unknown field "${key}" will be ignored.`);
    }
  }

  const data: ApplicationData = {
    brand_name: String(obj.brand_name ?? '').trim(),
    class_type: String(obj.class_type ?? '').trim(),
    abv: String(obj.abv ?? '').trim(),
    net_contents: String(obj.net_contents ?? '').trim(),
    bottler_name: String(obj.bottler_name ?? '').trim(),
    bottler_address: String(obj.bottler_address ?? '').trim(),
    country_of_origin: String(obj.country_of_origin ?? '').trim(),
    government_warning: String(obj.government_warning ?? '').trim(),
    is_import: Boolean(obj.is_import),
    applicant_name: obj.applicant_name ? String(obj.applicant_name).trim() : undefined,
    permit_number: obj.permit_number ? String(obj.permit_number).trim() : undefined,
  };

  return { data, errors: [], warnings };
}
