// Terminal markdown renderer — converts common markdown to ANSI escape codes.
const W = () => Math.min(process.stdout.columns || 80, 100);

const R = '\x1b[0m';
const B = '\x1b[1m';
const D = '\x1b[2m';
const CY = '\x1b[36m';
const WH = '\x1b[37m';
const MG = '\x1b[35m';

function inlineFormat(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, `${B}${CY}$1${R}`)
    .replace(/\*\*(.+?)\*\*/g,     `${B}$1${R}`)
    .replace(/\*([^*\n]+?)\*/g,    `${D}$1${R}`)
    .replace(/`([^`\n]+)`/g,       `${CY}$1${R}`)
    .replace(/~~(.+?)~~/g,         `${D}$1${R}`);
}

export function renderMarkdown(text) {
  const lines = text.split('\n');
  const out   = [];
  let inCode  = false;
  let codeLang = '';
  let codeLines = [];

  const flushCode = () => {
    const w       = W();
    const barW    = Math.min(w - 6, 58);
    const label   = codeLang ? ` ${codeLang} ` : '';
    const dashes  = '─'.repeat(Math.max(0, barW - label.length));
    out.push(`  ${D}┌${label}${dashes}┐${R}`);
    for (const cl of codeLines) {
      out.push(`  ${D}│${R} ${CY}${cl}${R}`);
    }
    out.push(`  ${D}└${'─'.repeat(barW)}┘${R}`);
  };

  for (const line of lines) {
    // Code block fence
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)/);
    if (fenceMatch) {
      if (!inCode) {
        inCode    = true;
        codeLang  = fenceMatch[2].trim();
        codeLines = [];
      } else {
        flushCode();
        inCode   = false;
        codeLang = '';
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // Headings
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h1) { out.push(`\n  ${B}${WH}${h1[1]}${R}`); continue; }
    if (h2) { out.push(`\n  ${B}${h2[1]}${R}`);       continue; }
    if (h3) { out.push(`  ${MG}${h3[1]}${R}`);        continue; }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      out.push(`  ${D}${'─'.repeat(Math.min(W() - 4, 56))}${R}`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      out.push(`  ${D}│${R} ${D}${inlineFormat(line.slice(2))}${R}`);
      continue;
    }

    // Unordered list (-, *, +)
    const ulMatch = line.match(/^( *)([-*+]) (.+)/);
    if (ulMatch) {
      const indent = ulMatch[1].length;
      const bullet = indent > 0 ? `${D}◦${R}` : `${CY}•${R}`;
      out.push(`  ${' '.repeat(indent)}${bullet} ${inlineFormat(ulMatch[3])}`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^( *)(\d+)\. (.+)/);
    if (olMatch) {
      const indent = olMatch[1].length;
      out.push(`  ${' '.repeat(indent)}${CY}${olMatch[2]}.${R} ${inlineFormat(olMatch[3])}`);
      continue;
    }

    // Normal line with inline formatting
    out.push(inlineFormat(line));
  }

  // Unclosed code block
  if (inCode && codeLines.length > 0) flushCode();

  return out.join('\n');
}

// Stream-render partial markdown (for live streaming).
// Returns { rendered, tail } where tail is the unrendered trailing partial line.
export function renderPartial(text) {
  const lastNl = text.lastIndexOf('\n');
  if (lastNl === -1) return { rendered: '', tail: text };
  const safe = text.slice(0, lastNl + 1);
  const tail = text.slice(lastNl + 1);
  return { rendered: renderMarkdown(safe), tail };
}
