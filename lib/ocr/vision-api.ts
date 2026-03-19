import { createWorker, type Worker } from 'tesseract.js';
import type { OCRBlock } from './calendar-parser';

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('eng');
  }
  return worker;
}

/**
 * OCR using tesseract.js — pure JS, works on simulator and device.
 * Downloads language data on first use (~2MB), then cached.
 */
export async function extractTextFromImage(imageUri: string): Promise<OCRBlock[]> {
  const w = await getWorker();
  const { data } = await w.recognize(imageUri);

  if (!data?.blocks?.length) {
    return [];
  }

  return data.blocks.map((block) => ({
    text: block.text,
    boundingBox: {
      x: block.bbox.x0,
      y: block.bbox.y0,
      width: block.bbox.x1 - block.bbox.x0,
      height: block.bbox.y1 - block.bbox.y0,
    },
  }));
}
