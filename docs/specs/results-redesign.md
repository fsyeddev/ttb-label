# Feature Spec — Results page redesign (w03)

**Status:** Approved
**Owner:** Faheem
**Last updated:** 2026-05-05

## Goal
Replace the current full-width results layout with the wireframe in `wireframes/w03.png`: a left rail of field cards with colored status accents, a right rail with a label thumbnail, an `Approve as-is` / `Reject` action footer, and a casing-only-mismatch surfaced as REVIEW (yellow) — matching the wireframe's bottler-name card.

## Scope

**In scope:**
- New header strip:
  - Title `Verification Results` (left).
  - Status pill underneath the title that reflects `overallStatus`:
    - `PASS` → green dot + `Approved`
    - `REVIEW` → yellow dot + `Needs review`
    - `FAIL` → red dot + `Failed`
  - Adjacent count chips: `<n> PASS`, `<n> REVIEW`, `<n> FAIL` (always shown, even when count is 0).
  - Right side: `Print`, `Export CSV`, `New scan` buttons.
- Two-column body:
  - Left rail (≈70% width): field cards stacked.
  - Right rail (≈30% width): `SUBMITTED LABEL` heading with a clickable thumbnail (replacing the current `Enlarge` button entirely). Clicking the thumbnail opens a modal showing the full image. Modal closes on backdrop click, on `Escape`, and via an explicit close button.
- Field cards: each card has a left edge accent bar in the status color (green/yellow/red), a bold title, a status pill on the right, an `EXPECTED` / `DETECTED` two-column body, and a hint-text strip at the bottom for non-PASS cards. Hint text is the existing `field.note` string surfaced in italics.
- Field labels and order on the results page (rename from current):
  1. `Brand Name`
  2. `Class / Type Designation`
  3. `Alcohol by Volume (ABV)`
  4. `Net Contents` (kept; not in user's verbatim list, but it's a CFR-required field — see Notes)
  5. `Bottler Name`
  6. `Bottler Address`
  7. `Government Warning Statement`
  - Country of Origin still renders only when `is_import` is true (unchanged behavior).
- Footer strip:
  - Left: `<n> field needs your judgment.` (singular when n=1, plural otherwise; hidden when 0).
  - Right: `Reject` (ghost) and `Approve as-is` (primary). Wired to existing `onReset` for now (with a toast-style confirmation in a future iteration). Spec'd as no-op-with-reset for v1.
- New comparator behavior — casing-only review:
  - `compareCompanyName` (semantic.ts) gains a third return: when raw strings (after trim) differ but `fuzzyEqual` is true (i.e., same text, different casing/punctuation), return `status: 'warning'` with note `Casing differs but text matches. Likely acceptable — confirm.`
  - This replaces the current binary pass/fail for these two fields, but only on this exact path. Real text mismatches still hard-fail (BUG-01 strict-match property is preserved — anything beyond casing/punctuation/whitespace divergence is still a fail).

**Out of scope:**
- Wiring `Approve as-is` / `Reject` to a persistence layer or analytics. v1 just resets to the form like `New scan`.
- A real CSV export pipeline. v1's `Export CSV` button is included but routes to a TODO; left in for layout fidelity. Marked clearly in the implementation as a no-op placeholder.
- Changing how compliance advisories are surfaced — the existing advisories section continues to render below the field cards if any are present.

## Approach

**Files touched:**
- `components/ResultsCard.tsx` — heavy rewrite of layout and field card. Keep header logic + advisories section; replace per-field row component with the new accented card.
- `components/FieldBadge.tsx` — minor: add the status-color tokens used by the new accent bar so we don't duplicate the mapping.
- `components/LabelModal.tsx` — new file, accessible modal for the enlarged label image (focus trap is acceptable to skip; close-on-Escape and close-on-backdrop are required).
- `components/LabelVerifier.tsx` — pass the uploaded `imageFile`'s object URL through to `ResultsCard` so the right-rail thumbnail can render. Currently `ResultsCard` only receives `result + onReset`.
- `lib/validators/semantic.ts` — extend `compareCompanyName` return type to include `'warning'` and add the casing-difference branch.
- `lib/validators/spirits.ts` — no logic change; FieldResult `status` already supports `'warning'`, so the new comparator value flows through without code changes. Adjust `COLA_FIELD_LABELS` (or override at render time) for the renamed labels.
- `types/cola.ts` — update `COLA_FIELD_LABELS` for the new label strings (`Brand Name`, `Class / Type Designation`, `Alcohol by Volume (ABV)`, `Net Contents`, `Bottler Name`, `Bottler Address`, `Country of Origin`, `Government Warning Statement`).

**Modal contract (`LabelModal.tsx`):**
- Props: `{ open: boolean; imageUrl: string | null; alt: string; onClose: () => void }`.
- Renders a `<div role="dialog" aria-modal="true">` with a centered `<img>` capped at 90vw / 90vh.
- Closes on backdrop click and on `Escape` keydown (window-level listener, attached only while open).
- No portal needed for v1 — render inline; z-index high enough to cover the page.

**Casing-only review behavior (semantic.ts):**

```
if (!extracted) → fail "<field> not found on label"
if (!submitted) → fail "<field> not provided in application"
if (submitted.trim() === extracted.trim()) → pass (exact)
if (fuzzyEqual(submitted, extracted)) → warning "Casing differs but text matches. Likely acceptable — confirm."
otherwise → fail "<field> mismatch: submitted \"<x>\" vs label \"<y>\""
```

This preserves the BUG-01 property: any mismatch beyond casing/punctuation/whitespace normalization remains a hard fail and never falls into a similarity-band warning.

## Acceptance criteria

- [ ] Results header shows `Verification Results`, the status pill text matches `overallStatus`, and the three count chips render with correct counts.
- [ ] Left rail field cards render in the order Brand → Class/Type → ABV → Net Contents → Bottler Name → Bottler Address → Government Warning, plus Country of Origin only when imported.
- [ ] Each card's left accent bar color matches its status (green = pass, yellow = warning, red = fail). The PASS cards do not show the hint strip; FAIL/REVIEW cards show the existing `field.note` in italics.
- [ ] Right rail shows a thumbnail of the submitted label. Clicking opens a modal with the full image; the modal closes on backdrop click, `Escape`, and the close button.
- [ ] Footer renders `Reject` and `Approve as-is`; both currently call `onReset` (documented in code comment as the v1 contract — no production persistence yet).
- [ ] Footer left text reads `1 field needs your judgment.` when there is exactly 1 warning; pluralizes correctly; omitted when 0.
- [ ] When submitted bottler/brand differs only in casing (e.g., `Old Cypress Distillery` vs `OLD CYPRESS DISTILLERY`), the field renders as REVIEW (yellow) with the note `Casing differs but text matches. Likely acceptable — confirm.` — overall status escalates to `REVIEW` (no longer a silent PASS).
- [ ] When submitted differs from extracted by anything more than casing/punctuation/whitespace, status is FAIL (BUG-01 invariant preserved).
- [ ] Compliance advisories continue to render in their own section below the field cards (existing behavior).

## Evals

Land alongside the implementation in the same change.

- `compareCompanyName_casing_only_returns_warning` — `Old Cypress Distillery` vs `OLD CYPRESS DISTILLERY` → `status === 'warning'`, note matches expected copy.
- `compareCompanyName_exact_match_remains_pass` — identical strings → `status === 'pass'`, no note.
- `compareCompanyName_real_mismatch_still_fails` — `Highland Crest` vs `Old Cypress` → `status === 'fail'` (BUG-01 invariant).
- `compareCompanyName_punctuation_difference_warns` — `Stone's Throw, Inc.` vs `Stones Throw Inc` → `status === 'warning'` (covered by the same fuzzy-equal-but-not-strict-equal branch).
- `compareCompanyName_missing_extracted_fails` — extraction returns `null` → `status === 'fail'`.
- `spirits_overall_status_review_when_only_casing_mismatch` — full pipeline test: feed an extraction that matches the application except for bottler-name casing; assert `overallStatus === 'REVIEW'`, exactly one field has status `warning`, all other fields pass.
- `results_card_label_modal_opens_and_closes` — render `ResultsCard` with a mocked image URL, click thumbnail → modal visible; press `Escape` → modal hidden; click backdrop → modal hidden.
- `results_card_renames_field_labels` — assert each renamed label text appears exactly once on the page.
- `results_card_footer_pluralization` — 0 / 1 / 2 warnings → footer hidden / singular / plural.

## Open questions
- Should the `Approve as-is` button persist a decision somewhere (file system, local storage, eventual API call) or remain a UI-only acknowledgement in v1? Current spec is UI-only with `onReset`.
- The user listed only six field labels for renaming (excluded Net Contents). We keep Net Contents on the page because it's a 27 CFR Part 5.53 required field — flagging this as a confirmation point. If the user actually wants Net Contents hidden, we'd hide its card but keep the validator running (so the count chips still count it).

## Notes
- The casing-only warning rule sits next to the BUG-01 strict-match work in `docs/specs/company-name-suffix-strip.md`. Read both together when changing `compareCompanyName`.
- This rewrite preserves the architectural rule: cross-validation `FieldResult[]` and compliance advisories remain separate visual sections; advisories never affect `overallStatus`.

---

**Status legend:** Draft → Approved → In progress → Done
