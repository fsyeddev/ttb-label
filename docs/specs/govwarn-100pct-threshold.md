# Feature Spec — Government Warning Distance-Based Threshold

**Status:** Done
**Owner:** Faheem
**Last updated:** 2026-05-04

> Filename retained from the prior 100%-only iteration so existing references in
> `bugs.md`, `regex.ts`, and `technical-reference.md` keep resolving. The model
> below supersedes the 100%-or-warning rule.

## Goal
The government warning has exact statutory wording. The text-comparison branch of `compareGovernmentWarning` should distinguish three buckets — exact match, subtle deviation requiring human review, and obvious garbage that should hard-fail. Tracked as BUG-08.

## Background — why three tiers, not two
The first iteration of this rule landed as binary on the text-comparison branch (100% match → pass, anything else → warning). It worked for the cat-6 sneaky cases (2–3 char diffs surfaced as warnings instead of slipping through as PASS), but in real eval runs the rule was too coarse: the cat-5 fixtures `05-warning-bad-03` (truncated to first sentence, ~60 chars) and `05-warning-bad-04` (completely different wording) routed to REVIEW when they should hard-fail. Agents should not have to manually inspect obvious garbage.

## Scope

**In scope:**
- Replace the binary 100%-or-warning logic on the text-comparison branch of `compareGovernmentWarning` with a three-bucket distance-based model.
- Add a named constant `MAX_WARNING_DISTANCE = 10` at the top of `lib/validators/regex.ts`. Do not inline 10 in the comparison.
- Update the warning/fail notes so the agent gets a magnitude signal (existing edit-distance note format is fine for warning; fail note explicitly calls out the "more than ~5% off" rule of thumb).

**Out of scope:**
- Structural hard fails (null extraction, non-ALL-CAPS prefix). These remain unchanged and are independent of the new distance buckets.
- Other regex / semantic validators.
- Allowlist of OCR-equivalent substitutions (already deferred under the original BUG-08 lean: accept the noise).

## Approach

**Hard fails (unchanged):**
1. `extracted` null/empty → fail (no warning on label).
2. `GOVERNMENT WARNING` (uppercase substring) not present:
   - Case-insensitive form found → fail "must be ALL CAPS".
   - Else → fail "prefix not found".

**Text-comparison branch — three tiers by Levenshtein distance:**
After the hard-fail checks, both sides are normalized with `joinHyphens` (line-break hyphen joining + whitespace collapse). Compute `distance = levenshtein(officialNorm, extractedNorm)`.

| Bucket | Distance | Status |
|---|---|---|
| Exact match | 0 | `pass` |
| Subtle deviation | 1 ≤ d ≤ `MAX_WARNING_DISTANCE` (10) | `warning` |
| Major deviation | d > `MAX_WARNING_DISTANCE` (10) | `fail` |

10 chars on the 218-char official text is roughly 4.6% — phrased in user-facing terms as "more than ~5% off the official text → automatic fail". Cat-6 sneaky cases (2–3 char diffs) sit comfortably in the warning band; cat-5 obvious cases (100+ char diffs) sit deep in the fail band; 10 chars leaves comfortable headroom for genuine OCR noise on long words.

## Acceptance criteria
- [x] `MAX_WARNING_DISTANCE` constant declared at the top of `lib/validators/regex.ts`; no inline `10` in `compareGovernmentWarning`.
- [x] Distance ≤ 10 → `warning`; distance > 10 → `fail`. Distance 0 still → `pass`.
- [x] Null / non-CAPS / absent-prefix cases still produce `fail`.
- [x] Truncated test (`severely truncated to first sentence`) renamed and flipped from `warning` → `fail`.
- [x] Hyphen-OCR test still expects `warning` (small distance well below threshold).
- [x] Four sneaky-substitution tests still expect `warning` (each is 2–3 char diff).
- [x] At least one new test asserts `fail` when extracted is wholly different text.
- [x] Live-URL eval on cat-5 + cat-6 fixtures: cat-5 = FAIL × 4, cat-6 = REVIEW × 4.

## Evals
- `passes on exact official text` — distance 0 → pass (unchanged).
- `warns when 'may cause' is substituted with 'could cause'` — distance ~5 → warning.
- `warns when 'a Surgeon General' replaces 'the Surgeon General'` — distance ~2 → warning.
- `warns when 'alcohol beverages' replaces 'alcoholic beverages'` — distance ~2 → warning.
- `warns when colon is missing after GOVERNMENT WARNING` — distance 1 → warning (CAPS still satisfied; equality fails).
- `warns when warning has line-break hyphen artifacts` — distance ~2 (case differences in joined words) → warning.
- `fails when warning is present but severely truncated` — first-sentence ~60 chars vs 218-char official → distance ~160 → fail.
- `fails when warning is wholly different text` — distance > 10 → fail (new).
- `fails when warning uses wrong capitalization (title case)` — structural fail, unchanged.
- `fails when warning is completely absent` — structural fail, unchanged.

## Notes
- 2026-05-04 manual eval run confirmed the prior 100%-only rule misrouted cat-5 truncated/different-wording cases. This refinement was prompted by that.
- Live-URL eval after deploy is part of "shipped correctly"; without it, BUG-08 is not closeable.

---

**Status legend:** Draft → Approved → In progress → Done
**Approval rule:** A spec must be Approved before code is written.
