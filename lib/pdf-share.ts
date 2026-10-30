import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { PHONE_PAGE } from '@/lib/pdf-html';

/** A rendered PDF plus the HTML it came from (the Android preview shows the HTML). */
export type PdfDoc = { uri: string; html: string; title: string };

/** Yield a frame so a just-set spinner paints before a synchronous HTML build blocks the JS thread. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

/**
 * Render HTML to a phone-shaped PDF named after `title`, so the file the
 * recipient sees reads "October 2026 Habits.pdf" instead of a random id.
 */
export async function renderPdf(html: string, title: string): Promise<PdfDoc> {
  const { uri } = await Print.printToFileAsync({ html, ...PHONE_PAGE });
  const dir = new Directory(Paths.cache, 'pdf-share');
  if (!dir.exists) dir.create();
  const named = new File(dir, `${title.replace(/[/\\:*?"<>|]/g, '-')}.pdf`);
  if (named.exists) named.delete();
  new File(uri).move(named);
  return { uri: named.uri, html, title };
}

export async function sharePdf(doc: PdfDoc): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(doc.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: doc.title,
  });
}
