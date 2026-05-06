# Feature Spec — Image Pre-processing

**Status:** Done
**Owner:** Faheem
**Last updated:** 2026-05-06

## Goal
Reduce Gemini round-trip latency by downsizing large uploaded images before sending. Typical phone photos are 3–12 MB; after resize they land at 100–400 KB, cutting payload size by 85–95% with no perceptible accuracy loss (Gemini's effective resolution ceiling is ~1024–1568px on the longest edge).

## Scope

**In scope:** server-side resize to max 1280px on the longest edge, JPEG re-encode at Q85, new `imagePreprocessMs` timing phase.

**Out of scope:** deskew, glare reduction, perspective correction (deferred — no labeled "bad photo" dataset to measure accuracy lift against).

## Approach

- `lib/image-preprocess.ts` — `preprocessImage(buffer: Buffer)` using `sharp`
  - Resize: `fit: 'inside', withoutEnlargement: true`, max edge 1280px
  - Output: JPEG Q85 regardless of input format (PNG, WebP, JPEG all pass through)
  - Returns original and resized dimensions + KB sizes for logging
- `app/api/analyze/route.ts` — calls `preprocessImage` after `arrayBuffer()`, before `base64` encode
- `next.config.ts` — `serverExternalPackages: ['sharp']` so the native binary resolves on Vercel
- `types/cola.ts` — `AnalysisTimings` gains `imagePreprocessMs` and `resizedSizeKB`
- `components/LabelVerifier.tsx` — console.table header shows "X KB → Y KB after resize"; preprocess row added

## Acceptance criteria
- [x] Images with longest edge > 1280px are resized; images ≤ 1280px are passed through unchanged
- [x] Aspect ratio is preserved exactly
- [x] Output is always `image/jpeg`
- [x] `imagePreprocessMs` appears in response timings; console.table shows it
- [x] TypeScript build clean, all 198 tests pass

## Evals
`evals/image-preprocess.test.ts` — 6 cases covering resize, aspect ratio, no-upscale guard, JPEG output, dimension reporting, size reduction.
