// Pure derivation for the verifying / loading screen. Kept out of the .tsx
// component so evals can import it without React.

export type StageStatus = 'done' | 'current' | 'pending';

export interface Stage {
  id: string;
  label: string;
  status: StageStatus;
}

export const STAGE_LABELS = [
  'Reading label image',
  'Extracting fields',
  'Matching to application',
  'Compliance checks',
] as const;

/**
 * Given elapsed ms and whether the request has finished, produce the four
 * stage states. Mock cadence (no streaming yet):
 *   t < 1.0s  → stage 1 in progress
 *   t < 2.0s  → stage 2 in progress
 *   t < 3.0s  → stage 3 in progress
 *   t ≥ 3.0s  → stage 4 in progress (waits here for the fetch to resolve)
 *   finished  → stage 4 done (and any prior stages skipped to done)
 */
export function deriveStages(elapsedMs: number, finished: boolean): Stage[] {
  const stages: Stage[] = STAGE_LABELS.map((label, i) => ({
    id: String(i),
    label,
    status: 'pending',
  }));

  if (finished) {
    stages.forEach((s) => (s.status = 'done'));
    return stages;
  }

  let activeIdx: number;
  if (elapsedMs < 1000) activeIdx = 0;
  else if (elapsedMs < 2000) activeIdx = 1;
  else if (elapsedMs < 3000) activeIdx = 2;
  else activeIdx = 3;

  for (let i = 0; i < stages.length; i++) {
    if (i < activeIdx) stages[i].status = 'done';
    else if (i === activeIdx) stages[i].status = 'current';
    else stages[i].status = 'pending';
  }
  return stages;
}

export function progressRatio(stages: Stage[]): number {
  const doneCount = stages.filter((s) => s.status === 'done').length;
  const inProgressCount = stages.filter((s) => s.status === 'current').length;
  // A stage in progress contributes half its slot — the bar grows visibly the
  // moment a step starts, then jumps another half when it completes.
  return Math.min(1, (doneCount + (inProgressCount > 0 ? 0.5 : 0)) / stages.length);
}
