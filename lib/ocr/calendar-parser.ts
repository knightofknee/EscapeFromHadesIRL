export type OCRBlock = {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type ParsedCalendarDay = {
  date: string; // YYYY-MM-DD
  marks: string[]; // detected text/marks for that day
};

export type ParsedCalendar = {
  days: ParsedCalendarDay[];
  rawBlocks: OCRBlock[];
  confidence: number;
};

/**
 * Parses OCR blocks from an image into a calendar structure.
 * This is a heuristic parser — it looks for patterns like:
 * - Numbers 1-31 (day numbers)
 * - Short text near day numbers (habit marks)
 * - Grid-like layout patterns
 */
export function parseCalendarBlocks(
  blocks: OCRBlock[],
  year: number,
  month: number, // 0-indexed
): ParsedCalendar {
  // Find day number blocks (1-31)
  const dayBlocks = blocks.filter((b) => {
    const num = parseInt(b.text.trim(), 10);
    return !isNaN(num) && num >= 1 && num <= 31;
  });

  // Sort by position (top-to-bottom, left-to-right)
  dayBlocks.sort((a, b) => {
    const rowDiff = Math.round(a.boundingBox.y / 50) - Math.round(b.boundingBox.y / 50);
    if (rowDiff !== 0) return rowDiff;
    return a.boundingBox.x - b.boundingBox.x;
  });

  // For each day number, find nearby text blocks that aren't other day numbers
  const dayNumbers = new Set(dayBlocks.map((b) => b.text.trim()));
  const markBlocks = blocks.filter((b) => !dayNumbers.has(b.text.trim()));

  const days: ParsedCalendarDay[] = dayBlocks.map((dayBlock) => {
    const dayNum = parseInt(dayBlock.text.trim(), 10);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    // Find marks near this day number (within a reasonable radius)
    const nearbyMarks = markBlocks.filter((mark) => {
      const dx = mark.boundingBox.x - dayBlock.boundingBox.x;
      const dy = mark.boundingBox.y - dayBlock.boundingBox.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < 150 && dy > -20; // Below or slightly above the day number
    });

    return {
      date: dateStr,
      marks: nearbyMarks.map((m) => m.text.trim()).filter(Boolean),
    };
  });

  const confidence = dayBlocks.length > 20 ? 0.8 : dayBlocks.length > 10 ? 0.5 : 0.2;

  return { days, rawBlocks: blocks, confidence };
}
