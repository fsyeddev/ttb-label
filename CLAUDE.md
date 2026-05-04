# TTB COLA Label Verifier

Prototype for the US Treasury / TTB. Agents upload an alcohol label image plus an application form; the system extracts label data with Gemini Vision and reports whether the label matches the application and complies with 27 CFR Part 5. Live at https://cola-verify.vercel.app.

**Scope (v1):** distilled spirits only. Wine and malt beverages are spec'd, not built.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript, Tailwind v4
- Gemini 2.5 Flash Lite via `@google/generative-ai`
- Vitest 4 for evals/tests
- Deploys to Vercel via GitHub auto-deploy on push to `main`

Next.js 16, React 19, and Vitest 4 are post-training-cutoff for many models — APIs and conventions may differ from older patterns. When in doubt, check `node_modules/next/dist/docs/` (or the equivalent for the package in question) rather than guessing.

## Commands

```bash
npm run dev          # local dev server
npm run build        # production build
npm test             # run the full eval suite (vitest run)
npm run test:watch   # vitest watch mode
```

## Where to look first

- [docs/tracker.md](docs/tracker.md) — current state, what's done, what's planned, known issues
- [docs/technical-reference.md](docs/technical-reference.md) — module map, file purposes, architecture details
- [docs/specs/](docs/specs/) — one file per upcoming feature; every non-trivial change gets a spec

## Architecture — the load-bearing rule

The system answers two independent questions about a label, and the two answers must never be conflated:

1. **Cross-validation** (`lib/validators/spirits.ts`, `FieldResult[]`): does the label match the submitted application? Drives the `PASS / FAIL / REVIEW` headline.
2. **Compliance advisories** (`lib/validators/compliance.ts`, `ComplianceFlag[]`): does the label itself comply with 27 CFR Part 5? Surfaced as a separate visual section. **Never** affects `overallStatus`.

A green PASS verdict can — and often will — coexist with one or more advisories. That's the desired outcome, not a bug. Advisories never flip a green header to yellow or red; this preserves the "5-second approval" path agents rely on.

Per-beverage validators are modular. A new beverage type (wine, beer/malt) gets its own `lib/validators/<type>.ts` plus its own evals — never folded into spirits.

## Workflow

- **Spec-first.** Status legend in each spec is `Draft → Approved → In progress → Done`. Do not write code until a spec is Approved. Flip to In progress when starting, Done when shipped.
- **Evals alongside features.** Every feature iteration includes its evals in the same change. Never defer.
- **Clean, focused commits.** Prefer one meaningful commit per logical change over grab-bag commits.

## Git and deploy

- Never add `Co-Authored-By: Claude` or any Claude attribution to commits.
- Author email is `fsyed.dev@gmail.com` (configured locally and globally; don't change it).
- Vercel auto-deploys on push to `main` via the GitHub integration. Do not deploy manually.
