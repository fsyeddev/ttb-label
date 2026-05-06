# Feature Spec — Company Name Strict-Match Comparator

**Status:** Done
**Owner:** Faheem
**Last updated:** 2026-05-04

> Filename retained from initial scoping (suffix-strip was the proposed fix
> direction in `docs/bugs.md` BUG-01). The actual design landed on binary
> strict-equality after discussion — see Background. The body below describes
> what shipped, not what was originally proposed.

## Goal
Stop downgrading obvious bottler / brand mismatches to `warning` because of shared generic suffixes. Tracked as BUG-01: `"Wrong Distilling Co."` vs `"Prairie Wind Distilling Co."` returns `warning` (~0.69 Levenshtein similarity, in the 0.6–0.85 band) when it should clearly fail. A soft "possible mismatch — review" on totally different companies is the wrong signal for an automated verifier — it costs agent trust on the very category (Cat 2) the system exists to catch.

## Background — why strict equality, not suffix stripping
Suffix stripping was the suspected fix direction in BUG-01: strip "Distilling Co." from both sides and compare the unique tokens. That cleanly handles BUG-01 but creates a new problem — under stripping, `"Old Cypress Distillery"` vs `"Old Cypress"` (an OCR truncation) would pass, and `"Old Tom Distillery"` vs `"Old Tom Distilery"` (a typo on the suffix) would either pass with typo-tolerance or produce inconsistent results without it.

The product-level call: **mismatch should always fail**. The system can't reliably distinguish OCR error from human typo, and if it tries to, it hides exactly the kind of agent-form errors the system exists to catch. Visual verification (`docs/specs/visual-verification.md`) is the chosen mechanism for surfacing OCR-side errors to humans, not lossy text comparison.

With "any mismatch fails," suffix stripping no longer changes any outcome:
- Equal cases (`"X Co." == "X Co."`) pass without stripping.
- BUG-01 case (`"Wrong …" vs "Prairie Wind …"`) fails without stripping — they aren't equal anyway.
- The only cases stripping would have changed are truncations, which we now want to fail.

So the fix collapses to: replace `compareTextField` for `brand_name` and `bottler_name` with a binary strict-equality comparator built on the existing `fuzzyEqual` (case/whitespace/apostrophe/dash normalized). No new constants, no suffix list, no new helpers beyond the comparator itself.

## Scope

**In scope:**
- New `compareCompanyName(submitted, extracted, label)` exported from `lib/validators/semantic.ts`.
- Wire to `brand_name` and `bottler_name` call sites in `lib/validators/spirits.ts` only.
- Binary `pass`/`fail` (no warning tier for these two fields).
- Equality is `fuzzyEqual` — case-insensitive, whitespace-collapsed, apostrophe/dash-normalized. Punctuation differences (e.g., `"Co."` vs `"Co"`) fail; we can't tell OCR from human.

**Out of scope:**
- Other text fields (address, class/type, country-of-origin, gov-warning) — keep their existing comparators / tiers.
- Any heuristic for OCR truncation, typo detection, or fuzzy company-name matching. These belong to visual verification, not text comparison.
- Re-tiering of `compareTextField` globally — that would need its own product call.

## Approach
`compareCompanyName` is a thin comparator. Null guards mirror `compareTextField` so per-field result shape stays consistent. After the null checks, defer to `fuzzyEqual`; on inequality return `fail` with a note that surfaces both sides verbatim so the agent can see exactly what differs.

The two call sites in `lib/validators/spirits.ts` (brand at the top of `validateSpiritsLabel`, bottler in section 5) swap from `compareTextField(...)` to `compareCompanyName(...)`. Field-result construction is otherwise unchanged.

## Acceptance criteria
- [x] `compareCompanyName` returns `pass` only on `fuzzyEqual` true; everything else is `fail`.
- [x] No `warning` status produced by this comparator.
- [x] BUG-01 fixture (`02-mismatch-05`) goes from `failed=0 warning` to `failed=1 fail` overall `FAIL`.
- [x] `bottler_address`, `class_type`, etc. still use `compareTextField` and behave as before.
- [x] All 135 existing tests still pass; suite now at 146.

## Evals
- `compareCompanyName fails on shared-suffix mismatch (BUG-01 case)` — `"Wrong Distilling Co."` vs `"Prairie Wind Distilling Co."` → `fail`.
- `compareCompanyName fails on OCR truncation` — `"Old Cypress Distillery"` vs `"Old Cypress"` → `fail` (visual verification is the catch path, not the text comparator).
- `compareCompanyName fails on suffix typo` — `"Old Tom Distillery"` vs `"Old Tom Distilery"` → `fail`.
- `compareCompanyName fails on core-name typo` — `"Jak Daniels"` vs `"Jack Daniels"` → `fail`.
- `compareCompanyName passes on case-only difference` — `"OLD TOM DISTILLERY"` vs `"Old Tom Distillery"` → `pass`.
- `compareCompanyName fails on punctuation-only difference` — `"Old Tom Co."` vs `"Old Tom Co"` → `fail`. We deliberately do not tolerate punctuation drift; agent should match the label exactly.
- `compareCompanyName fails when extracted is null` and `… when submitted is null` — null guards.
- New pipeline ground-truth fixture `bug-01-bottler-suffix-mismatch.json` covers the end-to-end BUG-01 path: bottler differs, expected `bottler_name=fail`, expected overall `FAIL`.
- Regression: existing `bottler_address` tests on `compareTextField` continue to pass — comparator wiring is field-scoped.

## Open questions
- None. Strict-binary-equality scope confirmed with Faheem 2026-05-04.

## Notes
- Visual verification is the long-term answer for OCR-side discrepancies (truncation, missed words, etc.). Drafted as `docs/specs/visual-verification.md`. This spec deliberately keeps text comparison strict so visual verification carries its weight.
- Trailing-period tolerance was considered and rejected: we can't tell OCR drift from human input, and the agent's job is to match the label as it appears.

---

**Status legend:** Draft → Approved → In progress → Done
**Approval rule:** A spec must be Approved before code is written.

---

**Superseded — 2026-05-05:** the casing-only warning that was incidentally introduced alongside BUG-01's strict-match work (via `docs/specs/results-redesign.md`) was reversed by `docs/specs/case-insensitive-and-address-substring.md`. `compareCompanyName` is now strictly binary pass/fail with no warning tier. Case differences fold into pass via `fuzzyEqual`. The BUG-01 strict-match invariant (any non-fuzzyEqual difference is `fail`) is preserved.
