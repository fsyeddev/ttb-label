import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { extractLabelData } from '@/lib/gemini';
import { validateSpiritsLabel } from '@/lib/validators/spirits';
import type { AnalysisResponse, OverallStatus } from '@/types/cola';

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    const formData = await req.formData();

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

    // Convert to base64 for Gemini
    const imageBytes = await imageFile.arrayBuffer();
    const imageBase64 = Buffer.from(imageBytes).toString('base64');

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
    const extraction = await extractLabelData(imageBase64, imageFile.type);

    // --- Validation ---
    const fields = validateSpiritsLabel(applicationData, extraction);

    // --- Determine overall status ---
    const hasFailures = fields.some((f) => f.status === 'fail');
    const hasWarnings = fields.some((f) => f.status === 'warning');
    let overallStatus: OverallStatus = 'PASS';
    if (hasFailures) overallStatus = 'FAIL';
    else if (hasWarnings) overallStatus = 'REVIEW';

    const response: AnalysisResponse = {
      jobId: uuidv4(),
      processingMs: Date.now() - start,
      fields,
      overallStatus,
      extraction,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[/api/analyze]', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
