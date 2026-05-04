# Feature Spec — Batch Upload

**Status:** Draft (placeholder — not yet expanded)
**Owner:** Faheem
**Last updated:** 2026-05-04

## Goal
Allow agents to submit multiple applications (image + form data pairs) at once, view aggregate pass/fail results, and export results as CSV.

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
- Pairing strategy: filename convention (`label_001.jpg` ↔ `app_001.json`), or a manifest CSV that lists pairs?
- Concurrency: how many extractions run in parallel against Gemini? (Rate limit + < 5s per-application target.)
- Partial failure handling: one failed item blocks the batch, or batch continues and reports per-item status?
- Aggregate view shape: table per item, or summary counts + drill-down?
- CSV export columns: per-field results, or just overall status per application?

## Notes
- This is the first feature that introduces non-trivial concurrency — likely needs a job queue or streaming response.
