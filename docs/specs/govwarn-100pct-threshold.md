# Feature Spec — Government Warning 100% Threshold

**Status:** Approved
**Owner:** Faheem
**Last updated:** 2026-05-04

## Goal
The government warning has exact statutory wording. Tighten `compareGovernmentWarning` so any non-100% match (after normalization) routes to human review instead of auto-passing. Tracked as BUG-08.

## Scope

**In scope:**
- Drop the tiered Levenshtein thresholds (`≥0.92 pass`, `0.75–0.92 warning`, `<0.75 fail`) in `lib/validators/regex.ts → compareGovernmentWarning`. After the structural hard-fail checks, replace the fuzzy similarity branch with a strict equality check after `joinHyphens` normalization.
- Restructure the CAPS hard-fail gate so it checks for `GOVERNMENT WARNING` (uppercase, no colon) — a missing colon is a wording corruption, not a CAPS violation, and should land as a warning, not a misleading "must be ALL CAPS" hard fail.
- Warning note includes a short character-delta signal (Levenshtein edit distance) so the agent knows the magnitude of the deviation. Not a full diff.

**Out of scope:**
- Other regex / semantic validators.
- Allowlist of known OCR-equivalent substitutions (BUG-08 lean: accept the noise).

## Approach

Hard fails (unchanged behavior, slightly restructured plumbing):
1. `extracted` null/empty → fail (no warning on label).
2. `GOVERNMENT WARNING` (uppercase substring) not present:
   - Case-insensitive form found → fail "must be ALL CAPS".
   - Else → fail "prefix not found".

After hard fails, normalize both sides with `joinHyphens` (existing helper: line-break hyphen joining + whitespace collapse) and compare strictly:
- Equal → `pass`.
- Not equal → `warning` with a note including edit distance.

## Acceptance criteria
- [ ] `compareGovernmentWarning` no longer imports `similarity` from `./semantic`.
- [ ] All non-100% matches route to `warning`, never `pass`.
- [ ] Null / non-CAPS / absent-prefix cases still produce `fail`.
- [ ] OCR-hyphen and severely-truncated existing tests are renamed (`warns when…`) and flipped to expect `warning`.
- [ ] Four sneaky-substitution tests added and passing.

## Evals
- `warns when 'may cause' is substituted with 'could cause'` — sneaky-01 pattern.
- `warns when 'a Surgeon General' replaces 'the Surgeon General'` — sneaky-03 pattern.
- `warns when 'alcohol beverages' replaces 'alcoholic beverages'` — sneaky-04 pattern.
- `warns when colon is missing after GOVERNMENT WARNING` — sneaky-05 pattern (CAPS still satisfied; equality fails).
- `warns when warning has line-break hyphen artifacts` — flipped from prior `passes`.
- `warns when warning is present but truncated` — flipped from prior `fails`.

## Notes
- Confirmed by 2026-05-04 manual eval run: cases `06-warning-sneaky-{01,03,04}` returned PASS under the 92% threshold; sneaky-02 hit a Gemini 503.

---

**Status legend:** Draft → Approved → In progress → Done
**Approval rule:** A spec must be Approved before code is written.
