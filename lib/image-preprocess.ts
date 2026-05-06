import sharp from 'sharp';

// Gemini processes images at an effective resolution of roughly 1024–1568px on
// the longest edge. Resizing above that adds payload bytes with no accuracy gain
// and noticeably increases round-trip time. 1280px is a comfortable ceiling that
// keeps detail while cutting typical phone-photo payloads by ~85–90%.
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 85;

export interface PreprocessResult {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  originalWidth: number;
  originalHeight: number;
  resizedWidth: number;
  resizedHeight: number;
  originalSizeKB: number;
  resizedSizeKB: number;
}

export async function preprocessImage(input: Buffer): Promise<PreprocessResult> {
  const img = sharp(input);
  const { width = 0, height = 0 } = await img.metadata();

  const longestEdge = Math.max(width, height);
  const scale = longestEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longestEdge : 1;
  const resizedWidth = Math.round(width * scale);
  const resizedHeight = Math.round(height * scale);

  const outputBuffer = await sharp(input)
    .resize(resizedWidth, resizedHeight, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return {
    buffer: outputBuffer,
    mimeType: 'image/jpeg',
    originalWidth: width,
    originalHeight: height,
    resizedWidth,
    resizedHeight,
    originalSizeKB: Math.round(input.byteLength / 1024),
    resizedSizeKB: Math.round(outputBuffer.byteLength / 1024),
  };
}
