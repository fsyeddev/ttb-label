import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { extractLabelData } from '@/lib/gemini';
import { preprocessImage } from '@/lib/image-preprocess';
import { validateSpiritsLabel } from '@/lib/validators/spirits';
import type { AnalysisResponse, AnalysisTimings, OverallStatus } from '@/types/cola';

export async function POST(req: NextRequest) {
  const start = Date.now();
  // Per-phase markers so the response carries a breakdown of where time went.
  // Surfaced via response.timings; the client logs them to the browser console.
  let formParseMs = 0;
  let imageDecodeMs = 0;
  let imagePreprocessMs = 0;
  let geminiExtractionMs = 0;
  let validationMs = 0;
  let imageSizeKB = 0;
  let resizedSizeKB = 0;

  try {
    const t0 = Date.now();
    const formData = await req.formData();
    formParseMs = Date.now() - t0;

    // --- Image ---
    const imageFile = formData.get('labelImage') as File | null;
    if (!imageFile) {
      return NextResponse.json({ error: 'No label image provided.' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Unsupported image format. Please upload JPEG, PNG, or WEBP.' },
        { status: 400 }
      );
    }

    if (imageFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image file too large. Maximum size is 10 MB.' }, { status: 400 });
    }

    imageSizeKB = Math.round(imageFile.size / 1024);

    // Decode the uploaded image
    const t1 = Date.now();
    const imageBytes = await imageFile.arrayBuffer();
    imageDecodeMs = Date.now() - t1;

    // Resize to max 1280px on the longest edge and re-encode as JPEG before
    // sending to Gemini. Typical phone photos are 3–12 MB; after preprocessing
    // they land at 100–400 KB, cutting Gemini payload and round-trip time.
    const t1b = Date.now();
    const preprocessed = await preprocessImage(Buffer.from(imageBytes));
    imagePreprocessMs = Date.now() - t1b;
    resizedSizeKB = preprocessed.resizedSizeKB;

    const imageBase64 = preprocessed.buffer.toString('base64');
    const imageMimeType = preprocessed.mimeType;

    // --- Application Form Data ---
    const applicationRaw = formData.get('applicationData') as string | null;
    if (!applicationRaw) {
      return NextResponse.json({ error: 'No application data provided.' }, { status: 400 });
    }

    let applicationData;
    try {
      applicationData = JSON.parse(applicationRaw);
    } catch {
      return NextResponse.json({ error: 'Invalid application data format.' }, { status: 400 });
    }

    // --- Gemini Extraction ---
    const t2 = Date.now();
    const extraction = await extractLabelData(imageBase64, imageMimeType);
    geminiExtractionMs = Date.now() - t2;

    // --- Validation (cross-validation fields + compliance advisories) ---
    const t3 = Date.now();
    const { fields, advisories } = validateSpiritsLabel(applicationData, extraction);
    validationMs = Date.now() - t3;

    // --- Determine overall status — derived from FieldResult[] only.
    // Advisories are informational and never affect the headline verdict. ---
    const hasFailures = fields.some((f) => f.status === 'fail');
    const hasWarnings = fields.some((f) => f.status === 'warning');
    let overallStatus: OverallStatus = 'PASS';
    if (hasFailures) overallStatus = 'FAIL';
    else if (hasWarnings) overallStatus = 'REVIEW';

    const totalServerMs = Date.now() - start;
    const timings: AnalysisTimings = {
      formParseMs,
      imageDecodeMs,
      imagePreprocessMs,
      geminiExtractionMs,
      validationMs,
      totalServerMs,
      imageSizeKB,
      resizedSizeKB,
    };

    const response: AnalysisResponse = {
      jobId: uuidv4(),
      processingMs: totalServerMs,
      fields,
      advisories,
      overallStatus,
      extraction,
      timings,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[/api/analyze]', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
