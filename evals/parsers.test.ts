import { describe, it, expect } from 'vitest';
import { parseJSONImport } from '@/lib/parsers/json-import';
import { parseCSVImport } from '@/lib/parsers/csv-import';

const VALID_JSON_DATA = {
  brand_name: 'Old Tom Distillery',
  class_type: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol.',
  net_contents: '750 mL',
  bottler_name: 'Old Tom Distillery Co.',
  bottler_address: 'Louisville, KY 40202',
  country_of_origin: 'USA',
  government_warning:
    'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.',
};

// ─── JSON Parser ─────────────────────────────────────────────────────────────

describe('parseJSONImport', () => {
  it('parses valid JSON successfully', () => {
    const r = parseJSONImport(JSON.stringify(VALID_JSON_DATA));
    expect(r.errors).toHaveLength(0);
    expect(r.data?.brand_name).toBe('Old Tom Distillery');
  });

  it('returns error on invalid JSON', () => {
    const r = parseJSONImport('{invalid json');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.data).toBeNull();
  });

  it('returns error on missing required field', () => {
    const { brand_name, ...rest } = VALID_JSON_DATA;
    const r = parseJSONImport(JSON.stringify(rest));
    expect(r.errors.some((e) => e.includes('brand_name'))).toBe(true);
    expect(r.data).toBeNull();
  });

  it('returns error on multiple missing fields', () => {
    const { brand_name, abv, ...rest } = VALID_JSON_DATA;
    const r = parseJSONImport(JSON.stringify(rest));
    expect(r.errors.length).toBe(2);
  });

  it('returns error on empty brand_name', () => {
    const r = parseJSONImport(JSON.stringify({ ...VALID_JSON_DATA, brand_name: '  ' }));
    expect(r.errors.some((e) => e.includes('brand_name'))).toBe(true);
  });

  it('warns on unknown extra fields', () => {
    const r = parseJSONImport(JSON.stringify({ ...VALID_JSON_DATA, unknown_field: 'foo' }));
    expect(r.warnings.some((w) => w.includes('unknown_field'))).toBe(true);
    expect(r.data).not.toBeNull();
  });

  it('returns error on JSON array (not object)', () => {
    const r = parseJSONImport(JSON.stringify([VALID_JSON_DATA]));
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('trims whitespace from field values', () => {
    const r = parseJSONImport(JSON.stringify({ ...VALID_JSON_DATA, brand_name: '  Old Tom Distillery  ' }));
    expect(r.data?.brand_name).toBe('Old Tom Distillery');
  });

  // aged_years — used by the whisky aging advisory (27 CFR 5.40)
  it('parses optional aged_years as a number', () => {
    const r = parseJSONImport(JSON.stringify({ ...VALID_JSON_DATA, aged_years: 2 }));
    expect(r.errors).toHaveLength(0);
    expect(r.data?.aged_years).toBe(2);
  });

  it('coerces aged_years from string number', () => {
    const r = parseJSONImport(JSON.stringify({ ...VALID_JSON_DATA, aged_years: '8' }));
    expect(r.data?.aged_years).toBe(8);
  });

  it('warns and drops aged_years when not numeric', () => {
    const r = parseJSONImport(JSON.stringify({ ...VALID_JSON_DATA, aged_years: 'old' }));
    expect(r.warnings.some((w) => w.includes('aged_years'))).toBe(true);
    expect(r.data?.aged_years).toBeUndefined();
  });

  it('omits aged_years when not provided', () => {
    const r = parseJSONImport(JSON.stringify(VALID_JSON_DATA));
    expect(r.data?.aged_years).toBeUndefined();
  });
});

// ─── CSV Parser ──────────────────────────────────────────────────────────────

const VALID_CSV = `brand_name,class_type,abv,net_contents,bottler_name,bottler_address,country_of_origin,government_warning
Old Tom Distillery,Kentucky Straight Bourbon Whiskey,45% Alc./Vol.,750 mL,Old Tom Distillery Co.,"Louisville, KY 40202",USA,GOVERNMENT WARNING: short`;

describe('parseCSVImport', () => {
  it('parses valid CSV successfully', () => {
    const r = parseCSVImport(VALID_CSV);
    expect(r.errors).toHaveLength(0);
    expect(r.data?.brand_name).toBe('Old Tom Distillery');
    expect(r.data?.abv).toBe('45% Alc./Vol.');
  });

  it('accepts alternative header "brand" for brand_name', () => {
    const csv = `brand,class_type,abv,net_contents,bottler_name,bottler_address
Eagle Rare,Bourbon Whiskey,45% Alc./Vol.,750 mL,Buffalo Trace,"Frankfort, KY"`;
    const r = parseCSVImport(csv);
    expect(r.data?.brand_name).toBe('Eagle Rare');
  });

  it('accepts "alcohol by volume" header for abv', () => {
    const csv = `brand_name,class_type,alcohol by volume,net_contents,bottler_name,bottler_address
Old Tom,Bourbon,45% Alc./Vol.,750 mL,Old Tom Co.,"Louisville, KY"`;
    const r = parseCSVImport(csv);
    expect(r.data?.abv).toBe('45% Alc./Vol.');
  });

  it('returns error on empty CSV', () => {
    const r = parseCSVImport('');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('returns error when required column is missing', () => {
    const csv = `brand_name,class_type,abv
Old Tom,Bourbon,45%`;
    const r = parseCSVImport(csv);
    expect(r.errors.some((e) => e.includes('net_contents'))).toBe(true);
  });

  it('warns on unknown column', () => {
    const csv = `brand_name,class_type,abv,net_contents,bottler_name,bottler_address,unknown_col
Old Tom,Bourbon,45%,750 mL,Old Tom Co.,"Louisville, KY",extra`;
    const r = parseCSVImport(csv);
    expect(r.warnings.some((w) => w.includes('unknown_col'))).toBe(true);
  });

  it('handles quoted fields with commas', () => {
    const csv = `brand_name,class_type,abv,net_contents,bottler_name,bottler_address
"Old Tom, Jr.",Bourbon,45%,750 mL,Old Tom Co.,"Louisville, KY 40202"`;
    const r = parseCSVImport(csv);
    expect(r.data?.brand_name).toBe('Old Tom, Jr.');
    expect(r.data?.bottler_address).toBe('Louisville, KY 40202');
  });

  it('parses optional aged_years column', () => {
    const csv = `brand_name,class_type,abv,net_contents,bottler_name,bottler_address,aged_years
Old Tom,Bourbon Whiskey,45%,750 mL,Old Tom Co.,"Louisville, KY",2`;
    const r = parseCSVImport(csv);
    expect(r.data?.aged_years).toBe(2);
  });

  it('accepts "age" header as aged_years alias', () => {
    const csv = `brand_name,class_type,abv,net_contents,bottler_name,bottler_address,age
Old Tom,Bourbon Whiskey,45%,750 mL,Old Tom Co.,"Louisville, KY",10`;
    const r = parseCSVImport(csv);
    expect(r.data?.aged_years).toBe(10);
  });
});
