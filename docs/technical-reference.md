# Technical Reference

## Architecture

### Validation Pipeline
```
Image + FormData
  → [1] Gemini Vision extraction  (structured JSON from label)
  → [2] Regex layer               (ABV, net contents, government warning)
  → [3] Semantic layer            (fuzzy: brand name, class/type, address)
  → [4] Spirits compliance engine (27 CFR Part 5 presence + format rules)
  → FieldResult[] with per-field status
```

### Key Files
| Path | Purpose |
|------|---------|
| `types/cola.ts` | All shared TypeScript types |
| `lib/gemini.ts` | Gemini Vision client + extraction prompt |
| `lib/validators/regex.ts` | ABV, net contents, government warning comparison |
| `lib/validators/semantic.ts` | Levenshtein fuzzy matching |
| `lib/validators/spirits.ts` | 27 CFR Part 5 orchestration |
| `lib/parsers/json-import.ts` | JSON form data file parser |
| `lib/parsers/csv-import.ts` | CSV form data file parser |
| `app/api/analyze/route.ts` | POST endpoint |
| `components/LabelVerifier.tsx` | Main UI state machine |
| `evals/` | All tests and ground-truth fixtures |

---

## Module Details

### Gemini Vision Extraction — `lib/gemini.ts`
- Structured JSON extraction prompt for all 8 COLA fields
- `brand_name` prompt: extracts primary trademark only, NOT fanciful/expression names (e.g., "Tennessee Fire" is excluded; "Jack Daniel's" is returned)
- `class_type` prompt: extracts legal 27 CFR Part 5 designation only (e.g., "Cinnamon Liqueur"), ignores fanciful names
- `government_warning` prompt: joins line-break hyphens before returning (e.g., "CONSUMP- TION" → "CONSUMPTION")
- Strips markdown code fences from Gemini response before JSON parsing
- Model: `gemini-2.5-flash-lite`

### Regex Validator — `lib/validators/regex.ts`
- `parseABV` — parses ABV strings; supports `XX% Alc./Vol.` and `XX Proof` (auto-converts proof ÷ 2)
- `compareABV` — numeric comparison within ±0.1% tolerance
- `compareNetContents` — normalizes units before comparing; handles mL ↔ L conversion (1 L = 1000 mL)
- `compareGovernmentWarning` — two-stage check:
  1. Hard fail if `GOVERNMENT WARNING:` prefix not present or not in ALL CAPS
  2. Fuzzy similarity (Levenshtein, ≥92% = pass) after stripping line-break hyphens (`([A-Za-z])\s*-\s*([A-Za-z])` pattern handles all hyphen formats)

### Semantic Validator — `lib/validators/semantic.ts`
- `normalize` — lowercase, collapse whitespace, normalize apostrophes/dashes
- `fuzzyEqual` — case-insensitive exact match (handles "STONE'S THROW" vs "Stone's Throw")
- `fuzzyContains` — partial match for address fields
- `similarity` — Levenshtein distance ratio (0–1)
- `compareTextField` — tiered result: pass (≥0.85), warning (0.6–0.85), fail (<0.6)

### Spirits Validator — `lib/validators/spirits.ts`
- `APPROVED_CLASS_TYPES` — representative list of approved 27 CFR Part 5 designations
- `isApprovedClassType` — checks extracted class type against approved list
- `validateSpiritsLabel` — orchestrates all 8 field checks:
  - Brand name: fuzzy match
  - Class/type: fuzzy match + CFR approval check (fail stays fail; pass → warning if unapproved)
  - ABV: numeric regex
  - Net contents: unit-normalized regex
  - Bottler name + address: fuzzy match
  - Country of origin: required only for imports
  - Government warning: auto-checked against official TTB text (agent does not submit this field)

### Form Data Parsers
- `lib/parsers/json-import.ts` — parses uploaded `.json` file into `ApplicationData`; validates required fields; warns on unknown keys
- `lib/parsers/csv-import.ts` — parses uploaded `.csv` with flexible header mapping (e.g., "brand" → `brand_name`, "alcohol by volume" → `abv`)

### API Endpoint — `app/api/analyze/route.ts`
- `POST /api/analyze` — accepts `multipart/form-data` with `labelImage` (file) + `applicationData` (JSON string)
- Converts image to base64, calls Gemini Vision, runs validation engine
- Returns `AnalysisResponse` with `fields`, `overallStatus`, `processingMs`, `jobId`

### UI Components
- `UploadZone` — drag-and-drop + click-to-browse; JPEG/PNG/WEBP; max 10 MB; thumbnail preview
- `ApplicationForm` — 6 manual input fields + JSON/CSV file import; government warning removed (auto-checked)
- `ResultsCard` — per-field result cards showing submitted vs extracted values + status badge
- `FieldBadge` — PASS (green) / FAIL (red) / REVIEW (yellow) pill badges
- `LabelVerifier` — main interactive Client Component; manages all state
- `LabelVerifierLoader` — thin wrapper using `next/dynamic({ ssr: false })` to eliminate React hydration mismatches

---

## Compliance Notes

### Government Warning
- Agents do NOT enter the government warning — it is auto-checked by the system
- Official text is the statutory language from the Alcoholic Beverage Labeling Act of 1988 (27 CFR Part 16)
- Hard requirement: `GOVERNMENT WARNING:` prefix must be in ALL CAPS
- Comparison uses Levenshtein similarity ≥92% after stripping line-break hyphens

### Brand Name vs Fanciful Name
- TTB COLA applications have separate fields for Brand Name and Fanciful Name
- This system captures Brand Name only (v1)
- Example: Brand = "Jack Daniel's", Fanciful = "Tennessee Fire"

---

## JSON Import Format
```json
{
  "brand_name": "Jack Daniel's",
  "class_type": "Cinnamon Liqueur",
  "abv": "70 Proof",
  "net_contents": "750 mL",
  "bottler_name": "Jack Daniel Distillery",
  "bottler_address": "Lynchburg, Tennessee",
  "country_of_origin": "USA",
  "is_import": false
}
```

---

## Eval Suite
- **65 tests passing** across 3 test files
- `evals/validators.test.ts` — 37 unit tests for regex + semantic + spirits validators
- `evals/parsers.test.ts` — 28 tests for JSON/CSV parsers
- `evals/pipeline.test.ts` — 6 fixture-based end-to-end pipeline tests + 8 edge case tests
- `evals/fixtures/ground-truth/` — 6 JSON fixtures: all-pass, ABV mismatch, wrong gov warning capitalization, brand name case mismatch, missing gov warning, import missing country of origin
