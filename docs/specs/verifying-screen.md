# Feature Spec — Verifying / loading screen (w02)

**Status:** Approved
**Owner:** Faheem
**Last updated:** 2026-05-05

## Goal
Replace the current spinner-only loading state with the wireframe in `wireframes/w02.png`: two-column layout showing a label preview on the left and a four-step status checklist with elapsed-time bar on the right, while `/api/analyze` runs.

## Scope

**In scope:**
- A new `verifying` rendering inside `LabelVerifier.tsx` that activates when `appState === 'loading'`.
- Left column:
  - Title `VERIFYING` (caps, small).
  - `<filename>` headline (e.g., `old-cypress-bourbon.png`) — large serif-style, matches wireframe.
  - Below the filename, the actual uploaded image rendered as a preview (object-contain, max-width to match wireframe pill width). The wireframe shows a placeholder pill with the text `label preview`; we substitute the real image. If for any reason `URL.createObjectURL` fails, we fall back to the placeholder pill so the page never breaks.
- Right column:
  - Four-step checklist, in order:
    1. `Reading label image`
    2. `Extracting fields`
    3. `Matching to application`
    4. `Compliance checks`
  - Each step has a status icon: green check (done), filled dark dot (in progress), pale grey disc (pending).
  - Below the checklist, divider, then `Elapsed` label on the left and elapsed seconds on the right (e.g., `2.3s`). No `/ 5.0s` total — only elapsed.
  - Beneath the row, a horizontal progress bar that fills proportionally to the active step (1/4, 2/4, 3/4, 4/4). The bar's fill ratio is driven by step progress, not by elapsed time.
  - `Cancel` button beneath the bar. Clicking aborts the in-flight fetch via `AbortController` and returns the user to the form state with all entered data preserved.
- The whole page chrome from the homepage is gone in this state — the verifying view fills the body, mirroring the wireframe.

**Out of scope:**
- True server-side streaming of intermediate progress events. The backend remains a single `POST /api/analyze`.
- A real cancellation contract on the server side (the request just gets aborted client-side; server work that has already started will complete and be discarded).

## Approach

**Step progression model — timed mock, since backend isn't streaming:**

Stages advance on a fixed cadence:

- `t = 0`: kick off `fetch('/api/analyze')` and start a 100 ms ticker.
- Stage 1 (`Reading label image`) becomes `done` at `t ≥ 1.0s`.
- Stage 2 (`Extracting fields`) becomes `done` at `t ≥ 2.0s`.
- Stage 3 (`Matching to application`) becomes `done` at `t ≥ 3.0s`.
- Stage 4 (`Compliance checks`) becomes `in progress` at `t ≥ 3.0s` and stays `in progress` until the fetch resolves. Once the fetch resolves, it flips to `done` and the view transitions to results.
- The `current` step is always the lowest-index step that isn't `done`.

If the fetch resolves *before* `t = 3.0s` (rare but possible on cached/very-fast runs), the checklist fast-forwards: all four steps flip to `done` immediately and we transition to results. This avoids the awkward case of the UI saying "still extracting" after results are already in hand.

If the fetch errors, we transition to the existing error state (no change to error rendering this iteration).

**Elapsed counter:**
- Driven by the same 100 ms ticker; rendered as `(elapsedMs / 1000).toFixed(1) + 's'`.
- Stops when fetch resolves or is cancelled.

**Cancel:**
- Holds an `AbortController` ref for the duration of the request.
- On click: `controller.abort()`, clear the ticker, restore `appState = 'form'`. Form data and the uploaded image stay populated so the user can adjust and retry.

**Files touched:**
- `components/LabelVerifier.tsx` — rewrite the `loading` branch; thread `AbortController` into `handleSubmit`; track elapsed and stage state.
- `components/VerifyingScreen.tsx` — new file, presentational component (`{filename, imageUrl, stages, elapsedMs, onCancel}`). Keeps `LabelVerifier` from getting too dense.

## Acceptance criteria

- [ ] Submitting from the homepage transitions to the verifying view immediately and renders the actual uploaded image (not a placeholder) within ~50 ms.
- [ ] Filename in the headline matches the uploaded file's `name`.
- [ ] Elapsed counter advances at ~10 Hz, displayed as `<n>.<n>s`.
- [ ] Stage icons advance through done → done → done → in-progress at the timed thresholds described above; the fourth step never flips to `done` until the fetch resolves (or it fast-forwards if the fetch beats the schedule).
- [ ] Progress bar fill ratio matches step progress (25% / 50% / 75% / 100%), not elapsed time.
- [ ] `Cancel` aborts the request, returns to the form, and preserves all entered data and the uploaded image.
- [ ] If the request errors, the error state is shown (existing behavior).
- [ ] Existing 124+ tests continue to pass; no API contract change.

## Evals

Land alongside the implementation in the same change.

- `verifying_screen_renders_filename_and_preview` — given a `File` named `old-cypress-bourbon.png` mounted into a fake state, the rendered component shows that filename and an `<img>` with a non-empty `src`.
- `verifying_screen_stage_progression_at_thresholds` — using fake timers, advance to 1.0s, 2.0s, 3.0s, 5.0s and assert step states at each tick.
- `verifying_screen_progress_bar_ratio` — assert the bar's `aria-valuenow` (or width style) matches `25 / 50 / 75 / 100` at each stage transition.
- `verifying_screen_cancel_aborts_and_restores_form` — fire `Cancel`, assert `AbortController.signal.aborted === true`, assert `LabelVerifier` re-renders the form with the previously uploaded file still in state.
- `verifying_screen_fast_resolution_skips_intermediate_stages` — resolve the fetch at `t = 0.4s`; assert all four stages reach `done` and the view transitions to results without leaving stage 4 stuck.
- `verifying_screen_elapsed_format` — at `t = 2300ms` the elapsed text reads `2.3s`.

## Open questions
- Should `Cancel` also clear the form on press (current spec preserves it)? Default is preserve so the agent doesn't lose typed data; revisit if the agent flow expects a hard reset.

## Notes
- This is a UI-only change. When the backend later streams stage events (likely tied to the `live-extraction-evals` work), the view contract is already shaped for it: the timed mock can be replaced by the real event stream without re-doing the layout.

---

**Status legend:** Draft → Approved → In progress → Done
