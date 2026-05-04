# Feature Spec — Wine Support (27 CFR Part 4)

**Status:** Draft
**Owner:** Faheem
**Last updated:** 2026-05-04

## Goal
Extend the COLA verifier to validate wine labels under 27 CFR Part 4 — agents upload a wine label image plus application data, and the system runs the Part 4 equivalent of the spirits compliance checks already in place.

## Scope

**In scope:**
- New validator module `lib/validators/wine.ts` mirroring `lib/validators/spirits.ts`
- Beverage-type selector on the form (Spirits / Wine), routing to the correct validator
- Approved wine class/type list covering the 9 Part 4 classes — focused on real-world labels (Table Wine, Sparkling Wine, Dessert Wine, Vermouth, Fruit Wine, etc.)
- Class-aware ABV tolerance: ±1.5% for table wine (7–14% ABV), ±1% for dessert wine (>14% ABV)
- Sulfite declaration auto-check (similar to government warning — agent does not submit it)
- Vintage year format validation (4-digit YYYY when present on label)
- Standard wine container size validation (187mL, 375mL, 500mL, 750mL, 1L, 1.5L, 3L)
- Government warning (reuse spirits regex — same statutory text)
- Wine-specific Gemini extraction prompt fields (vintage, varietal, appellation, sulfite text)
- New end-to-end pipeline fixtures in `evals/fixtures/ground-truth/wine-*.json`

**Out of scope:**
- Varietal/appellation percentage compliance (75% varietal rule, 95%/85% vintage rule) — cannot verify from a label image alone, requires production records
- Champagne geographic protection enforcement (handled at TTB COLA submission level, not on the label)
- Sub-classification of sparkling wines (Crackling, Pétillant, etc.)
- Imported wine certification requirements beyond country of origin
- Beer/malt support — separate spec
- Auto-detection of beverage type from the label (Phase 2 — see open questions)

## Approach

### Module structure
- `lib/validators/wine.ts` — orchestrates Part 4 field checks; exports `validateWineLabel(formData, extraction)` returning `FieldResult[]` (same shape as spirits)
- `APPROVED_WINE_CLASS_TYPES` constant in the same file
- Reuse `lib/validators/regex.ts` for ABV parsing and government warning comparison
- Reuse `lib/validators/semantic.ts` for fuzzy text matching (brand, bottler, appellation)
- New helpers in `wine.ts`: `getABVTolerance(classType)`, `validateVintageFormat(year)`, `checkSulfiteDeclaration(extraction)`, `isStandardWineSize(netContents)`

### Type changes
- Extend `ApplicationData` in `types/cola.ts` with optional wine fields: `beverage_type: 'spirits' | 'wine'`, `vintage?: string`, `varietal?: string`, `appellation?: string`
- Extend `ExtractionResult` with: `vintage`, `varietal`, `appellation`, `sulfite_declaration`
- `beverage_type` defaults to `'spirits'` for backward compatibility

### Routing
- `app/api/analyze/route.ts` reads `beverage_type` from form data and dispatches to the correct validator
- Default to spirits if unset (existing behavior preserved)

### Gemini prompt
- Extend `lib/gemini.ts` extraction prompt with wine fields, conditional guidance: "If label is wine, also extract vintage, varietal, appellation, and any sulfite declaration text"
- Returns `null` for fields not present on the label

### UI
- `components/ApplicationForm.tsx` — add beverage type select at the top; show wine-specific fields (vintage, varietal, appellation) when Wine is selected
- `components/ResultsCard.tsx` — render new wine-specific field results with their compliance notes

### CFR-approved class/type list (initial — real-world focus)
| Class | Designations |
|---|---|
| 1 — Grape Wine | Table Wine, Red Wine, White Wine, Rosé Wine, Sweet Wine, Dry Wine |
| 2 — Sparkling Grape Wine | Sparkling Wine, Champagne (where geographically allowed), Sparkling Red Wine |
| 3 — Carbonated Grape Wine | Carbonated Wine |
| 4 — Citrus Wine | Citrus Wine, Orange Wine |
| 5 — Fruit Wine | Fruit Wine, Apple Wine, Berry Wine |
| 6 — Other Agricultural | Mead, Honey Wine, Rice Wine, Saké |
| 7 — Aperitif Wine | Vermouth, Sweet Vermouth, Dry Vermouth, Aperitif Wine |
| 8 — Imitation/Substandard | (out of scope — flagged as warning) |
| 9 — Retsina | Retsina |

## Acceptance criteria
- [ ] User can select "Wine" as beverage type on the application form
- [ ] Wine-specific fields (vintage, varietal, appellation) appear conditionally
- [ ] Submitting a wine application invokes `validateWineLabel`, not `validateSpiritsLabel`
- [ ] All 8+ Part 4 field checks return PASS / FAIL / REVIEW with plain-English notes
- [ ] ABV tolerance is class-aware: ±1.5% for table wine, ±1% for dessert wine
- [ ] Sulfite declaration auto-checked — agents do not submit it
- [ ] At least 7 wine class/type designations approved at launch
- [ ] Vintage validates as 4-digit YYYY between 1900 and current year + 1
- [ ] Standard wine sizes pass; non-standard sizes fail with reason
- [ ] Government warning check works identically to spirits
- [ ] All evals listed below pass
- [ ] Existing spirits flow continues to work unchanged (no regressions)

## Evals
Each name corresponds to a test case to add in `evals/validators.test.ts` (unit) or `evals/pipeline.test.ts` (end-to-end).

**Class/type approval (`isApprovedWineClassType`):**
- `wine_class_table_wine_approved` — "Table Wine" returns true
- `wine_class_sparkling_approved` — "Sparkling Wine" returns true
- `wine_class_vermouth_approved` — "Sweet Vermouth" returns true
- `wine_class_mead_approved` — "Mead" returns true
- `wine_class_unapproved_returns_false` — "Premium Reserve Selection" returns false

**ABV tolerance (`compareWineABV`):**
- `wine_abv_table_within_1_5_percent_pass` — submitted 12.0%, extracted 13.4% → pass
- `wine_abv_table_outside_1_5_percent_fail` — submitted 12.0%, extracted 13.6% → fail
- `wine_abv_dessert_within_1_percent_pass` — submitted 18.0%, extracted 18.9% → pass
- `wine_abv_dessert_outside_1_percent_fail` — submitted 18.0%, extracted 19.2% → fail
- `wine_abv_class_dispatch` — given class "Table Wine" uses 1.5% tolerance, "Dessert Wine" uses 1.0%

**Sulfite declaration (`checkSulfiteDeclaration`):**
- `wine_sulfite_present_pass` — extraction contains "Contains Sulfites" → pass
- `wine_sulfite_alt_phrasing_pass` — extraction contains "Contains Naturally Occurring Sulfites" → pass
- `wine_sulfite_missing_fail` — no sulfite text on label → fail
- `wine_sulfite_capitalization_tolerated` — "contains sulfites" (lowercase) → pass

**Vintage (`validateVintageFormat`):**
- `wine_vintage_4digit_valid` — "2018" → valid
- `wine_vintage_2digit_invalid` — "18" → invalid
- `wine_vintage_word_invalid` — "Vintage" → invalid
- `wine_vintage_future_year_invalid` — "2099" → invalid

**Net contents (`isStandardWineSize`):**
- `wine_size_750ml_standard` — "750 mL" → valid
- `wine_size_375ml_standard` — "375 mL" → valid
- `wine_size_700ml_nonstandard_fail` — "700 mL" (spirits size, not wine) → fail with reason
- `wine_size_unit_normalization` — "1.5 L" matches "1500 mL"

**Government warning (reuse):**
- `wine_government_warning_pass` — same official text → pass
- `wine_government_warning_missing_fail` — no warning → fail

**End-to-end pipeline (`evals/pipeline.test.ts` + new fixtures):**
- `wine_pipeline_table_wine_all_pass` — full extraction → validation → all green
- `wine_pipeline_dessert_wine_all_pass` — dessert wine fixture passes
- `wine_pipeline_missing_sulfite_fail` — sulfite absent → overall fail
- `wine_pipeline_imported_no_country_fail` — French import without country of origin → fail
- `wine_pipeline_vintage_mismatch_fail` — submitted 2018, extracted 2019 → fail

**Regression:**
- `spirits_pipeline_unchanged` — existing spirits fixtures still pass after wine module ships

## Open questions
- Should beverage type be auto-detected from the label (e.g., Gemini suggests "wine" based on visual cues), or always user-selected? Lean: user-selected for v1, auto-detect later.
- Vermouth is technically Class 7 wine under Part 4 but is often shelved with spirits — keep it under wine validator?
- Varietal and appellation: presence-only checks, or fuzzy compare submitted vs. extracted? Lean: fuzzy compare, with REVIEW status (not FAIL) for mismatches since label percentage rules can't be verified.
- Do we need a separate sulfite-specific official phrase, or just check for "sulfite(s)" substring? Lean: substring + ALL CAPS check on "CONTAINS SULFITES" if present, since TTB requires it to be conspicuous.

## Notes
- 27 CFR Part 4 is being modernized by TTB; spec should track both the legacy section numbers (e.g., 4.21, 4.32) and any new ones once published.
- Sulfite declaration is required when SO₂ ≥ 10 ppm (27 CFR 4.32a); we cannot verify ppm from a label image, so the check is presence-only.
- Real-world example labels for fixtures: Kendall-Jackson Chardonnay (Table), Mondavi Cabernet (Table), Veuve Clicquot Brut (Sparkling), Dolin Vermouth de Chambéry (Aperitif), B Nektar Mead (Other Agricultural).
