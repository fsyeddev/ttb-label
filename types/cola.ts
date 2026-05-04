// Core shared types for the TTB COLA verification system

export type FieldStatus = 'pass' | 'fail' | 'warning' | 'missing';
export type OverallStatus = 'PASS' | 'FAIL' | 'REVIEW';

// The 8 required fields for distilled spirits under 27 CFR Part 5
export type COLAField =
  | 'brand_name'
  | 'class_type'
  | 'abv'
  | 'net_contents'
  | 'bottler_name'
  | 'bottler_address'
  | 'country_of_origin'
  | 'government_warning';

export const COLA_FIELD_LABELS: Record<COLAField, string> = {
  brand_name: 'Brand Name',
  class_type: 'Class / Type Designation',
  abv: 'Alcohol by Volume (ABV)',
  net_contents: 'Net Contents',
  bottler_name: 'Bottler / Producer Name',
  bottler_address: 'Bottler / Producer Address',
  country_of_origin: 'Country of Origin',
  government_warning: 'Government Warning Statement',
};

// Data submitted by the agent via form or file upload
export interface ApplicationData {
  brand_name: string;
  class_type: string;
  abv: string;
  net_contents: string;
  bottler_name: string;
  bottler_address: string;
  country_of_origin: string;
  government_warning?: string; // not entered by agent — auto-checked against official TTB text
  // optional metadata
  is_import?: boolean;
  applicant_name?: string;
  permit_number?: string;
}

// Raw extraction output from Gemini Vision
export interface ExtractionResult {
  brand_name: string | null;
  class_type: string | null;
  abv: string | null;
  net_contents: string | null;
  bottler_name: string | null;
  bottler_address: string | null;
  country_of_origin: string | null;
  government_warning: string | null;
  raw_text?: string;
  confidence?: 'high' | 'medium' | 'low';
}

// Per-field comparison result
export interface FieldResult {
  field: COLAField;
  label: string;
  submitted: string;
  extracted: string | null;
  status: FieldStatus;
  note?: string;
  complianceNote?: string;
}

// Full analysis response from /api/analyze
export interface AnalysisResponse {
  jobId: string;
  processingMs: number;
  fields: FieldResult[];
  overallStatus: OverallStatus;
  extraction: ExtractionResult;
  error?: string;
}

// Eval-specific types
export interface EvalCase {
  id: string;
  description: string;
  labelFile: string;
  formData: ApplicationData;
  expected: Record<COLAField, FieldStatus>;
  tags: string[];
}

export interface EvalResult {
  caseId: string;
  description: string;
  passed: boolean;
  fieldResults: FieldResult[];
  expected: Record<COLAField, FieldStatus>;
  processingMs: number;
}
