import type { OCRBlock } from './calendar-parser';

// Placeholder for Google Cloud Vision API integration
// In production, you'd either:
// 1. Call the Vision API directly with an API key
// 2. Use a Firebase Cloud Function as a proxy
// 3. Use expo-text-extractor for on-device OCR

const VISION_API_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

export async function extractTextFromImage(
  base64Image: string,
  apiKey: string,
): Promise<OCRBlock[]> {
  const requestBody = {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      },
    ],
  };

  const response = await fetch(`${VISION_API_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Vision API error: ${response.status}`);
  }

  const data = await response.json();
  const annotations = data.responses?.[0]?.textAnnotations;

  if (!annotations || annotations.length === 0) {
    return [];
  }

  // Skip first annotation (full text), map rest to OCRBlocks
  return annotations.slice(1).map((annotation: any) => {
    const vertices = annotation.boundingPoly?.vertices ?? [];
    const xs = vertices.map((v: any) => v.x ?? 0);
    const ys = vertices.map((v: any) => v.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      text: annotation.description ?? '',
      boundingBox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  });
}

/**
 * Stub for on-device OCR (no API key needed).
 * Returns empty results — implement with expo-text-extractor or ML Kit when ready.
 */
export async function extractTextOnDevice(_imageUri: string): Promise<OCRBlock[]> {
  // TODO: Integrate expo-text-extractor or react-native-mlkit-ocr
  return [];
}
