import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  },
}));

import { extractLabelData, GEMINI_503_RETRY_DELAYS_MS } from '@/lib/gemini';

const VALID_PAYLOAD = {
  brand_name: 'Test Brand',
  class_type: 'Vodka',
  abv: '40% Alc./Vol.',
  net_contents: '750 mL',
  bottler_name: 'Test Co.',
  bottler_address: 'Anywhere, USA',
  country_of_origin: 'USA',
  government_warning: null,
  age_statement: null,
  statement_of_composition: null,
  state_of_distillation: null,
  production_statement: null,
  raw_text: 'Test',
  confidence: 'high' as const,
};

const successResponse = () => ({
  response: { text: () => JSON.stringify(VALID_PAYLOAD) },
});

const error503 = () => {
  const err = new Error('[GoogleGenerativeAI Error]: fetch failed [503 Service Unavailable] model is currently experiencing high demand') as Error & { status?: number };
  err.status = 503;
  return err;
};

const error500 = () => {
  const err = new Error('[GoogleGenerativeAI Error]: fetch failed [500 Internal Server Error]') as Error & { status?: number };
  err.status = 500;
  return err;
};

describe('extractLabelData — Gemini 503 retry (INFRA-04)', () => {
  let originalApiKey: string | undefined;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('uses a [5000, 10000] ms retry schedule (named constant, no magic numbers)', () => {
    expect(GEMINI_503_RETRY_DELAYS_MS).toEqual([5000, 10000]);
  });

  it('retries on 503 once and succeeds', async () => {
    mockGenerateContent
      .mockImplementationOnce(async () => { throw error503(); })
      .mockImplementationOnce(async () => successResponse());

    const promise = extractLabelData('fakebase64', 'image/png');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.brand_name).toBe('Test Brand');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('503');
    expect(warnSpy.mock.calls[0][0]).toContain('attempt 1/2');
  });

  it('retries on 503 twice and succeeds', async () => {
    mockGenerateContent
      .mockImplementationOnce(async () => { throw error503(); })
      .mockImplementationOnce(async () => { throw error503(); })
      .mockImplementationOnce(async () => successResponse());

    const promise = extractLabelData('fakebase64', 'image/png');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.brand_name).toBe('Test Brand');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[1][0]).toContain('attempt 2/2');
  });

  it('gives up after exhausting retries and rethrows the 503 unchanged (no wrapper)', async () => {
    const err = error503();
    // Same instance thrown each time — proves the rethrown error is the SDK
    // error, not a "all retries failed" wrapper.
    mockGenerateContent.mockImplementation(async () => { throw err; });

    const promise = extractLabelData('fakebase64', 'image/png');
    // Attach the rejection handler synchronously, before running timers, so the
    // promise has an owner the moment it rejects (avoids a transient unhandled
    // rejection while fake timers are still draining).
    const assertion = expect(promise).rejects.toBe(err);
    await vi.runAllTimersAsync();
    await assertion;

    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-503 error (e.g., 500) — first error throws immediately', async () => {
    const err = error500();
    mockGenerateContent.mockImplementationOnce(async () => { throw err; });

    await expect(extractLabelData('fakebase64', 'image/png')).rejects.toBe(err);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('detects 503 from message text when status is missing (resilience to wrapping)', async () => {
    // Some wrappers strip the structured `status` field. Detection must still fire on the message.
    const wrapped = new Error('upstream call failed: 503 Service Unavailable');
    mockGenerateContent
      .mockImplementationOnce(async () => { throw wrapped; })
      .mockImplementationOnce(async () => successResponse());

    const promise = extractLabelData('fakebase64', 'image/png');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.brand_name).toBe('Test Brand');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
