import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { preprocessImage } from '@/lib/image-preprocess';

// Create a synthetic solid-colour JPEG of the given dimensions
async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('preprocessImage', () => {
  it('downsizes a landscape image so the longest edge is ≤ 1280px', async () => {
    const input = await makeJpeg(3024, 4032); // portrait phone photo
    const result = await preprocessImage(input);
    expect(result.resizedWidth).toBeLessThanOrEqual(1280);
    expect(result.resizedHeight).toBeLessThanOrEqual(1280);
    expect(Math.max(result.resizedWidth, result.resizedHeight)).toBe(1280);
  });

  it('preserves aspect ratio after resize', async () => {
    const input = await makeJpeg(4000, 2000); // 2:1 landscape
    const result = await preprocessImage(input);
    const ratio = result.resizedWidth / result.resizedHeight;
    expect(ratio).toBeCloseTo(2, 1);
  });

  it('does not upscale images already within the limit', async () => {
    const input = await makeJpeg(800, 600);
    const result = await preprocessImage(input);
    expect(result.resizedWidth).toBe(800);
    expect(result.resizedHeight).toBe(600);
  });

  it('always outputs JPEG regardless of input format', async () => {
    const pngInput = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 128, b: 0 } },
    })
      .png()
      .toBuffer();
    const result = await preprocessImage(pngInput);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('reports correct original and resized dimensions', async () => {
    const input = await makeJpeg(2560, 1920);
    const result = await preprocessImage(input);
    expect(result.originalWidth).toBe(2560);
    expect(result.originalHeight).toBe(1920);
    expect(result.resizedWidth).toBe(1280);
    expect(result.resizedHeight).toBe(960);
  });

  it('reduces file size for large images', async () => {
    const input = await makeJpeg(4032, 3024);
    const result = await preprocessImage(input);
    expect(result.resizedSizeKB).toBeLessThan(result.originalSizeKB);
  });
});
