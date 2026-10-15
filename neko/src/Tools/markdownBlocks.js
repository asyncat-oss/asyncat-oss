// The little Markdown that tool and skill descriptions use, split into
// blocks (headings, numbered and bulleted items, paragraphs) and inline bits
// (`code` and **bold**), for Tools & Skills to draw with the app's styles.

/** [{ type: 'heading', depth, text } | { type: 'numbered', number, text } | { type: 'bullet', text } | { type: 'paragraph', text }] */
export function parseMarkdownBlocks(content) {
  if (!String(content || '').trim()) return [];

  const withoutFrontmatter = String(content).replace(/^---[\s\S]*?\n---\s*/, '');
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (const line of withoutFrontmatter.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', depth: heading[1].length, text: heading[2] });
    } else if (numbered) {
      flushParagraph();
      blocks.push({ type: 'numbered', number: numbered[1], text: numbered[2] });
    } else if (bullet) {
      flushParagraph();
      blocks.push({ type: 'bullet', text: bullet[1] });
    } else {
      paragraph.push(trimmed);
    }
  }

  flushParagraph();
  return blocks;
}

/** "Use `ls` **first**" → [{ type: 'text', text: 'Use ' }, { type: 'code', text: 'ls' }, …]. */
export function inlineTokens(text) {
  const source = String(text || '');
  const tokens = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: 'text', text: source.slice(lastIndex, match.index) });
    const token = match[0];
    tokens.push(token.startsWith('`') ? { type: 'code', text: token.slice(1, -1) } : { type: 'strong', text: token.slice(2, -2) });
    lastIndex = match.index + token.length;
  }
  if (lastIndex < source.length) tokens.push({ type: 'text', text: source.slice(lastIndex) });
  return tokens;
}
