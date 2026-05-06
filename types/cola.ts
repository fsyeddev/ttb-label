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
  bottler_name: 'Bottler Name',
  bottler_address: 'Bottler Address',
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
  // Optional: agent-supplied age in years for whisky aging advisory (27 CFR 5.40).
  // Whisky aged < 4 years requires an age statement on the label; this lets the
  // compliance layer fire only when the agent supplies a known-young age.
  aged_years?: number;
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
  // Compliance-advisory fields — extracted from the label, used by lib/validators/compliance.ts.
  // Independent of cross-validation; never affect overallStatus.
  age_statement?: string | null;             // e.g. "Aged 4 Years"
  statement_of_composition?: string | null;  // e.g. "Cinnamon-flavored whisky with natural flavors"
  state_of_distillation?: string | null;     // e.g. "Distilled in Kentucky" or "Product of Scotland"
  production_statement?: string | null;      // e.g. "Distilled and bottled by..."
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

// Compliance advisory — informational TTB-rule check on the label itself.
// Lives alongside FieldResult[] but is independent: advisories never affect
// overallStatus. See docs/specs/compliance-advisories.md for the full design.
export type AdvisoryStatus = 'info' | 'warning' | 'review-required';

export interface ComplianceFlag {
  id: string;                  // stable identifier, e.g. "bottle-size-non-standard"
  severity: AdvisoryStatus;
  title: string;               // short, agent-readable headline
  detail: string;              // 1-2 sentence plain-English explanation
  cfrReference: string;        // e.g. "27 CFR 5.47"
  relatedField?: COLAField;    // optional anchor to a specific field for UI highlighting
}

// Per-phase wall-clock timings, populated by /api/analyze and surfaced to
// the browser console by the client so the slow path is visible without
// having to instrument by hand. All values in milliseconds.
export interface AnalysisTimings {
  formParseMs: number;        // multipart/FormData decode on the server
  imageDecodeMs: number;      // arrayBuffer read (CPU-bound, scales with image size)
  imagePreprocessMs: number;  // sharp resize + JPEG encode before sending to Gemini
  geminiExtractionMs: number; // round-trip to Gemini including any retries
  validationMs: number;       // cross-validation + compliance checks (pure JS)
  totalServerMs: number;      // sum of phases + overhead — equals processingMs
  imageSizeKB: number;        // original uploaded image size
  resizedSizeKB: number;      // size after preprocessing (what Gemini actually receives)
}

// Full analysis response from /api/analyze
export interface AnalysisResponse {
  jobId: string;
  processingMs: number;
  fields: FieldResult[];           // drives overallStatus
  advisories: ComplianceFlag[];    // informational; never affects overallStatus
  overallStatus: OverallStatus;
  extraction: ExtractionResult;
  timings?: AnalysisTimings;
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
