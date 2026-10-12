/**
 * Rich note bodies. Text notes are stored as the HTML that
 * react-native-enriched-html produces (`note.format === 'html'`): a fixed,
 * curated tag set (see https://docs.swmansion.com/react-native-enriched-html
 * "HTML format and supported tags"):
 *
 *   <html>
 *     <p>a line</p>            plain paragraph (one per line)
 *     <br>                     an empty line
 *     <h1>..<h6>               headings
 *     <ul><li>..</li></ul>     bullets   (<ul data-type="checkbox"> = checkboxes)
 *     <ol><li>..</li></ol>     numbers
 *     <blockquote><p>..</p></blockquote>, <codeblock><p>..</p></codeblock>
 *     inline: <b> <i> <u> <s> <code> <a href> <mention> <img src width height>
 *   </html>
 *
 * Notes written before rich text are plain strings (no `format`). They are
 * converted with `plainToHtml` the first time they're opened in the editor,
 * and the original string is kept on the doc as `contentLegacy`.
 *
 * Everything here is pure (no RN imports) so it's unit-testable.
 */

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export type HtmlToken =
  | { type: 'open'; tag: string; attrs: Record<string, string>; selfClosing: boolean; raw: string }
  | { type: 'close'; tag: string; raw: string }
  | { type: 'text'; text: string; raw: string };

const TOKEN_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;
const ATTR_RE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
/** Void elements: never have a closing tag. */
const VOID_TAGS = new Set(['br', 'img', 'hr']);

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    switch (body) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      case 'nbsp': return ' ';
      default: return m;
    }
  });
}

export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

export function tokenize(html: string): HtmlToken[] {
  const out: HtmlToken[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(html))) {
    if (m[5] != null || m[6] != null) {
      const raw = m[5] ?? m[6];
      out.push({ type: 'text', text: decodeEntities(raw), raw });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1] === '/') {
      out.push({ type: 'close', tag, raw: m[0] });
      continue;
    }
    const attrs: Record<string, string> = {};
    ATTR_RE.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ATTR_RE.exec(m[3] ?? ''))) {
      attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    }
    out.push({ type: 'open', tag, attrs, selfClosing: m[4] === '/' || VOID_TAGS.has(tag), raw: m[0] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Legacy plain text → HTML
// ---------------------------------------------------------------------------

// The plain-text editor's list prefixes (components/notes/note-editor.tsx
// before rich text): "  • item" and "  1. item".
const LEGACY_BULLET_RE = /^\s*•\s+(.*)$/;
const LEGACY_NUMBER_RE = /^\s*\d+\.\s+(.*)$/;
/** U+0336 combining long stroke: the old editor's strikethrough. */
const STRIKE_CHAR = '̶';

/** One line of legacy text → inline HTML, turning U+0336 runs into <s>. */
function legacyInline(line: string): string {
  if (!line.includes(STRIKE_CHAR)) return escapeText(line);
  const chars = Array.from(line);
  let out = '';
  let run = '';
  let struck = '';
  const flushRun = () => {
    if (run) out += escapeText(run);
    run = '';
  };
  const flushStruck = () => {
    if (struck) out += `<s>${escapeText(struck)}</s>`;
    struck = '';
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === STRIKE_CHAR) continue; // consumed with its base char
    if (chars[i + 1] === STRIKE_CHAR) {
      flushRun();
      struck += c;
    } else {
      flushStruck();
      run += c;
    }
  }
  flushRun();
  flushStruck();
  return out;
}

/**
 * Convert a pre-rich-text note body to editor HTML. Only converts what the
 * old editor itself produced (its bullet/number prefixes and U+0336
 * strikethrough); everything else, including literal markdown like "**x**"
 * or "- [ ] task" lines, carries over as the exact text the user typed.
 */
export function plainToHtml(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const parts: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) parts.push(`</${list}>`);
    list = null;
  };
  for (const line of lines) {
    const bullet = line.match(LEGACY_BULLET_RE);
    const number = bullet ? null : line.match(LEGACY_NUMBER_RE);
    if (bullet || number) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        parts.push(`<${kind}>`);
        list = kind;
      }
      parts.push(`<li>${legacyInline((bullet ?? number)![1])}</li>`);
      continue;
    }
    closeList();
    parts.push(line.length === 0 ? '<br>' : `<p>${legacyInline(line)}</p>`);
  }
  closeList();
  return `<html>${parts.join('')}</html>`;
}

// ---------------------------------------------------------------------------
// HTML → lines (shared walker for plain text and markdown)
// ---------------------------------------------------------------------------

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);

type LineKind =
  | { kind: 'p' }
  | { kind: 'h'; level: number }
  | { kind: 'li'; list: 'ul' | 'ol' | 'checkbox'; index: number; checked: boolean }
  | { kind: 'quote' }
  | { kind: 'code' }
  | { kind: 'empty' };

export type InlineHandlers = {
  text: (t: string) => string;
  open: (tag: string, attrs: Record<string, string>) => string;
  close: (tag: string) => string;
  img: (attrs: Record<string, string>) => string;
};

type Line = { kind: LineKind; body: string };

/**
 * Walk editor HTML into a flat list of lines (one per paragraph / list item /
 * empty line), rendering inline content through `h`. Tolerant of HTML the
 * editor didn't produce: stray text outside blocks becomes its own line.
 */
function walkLines(html: string, h: InlineHandlers): Line[] {
  const lines: Line[] = [];
  const containers: { tag: string; list?: 'ul' | 'ol' | 'checkbox'; count: number }[] = [];
  let current: Line | null = null;

  const container = () => containers[containers.length - 1];
  const startLine = (kind: LineKind) => {
    current = { kind, body: '' };
  };
  const endLine = () => {
    if (current) lines.push(current);
    current = null;
  };
  const defaultKind = (): LineKind => {
    const c = container();
    if (c?.tag === 'blockquote') return { kind: 'quote' };
    if (c?.tag === 'codeblock') return { kind: 'code' };
    return { kind: 'p' };
  };

  for (const tok of tokenize(html)) {
    if (tok.type === 'text') {
      // Whitespace between blocks (pretty-printed HTML) isn't content.
      if (!current && !tok.text.trim()) continue;
      if (!current) startLine(defaultKind());
      current!.body += h.text(tok.text);
      continue;
    }
    const tag = tok.tag;
    if (tok.type === 'open') {
      if (tag === 'html' || tag === 'body') continue;
      if (tag === 'ul' || tag === 'ol') {
        endLine();
        const list = tag === 'ul' && tok.attrs['data-type'] === 'checkbox' ? 'checkbox' : (tag as 'ul' | 'ol');
        containers.push({ tag, list, count: 0 });
        continue;
      }
      if (tag === 'blockquote' || tag === 'codeblock') {
        endLine();
        containers.push({ tag, count: 0 });
        continue;
      }
      if (tag === 'br') {
        if (current) {
          // A <br> inside a paragraph is a soft line break: split the line.
          const kind = (current as Line).kind;
          endLine();
          startLine(kind);
        } else {
          lines.push({ kind: { kind: 'empty' }, body: '' });
        }
        continue;
      }
      if (BLOCK_TAGS.has(tag)) {
        endLine();
        if (tag === 'li') {
          const c = container();
          const list = c?.list ?? 'ul';
          if (c) c.count++;
          startLine({ kind: 'li', list, index: c?.count ?? 1, checked: 'checked' in tok.attrs });
        } else if (tag[0] === 'h') {
          startLine({ kind: 'h', level: Number(tag[1]) });
        } else {
          startLine(defaultKind());
        }
        continue;
      }
      if (tag === 'img') {
        if (!current) startLine(defaultKind());
        current!.body += h.img(tok.attrs);
        continue;
      }
      if (!current) startLine(defaultKind());
      current!.body += h.open(tag, tok.attrs);
      continue;
    }
    // close
    if (tag === 'ul' || tag === 'ol' || tag === 'blockquote' || tag === 'codeblock') {
      endLine();
      containers.pop();
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      endLine();
      continue;
    }
    if (current) (current as Line).body += h.close(tag);
  }
  endLine();
  return lines;
}

// ---------------------------------------------------------------------------
// HTML → plain text (previews, search, vocabulary, checklist conversion)
// ---------------------------------------------------------------------------

const PLAIN_HANDLERS: InlineHandlers = {
  text: (t) => t,
  open: () => '',
  close: () => '',
  img: () => '',
};

/** Plain text of a note body, one line per paragraph. Images drop out. */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  return walkLines(html, PLAIN_HANDLERS)
    .map((l) => l.body)
    .join('\n');
}

/**
 * Lines as the reader sees them: list items keep a visible marker. Used for
 * list previews and search, where "• milk" reads better than "milk".
 */
export function htmlToDisplayLines(html: string): string[] {
  if (!html) return [];
  return walkLines(html, PLAIN_HANDLERS).map((l) => {
    if (l.kind.kind !== 'li') return l.body;
    if (l.kind.list === 'ol') return `${l.kind.index}. ${l.body}`;
    if (l.kind.list === 'checkbox') return `${l.kind.checked ? '☑' : '☐'} ${l.body}`;
    return `• ${l.body}`;
  });
}

// ---------------------------------------------------------------------------
// HTML → Markdown (export)
// ---------------------------------------------------------------------------

export type MarkdownOptions = {
  /** Markdown for an <img>, given its src. Return '' to drop it. */
  image: (src: string, attrs: Record<string, string>) => string;
};

export function htmlToMarkdown(html: string, opts: MarkdownOptions): string {
  if (!html) return '';
  const linkStack: string[] = [];
  const handlers: InlineHandlers = {
    text: (t) => t,
    open: (tag, attrs) => {
      switch (tag) {
        case 'b': case 'strong': return '**';
        case 'i': case 'em': return '*';
        case 's': case 'del': case 'strike': return '~~';
        case 'code': return '`';
        case 'u': return '<u>';
        case 'a': linkStack.push(attrs.href ?? ''); return '[';
        default: return '';
      }
    },
    close: (tag) => {
      switch (tag) {
        case 'b': case 'strong': return '**';
        case 'i': case 'em': return '*';
        case 's': case 'del': case 'strike': return '~~';
        case 'code': return '`';
        case 'u': return '</u>';
        case 'a': return `](${linkStack.pop() ?? ''})`;
        default: return '';
      }
    },
    img: (attrs) => opts.image(attrs.src ?? '', attrs),
  };
  const out: string[] = [];
  let inCode = false;
  for (const l of walkLines(html, handlers)) {
    const isCode = l.kind.kind === 'code';
    if (isCode && !inCode) out.push('```');
    if (!isCode && inCode) out.push('```');
    inCode = isCode;
    switch (l.kind.kind) {
      case 'empty': out.push(''); break;
      case 'h': out.push(`${'#'.repeat(l.kind.level)} ${l.body}`); break;
      case 'quote': out.push(`> ${l.body}`); break;
      case 'li':
        if (l.kind.list === 'ol') out.push(`${l.kind.index}. ${l.body}`);
        else if (l.kind.list === 'checkbox') out.push(`- [${l.kind.checked ? 'x' : ' '}] ${l.body}`);
        else out.push(`- ${l.body}`);
        break;
      default: out.push(l.body);
    }
  }
  if (inCode) out.push('```');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Every <img src> in document order. */
export function imageSources(html: string): string[] {
  if (!html || !html.includes('<img')) return [];
  const out: string[] = [];
  for (const tok of tokenize(html)) {
    if (tok.type === 'open' && tok.tag === 'img' && tok.attrs.src) out.push(tok.attrs.src);
  }
  return out;
}

/**
 * Rewrite every <img> tag through `fn` (return null to drop the image).
 * Text and all other markup pass through byte-for-byte.
 */
export function mapImages(
  html: string,
  fn: (attrs: Record<string, string>) => Record<string, string> | null,
): string {
  if (!html || !html.includes('<img')) return html;
  return html.replace(/<img\b[^>]*>/gi, (raw) => {
    const tok = tokenize(raw)[0];
    if (!tok || tok.type !== 'open') return raw;
    const next = fn(tok.attrs);
    if (!next) return '';
    const attrs = Object.entries(next)
      .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
      .join(' ');
    return `<img ${attrs}/>`;
  });
}

/** True when the HTML has no visible content (no text, no images). */
export function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  if (html.includes('<img')) return false;
  return htmlToPlainText(html).trim().length === 0;
}

// ---------------------------------------------------------------------------
// Editor offsets
// ---------------------------------------------------------------------------
//
// EnrichedTextInput reports selections as offsets into its text storage:
// one line per paragraph / list item / empty line, joined by "\n", with every
// inline image occupying exactly ONE offset (observed on device; note that
// its onChangeText value omits images, so we derive the text ourselves). The
// functions below map those offsets back onto the HTML so programmatic edits
// (accepting a word suggestion, inserting a photo on its own line) can be
// applied with setValue without disturbing any surrounding formatting.

/** The object-replacement char standing in for an image in editor text. */
export const IMAGE_CHAR = '￼';

type Seg =
  | { kind: 'text'; tok: number; start: number; len: number }
  | { kind: 'img'; tok: number; start: number };

type EditorLine = {
  start: number;
  end: number;
  /** Token index of the opening block tag (<p>, <li>, <hN>), or -1. */
  open: number;
  /** Token index of the matching close tag, or -1. */
  close: number;
  /** Token index of a top-level <br> when this line is an empty line. */
  br: number;
  /** Innermost container (<ul>/<ol>/<blockquote>/<codeblock>) if any. */
  container: { open: number; close: number } | null;
  segs: Seg[];
};

function analyze(html: string): { toks: HtmlToken[]; lines: EditorLine[]; text: string } {
  const toks = tokenize(html);
  const lines: EditorLine[] = [];
  const containers: { open: number; close: number }[] = [];
  let cur: EditorLine | null = null;
  let offset = 0;
  let text = '';

  const begin = (open: number) => {
    if (lines.length > 0) {
      offset += 1; // the "\n" between lines
      text += '\n';
    }
    cur = {
      start: offset,
      end: offset,
      open,
      close: -1,
      br: -1,
      container: containers[containers.length - 1] ?? null,
      segs: [],
    };
    lines.push(cur);
  };
  const finish = (close: number) => {
    if (cur) {
      cur.close = close;
      cur.end = offset;
    }
    cur = null;
  };

  toks.forEach((tok, i) => {
    if (tok.type === 'text') {
      if (!cur && !tok.text.trim()) return;
      if (!cur) begin(-1);
      cur!.segs.push({ kind: 'text', tok: i, start: offset, len: tok.text.length });
      offset += tok.text.length;
      text += tok.text;
      cur!.end = offset;
      return;
    }
    const tag = tok.tag;
    if (tok.type === 'open') {
      if (tag === 'html' || tag === 'body') return;
      if (tag === 'ul' || tag === 'ol' || tag === 'blockquote' || tag === 'codeblock') {
        finish(-1);
        containers.push({ open: i, close: -1 });
        return;
      }
      if (tag === 'br') {
        if (cur) {
          finish(-1);
          begin(-1);
        } else {
          begin(-1);
          cur!.br = i;
          finish(-1);
        }
        return;
      }
      if (BLOCK_TAGS.has(tag)) {
        finish(-1);
        begin(i);
        return;
      }
      if (tag === 'img') {
        if (!cur) begin(-1);
        cur!.segs.push({ kind: 'img', tok: i, start: offset });
        offset += 1;
        text += IMAGE_CHAR;
        cur!.end = offset;
      }
      return;
    }
    if (tag === 'ul' || tag === 'ol' || tag === 'blockquote' || tag === 'codeblock') {
      finish(-1);
      const c = containers.pop();
      if (c) c.close = i;
      return;
    }
    if (BLOCK_TAGS.has(tag)) finish(i);
  });
  finish(-1);
  return { toks, lines, text };
}

/** The editor's text model for `html` (see IMAGE_CHAR). */
export function htmlToEditorText(html: string): string {
  if (!html) return '';
  return analyze(html).text;
}

function join(toks: HtmlToken[], replaced: Map<number, string>): string {
  let out = '';
  toks.forEach((t, i) => {
    out += replaced.has(i) ? replaced.get(i)! : t.raw;
  });
  return out;
}

/**
 * Replace editor-offset range [start, end) with plain `insert`, keeping all
 * formatting around it. The range must sit within one line (a word-level
 * edit); returns null when it doesn't, so callers can no-op safely.
 * Inserted text inherits the style of the text it continues (the run
 * before it, or the run after it at the start of a line), like typing.
 */
export function replaceEditorRange(html: string, start: number, end: number, insert: string): string | null {
  if (start > end) return null;
  const { toks, lines } = analyze(html);
  if (lines.length === 0) {
    return start === 0 && end === 0 && insert ? `<html><p>${escapeText(insert)}</p></html>` : null;
  }
  const line = lines.find((l) => l.start <= start && end <= l.end);
  if (!line) return null;
  const replaced = new Map<number, string>();

  if (line.br >= 0) {
    if (!insert) return html;
    replaced.set(line.br, `<p>${escapeText(insert)}</p>`);
    return join(toks, replaced);
  }

  // Pick the run that receives the inserted text.
  const textSegs = line.segs.filter((s): s is Extract<Seg, { kind: 'text' }> => s.kind === 'text');
  // A replacement stays in the run being replaced; a pure insert continues
  // the run that ends at the caret (or starts there, at a line start).
  const host =
    (end > start ? textSegs.find((s) => s.start <= start && start < s.start + s.len) : undefined) ??
    textSegs.find((s) => s.start < start && start <= s.start + s.len) ??
    textSegs.find((s) => s.start === start) ??
    null;

  // Cut the range out of every overlapping run / image.
  const newText = new Map<number, string>();
  for (const s of line.segs) {
    if (s.kind === 'img') {
      if (s.start >= start && s.start < end) replaced.set(s.tok, '');
      continue;
    }
    const a = Math.max(start, s.start);
    const b = Math.min(end, s.start + s.len);
    const t = (toks[s.tok] as Extract<HtmlToken, { type: 'text' }>).text;
    if (a < b) newText.set(s.tok, t.slice(0, a - s.start) + t.slice(b - s.start));
  }

  if (insert) {
    if (host) {
      const t = newText.get(host.tok) ?? (toks[host.tok] as Extract<HtmlToken, { type: 'text' }>).text;
      const at = start - host.start;
      newText.set(host.tok, t.slice(0, at) + insert + t.slice(at));
    } else {
      // No text run touches the caret (empty paragraph, or the caret sits
      // beside an image): add a bare text node at that spot.
      const before = [...line.segs].reverse().find((s) => s.start < start);
      const anchor = before ? before.tok : line.open;
      if (anchor < 0) return null;
      const prev = replaced.get(anchor) ?? toks[anchor].raw;
      replaced.set(anchor, prev + escapeText(insert));
    }
  }

  for (const [tok, t] of newText) replaced.set(tok, escapeText(t));
  return join(toks, replaced);
}

/**
 * Insert `imgHtml` (an <img .../> tag) on its own line at editor offset
 * `offset`, splitting the current paragraph if the caret is mid-line.
 * Inside a list / quote / code block the image goes after that block.
 * Returns the new HTML and the caret offset just past the image (start of
 * the following line, which is created if the image would end the note).
 */
export function insertImageBlock(html: string, offset: number, imgHtml: string): { html: string; caret: number } {
  const block = `<p>${imgHtml}</p>`;
  const { toks, lines } = analyze(html);
  const replaced = new Map<number, string>();
  const line = lines.find((l) => l.start <= offset && offset <= l.end) ?? lines[lines.length - 1];
  let out: string;

  if (!line) {
    out = `<html>${block}<br></html>`;
  } else if (line.br >= 0) {
    replaced.set(line.br, block + (lines[lines.length - 1] === line ? '<br>' : ''));
    out = join(toks, replaced);
  } else if (line.container) {
    const close = line.container.close >= 0 ? line.container.close : toks.length - 1;
    const isLastBlock = !lines.some((l) => l.start > line.start && l.container !== line.container);
    replaced.set(close, toks[close].raw + block + (isLastBlock ? '<br>' : ''));
    out = join(toks, replaced);
  } else if (line.open < 0 || line.close < 0) {
    // Implicit line (stray text / soft break): put the image after the doc.
    out = html.replace(/<\/html>\s*$/i, '') + block + '<br>' + (/<\/html>\s*$/i.test(html) ? '</html>' : '');
  } else if (offset <= line.start) {
    replaced.set(line.open, block + toks[line.open].raw);
    out = join(toks, replaced);
  } else if (offset >= line.end) {
    const isLast = lines[lines.length - 1] === line;
    replaced.set(line.close, toks[line.close].raw + block + (isLast ? '<br>' : ''));
    out = join(toks, replaced);
  } else {
    // Mid-line: close the open inline tags and the block, add the image
    // paragraph, then reopen the block and the same inline tags.
    const stack: number[] = [];
    let splitTok = -1;
    let splitAt = 0;
    for (let i = line.open + 1; i < line.close; i++) {
      const t = toks[i];
      const seg = line.segs.find((s) => s.tok === i);
      if (seg) {
        const segEnd = seg.kind === 'text' ? seg.start + seg.len : seg.start + 1;
        if (offset <= seg.start) {
          splitTok = i;
          splitAt = 0;
          break;
        }
        if (offset < segEnd) {
          splitTok = i;
          splitAt = offset - seg.start;
          break;
        }
        continue;
      }
      if (t.type === 'open' && !t.selfClosing) stack.push(i);
      else if (t.type === 'close') {
        for (let k = stack.length - 1; k >= 0; k--) {
          if ((toks[stack[k]] as Extract<HtmlToken, { type: 'open' }>).tag === t.tag) {
            stack.splice(k, 1);
            break;
          }
        }
      }
    }
    if (splitTok < 0) splitTok = line.close;
    const closers = [...stack].reverse().map((k) => `</${(toks[k] as Extract<HtmlToken, { type: 'open' }>).tag}>`).join('');
    const blockTag = (toks[line.open] as Extract<HtmlToken, { type: 'open' }>).tag;
    const reopen = toks[line.open].raw + stack.map((k) => toks[k].raw).join('');
    const middle = `${closers}</${blockTag}>${block}${reopen}`;
    const st = toks[splitTok];
    if (st.type === 'text' && splitAt > 0) {
      replaced.set(splitTok, escapeText(st.text.slice(0, splitAt)) + middle + escapeText(st.text.slice(splitAt)));
    } else {
      replaced.set(splitTok, middle + st.raw);
    }
    out = join(toks, replaced);
  }

  // The caret goes to the start of the line right after the image.
  const after = analyze(out);
  const imgLine = after.lines.findIndex((l) => l.segs.some((s) => s.kind === 'img' && after.toks[s.tok].raw === imgHtml));
  const next = after.lines[imgLine + 1];
  return { html: out, caret: next ? next.start : after.text.length };
}

/**
 * Each image in `html` as its own `<p><img/></p>` block, in order. Used when
 * a body is rebuilt from plain text (Undo Checklist) so the photos the note
 * held come back instead of being dropped.
 */
export function imageParagraphs(html: string): string {
  if (!html || !html.includes('<img')) return '';
  return tokenize(html)
    .filter((t) => t.type === 'open' && t.tag === 'img')
    .map((t) => `<p>${t.raw}</p>`)
    .join('');
}

/** Append raw block HTML to the end of a body (inside <html> if present). */
export function appendBlocks(html: string, blocks: string): string {
  if (!blocks) return html;
  if (!html) return `<html>${blocks}</html>`;
  const m = html.match(/<\/html>\s*$/i);
  return m ? html.slice(0, m.index) + blocks + html.slice(m.index) : html + blocks;
}

/**
 * EnrichedTextInput keeps a hidden zero-width space in some empty lines (an
 * empty list item; an empty last line inside a quote/code block) so the
 * line keeps its marker. Its onChangeSelection reports offsets INCLUDING
 * those hidden chars while setSelection expects offsets WITHOUT them (seen
 * on device; see getActualIndex in the library's EnrichedTextInputView.mm).
 * This returns the editor-text offsets where such hidden chars sit, so
 * reported selections can be mapped back with selectionToEditorOffset.
 */
export function hiddenCharOffsets(html: string): number[] {
  if (!html) return [];
  const { toks, lines } = analyze(html);
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (!l.container || l.segs.length > 0) return;
    const openTok = l.open >= 0 ? toks[l.open] : null;
    const isItem = openTok?.type === 'open' && openTok.tag === 'li';
    const next = lines[i + 1];
    const lastInContainer = !next || next.container !== l.container;
    if (isItem || lastInContainer) out.push(l.start);
  });
  return out;
}

/** Map an offset reported by onChangeSelection to the editor-text model. */
export function selectionToEditorOffset(reported: number, hidden: number[]): number {
  let n = 0;
  for (let i = 0; i < hidden.length; i++) {
    // The i-th hidden char sits at reported index hidden[i] + i.
    if (hidden[i] + i < reported) n++;
    else break;
  }
  return reported - n;
}
