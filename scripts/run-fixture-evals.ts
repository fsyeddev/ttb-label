/**
 * Runs the manually-generated fixtures through the live verifier and reports
 * per-case PASS/FAIL against category-level expectations.
 *
 * Prereq: dev server running at http://localhost:3000 (or pass --url).
 *
 * Run:
 *   npm run eval:fixtures
 *   npm run eval:fixtures -- --url=https://cola-verify.vercel.app
 *   npm run eval:fixtures -- --only 01-pass-01,02-mismatch-01
 *   npm run eval:fixtures -- --verbose
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIXTURES_DIR = resolve(ROOT, 'evals', 'fixtures', 'generated');
const MANIFEST = resolve(FIXTURES_DIR, 'manifest.json');

interface TestCase {
  id: string;
  category: number;
  description: string;
  form_data: Record<string, unknown>;
  expected_behavior: string;
}

interface AnalysisResponse {
  overallStatus: 'PASS' | 'FAIL' | 'REVIEW';
  fields: Array<{ field: string; status: string; note?: string }>;
  advisories: Array<{ id: string; severity: string; title: string }>;
  processingMs: number;
  error?: string;
}

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const urlArg = args.find((a) => a.startsWith('--url'));
const baseUrl = urlArg ? (urlArg.includes('=') ? urlArg.split('=')[1] : args[args.indexOf(urlArg) + 1]) : 'http://localhost:3000';
const onlyArg = args.find((a) => a.startsWith('--only'));
const onlyIds = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

// The 30 fixtures the user manually generated
const GENERATED_IDS = [
  '01-pass-01', '01-pass-02', '01-pass-03',
  '02-mismatch-01', '02-mismatch-02', '02-mismatch-03', '02-mismatch-04', '02-mismatch-05',
  '03-noncompliant-01', '03-noncompliant-02', '03-noncompliant-03', '03-noncompliant-04', '03-noncompliant-05',
  '04-noncompliant-01', '04-noncompliant-04', '04-noncompliant-06', '04-noncompliant-09', '04-noncompliant-12',
  '04-noncompliant-14', '04-noncompliant-16', '04-noncompliant-18', '04-noncompliant-20',
  '05-warning-bad-01', '05-warning-bad-02', '05-warning-bad-03', '05-warning-bad-04',
  '06-warning-sneaky-01', '06-warning-sneaky-02', '06-warning-sneaky-03', '06-warning-sneaky-04',
];

interface Expectation {
  overall: Array<'PASS' | 'FAIL' | 'REVIEW'>;
  failedFieldsMin?: number;
  failedFieldsMax?: number;
  advisoriesMin?: number;
  advisoriesMax?: number;
  govWarningMustFail?: boolean;
  description: string;
}

function expectationForCategory(category: number, id: string): Expectation {
  switch (category) {
    case 1:
      return {
        overall: ['PASS'],
        failedFieldsMax: 0,
        advisoriesMax: 0,
        description: 'green PASS, no advisories',
      };
    case 2:
      return {
        overall: ['FAIL', 'REVIEW'],
        failedFieldsMin: 1,
        description: 'at least one field mismatch',
      };
    case 3:
      return {
        overall: ['PASS', 'REVIEW'],
        failedFieldsMax: 0,
        advisoriesMin: 1,
        description: 'cross-validation passes, ≥1 advisory',
      };
    case 4:
      return {
        overall: ['PASS', 'REVIEW'],
        failedFieldsMax: 0,
        advisoriesMin: 1,
        description: 'cross-validation passes, ≥1 advisory',
      };
    case 5:
      return {
        overall: ['FAIL'],
        govWarningMustFail: true,
        description: 'gov warning hard fail',
      };
    case 6:
      return {
        overall: ['FAIL', 'REVIEW', 'PASS'],
        description: 'subtle gov warning — agent judges (any outcome shown)',
      };
    default:
      throw new Error(`Unknown category ${category} for ${id}`);
  }
}

function judge(actual: AnalysisResponse, exp: Expectation): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!exp.overall.includes(actual.overallStatus)) {
    reasons.push(`overall ${actual.overallStatus} not in [${exp.overall.join('|')}]`);
  }
  const failed = actual.fields.filter((f) => f.status === 'fail').length;
  if (exp.failedFieldsMin !== undefined && failed < exp.failedFieldsMin) {
    reasons.push(`failed=${failed}, expected ≥${exp.failedFieldsMin}`);
  }
  if (exp.failedFieldsMax !== undefined && failed > exp.failedFieldsMax) {
    reasons.push(`failed=${failed}, expected ≤${exp.failedFieldsMax}`);
  }
  const advCount = actual.advisories?.length ?? 0;
  if (exp.advisoriesMin !== undefined && advCount < exp.advisoriesMin) {
    reasons.push(`advisories=${advCount}, expected ≥${exp.advisoriesMin}`);
  }
  if (exp.advisoriesMax !== undefined && advCount > exp.advisoriesMax) {
    reasons.push(`advisories=${advCount}, expected ≤${exp.advisoriesMax}`);
  }
  if (exp.govWarningMustFail) {
    const gov = actual.fields.find((f) => f.field === 'government_warning');
    if (!gov || gov.status !== 'fail') {
      reasons.push(`gov_warning expected FAIL, got ${gov?.status ?? 'missing'}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

async function runOne(c: TestCase): Promise<{ id: string; ok: boolean; reasons: string[]; actual?: AnalysisResponse; error?: string }> {
  const imgPath = resolve(FIXTURES_DIR, `${c.id}.png`);
  if (!existsSync(imgPath)) {
    return { id: c.id, ok: false, reasons: [`image missing: ${imgPath}`] };
  }
  const imgBytes = readFileSync(imgPath);
  const form = new FormData();
  form.append('labelImage', new Blob([imgBytes], { type: 'image/png' }), `${c.id}.png`);
  form.append('applicationData', JSON.stringify(c.form_data));

  try {
    const res = await fetch(`${baseUrl}/api/analyze`, { method: 'POST', body: form });
    const json = (await res.json()) as AnalysisResponse;
    if (!res.ok || json.error) {
      return { id: c.id, ok: false, reasons: [`server error: ${json.error ?? res.status}`] };
    }
    const exp = expectationForCategory(c.category, c.id);
    const { ok, reasons } = judge(json, exp);
    return { id: c.id, ok, reasons, actual: json };
  } catch (err) {
    return { id: c.id, ok: false, reasons: [`fetch error: ${(err as Error).message}`] };
  }
}

async function main() {
  if (!existsSync(MANIFEST)) {
    console.error(`Manifest not found: ${MANIFEST}`);
    process.exit(1);
  }
  const manifest: TestCase[] = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
  const ids = onlyIds ?? GENERATED_IDS;
  const cases = manifest.filter((c) => ids.includes(c.id));

  console.log(`Running ${cases.length} cases against ${baseUrl}`);
  console.log(''.padEnd(70, '─'));

  const start = Date.now();
  const results: Awaited<ReturnType<typeof runOne>>[] = [];

  // Sequential — Gemini is rate-limited and we want clean output
  for (const c of cases) {
    process.stdout.write(`[${c.id}] ${c.description.slice(0, 50).padEnd(50)} … `);
    const r = await runOne(c);
    results.push(r);

    if (r.ok) {
      const adv = r.actual?.advisories?.length ?? 0;
      const failed = r.actual?.fields.filter((f) => f.status === 'fail').length ?? 0;
      console.log(`✓ ${r.actual?.overallStatus ?? '-'}  failed=${failed}  adv=${adv}`);
    } else {
      console.log(`✗ ${r.reasons.join('; ')}`);
    }

    if (verbose && r.actual) {
      const failed = r.actual.fields.filter((f) => f.status === 'fail');
      for (const f of failed) console.log(`     ↳ ${f.field}: ${f.note ?? '(fail)'}`);
      for (const a of r.actual.advisories ?? []) console.log(`     ⚠ [${a.severity}] ${a.title}`);
    }
  }

  console.log(''.padEnd(70, '─'));
  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s — ${ok}/${cases.length} matched expectations`);

  if (fail > 0) {
    console.log('\nMismatches by category:');
    const byCategory = new Map<number, string[]>();
    for (const r of results.filter((r) => !r.ok)) {
      const c = manifest.find((m) => m.id === r.id);
      if (!c) continue;
      const list = byCategory.get(c.category) ?? [];
      list.push(`${r.id}: ${r.reasons.join('; ')}`);
      byCategory.set(c.category, list);
    }
    for (const [cat, items] of [...byCategory.entries()].sort()) {
      console.log(`\n  Category ${cat}:`);
      for (const item of items) console.log(`    ${item}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
