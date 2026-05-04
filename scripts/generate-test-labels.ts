/**
 * Reads ../../test_data.json (60-case array produced by Gemini),
 * writes per-case fixtures and generates label images via Gemini Image Gen.
 *
 * Output:
 *   evals/fixtures/generated/<id>.json   — form_data only (drop-in for the form import)
 *   evals/fixtures/generated/<id>.png    — generated label image
 *   evals/fixtures/generated/manifest.json — full array with expected_behavior
 *
 * Resumes safely: skips any <id>.png that already exists.
 *
 * Run:
 *   npm run generate:labels
 *   npm run generate:labels -- --only 01-pass-01,02-mismatch-03
 *   npm run generate:labels -- --dry-run
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INPUT = resolve(ROOT, '..', 'test_data.json');
const OUT_DIR = resolve(ROOT, 'evals', 'fixtures', 'generated');

const IMAGE_MODEL = 'gpt-image-1';
const IMAGE_SIZE = '1024x1024';
const IMAGE_QUALITY = 'high'; // 'low' | 'medium' | 'high' — high renders label text legibly (~$0.167/image)
const CONCURRENCY = 3; // gentle on rate limits
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

interface TestCase {
  id: string;
  category: number;
  description: string;
  form_data: Record<string, unknown>;
  image_prompt: string;
  expected_behavior: string;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only'));
const onlyIds = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey && !dryRun) {
  console.error('OPENAI_API_KEY missing. Set it in .env.local or export it.');
  process.exit(1);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
if (!existsSync(INPUT)) {
  console.error(`Input not found: ${INPUT}`);
  process.exit(1);
}

const cases: TestCase[] = JSON.parse(readFileSync(INPUT, 'utf-8'));
const filtered = onlyIds ? cases.filter((c) => onlyIds.includes(c.id)) : cases;

console.log(`Loaded ${cases.length} cases. Processing ${filtered.length}.`);
if (dryRun) console.log('DRY RUN — no images will be generated.');

writeFileSync(
  resolve(OUT_DIR, 'manifest.json'),
  JSON.stringify(cases, null, 2),
);

async function generateImage(prompt: string): Promise<Buffer> {
  const url = 'https://api.openai.com/v1/images/generations';
  const body = {
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: IMAGE_SIZE,
    quality: IMAGE_QUALITY,
  };

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = await res.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('No b64_json in response');
      return Buffer.from(b64, 'base64');
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        console.warn(`  retry ${attempt}/${MAX_RETRIES} after ${delay}ms: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function processCase(c: TestCase): Promise<{ id: string; status: 'ok' | 'skip' | 'fail'; error?: string }> {
  const jsonPath = resolve(OUT_DIR, `${c.id}.json`);
  const imgPath = resolve(OUT_DIR, `${c.id}.png`);

  writeFileSync(jsonPath, JSON.stringify(c.form_data, null, 2));

  if (existsSync(imgPath)) return { id: c.id, status: 'skip' };
  if (dryRun) return { id: c.id, status: 'skip' };

  try {
    const buf = await generateImage(c.image_prompt);
    writeFileSync(imgPath, buf);
    return { id: c.id, status: 'ok' };
  } catch (err) {
    return { id: c.id, status: 'fail', error: (err as Error).message };
  }
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const start = Date.now();
  const results = await runWithConcurrency(filtered, CONCURRENCY, async (c) => {
    process.stdout.write(`→ ${c.id} (${c.description.slice(0, 60)})\n`);
    const r = await processCase(c);
    const tag = r.status === 'ok' ? '✓' : r.status === 'skip' ? '·' : '✗';
    process.stdout.write(`  ${tag} ${r.id}${r.error ? ` — ${r.error}` : ''}\n`);
    return r;
  });

  const ok = results.filter((r) => r.status === 'ok').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('---');
  console.log(`Done in ${elapsed}s — ok: ${ok}, skip: ${skip}, fail: ${fail}`);

  if (fail > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(`  ${r.id}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
