import {
  plainToHtml,
  htmlToPlainText,
  htmlToDisplayLines,
  htmlToMarkdown,
  imageSources,
  mapImages,
  isHtmlEmpty,
  tokenize,
  decodeEntities,
} from '@/lib/note-html';

const S = '̶';

describe('plainToHtml (legacy migration)', () => {
  it('returns empty for empty', () => {
    expect(plainToHtml('')).toBe('');
  });

  it('wraps lines in <p> and blank lines as <br>', () => {
    expect(plainToHtml('one\n\ntwo')).toBe('<html><p>one</p><br><p>two</p></html>');
  });

  it('escapes HTML-special characters', () => {
    expect(plainToHtml('a & b <c> "d"')).toBe('<html><p>a &amp; b &lt;c&gt; "d"</p></html>');
  });

  it('turns the old bullet prefix into a <ul>', () => {
    expect(plainToHtml('list:\n  • milk\n  • eggs\nafter')).toBe(
      '<html><p>list:</p><ul><li>milk</li><li>eggs</li></ul><p>after</p></html>',
    );
  });

  it('turns the old number prefix into an <ol>', () => {
    expect(plainToHtml('  1. a\n  2. b')).toBe('<html><ol><li>a</li><li>b</li></ol></html>');
  });

  it('starts a new list when the kind changes', () => {
    expect(plainToHtml('  • a\n  1. b')).toBe('<html><ul><li>a</li></ul><ol><li>b</li></ol></html>');
  });

  it('turns U+0336 strikethrough into <s>', () => {
    const struck = Array.from('done').map((c) => c + S).join('');
    expect(plainToHtml(`${struck} todo`)).toBe('<html><p><s>done</s> todo</p></html>');
  });

  it('keeps checklist-revert lines and literal markdown as typed', () => {
    expect(plainToHtml('- [ ] task\n**bold**')).toBe('<html><p>- [ ] task</p><p>**bold**</p></html>');
  });

  it('preserves surrounding whitespace inside a line', () => {
    expect(plainToHtml('  indented')).toBe('<html><p>  indented</p></html>');
  });

  it('round-trips text through htmlToPlainText (minus list prefixes and strikes)', () => {
    const legacy = 'Title\n\nline with & and <tags>\nlast';
    expect(htmlToPlainText(plainToHtml(legacy))).toBe(legacy);
  });

  it('round-trips list items to their text', () => {
    expect(htmlToPlainText(plainToHtml('  • milk\n  2. eggs'))).toBe('milk\neggs');
  });

  it('round-trips emoji and astral characters', () => {
    const t = '🔥 hades 🐈‍⬛ ok';
    expect(htmlToPlainText(plainToHtml(t))).toBe(t);
  });
});

describe('htmlToPlainText', () => {
  it('handles the editor format', () => {
    const html = '<html><h1>Title</h1><br><p>Some <b>body</b> text.</p></html>';
    expect(htmlToPlainText(html)).toBe('Title\n\nSome body text.');
  });

  it('ignores pretty-print whitespace between blocks', () => {
    const html = '<html>\n  <p>a</p>\n  <p>b</p>\n</html>';
    expect(htmlToPlainText(html)).toBe('a\nb');
  });

  it('drops images', () => {
    expect(htmlToPlainText('<html><p>a<img src="x" width="1" height="1"/>b</p></html>')).toBe('ab');
  });

  it('decodes entities', () => {
    expect(htmlToPlainText('<p>a &amp; b &lt;c&gt; &#128293;</p>')).toBe('a & b <c> 🔥');
  });

  it('treats an inner <br> as a line break', () => {
    expect(htmlToPlainText('<p>a<br>b</p>')).toBe('a\nb');
  });

  it('reads blockquote and codeblock lines', () => {
    expect(htmlToPlainText('<html><blockquote><p>q</p></blockquote><codeblock><p>c1</p><p>c2</p></codeblock></html>')).toBe('q\nc1\nc2');
  });
});

describe('htmlToDisplayLines', () => {
  it('marks list items', () => {
    const html = '<html><ul><li>a</li></ul><ol><li>x</li><li>y</li></ol><ul data-type="checkbox"><li checked>done</li><li>todo</li></ul></html>';
    expect(htmlToDisplayLines(html)).toEqual(['• a', '1. x', '2. y', '☑ done', '☐ todo']);
  });
});

describe('htmlToMarkdown', () => {
  const opts = { image: (src: string) => `![](${src})` };

  it('converts inline styles', () => {
    expect(htmlToMarkdown('<p><b>b</b> <i>i</i> <s>s</s> <code>c</code> <u>u</u></p>', opts)).toBe(
      '**b** *i* ~~s~~ `c` <u>u</u>',
    );
  });

  it('converts links', () => {
    expect(htmlToMarkdown('<p>see <a href="https://x.com">here</a></p>', opts)).toBe('see [here](https://x.com)');
  });

  it('converts headings, lists, quotes, code, and empty lines', () => {
    const html =
      '<html><h2>H</h2><br><ul><li>a</li></ul><ol><li>one</li><li>two</li></ol>' +
      '<ul data-type="checkbox"><li checked>x</li><li>y</li></ul>' +
      '<blockquote><p>q</p></blockquote><codeblock><p>let a</p></codeblock><p>end</p></html>';
    expect(htmlToMarkdown(html, opts)).toBe(
      ['## H', '', '- a', '1. one', '2. two', '- [x] x', '- [ ] y', '> q', '```', 'let a', '```', 'end'].join('\n'),
    );
  });

  it('renders images through the callback', () => {
    expect(htmlToMarkdown('<p>a<img src="efh-media://img_1.jpg" width="10" height="10"/></p>', opts)).toBe(
      'a![](efh-media://img_1.jpg)',
    );
  });

  it('restarts numbering per list', () => {
    expect(htmlToMarkdown('<ol><li>a</li></ol><p>x</p><ol><li>b</li></ol>', opts)).toBe('1. a\nx\n1. b');
  });
});

describe('images', () => {
  const html = '<html><p>a<img src="efh-media://img_1.jpg" width="100" height="50"/></p><p><img src="b.png"></p></html>';

  it('lists image sources in order', () => {
    expect(imageSources(html)).toEqual(['efh-media://img_1.jpg', 'b.png']);
  });

  it('rewrites image tags and leaves everything else alone', () => {
    const out = mapImages(html, (a) => ({ ...a, src: a.src.toUpperCase() }));
    expect(out).toBe(
      '<html><p>a<img src="EFH-MEDIA://IMG_1.JPG" width="100" height="50"/></p><p><img src="B.PNG"/></p></html>',
    );
  });

  it('drops images when the mapper returns null', () => {
    expect(mapImages('<p>a<img src="x"/>b</p>', () => null)).toBe('<p>ab</p>');
  });

  it('escapes attribute values', () => {
    expect(mapImages('<img src="x"/>', () => ({ src: 'a"b&c' }))).toBe('<img src="a&quot;b&amp;c"/>');
  });
});

describe('isHtmlEmpty', () => {
  it('is empty for blank documents', () => {
    expect(isHtmlEmpty('')).toBe(true);
    expect(isHtmlEmpty('<html><br><p>  </p></html>')).toBe(true);
  });
  it('is not empty with text or an image', () => {
    expect(isHtmlEmpty('<html><p>x</p></html>')).toBe(false);
    expect(isHtmlEmpty('<html><p><img src="a"/></p></html>')).toBe(false);
  });
});

describe('tokenizer', () => {
  it('treats a stray < as text', () => {
    expect(tokenize('a < b').map((t) => t.type)).toEqual(['text', 'text', 'text']);
    expect(htmlToPlainText('<p>a < b</p>')).toBe('a < b');
  });
  it('decodes numeric entities', () => {
    expect(decodeEntities('&#x1F525;&#39;')).toBe("🔥'");
  });
});

import { htmlToEditorText, replaceEditorRange, insertImageBlock, IMAGE_CHAR } from '@/lib/note-html';

// Exactly what EnrichedTextInput emitted on device (pretty-printed).
const DEVICE_HTML =
  '<html>\n<p>Hello <b>bold</b> world</p>\n<br>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<p>a &amp; b &lt;c&gt;</p>\n<p><s>struck</s> ends<img src="file:///x/a.jpeg" width="200" height="133"/><b>ZZ</b></p>\n</html>';

describe('htmlToEditorText (device offset model)', () => {
  it('matches the editor: lines joined by \\n, images as one char', () => {
    expect(htmlToEditorText(DEVICE_HTML)).toBe(
      `Hello bold world\n\none\ntwo\na & b <c>\nstruck ends${IMAGE_CHAR}ZZ`,
    );
  });
  it('puts the caret after the image at the observed offset', () => {
    // Device reported selection 48 right after inserting the image at the
    // end of "…struck ends" (47 chars before it).
    const t = htmlToEditorText(DEVICE_HTML);
    expect(t.indexOf(IMAGE_CHAR) + 1).toBe(48);
  });
});

describe('replaceEditorRange', () => {
  it('replaces a word inside a styled run, keeping the style', () => {
    const html = '<html><p>Hello <b>bol</b> world</p></html>';
    // "bol" spans offsets 6..9
    expect(replaceEditorRange(html, 6, 9, 'bold ')).toBe('<html><p>Hello <b>bold </b> world</p></html>');
  });

  it('appends at the end of a line into the last run', () => {
    const html = '<html><p>one</p><p>tw</p></html>';
    expect(replaceEditorRange(html, 4, 6, 'two ')).toBe('<html><p>one</p><p>two </p></html>');
  });

  it('fills an empty line', () => {
    const html = '<html><p>a</p><br><p>b</p></html>';
    expect(replaceEditorRange(html, 2, 2, 'x')).toBe('<html><p>a</p><p>x</p><p>b</p></html>');
  });

  it('handles list items and escapes the insert', () => {
    const html = '<html><ul><li>mi</li></ul></html>';
    expect(replaceEditorRange(html, 0, 2, 'milk & eggs ')).toBe('<html><ul><li>milk &amp; eggs </li></ul></html>');
  });

  it('works on pretty-printed device HTML', () => {
    // Replace "world" (offsets 11..16) in line 1.
    const out = replaceEditorRange(DEVICE_HTML, 11, 16, 'there')!;
    expect(htmlToEditorText(out)).toBe(`Hello bold there\n\none\ntwo\na & b <c>\nstruck ends${IMAGE_CHAR}ZZ`);
    expect(out).toContain('<p>Hello <b>bold</b> there</p>');
  });

  it('inserts text right after an image', () => {
    const html = '<html><p><img src="a" width="1" height="1"/></p></html>';
    expect(replaceEditorRange(html, 1, 1, 'hi')).toBe('<html><p><img src="a" width="1" height="1"/>hi</p></html>');
  });

  it('refuses ranges that cross lines', () => {
    expect(replaceEditorRange('<html><p>a</p><p>b</p></html>', 0, 3, 'x')).toBeNull();
  });

  it('keeps entities in untouched text', () => {
    const html = '<html><p>a &amp; b</p><p>c</p></html>';
    expect(replaceEditorRange(html, 6, 7, 'cat')).toBe('<html><p>a &amp; b</p><p>cat</p></html>');
  });

  it('handles astral characters by UTF-16 offset', () => {
    const html = '<html><p>🔥 ha</p></html>';
    // "🔥" is 2 UTF-16 units, so "ha" sits at 3..5.
    expect(replaceEditorRange(html, 3, 5, 'hades')).toBe('<html><p>🔥 hades</p></html>');
  });

  it('creates a document from nothing', () => {
    expect(replaceEditorRange('', 0, 0, 'hi')).toBe('<html><p>hi</p></html>');
  });
});

describe('insertImageBlock', () => {
  const IMG = '<img src="efh-media://img_1.jpg" width="300" height="200"/>';

  it('splits a paragraph mid-line and reopens inline styles', () => {
    const html = '<html><p>ab<b>cd</b>ef</p></html>';
    // caret between "c" and "d" → offset 3
    const r = insertImageBlock(html, 3, IMG);
    expect(r.html).toBe(`<html><p>ab<b>c</b></p><p>${IMG}</p><p><b>d</b>ef</p></html>`);
    expect(htmlToEditorText(r.html)).toBe(`abc\n${IMAGE_CHAR}\ndef`);
    expect(r.caret).toBe(6); // start of "def"
  });

  it('adds a trailing empty line when the image ends the note', () => {
    const r = insertImageBlock('<html><p>abc</p></html>', 3, IMG);
    expect(r.html).toBe(`<html><p>abc</p><p>${IMG}</p><br></html>`);
    expect(r.caret).toBe(6);
  });

  it('inserts before a line when the caret is at its start', () => {
    const r = insertImageBlock('<html><p>a</p><p>b</p></html>', 2, IMG);
    expect(r.html).toBe(`<html><p>a</p><p>${IMG}</p><p>b</p></html>`);
    expect(r.caret).toBe(4);
  });

  it('replaces an empty line', () => {
    const r = insertImageBlock('<html><p>a</p><br><p>b</p></html>', 2, IMG);
    expect(r.html).toBe(`<html><p>a</p><p>${IMG}</p><p>b</p></html>`);
    expect(r.caret).toBe(4);
  });

  it('goes after a list when the caret is inside it', () => {
    const r = insertImageBlock('<html><ul><li>a</li><li>b</li></ul><p>c</p></html>', 1, IMG);
    expect(r.html).toBe(`<html><ul><li>a</li><li>b</li></ul><p>${IMG}</p><p>c</p></html>`);
    expect(r.caret).toBe(6);
  });

  it('works on an empty note', () => {
    const r = insertImageBlock('', 0, IMG);
    expect(r.html).toBe(`<html><p>${IMG}</p><br></html>`);
    expect(r.caret).toBe(2);
  });

  it('works on pretty-printed device HTML', () => {
    const r = insertImageBlock(DEVICE_HTML, 3, IMG);
    expect(htmlToEditorText(r.html).startsWith(`Hel\n${IMAGE_CHAR}\nlo bold world\n`)).toBe(true);
  });
});

import { imageParagraphs, appendBlocks } from '@/lib/note-html';

describe('imageParagraphs / appendBlocks', () => {
  it('lifts images into their own paragraphs', () => {
    expect(imageParagraphs('<html><p>a<img src="x" width="1" height="1"/>b</p></html>')).toBe(
      '<p><img src="x" width="1" height="1"/></p>',
    );
    expect(imageParagraphs('<p>none</p>')).toBe('');
  });
  it('appends inside the html root', () => {
    expect(appendBlocks('<html><p>a</p></html>', '<p>b</p>')).toBe('<html><p>a</p><p>b</p></html>');
    expect(appendBlocks('', '<p>b</p>')).toBe('<html><p>b</p></html>');
    expect(appendBlocks('<html><p>a</p></html>', '')).toBe('<html><p>a</p></html>');
  });
});

describe('insertImageBlock batches', () => {
  it('keeps consecutive images together before a list', () => {
    const A = '<img src="a" width="1" height="1"/>';
    const B = '<img src="b" width="1" height="1"/>';
    const start = '<html><p>x</p><ul><li>one</li></ul></html>';
    const r1 = insertImageBlock(start, 1, A);
    const r2 = insertImageBlock(r1.html, r1.caret - 1, B);
    expect(r2.html).toBe(`<html><p>x</p><p>${A}</p><p>${B}</p><ul><li>one</li></ul></html>`);
    expect(htmlToEditorText(r2.html)).toBe(`x\n${IMAGE_CHAR}\n${IMAGE_CHAR}\none`);
    expect(r2.caret).toBe(6);
  });
});

import { hiddenCharOffsets, selectionToEditorOffset } from '@/lib/note-html';

describe('hidden zero-width chars in the editor', () => {
  // Device case: "V7 undo test\na\nb\n\n￼" — the empty <li> holds a hidden
  // char, so a caret after the image was reported as 20 (model says 19).
  const html =
    '<html>\n<p>V7 undo test</p>\n<ul>\n<li>a</li>\n<li>b</li>\n<li></li>\n</ul>\n<p><img src="x" width="1" height="1"/></p>\n</html>';

  it('finds the empty list item', () => {
    expect(hiddenCharOffsets(html)).toEqual([17]);
  });

  it('maps reported offsets back to the model', () => {
    const hidden = hiddenCharOffsets(html);
    expect(selectionToEditorOffset(16, hidden)).toBe(16); // after "b" (observed 16)
    expect(selectionToEditorOffset(20, hidden)).toBe(19); // after the image (observed 20)
    expect(selectionToEditorOffset(17, hidden)).toBe(17); // at the empty item
    expect(selectionToEditorOffset(18, hidden)).toBe(17); // just past its hidden char
  });

  it('has none for plain paragraphs and top-level blank lines', () => {
    expect(hiddenCharOffsets('<html><p>a</p><br><p>b</p></html>')).toEqual([]);
  });

  it('counts an empty last line in a quote', () => {
    expect(hiddenCharOffsets('<html><blockquote><p>q</p><br></blockquote></html>')).toEqual([2]);
  });

  it('handles several empty items', () => {
    const h = '<html><ul><li></li><li>x</li><li></li></ul></html>';
    const hidden = hiddenCharOffsets(h); // lines: "" (0), "x" (1..2), "" (3)
    expect(hidden).toEqual([0, 3]);
    expect(selectionToEditorOffset(2, hidden)).toBe(1); // before "x"
    expect(selectionToEditorOffset(5, hidden)).toBe(3); // in the last item
  });
});
