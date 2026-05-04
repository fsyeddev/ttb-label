# Feature Spec — Live Extraction Evals

**Status:** Draft (placeholder — not yet expanded)
**Owner:** Faheem
**Last updated:** 2026-05-04

## Goal
Run the eval suite against real label images calling the Gemini API, instead of mocked extractions. Establishes a confidence baseline for Gemini's extraction quality and catches regressions when the model or prompt changes.

## Scope

**In scope:** TBD — expand before approval.

**Out of scope:** TBD.

## Approach
TBD.

## Acceptance criteria
- [ ] TBD

## Evals
- TBD

## Open questions
- Cost: each Gemini call is non-zero — gate live evals behind an env var or separate test command (e.g., `npm run eval:live`)?
- Source label images: where do we host them? Repo (large binaries), object storage (S3/R2), or a curated public dataset?
- Determinism: Gemini extraction is non-deterministic across runs (known issue #2). Do we score with tolerance, run N times and take majority, or accept some flakiness?
- Pass criteria: per-field accuracy threshold (e.g., ≥90% on brand_name across the test set), or all-or-nothing?
- CI integration: live evals on every PR (cost), nightly only, or manual trigger?

## Notes
- Current `evals/pipeline.test.ts` mocks the Gemini call — this spec replaces those mocks for a designated subset of fixtures.
- Required to genuinely validate the prompt mitigations called out in tracker known issues #1 and #2.
