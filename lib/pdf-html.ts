import { Colors } from '@/constants/theme';
import { relativeLuminance } from '@/lib/contrast';

/**
 * Shared bits for the HTML behind the shareable PDFs (Stats, Month). The
 * PDFs are made to be read on a phone: narrow pages, one column, content
 * stacked vertically.
 */

/** Page size in points, phone-shaped (about an iPhone's aspect ratio). */
export const PHONE_PAGE = { width: 420, height: 910 } as const;

export type PdfScheme = 'light' | 'dark';

/**
 * The PDF wears the app's own theme, so a dark-mode user shares a dark PDF
 * that looks like their phone. `app` is that theme's Colors entry (heatmap,
 * grid, tiles); the rest are the document's text and chrome.
 */
export type PdfPalette = {
  scheme: PdfScheme;
  app: (typeof Colors)[PdfScheme];
  page: string;
  ink: string;
  strong: string;
  mid: string;
  muted: string;
  faint: string;
  line: string;
  chip: string;
};

export function pdfPalette(scheme: PdfScheme): PdfPalette {
  const app = Colors[scheme];
  return scheme === 'dark'
    ? {
        scheme,
        app,
        page: app.background,
        ink: app.text,
        strong: '#FFFFFF',
        mid: '#C9CDD1',
        muted: app.icon,
        faint: '#6F767C',
        line: app.tileBorder,
        chip: app.tileBackground,
      }
    : {
        scheme,
        app,
        page: '#FFFFFF',
        ink: '#1F2937',
        strong: '#111827',
        mid: '#4B5563',
        muted: '#6B7280',
        faint: '#9CA3AF',
        line: '#E5E7EB',
        chip: '#F3F4F6',
      };
}

export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Darken a hex color toward black — light line colors need more ink on
 * white paper than they need on the app's cards. Dark pages keep the
 * app's color as is. */
export function shadeForPrint(hex: string, scheme: PdfScheme = 'light'): string {
  if (scheme === 'dark' || relativeLuminance(hex) <= 0.55) return hex;
  const h = hex.replace('#', '');
  const mix = (c: number) => Math.round(c * 0.72);
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function generatedDate(now = new Date()): string {
  return now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Document shell. The viewport meta is for the Android preview, which shows
 * the HTML itself (its WebView can't open a PDF); printing ignores it. The palette is exposed as CSS variables
 * (--page, --ink, --muted, ...) for each document's own styles.
 */
export function htmlDocument(css: string, body: string, palette: PdfPalette): string {
  const vars = (['page', 'ink', 'strong', 'mid', 'muted', 'faint', 'line', 'chip'] as const)
    .map((k) => `--${k}: ${palette[k]};`)
    .join(' ');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { ${vars} }
  /* No page margin: the printer leaves margins unpainted (white strips on a
     dark page), so the gutters are the .sheet wrapper's padding instead. */
  @page { margin: 0; }
  /* WebKit drops background colors when printing unless told to keep them:
     the heatmap and the week tiles ARE background colors. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { padding: 20px; }
  /* The printer paints only as far as the content reaches, leaving the rest
     of the last page white; a fixed layer repeats on every printed page. */
  body::before { content: ''; position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: var(--page); z-index: -1; }
  /* One block that never splits across pages. The space above it is padding,
     not margin, so a block that starts a new page keeps its gap from the top
     edge instead of sitting flush against it. */
  .u { padding-top: 10px; break-inside: avoid; page-break-inside: avoid; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; background: var(--page); }
  html { background: var(--page); }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .meta { font-size: 11px; color: var(--muted); margin-bottom: 16px; line-height: 1.4; }
${css}
</style>
</head>
<body>
<div class="sheet">
${body}
</div>
</body>
</html>`;
}
