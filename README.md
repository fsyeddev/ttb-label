# TTB COLA Label Verifier

AI-powered label verification tool for TTB compliance agents. Upload a label image and application data — the system checks that they match and meet COLA requirements (27 CFR Part 5).

## Live Demo

Deploy URL: _(add after Vercel deploy)_

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd cola-verify
npm install
```

### 2. Set up environment

```bash
cp .env.local.example .env.local
# Edit .env.local and add your Gemini API key
# Get one at: https://aistudio.google.com/app/apikey
```

### 3. Run development server

```bash
npm run dev
# Open http://localhost:3000
```

---

## How to Use

1. **Upload a label image** — JPEG, PNG, or WEBP, max 10 MB
2. **Enter application data** — fill in the form fields, or click "Import from JSON / CSV" to upload a file
3. **Click Analyze Label** — results appear in under 5 seconds
4. **Review per-field results** — each field shows PASS / FAIL / REVIEW with an explanation

---

## Architecture

```
cola-verify/
  app/
    page.tsx              # Main UI (upload + form -> results)
    api/analyze/route.ts  # POST endpoint: image + form -> field results
  lib/
    gemini.ts             # Gemini 2.0 Flash vision extraction
    validators/
      regex.ts            # ABV, net contents, government warning exact checks
      semantic.ts         # Fuzzy/case-insensitive text comparison
      spirits.ts          # 27 CFR Part 5 full COLA compliance engine
    parsers/
      json-import.ts      # JSON application data file parser
      csv-import.ts       # CSV application data file parser
  components/
    UploadZone.tsx        # Drag-and-drop image upload
    ApplicationForm.tsx   # Form fields + file import button
    ResultsCard.tsx       # Per-field results display
    FieldBadge.tsx        # PASS / FAIL / REVIEW pill
  types/cola.ts           # Shared TypeScript types
  evals/
    validators.test.ts    # Unit tests: regex, semantic, CFR approval
    parsers.test.ts       # Unit tests: JSON and CSV parsers
    pipeline.test.ts      # End-to-end pipeline tests using mock extraction
    fixtures/ground-truth/ # 6 labeled test cases (pass, fail, edge cases)
```

### Validation pipeline (per request)

```
Label image + form data
  -> Gemini 2.0 Flash Vision  (extracts structured JSON from label)
  -> Regex layer              (ABV numeric, net contents unit, gov warning exact text)
  -> Semantic layer           (case-insensitive fuzzy match for brand name, address)
  -> COLA compliance engine   (27 CFR Part 5 presence checks, approved class/type list)
  -> FieldResult[] per field  (pass / fail / warning + explanation)
```

---

## Running Tests

```bash
npm test           # run all 64 unit + pipeline tests once
npm run test:watch # watch mode
```

Test coverage:
- **ABV parsing and comparison** — format variants, proof conversion, range validation
- **Net contents** — mL/L unit normalization, format variants
- **Government warning** — exact text, ALL CAPS check, missing warning
- **Fuzzy text matching** — case insensitivity, whitespace, similarity scoring
- **JSON/CSV parsers** — valid, invalid, missing fields, unknown columns
- **Full pipeline** — 6 fixture cases including the all-caps brand name case and title-case warning case

---

## Importing Application Data

### JSON format

```json
{
  "brand_name": "Old Tom Distillery",
  "class_type": "Kentucky Straight Bourbon Whiskey",
  "abv": "45% Alc./Vol.",
  "net_contents": "750 mL",
  "bottler_name": "Old Tom Distillery Co.",
  "bottler_address": "Louisville, KY 40202",
  "country_of_origin": "USA",
  "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General...",
  "is_import": false
}
```

### CSV format

```csv
brand_name,class_type,abv,net_contents,bottler_name,bottler_address,country_of_origin
Old Tom Distillery,Kentucky Straight Bourbon Whiskey,45% Alc./Vol.,750 mL,Old Tom Distillery Co.,"Louisville, KY 40202",USA
```

Flexible column headers accepted (e.g. `brand`, `alcohol by volume`, `bottler`, `address`).

---

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (required) |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| AI Vision | Google Gemini 2.0 Flash (`@google/generative-ai`) |
| Styling | Tailwind CSS v4 |
| CSV parsing | PapaParse |
| Testing | Vitest |
| Deploy | Vercel |

---

## COLA Fields Verified (Distilled Spirits — 27 CFR Part 5)

| Field | Validation Method | CFR Reference |
|---|---|---|
| Brand Name | Case-insensitive fuzzy match | 27 CFR 5.34 |
| Class / Type | Semantic + approved designation list | 27 CFR 5.22 |
| Alcohol by Volume | Numeric comparison (tolerates format variants) | 27 CFR 5.52 |
| Net Contents | Unit-normalized comparison (mL/L) | 27 CFR 5.53 |
| Bottler Name | Fuzzy match | 27 CFR 5.54 |
| Bottler Address | Fuzzy match | 27 CFR 5.54 |
| Country of Origin | Fuzzy match (imports only) | 27 CFR 5.56 |
| Government Warning | Exact text + ALL CAPS check | 27 CFR 16.20 |

---

## Trade-offs and Limitations

- **Gemini extraction accuracy**: Targets >= 90% per-field accuracy. Poorly lit or angled photos will reduce accuracy. Image preprocessing is out of scope for v1.
- **Distilled spirits only**: Wine (27 CFR Part 4) and beer (27 CFR Part 7) are future iterations — the validator architecture is modular and ready to extend.
- **Class/type designation list**: The approved designations in `spirits.ts` are representative. A production deployment should import the complete 27 CFR Part 5 list.
- **Batch upload**: Not in scope for v1. Architecture supports it — add a queue and aggregate results view.
- **No persistent storage**: Results are not saved. Intentional for prototype (no PII concerns, no retention policy).

---

## Deploying to Vercel

```bash
npm install -g vercel
vercel
# Add GEMINI_API_KEY in Vercel project settings -> Environment Variables
```
