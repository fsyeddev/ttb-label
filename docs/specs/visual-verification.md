# Feature Spec — Visual Verification

**Status:** Draft
**Owner:** Faheem
**Last updated:** 2026-05-04

## Goal
Give agents direct visual evidence alongside per-field results so they can confirm extraction correctness in seconds — without having to reopen the original label image, mentally re-read it, or trust the OCR layer blindly. Closes the trust gap that BUG-01 surfaced and that BUG-02 (extraction truncation) keeps re-creating: instead of trying to be clever about OCR vs human errors at the text-comparison layer, surface the label region itself and let the human decide.

## Background — why this is the right architectural answer
The text-comparison layer can't reliably distinguish OCR error from human typo (see BUG-01 closure in `docs/bugs.md`). Every attempt to be tolerant of OCR drift (suffix stripping, similarity tiers, typo tolerance) opens a hole for real form errors to slip through. The chosen alternative: keep text comparison strict (fail on any mismatch) and pair it with visual evidence so the human can adjudicate quickly. Pairs naturally with the existing "5-second approval" path — for clean labels nothing changes; for mismatches, the agent sees the label region in-context instead of having to dig.

## Scope

**In scope:**

1. **Always-on label thumbnail on the results screen.** Currently the uploaded image disappears after upload. The results page should show a persistent thumbnail (with click-to-zoom modal) of the original image alongside the per-field results. Single-image cost — trivial to implement, immediately removes the largest UX friction agents have raised.

2. **Per-field cropped region overlay.** Each `ResultsCard` shows three things side-by-side for fields that have a corresponding region on the label (brand_name, class_type, abv, net_contents, bottler_name, bottler_address, government_warning):
   - Submitted value (from form)
   - Extracted value (from Gemini)
   - Cropped image strip showing exactly where on the label the value was read
   The agent visually confirms in 1–2 seconds that submitted value, extracted value, and the label region all agree (or identifies which one disagrees).

3. **Bounding-box data from Gemini.** Extend the Gemini extraction prompt or run a second targeted call to return per-field bounding boxes (`{x, y, width, height}` in pixel coords against the original image). When a box is unavailable for a field, the card falls back to the full thumbnail with no crop.

**Out of scope (v1):**
- Heatmap or saliency-map overlays.
- Side-by-side multi-image comparison view.
- Manual region correction by the agent (drag-to-reselect).
- OCR confidence scores per field.
- Crop annotations / redactions.
- Persistent storage of cropped regions (compute on the fly from bounding boxes + original image).

## Approach

**Data model.** Extend `ExtractionResult` with an optional `regions: Partial<Record<COLAField, BoundingBox>>` field. Bounding boxes are absolute pixel coords against the original image. Optionality matters — older Gemini responses, low-confidence extractions, or fields like `government_warning` that span large regions may not have a usable single box.

**Extraction prompt.** Two options worth evaluating:
- **(A) Single-pass:** Extend the existing `EXTRACTION_PROMPT` in `lib/gemini.ts` to also return bounding boxes for each non-null field. Risk: longer prompt, more JSON to parse, possibly degraded extraction quality. Cheap to test by adding the fields and running the existing 30-fixture eval.
- **(B) Two-pass:** Keep extraction prompt as-is; add a second targeted call that takes the extracted text values and asks the model to locate each on the image. Cleaner separation of concerns; doubles cost.
Pick (A) first and benchmark. Fall back to (B) if extraction quality regresses.

**UI.** New `LabelThumbnail` component anchored top of the results screen. Extend `ResultsCard` with an optional `cropRegion` prop; when present, render a small image element clipped via CSS `object-position`/`object-fit` on the original image (no separate cropped images stored — just CSS positioning over the same source). Click any crop or thumbnail to open a `LabelImageModal` showing the full image with the active region highlighted.

**Storage / persistence.** Original image is already in client memory after upload; pass it through to the results component instead of dropping the reference. No server-side storage changes for v1.

**Performance budget.** Adding bounding-box extraction must not push the < 5s end-to-end target. Measured against current ~2s extraction baseline; budget for v1 is +500ms per extraction.

## Acceptance criteria
- [ ] Original label thumbnail is always shown on the results screen with click-to-zoom modal.
- [ ] Bounding boxes returned by Gemini for at least 6 of 8 fields on standard fixtures (`01-pass-01`, `01-pass-02`, `01-pass-03`).
- [ ] `ResultsCard` renders the cropped region for fields where a box exists; falls back to no crop (text-only) when absent.
- [ ] Agent flow: clean label PASS path remains 5-second; mismatch path shows visible disagreement between submitted/extracted/region within the same screen with no modal trips required for the at-a-glance decision.
- [ ] No regression in extraction quality on the 30-fixture eval (overall PASS-rate within ±1 case of pre-change).
- [ ] End-to-end latency stays below 5s on the standard fixtures.

## Evals
- `boundingBox extraction returns coords for primary fields` — assert ≥6 fields have boxes on a clean fixture.
- `boundingBox extraction is robust to truncation` — for BUG-02 case (`Old Cypress Distillery` truncated to `Old Cypress`), the box should cover the full visible brand region OR be missing (we accept either, but never a tight box around just `Old Cypress` that hides the truncation).
- `ResultsCard renders crop when region is present` — component snapshot test.
- `ResultsCard falls back gracefully when region is absent` — component snapshot test.
- Live eval: re-run the 30-fixture suite post-change; PASS rate must be within ±1 case of the pre-change baseline.

## Open questions
- **(A) vs (B) extraction strategy** — single-pass vs two-pass; benchmark before deciding.
- **Bounding-box format from Gemini** — does the current SDK / model return them natively, or do we need to prompt-engineer the JSON shape? Quick spike before locking the data model.
- **Government warning field** — does a bounding box even make sense? It's often a large multi-line region. Likely show full thumbnail with a highlighted region rather than a tight crop.
- **Class/type vs fanciful name** — when the model truncates, the box may cover only part of the actual on-label text. Worth surfacing a "may be incomplete" flag when the cropped region's aspect ratio looks suspicious.

## Notes
- BUG-01 closure (binary strict-equality on company-name fields) deliberately defers the OCR-side disambiguation problem to this feature. If this feature ships and proves out, several bugs in `docs/bugs.md` (BUG-02 truncation, BUG-03 state-of-distillation false-positive) become "human-resolved on the results screen" rather than "tweak the prompt and hope."
- Consideration explicitly rejected during BUG-01 design: feeding the form data back to Gemini as context. Models tend to confirm what they're shown, which would defeat the purpose of an independent extraction step. Visual verification keeps extraction and verification cleanly separated — the model does extraction, the human does verification, the system does cross-validation.

---

**Status legend:** Draft → Approved → In progress → Done
**Approval rule:** A spec must be Approved before code is written.
