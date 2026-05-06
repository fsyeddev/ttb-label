/**
 * Model A/B Benchmark
 * Runs 16 label test cases through 4 Gemini models and reports accuracy, timing,
 * and error rates side-by-side so you can pick the best model for production.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/model-benchmark.ts
 *   tsx --env-file=.env.local scripts/model-benchmark.ts --save   (saves results to benchmark-results.json)
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { validateSpiritsLabel } from '@/lib/validators/spirits';
import { preprocessImage } from '@/lib/image-preprocess';
import { EXTRACTION_PROMPT } from '@/lib/gemini';
import type { ExtractionResult, OverallStatus } from '@/types/cola';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LABELS_DIR = resolve(ROOT, '..', 'labels');
const SAVE = process.argv.includes('--save');

const MODELS = [
  { id: 'gemini-2.5-flash',      short: '2.5-Flash  ' },
  { id: 'gemini-2.5-flash-lite', short: '2.5-Lite   ' },
  { id: 'gemini-2.0-flash-exp',  short: '2.0-FExp   ' },
  { id: 'gemini-1.5-flash-002',  short: '1.5-F002   ' },
];

const TEST_IDS = [
  '01-pass-01', '01-pass-02',
  '02-mismatch-01', '02-mismatch-05',
  '03-noncompliant-01', '03-noncompliant-05',
  '04-noncompliant-01', '04-noncompliant-20',
  '05-warning-bad-03', '05-warning-bad-04',
  '06-warning-sneaky-03', '06-warning-sneaky-04',
  '07_ABC_Whisky', '07_Jack_Tennessee_Fire', '07_lagavulin_islay', '07_Stagg',
];

// Expected: verdict the verifier should produce + whether ≥1 compliance advisory is required.
// "~" status means REVIEW or FAIL are both acceptable (subtle gov-warning diff).
const EXPECTED: Record<string, { status: OverallStatus | 'REVIEW|FAIL'; advisory: boolean; note: string }> = {
  '01-pass-01':           { status: 'PASS',        advisory: false, note: 'clean bourbon — all fields match' },
  '01-pass-02':           { status: 'PASS',        advisory: false, note: 'clean scotch import — all fields match' },
  '02-mismatch-01':       { status: 'FAIL',        advisory: false, note: 'brand name mismatch' },
  '02-mismatch-05':       { status: 'FAIL',        advisory: false, note: 'bottler name mismatch' },
  '03-noncompliant-01':   { status: 'PASS',        advisory: true,  note: '800 mL non-standard bottle size' },
  '03-noncompliant-05':   { status: 'PASS',        advisory: true,  note: '"Crafted by" non-standard phrasing' },
  '04-noncompliant-01':   { status: 'PASS',        advisory: true,  note: '400 mL non-standard bottle size' },
  '04-noncompliant-20':   { status: 'PASS',        advisory: true,  note: '"Mountain Ice" fanciful class type' },
  '05-warning-bad-03':    { status: 'FAIL',        advisory: false, note: 'gov warning first sentence only' },
  '05-warning-bad-04':    { status: 'FAIL',        advisory: false, note: 'gov warning incorrect text' },
  '06-warning-sneaky-03': { status: 'REVIEW|FAIL', advisory: false, note: '"a" vs "the" Surgeon General' },
  '06-warning-sneaky-04': { status: 'REVIEW|FAIL', advisory: false, note: '"alcohol" vs "alcoholic" beverages' },
  '07_ABC_Whisky':        { status: 'PASS',        advisory: false, note: 'real label — should all match' },
  '07_Jack_Tennessee_Fire':{ status: 'FAIL',       advisory: false, note: 'net_contents "0 mL" mismatch' },
  '07_lagavulin_islay':   { status: 'FAIL',        advisory: false, note: 'label missing net contents' },
  '07_Stagg':             { status: 'FAIL',        advisory: false, note: 'label missing ABV' },
};

interface TestCase {
  id: string;
  formData: Record<string, unknown>;
  description: string;
  expectedBehavior: string;
  imageBase64: string;
  mimeType: string;
  originalSizeKB: number;
  resizedSizeKB: number;
}

interface RunResult {
  modelId: string;
  caseId: string;
  geminiMs: number;
  overallStatus: OverallStatus | null;
  fieldPass: number;
  fieldWarn: number;
  fieldFail: number;
  advisoryCount: number;
  verdictMatch: boolean;     // status matches expected
  advisoryMatch: boolean;    // advisory fired when expected (or didn't when not expected)
  error: string | null;
  is503: boolean;
  extraction: ExtractionResult | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function findFile(id: string, dir: string, exts: string[]): string | null {
  for (const ext of exts) {
    const p = join(dir, `${id}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

function loadManifest(): Record<string, { form_data: Record<string, unknown>; description: string; expected_behavior: string }> {
  const manifestPath = join(LABELS_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) return {};
  const raw: Array<{ id: string; form_data: Record<string, unknown>; description: string; expected_behavior: string }> =
    JSON.parse(readFileSync(manifestPath, 'utf-8'));
  return Object.fromEntries(raw.map((e) => [e.id, e]));
}

function loadTestCase(id: string, manifest: ReturnType<typeof loadManifest>): Omit<TestCase, 'imageBase64' | 'mimeType' | 'originalSizeKB' | 'resizedSizeKB'> | null {
  const imgPath = findFile(id, LABELS_DIR, ['png', 'PNG', 'jpg', 'JPG', 'jpeg']);
  if (!imgPath) {
    console.warn(`  [skip] ${id} — no image found in ${LABELS_DIR}`);
    return null;
  }

  // Try per-file JSON first (handles lowercase variants like 07_stagg.json vs 07_Stagg)
  const jsonPath = findFile(id, LABELS_DIR, ['json']) ?? findFile(id.toLowerCase(), LABELS_DIR, ['json']);
  let formData: Record<string, unknown>;
  let description = '';
  let expectedBehavior = '';

  if (jsonPath) {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    const { description: d, expected_behavior: eb, ...form } = raw;
    formData = form;
    description = d ?? '';
    expectedBehavior = eb ?? '';
  } else if (manifest[id]) {
    formData = manifest[id].form_data;
    description = manifest[id].description;
    expectedBehavior = manifest[id].expected_behavior;
  } else {
    console.warn(`  [skip] ${id} — no JSON data found`);
    return null;
  }

  return { id, formData, description, expectedBehavior };
}

function is503(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; message?: unknown };
  return e.status === 503 || (typeof e.message === 'string' && /\b503\b/.test(e.message));
}

async function callGemini(modelId: string, imageBase64: string, mimeType: string, apiKey: string): Promise<ExtractionResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId });
  const result = await model.generateContent([
    { inlineData: { data: imageBase64, mimeType: mimeType as 'image/jpeg' } },
    EXTRACTION_PROMPT,
  ]);
  const text = result.response.text().trim();
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(clean) as ExtractionResult;
}

function scoreResult(result: RunResult): string {
  if (result.error) return result.is503 ? '503  ' : 'ERR  ';
  const exp = EXPECTED[result.caseId];
  const statusOk = exp.status === 'REVIEW|FAIL'
    ? result.overallStatus === 'REVIEW' || result.overallStatus === 'FAIL'
    : result.overallStatus === exp.status;
  return statusOk ? '✓    ' : '✗    ';
}

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

function rpad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set — run with --env-file=.env.local');

  console.log('\nMODEL BENCHMARK — TTB Label Verifier');
  console.log(`${MODELS.length} models × ${TEST_IDS.length} test cases\n`);

  // ── Step 1: Load and preprocess all images once ──────────────────────────
  console.log('Preprocessing images...');
  const manifest = loadManifest();
  const testCases: TestCase[] = [];

  for (const id of TEST_IDS) {
    const base = loadTestCase(id, manifest);
    if (!base) continue;

    const imgPath = findFile(id, LABELS_DIR, ['png', 'PNG', 'jpg', 'JPG', 'jpeg'])!;
    const imgBuffer = readFileSync(imgPath);
    const preprocessed = await preprocessImage(imgBuffer);
    const imageBase64 = preprocessed.buffer.toString('base64');

    testCases.push({
      ...base,
      imageBase64,
      mimeType: preprocessed.mimeType,
      originalSizeKB: preprocessed.originalSizeKB,
      resizedSizeKB: preprocessed.resizedSizeKB,
    });
    process.stdout.write(`  ${id.padEnd(30)} ${preprocessed.originalSizeKB} KB → ${preprocessed.resizedSizeKB} KB\n`);
  }

  console.log(`\n${testCases.length} cases ready.\n`);

  // ── Step 2: Run each model ────────────────────────────────────────────────
  const allResults: RunResult[] = [];

  for (const { id: modelId, short: modelShort } of MODELS) {
    console.log(`${'─'.repeat(70)}`);
    console.log(`Running ${modelId}...`);
    console.log(`${'─'.repeat(70)}`);

    let modelOk = 0;
    let modelErrors = 0;
    let model503s = 0;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const label = `[${String(i + 1).padStart(2)}/${testCases.length}] ${tc.id.padEnd(28)}`;
      process.stdout.write(`  ${label} `);

      const t0 = Date.now();
      let extraction: ExtractionResult | null = null;
      let errorMsg: string | null = null;
      let errorIs503 = false;

      try {
        extraction = await callGemini(modelId, tc.imageBase64, tc.mimeType, apiKey);
      } catch (err) {
        errorIs503 = is503(err);
        errorMsg = err instanceof Error ? err.message.slice(0, 80) : String(err);
        if (errorIs503) model503s++;
        modelErrors++;
      }

      const geminiMs = Date.now() - t0;

      let overallStatus: OverallStatus | null = null;
      let fieldPass = 0, fieldWarn = 0, fieldFail = 0, advisoryCount = 0;

      if (extraction) {
        const { fields, advisories } = validateSpiritsLabel(tc.formData as unknown as Parameters<typeof validateSpiritsLabel>[0], extraction);
        advisoryCount = advisories.length;
        for (const f of fields) {
          if (f.status === 'pass') fieldPass++;
          else if (f.status === 'warning') fieldWarn++;
          else if (f.status === 'fail' || f.status === 'missing') fieldFail++;
        }
        const hasFailures = fields.some((f) => f.status === 'fail' || f.status === 'missing');
        const hasWarnings = fields.some((f) => f.status === 'warning');
        overallStatus = hasFailures ? 'FAIL' : hasWarnings ? 'REVIEW' : 'PASS';
      }

      const exp = EXPECTED[tc.id];
      const statusOk = overallStatus !== null && (
        exp.status === 'REVIEW|FAIL'
          ? overallStatus === 'REVIEW' || overallStatus === 'FAIL'
          : overallStatus === exp.status
      );
      const advisoryOk = exp.advisory ? advisoryCount > 0 : !exp.advisory || advisoryCount === 0;

      const result: RunResult = {
        modelId, caseId: tc.id, geminiMs,
        overallStatus, fieldPass, fieldWarn, fieldFail, advisoryCount,
        verdictMatch: statusOk, advisoryMatch: advisoryOk,
        error: errorMsg, is503: errorIs503, extraction,
      };
      allResults.push(result);

      if (errorMsg) {
        process.stdout.write(`${errorIs503 ? '503 ' : 'ERR '}  ${geminiMs}ms  ${errorMsg.slice(0, 50)}\n`);
      } else {
        const mark = statusOk ? '✓' : '✗';
        const advMark = exp.advisory ? (advisoryOk ? '+adv' : '-adv') : '    ';
        process.stdout.write(
          `${mark} ${(overallStatus ?? '?').padEnd(6)}  ${rpad(geminiMs, 5)}ms  ` +
          `f=${fieldFail} w=${fieldWarn} p=${fieldPass}  adv=${advisoryCount} ${advMark}\n`
        );
        if (statusOk && advisoryOk) modelOk++;
      }
    }

    console.log(`\n  ${modelShort}: ${modelOk}/${testCases.length} correct | ${modelErrors} errors (${model503s}×503)\n`);
  }

  // ── Step 3: Summary table ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('SUMMARY');
  console.log('═'.repeat(90));
  console.log(pad('Model', 26) + pad('Correct', 10) + pad('Adv✓', 8) + pad('AvgMs', 8) + pad('P50ms', 8) + pad('Errors', 10));
  console.log('─'.repeat(70));

  for (const { id: modelId, short: modelShort } of MODELS) {
    const results = allResults.filter((r) => r.modelId === modelId);
    const correct = results.filter((r) => r.verdictMatch && !r.error).length;
    const advOk = results.filter((r) => r.advisoryMatch && !r.error).length;
    const errors = results.filter((r) => r.error).length;
    const errs503 = results.filter((r) => r.is503).length;
    const times = results.filter((r) => !r.error).map((r) => r.geminiMs).sort((a, b) => a - b);
    const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
    const p50 = times.length ? times[Math.floor(times.length / 2)] : 0;
    console.log(
      pad(modelShort.trim(), 26) +
      pad(`${correct}/${results.length}`, 10) +
      pad(`${advOk}/${results.length}`, 8) +
      pad(avg + 'ms', 8) +
      pad(p50 + 'ms', 8) +
      `${errors} (${errs503}×503)`
    );
  }

  // ── Step 4: Cross-model matrix ────────────────────────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('CROSS-MODEL MATRIX  (✓=correct  ✗=wrong  503=API error  ERR=other error)');
  console.log('═'.repeat(90));

  const shortNames = MODELS.map((m) => m.short);
  const COL = 16;

  // Header
  process.stdout.write(pad('Case', 28) + pad('Expected', 14));
  for (const s of shortNames) process.stdout.write(pad(s, COL));
  console.log();
  console.log('─'.repeat(28 + 14 + COL * MODELS.length));

  for (const tc of testCases) {
    const exp = EXPECTED[tc.id];
    process.stdout.write(pad(tc.id, 28) + pad(exp.status, 14));

    for (const { id: modelId } of MODELS) {
      const r = allResults.find((x) => x.modelId === modelId && x.caseId === tc.id);
      if (!r) { process.stdout.write(pad('—', COL)); continue; }

      if (r.error) {
        const tag = r.is503 ? '503' : 'ERR';
        process.stdout.write(pad(`${tag} ${r.geminiMs}ms`, COL));
      } else {
        const mark = r.verdictMatch ? '✓' : '✗';
        const advTag = exp.advisory ? (r.advisoryMatch ? '+' : '-') : '';
        process.stdout.write(pad(`${mark}${advTag}${r.overallStatus} ${r.geminiMs}ms`, COL));
      }
    }
    console.log();
  }

  // ── Step 5: Per-model compliance advisory breakdown ───────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('COMPLIANCE ADVISORY DETECTION  (cases 03/04 expect ≥1 advisory; others expect 0)');
  console.log('═'.repeat(90));
  console.log(pad('Case', 28) + pad('Exp adv', 9) + MODELS.map((m) => pad(m.short, 12)).join(''));
  console.log('─'.repeat(28 + 9 + 12 * MODELS.length));

  for (const tc of testCases) {
    const exp = EXPECTED[tc.id];
    process.stdout.write(pad(tc.id, 28) + pad(exp.advisory ? 'YES' : 'no', 9));
    for (const { id: modelId } of MODELS) {
      const r = allResults.find((x) => x.modelId === modelId && x.caseId === tc.id);
      if (!r || r.error) { process.stdout.write(pad('ERR', 12)); continue; }
      const mark = r.advisoryMatch ? '✓' : '✗';
      process.stdout.write(pad(`${mark} ${r.advisoryCount} adv`, 12));
    }
    console.log();
  }

  // ── Step 6: Extraction field quality spot-check ───────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('EXTRACTION SPOT-CHECK  (pass/warn/fail field counts for each run)');
  console.log('═'.repeat(90));
  console.log(pad('Case', 28) + MODELS.map((m) => pad(m.short + '(p/w/f)', 18)).join(''));
  console.log('─'.repeat(28 + 18 * MODELS.length));

  for (const tc of testCases) {
    process.stdout.write(pad(tc.id, 28));
    for (const { id: modelId } of MODELS) {
      const r = allResults.find((x) => x.modelId === modelId && x.caseId === tc.id);
      if (!r || r.error) { process.stdout.write(pad('ERR', 18)); continue; }
      process.stdout.write(pad(`${r.fieldPass}/${r.fieldWarn}/${r.fieldFail}`, 18));
    }
    console.log();
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`Total Gemini calls: ${MODELS.length * testCases.length}`);

  // ── Step 7: Optional JSON save ─────────────────────────────────────────────
  if (SAVE) {
    const outPath = resolve(ROOT, 'benchmark-results.json');
    writeFileSync(outPath, JSON.stringify({ testCases: testCases.map(({ imageBase64: _, ...rest }) => rest), results: allResults.map(({ extraction: _, ...rest }) => rest) }, null, 2));
    console.log(`\nFull results saved to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
