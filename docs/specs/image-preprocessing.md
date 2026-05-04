# Feature Spec — Image Pre-processing

**Status:** Draft (placeholder — not yet expanded)
**Owner:** Faheem
**Last updated:** 2026-05-04

## Goal
Improve extraction accuracy on low-quality submitted photos by preprocessing the image before sending to Gemini — deskew, glare reduction, and angle/perspective correction.

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
- Server-side vs. client-side preprocessing? Server keeps logic centralized but adds CPU cost; client offloads but limits library options.
- Library options: sharp (Node), opencv.js (browser), or a managed service?
- Measurable accuracy lift: need a labeled set of "bad" photos with ground truth — how do we collect that?
- Should this run on every upload, or only when extraction confidence is low (Gemini returns "low" confidence)?
- Front-vs-back-of-bottle issue (known issue #1) — preprocessing won't solve it; flag as out of scope.

## Notes
- Tied directly to known issue #2 in the tracker (Gemini class/type misreads).
- This is a quality-of-life feature, not a compliance feature — user acceptance evals matter more than unit tests.
