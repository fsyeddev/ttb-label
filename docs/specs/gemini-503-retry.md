# Feature Spec — Gemini 503 Retry

**Status:** Done
**Owner:** Faheem
**Last updated:** 2026-05-04

## Goal
Gemini Vision occasionally returns `503 Service Unavailable` ("model is currently experiencing high demand"). Today the error bubbles up unchanged through `/api/analyze` and surfaces as a fatal failure to both real UI users and the eval client. Add a small server-side retry on 503 so transient outages don't drop label-verification requests on the floor. Tracked as INFRA-04 in `docs/bugs.md`.

## Scope

**In scope:**
- Retry on 503 only, server-side in `lib/gemini.ts`, wrapping the SDK `generateContent` call.
- Up to 2 retries on a fixed schedule `[5000, 10000]` ms (worst case ~15 s).
- Named constant `GEMINI_503_RETRY_DELAYS_MS` — array length defines the retry count, no separate counter.
- `console.warn` on each retry (visible in Vercel function logs and local `npm run dev` terminal).
- After exhausting retries, rethrow the original 503 error unchanged — no wrapper.

**Out of scope:**
- 4xx errors (bad input, auth) — not transient.
- 429 quota errors — different semantics; would be its own change.
- Other 5xx (502/504) — not observed; out of scope per current eval evidence.
- Surfacing retry counts in the API response — server-side logging only for v1.
- Client-side retry in `scripts/run-fixture-evals.ts` — redundant once server-side retry is in.

## Approach
Add a small `callWithRetryOn503` helper inside `lib/gemini.ts` (colocated; not yet big enough for its own file). Detection priority: `error.status === 503` (the `GoogleGenerativeAIFetchError` shape exposes this) with a `\b503\b` regex fallback on `error.message` for resilience to wrapping. The helper wraps `model.generateContent(...)`; non-503 errors throw on the first attempt with no retry. JSON parsing happens after the helper returns — JSON-parse failures are a Gemini output bug, not transient, and are not retried.

## Acceptance criteria
- [x] `GEMINI_503_RETRY_DELAYS_MS = [5000, 10000]` declared at the top of `lib/gemini.ts`; no inline magic numbers in the retry path.
- [x] On 503, up to 2 retries on the schedule above; each attempt logged via `console.warn`.
- [x] On non-503 errors, no retry — the first error throws immediately.
- [x] When all 3 attempts fail with 503, the original 503 error is rethrown unchanged.
- [x] Retry lives server-side, so real UI users benefit — not just the eval script.

## Evals
- `retries on 503 once and succeeds` — mock SDK 503 → success; assert resolution, 2 SDK calls, 1 warn log.
- `retries on 503 twice and succeeds` — mock 503 → 503 → success; assert resolution, 3 SDK calls, 2 warn logs.
- `gives up after exhausting retries on 503` — mock 503 × 3; assert the original error throws (not a wrapper), 3 SDK calls, 2 warn logs.
- `does not retry on non-503 error` — mock a 500; assert it throws immediately with 1 SDK call and 0 warn logs.

## Open questions
- None. Retry-location decision (server-side in `lib/gemini.ts`) confirmed with Faheem 2026-05-04. Retry visibility chosen as server-side log only (not surfaced in API response).

## Notes
- Pre-fix transient cases observed (2026-05-04 eval): `04-noncompliant-01`, `04-noncompliant-14`, `06-warning-sneaky-02`. A subsequent BUG-08 confirmation run also hit 503 on `05-warning-bad-01`.

---

**Status legend:** Draft → Approved → In progress → Done
**Approval rule:** A spec must be Approved before code is written.
