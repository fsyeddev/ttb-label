import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ExtractionResult } from '@/types/cola';

export const GEMINI_503_RETRY_DELAYS_MS = [5000, 10000];

function is503Error(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; message?: unknown };
  if (e.status === 503) return true;
  if (typeof e.message === 'string' && /\b503\b/.test(e.message)) return true;
  return false;
}

async function callWithRetryOn503<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!is503Error(err) || attempt >= GEMINI_503_RETRY_DELAYS_MS.length) throw err;
      const delayMs = GEMINI_503_RETRY_DELAYS_MS[attempt];
      console.warn(
        `[gemini] 503 Service Unavailable — retrying in ${delayMs}ms (attempt ${attempt + 1}/${GEMINI_503_RETRY_DELAYS_MS.length})`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt++;
    }
  }
}

const GOVERNMENT_WARNING_OFFICIAL =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

export const EXTRACTION_PROMPT = `You are a TTB (Alcohol and Tobacco Tax and Trade Bureau) label analysis assistant.

Analyze this alcohol beverage label image and extract the following fields. Return ONLY a valid JSON object — no markdown, no explanation.

Return text exactly as it appears on the label, including any errors. Do not normalize, correct, or rewrite text.

Required fields to extract:
- brand_name: The primary brand or trademark name ONLY — the registered trade name under which the product is sold (e.g., "Jack Daniel's", "Jim Beam", "Maker's Mark", "Grey Goose"). Do NOT include the expression, variant, or fanciful name (e.g., for "Jack Daniel's Tennessee Fire" the brand_name is "Jack Daniel's" and "Tennessee Fire" is the fanciful name — omit it here). When in doubt, the brand name is the largest or most prominent name that is also a registered trademark.
- class_type: The legal TTB class and type designation as defined in 27 CFR Part 5 — this is the regulatory product category, NOT the brand expression or fanciful name. It typically appears as smaller regulatory text (e.g., "Cinnamon Liqueur", "Kentucky Straight Bourbon Whiskey", "Vodka", "London Dry Gin"). Fanciful or expression names like "Tennessee Fire", "Black Label", or "Single Barrel" are NOT class/type designations — ignore them. Look for words like LIQUEUR, WHISKEY, VODKA, RUM, GIN used in a regulatory/descriptive context.
- abv: Alcohol by volume as it appears (e.g., "45% Alc./Vol.", "40% alc. by vol.", "80 Proof")
- net_contents: Volume/size of the container (e.g., "750 mL", "1 L", "375 ml")
- bottler_name: Name of the bottler, distiller, or producer
- bottler_address: Address of the bottler/producer (city, state, country)
- country_of_origin: Country where the product was produced (null if not stated, "USA" if domestic)
- government_warning: The full government warning text. If the text wraps across lines with hyphens (e.g., "CONSUMP-\nTION" or "GEN-\nERAL"), remove the hyphen and join the word back together so the result reads "CONSUMPTION" and "GENERAL". Return the complete, continuous text with no line-break artifacts. Return null if not present.
- age_statement: Any explicit age-on-label text such as "Aged 4 Years", "Aged 12 Years", "10 Year Old", or similar. Return the literal phrase. Return null if no age is stated on the label.
- statement_of_composition: For liqueurs, cordials, and Distilled Spirits Specialty products, the descriptive composition sentence near the class designation (e.g., "Cinnamon-flavored whisky with natural flavors", "Cane spirit with botanicals and natural flavors"). Return the literal sentence. Return null if not present.
- state_of_distillation: Any explicit indication of where the spirit was distilled or the country of origin if imported, such as "Distilled in Kentucky", "Distilled in Tennessee", "Product of Scotland", "Produced in Mexico". Return the literal phrase. Return null if not present.
- production_statement: The literal phrase used to attribute production to the bottler/producer (e.g., "Distilled by Old Tom Distillery", "Bottled by ABC Spirits", "Produced and bottled by XYZ", "Imported by..."). Return the full phrase including the producer name. Return null if no production attribution is on the label.
- raw_text: A brief summary of all text visible on the label

Return null for any field you cannot find or read clearly.

Return JSON in this exact shape:
{
  "brand_name": string | null,
  "class_type": string | null,
  "abv": string | null,
  "net_contents": string | null,
  "bottler_name": string | null,
  "bottler_address": string | null,
  "country_of_origin": string | null,
  "government_warning": string | null,
  "age_statement": string | null,
  "statement_of_composition": string | null,
  "state_of_distillation": string | null,
  "production_statement": string | null,
  "raw_text": string | null,
  "confidence": "high" | "medium" | "low"
}`;

export async function extractLabelData(imageBase64: string, mimeType: string): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const result = await callWithRetryOn503(() =>
    model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        },
      },
      EXTRACTION_PROMPT,
    ])
  );

  const text = result.response.text().trim();

  // Strip markdown code fences if Gemini wraps in ```json
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`);
  }

  return parsed;
}

export { GOVERNMENT_WARNING_OFFICIAL };
