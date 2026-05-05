# Feature Spec — Government warning: case-insensitive body comparison

**Status:** Approved
**Owner:** Faheem
**Last updated:** 2026-05-05

## Goal
Stop hard-failing labels whose Government Warning body is printed in ALL CAPS (e.g., Jack Daniel's Tennessee Fire) when the wording is otherwise statutorily exact. The "GOVERNMENT WARNING" prefix CAPS rule still applies — only the body comparison becomes case-insensitive.

## Scope

**In scope:**
- `compareGovernmentWarning` in `lib/validators/regex.ts`: lowercase both `officialNorm` and `extractedNorm` after `joinHyphens` runs, before the equality check and the Levenshtein distance calculation.
- Updated comment block in the function explaining the case-fold step.
- Bug-tracker entry recording the find (BUG-09).

**Out of scope:**
- Changing the prefix-CAPS gate (still enforces "GOVERNMENT WARNING" — uppercase, no colon — must be present byte-for-byte).
- Changing `MAX_WARNING_DISTANCE` (still 10 chars, still ~5% rule).
- Loosening any other field comparator.

## Approach

The current logic is correct on intent — the body of the Government Warning must be statutorily exact wording — but the case-sensitive Levenshtein implementation conflates "wording differs" with "case differs." Real-world labels routinely typeset the entire warning in capitals; the TTB regulation (27 CFR 16.21) requires `"GOVERNMENT WARNING:"` to appear in capital letters and requires the warning text to appear, but does not mandate that the *body* be in any particular case. Case-insensitive body comparison aligns the comparator with regulatory intent.

**One-line change after the existing `joinHyphens` calls:**

```ts
const officialNorm = joinHyphens(GOVERNMENT_WARNING_OFFICIAL).toLowerCase();
const extractedNorm = joinHyphens(ext).toLowerCase();
```

The prefix-CAPS gate runs before this point and is unaffected.

## Acceptance criteria

- [ ] An extracted warning identical to the official text but printed entirely in caps (Jack Daniel's case) returns `status: 'pass'`.
- [ ] A label whose prefix is `"Government Warning:"` (title case) still hard-fails with the existing "must appear in all capital letters" message — the gate is unchanged.
- [ ] A label whose prefix is missing entirely still hard-fails with the "prefix not found" message.
- [ ] All five existing sneaky-substitution tests (`could cause`, `a Surgeon General`, `alcohol beverages`, missing colon) keep returning `warning`.
- [ ] The garbage-body test (`This product may contain ingredients...`) still hard-fails with the `~5%` note.
- [ ] Hyphen-and-noise warning still routes to `warning`.

## Evals

- `govwarn_all_caps_body_passes` — `GOVERNMENT_WARNING_OFFICIAL.toUpperCase()` returns `status: 'pass'`. This is the Jack Daniel's case directly.
- `govwarn_jack_daniels_actual_extraction_passes` — paste the actual extracted text (caps body, single-line) and assert pass.
- `govwarn_prefix_titlecase_still_fails` — `"Government Warning: ..."` still hits the prefix-CAPS gate (`status: 'fail'`).

## Notes

- This regression was visible only on real labels because the existing `06-warning-sneaky` fixtures used mixed-case body text. Adding the all-caps-body fixture would have caught it earlier — flagged as a follow-up coverage gap (`labels/EVALS/Jack_Tennessee_Fire.json` is the natural seed).

---

**Status legend:** Draft → Approved → In progress → Done
