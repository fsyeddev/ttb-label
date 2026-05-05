# Technical Reference

## Architecture

### Two independent output streams

The system answers two separate questions about a label, and the two answers are deliberately kept apart:

| | Cross-Validation | Compliance Advisories |
|---|---|---|
| **Question** | Does the label match the application? | Does the label itself comply with TTB regulations? |
| **Module** | `lib/validators/spirits.ts` | `lib/validators/compliance.ts` |
| **Output** | `FieldResult[]` | `ComplianceFlag[]` |
| **Drives `overallStatus`?** | **Yes** — PASS / FAIL / REVIEW | **No** — informational only |
| **Status values** | `pass` / `fail` / `warning` / `missing` | `info` / `warning` / `review-required` |

A green PASS verdict can — and often will — coexist with one or more advisories. That is the desired outcome, not a bug. Advisories never flip a green header to yellow or red. This preserves the "5-second approval" path while still surfacing rule observations a human reviewer would catch by eye. See [docs/specs/compliance-advisories.md](specs/compliance-advisories.md) for the full design.

### Validation Pipeline
```
Image + FormData
  → [1] Gemini Vision extraction       (structured JSON from label)
  → [2] Regex layer                    (ABV, net contents, government warning)
  → [3] Semantic layer                 (fuzzy: brand name, class/type, address)
  → [4] Spirits cross-validation       (27 CFR Part 5 presence + format rules)
  ┊                                    └─→ FieldResult[]    (drives overallStatus)
  → [5] Compliance advisories          (label-only TTB rule checks)
                                       └─→ ComplianceFlag[] (informational)
```

### Key Files
| Path | Purpose |
|------|---------|
| `types/cola.ts` | All shared TypeScript types (incl. `ComplianceFlag`, `AdvisoryStatus`) |
| `lib/gemini.ts` | Gemini Vision client + extraction prompt |
| `lib/validators/regex.ts` | ABV, net contents, government warning comparison |
| `lib/validators/semantic.ts` | Levenshtein fuzzy matching |
| `lib/validators/spirits.ts` | 27 CFR Part 5 cross-validation orchestrator (returns `{ fields, advisories }`) |
| `lib/validators/compliance.ts` | Compliance advisory rules + `runComplianceChecks` orchestrator |
| `lib/parsers/json-import.ts` | JSON form data file parser |
| `lib/parsers/csv-import.ts` | CSV form data file parser |
| `app/api/analyze/route.ts` | POST endpoint |
| `components/LabelVerifier.tsx` | Main UI state machine |
| `components/ResultsCard.tsx` | Per-field results + compliance advisories section |
| `evals/` | All tests and ground-truth fixtures |

---

## Module Details

### Gemini Vision Extraction — `lib/gemini.ts`
- Structured JSON extraction prompt for all 8 COLA fields
- `brand_name` prompt: extracts primary trademark only, NOT fanciful/expression names (e.g., "Tennessee Fire" is excluded; "Jack Daniel's" is returned)
- `class_type` prompt: extracts legal 27 CFR Part 5 designation only (e.g., "Cinnamon Liqueur"), ignores fanciful names
- `government_warning` prompt: joins line-break hyphens before returning (e.g., "CONSUMP- TION" → "CONSUMPTION")
- Strips markdown code fences from Gemini response before JSON parsing
- `callWithRetryOn503` wraps the SDK call: up to 2 retries on `GEMINI_503_RETRY_DELAYS_MS = [5000, 10000]` ms when Gemini returns 503 ("model is currently experiencing high demand"). Each retry logs via `console.warn`; the original 503 is rethrown unchanged after exhaustion. Non-503 errors are not retried. See [`docs/specs/gemini-503-retry.md`](specs/gemini-503-retry.md) (INFRA-04).
- Model: `gemini-2.5-flash-lite`

### Regex Validator — `lib/validators/regex.ts`
- `parseABV` — parses ABV strings; supports `XX% Alc./Vol.` and `XX Proof` (auto-converts proof ÷ 2)
- `compareABV` — numeric comparison within ±0.1% tolerance
- `compareNetContents` — normalizes units before comparing; handles mL ↔ L conversion (1 L = 1000 mL)
- `compareGovernmentWarning` — strict 100% threshold (see BUG-08 / [`docs/specs/govwarn-100pct-threshold.md`](specs/govwarn-100pct-threshold.md)):
  1. Hard fail if extracted text is null/empty, or `GOVERNMENT WARNING` (uppercase substring) not present (CAPS-aware: lower/title-case form returns "must be ALL CAPS"; absent entirely returns "prefix not found")
  2. Strict equality against the official statutory text after normalization (line-break hyphen joining + whitespace collapse only). The CAPS gate intentionally does not require the colon — a missing colon is a wording corruption, not a CAPS violation, and falls into the equality check.
  3. Non-100% match returns `warning` with a Levenshtein edit-distance signal so the agent gets a magnitude hint. Bias intentional: false-positive flags are cheaper than false-negative passes for statutorily exact text.

### Semantic Validator — `lib/validators/semantic.ts`
- `normalize` — lowercase, collapse whitespace, normalize apostrophes/dashes (note: only ASCII apostrophe and backtick currently — curly U+2018/U+2019 are not folded; tracked as a future improvement)
- `fuzzyEqual` — case-insensitive exact match (handles "STONE'S THROW" vs "Stone's Throw")
- `fuzzyContains` — partial match for address fields
- `similarity` — Levenshtein distance ratio (0–1)
- `levenshtein` — raw Levenshtein edit distance (exposed for user-facing magnitude signals like "differs by N characters")
- `compareTextField` — tiered result: pass (≥0.85), warning (0.6–0.85), fail (<0.6). Used for `bottler_address`, `class_type`, `country_of_origin`.
- `compareCompanyName` — binary pass/fail (no warning tier). Equal-after-normalize via `fuzzyEqual` is the only path to pass; anything else fails. Wired only at `brand_name` and `bottler_name`. See BUG-01 / [`docs/specs/company-name-suffix-strip.md`](specs/company-name-suffix-strip.md). The strict-binary stance is deliberate: text comparison can't reliably distinguish OCR error from human typo, so mismatch always fails and the planned visual-verification feature is the catch path for OCR-side discrepancies.

### Spirits Validator — `lib/validators/spirits.ts`
- `APPROVED_CLASS_TYPES` — representative list of approved 27 CFR Part 5 designations
- `isApprovedClassType` — checks extracted class type against approved list
- `validateSpiritsLabel` — top-level orchestrator. Returns `{ fields: FieldResult[], advisories: ComplianceFlag[] }`. The `fields` array drives `overallStatus`; `advisories` are informational and computed by delegating to `runComplianceChecks`. The 8 cross-validation field checks:
  - Brand name: fuzzy match
  - Class/type: fuzzy match + CFR approval check (fail stays fail; pass → warning if unapproved)
  - ABV: numeric regex
  - Net contents: unit-normalized regex
  - Bottler name + address: fuzzy match
  - Country of origin: required only for imports
  - Government warning: auto-checked against official TTB text (agent does not submit this field)

### Compliance Advisories — `lib/validators/compliance.ts`
Rule-based label-only checks. Each rule is a pure function returning `ComplianceFlag | null`; `runComplianceChecks` calls all of them and filters out the nulls. Rules:
- `checkBottleSize` — flags net contents outside the 27 CFR 5.47 approved fill list (±2 mL OCR tolerance). Approved sizes (mL): 50, 100, 200, 355, 375, 500, 700, 750, 1000, 1750.
- `checkAgeStatement` — for whisky: flags missing on-label age statement when the agent supplies `aged_years < 4` via `ApplicationData.aged_years`. Severity `review-required`. (27 CFR 5.40)
- `checkStatementOfComposition` — for liqueur, cordial, distilled spirits specialty, and flavored variants: flags absent composition text. (27 CFR 5.39)
- `checkStateOfDistillation` — flags missing state of distillation on "straight" whisky labels, and missing country on imported labels. (27 CFR 5.36)
- `checkProductionStatement` — flags non-standard production phrasings (e.g., "Made by..." vs. "Distilled by..."). Also flags missing production statement when a producer is named. (27 CFR 5.36)
- `checkFancifulName` — when the extracted brand text contains the submitted brand plus extra trailing words, surfaces those words as a potential fanciful-name candidate. Info severity. Acts as a safety net for extraction misbehavior — Gemini's prompt strips fanciful names, so this rule fires rarely in normal operation.

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
- Hard requirement: `GOVERNMENT WARNING` prefix must be in ALL CAPS
- Comparison is strict equality after normalization (line-break hyphen joining + whitespace collapse). Any non-100% match routes to `warning` for human review (BUG-08 / [`docs/specs/govwarn-100pct-threshold.md`](specs/govwarn-100pct-threshold.md))

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
- **146 tests passing** across 5 test files
- `evals/validators.test.ts` — unit tests for regex + semantic + spirits class/type validators (incl. `compareCompanyName` BUG-01 strict-match block)
- `evals/compliance.test.ts` — per-rule advisory tests + orchestrator tests
- `evals/parsers.test.ts` — JSON/CSV parser tests (incl. optional `aged_years`)
- `evals/pipeline.test.ts` — fixture-based end-to-end tests + edge cases + advisory/headline-independence tests
- `evals/gemini-retry.test.ts` — Gemini 503 retry path (1×, 2×, exhaustion, no-retry-on-non-503, message-text fallback detection)
- `evals/fixtures/ground-truth/` — 7 JSON fixtures: all-pass, ABV mismatch, wrong gov warning capitalization, brand name case mismatch, missing gov warning, import missing country of origin, BUG-01 bottler suffix mismatch
