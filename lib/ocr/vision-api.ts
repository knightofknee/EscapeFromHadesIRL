import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { OCRBlock } from './calendar-parser';

/**
 * On-device text recognition using Google ML Kit.
 * No API key needed — runs entirely on device.
 */
export async function extractTextFromImage(imageUri: string): Promise<OCRBlock[]> {
  const result = await TextRecognition.recognize(imageUri);

  if (!result?.blocks?.length) {
    return [];
  }

  return result.blocks.map((block) => ({
    text: block.text,
    boundingBox: {
      x: block.frame?.left ?? 0,
      y: block.frame?.top ?? 0,
      width: block.frame?.width ?? 0,
      height: block.frame?.height ?? 0,
    },
  }));
}
