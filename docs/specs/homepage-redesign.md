# Feature Spec — Homepage redesign (w01)

**Status:** Approved
**Owner:** Faheem
**Last updated:** 2026-05-05

## Goal
Replace the current vertical-stack home form with the two-column wireframe in `wireframes/w01.png`: image upload on the left, application form on the right, single-row Single label / Batch upload toggle in the header, and a clean field set with no inline hints.

## Scope

**In scope:**
- New page chrome: simple top bar with a small mark + "COLA Label Verification" wordmark on the left, and a `Single label` / `Batch upload` segmented control on the right.
- Two-column body inside a single subtly-bordered card on a light slate background:
  - Left column: dashed drop zone — `Drop label image here / or click to browse / PNG · JPG · PDF · up to 20 MB`. (PDF acceptance and 20 MB cap are display-only for now; the underlying validator stays at JPEG/PNG/WEBP, 10 MB — the gap is logged as an open question, not silently changed.)
  - Right column: form labeled `APPLICATION DATA` with `Import JSON / CSV` action top-right.
- Field set on right column (in this order):
  - `BRAND NAME` — text input.
  - `CLASS / TYPE` — text input.
  - `ABV` and `NET CONTENTS` — side-by-side on one row.
  - `BOTTLER NAME` — text input.
  - `BOTTLER ADDRESS` — text input.
  - `Imported product` — checkbox below the address. When checked, a `COUNTRY OF ORIGIN` field appears immediately below it. When unchecked, no country field is shown and any value is cleared.
- ABV input behaves as a percent field:
  - Numbers and a single decimal point only.
  - Permanent suffix label `% Alc./Vol.` rendered inside the input on the right edge, separated from the typed value.
  - Number is right-aligned so it visually butts up against the suffix.
  - Clicking the suffix toggles the unit between `% Alc./Vol.` and `Proof`. The toggle only changes the rendered suffix and the value sent to the backend (we send the chosen unit string in the existing free-text `abv` payload, e.g., `45 % Alc./Vol.` or `90 Proof` — server-side parsing already accepts both).
- Net Contents input:
  - Numbers and a single decimal point only.
  - Permanent suffix label `mL` on the right edge, value right-aligned.
- All inline hint text is removed from inputs. Labels are caps small, no helper paragraph.
- Buttons in card footer (right side): `Clear` (ghost) and `Verify label →` (primary). Disabled state when image or any required field is missing.
- The `Single label` / `Batch upload` toggle: `Batch upload` is visually present but disabled (greyed, `aria-disabled`, not focusable, not clickable). A `title` tooltip says `Batch upload — coming soon`.

**Out of scope:**
- Implementing batch upload (button is a placeholder only).
- Actually accepting PDFs (display copy says PDF; underlying file validation unchanged this iteration — reconciled in a later spec).
- Changing the backend `/api/analyze` contract.
- The big TTB project header / subtitle / footer band — replaced with a slim header.

## Approach

**Files touched:**
- `app/page.tsx` — strip the bulky header + footer, render new slim header with toggle, remove subtitle and footer copy.
- `components/LabelVerifier.tsx` — replace the vertical "step 1 / step 2" layout with the two-column card. Remove `Aged Years` from form state. Keep `appState` machine; the `loading` state will be replaced wholesale by the new verifying screen (separate spec).
- `components/ApplicationForm.tsx` — drop hints, drop government-warning info box, drop `aged_years` input, drop the bottom `is_import` checkbox (moved into the field flow under Bottler Address). Add the conditional `Country of Origin` field. Update ABV + Net Contents to suffixed numeric inputs.
- `components/UploadZone.tsx` — restyle to match wireframe (dashed border, large up-arrow glyph, supported-types and size copy). Keep underlying file validation logic.
- `types/cola.ts` — no change required: `ApplicationData.aged_years` stays in the type for JSON/CSV import compatibility, just no longer surfaced in the UI.

**Removing `aged_years` from the UI without breaking anything:**
- The whisky aging compliance advisory (`lib/validators/compliance.ts:88`) only fires when `aged_years` is supplied. If the form no longer collects it, the advisory simply never fires from form-driven flows — it remains live for JSON/CSV imports that include the field. That's acceptable for v1 (per user direction) and avoids deleting working compliance code.

**ABV / proof state model (kept simple):**
- `LabelVerifier` owns a new piece of UI state `abvUnit: 'percent' | 'proof'` defaulting to `'percent'`.
- When the user types `45` with unit `percent`, the form serializes `formData.abv = '45 % Alc./Vol.'` for the API payload at submit time. With unit `proof`, it becomes `90 Proof`. This keeps `ApplicationData.abv` as the existing free-text string the backend already understands, with no validator changes.

**Country of Origin conditional behavior:**
- When the import checkbox flips off, `country_of_origin` is reset to `''`. This avoids stale values being submitted invisibly.

## Acceptance criteria

- [ ] Page renders the two-column layout matching `wireframes/w01.png` at ≥768px viewport widths.
- [ ] No hint text appears under any input.
- [ ] Aged Years input is gone from the DOM.
- [ ] Country of Origin only renders when `Imported product` is checked, and the value is cleared when un-checked.
- [ ] ABV input only accepts digits and at most one `.`; suffix `% Alc./Vol.` is visible; clicking suffix toggles to `Proof` and back; typed value is right-aligned.
- [ ] Net Contents input only accepts digits and at most one `.`; suffix `mL` is visible; value right-aligned.
- [ ] `Batch upload` segment is greyed out, not clickable, not keyboard-focusable; `Single label` is the active segment.
- [ ] `Verify label →` is disabled until a file is selected and all required fields (brand, class, ABV, net contents, bottler name, bottler address; plus country of origin when imported) are filled.
- [ ] `Clear` resets the form and removes the uploaded image.
- [ ] Submit still posts to `/api/analyze` with the same multipart/JSON payload as before. ABV serializes with the chosen unit suffix (`%` or `Proof`).
- [ ] All existing parser + validator tests still pass — no behavior change to validation.

## Evals

Land alongside the implementation in the same change.

- `homepage_aged_years_input_absent` — render `LabelVerifier` and assert no element with id/name `aged-years` exists.
- `homepage_country_of_origin_conditional` — render with `is_import = false`, assert country input absent; toggle import on, assert it appears; toggle off, assert value is cleared from state and from the rendered DOM.
- `homepage_abv_numeric_only` — fire input events with `4`, `4.5`, `4.5x`, `abc`; only digits and single `.` survive in component state.
- `homepage_abv_unit_toggle` — click the suffix; assert the suffix text changes from `% Alc./Vol.` → `Proof` → `% Alc./Vol.` on successive clicks; assert the serialized payload reflects the chosen unit at submit time.
- `homepage_net_contents_numeric_only` — same assertion as ABV but for Net Contents and `mL` suffix.
- `homepage_batch_upload_disabled` — assert the Batch upload control has `aria-disabled="true"` and does not change the active segment when clicked.
- `homepage_no_inline_hints` — assert no `<p>` elements with the existing hint copy strings (`The product name as it appears on the label`, etc.) are rendered.
- `homepage_submit_disabled_until_complete` — incrementally fill fields and assert the submit button is enabled only when image + required fields are populated.

## Open questions
- The wireframe says PDF accepted up to 20 MB; current backend validates JPEG/PNG/WEBP up to 10 MB. The display copy is updated to match the wireframe, but the validation gap is intentionally deferred to a follow-up spec rather than silently expanded here. Need to decide whether v1 actually accepts PDF (would require a different upload + render path).

## Notes
- The current `LabelVerifierLoader` dynamic-import wrapper stays — its rationale (Next 16 + ssr:false from a client component) is unchanged.
- Government Warning is intentionally still not a form field; the auto-check info banner is removed from the homepage but the auto-check itself continues server-side.

---

**Status legend:** Draft → Approved → In progress → Done
