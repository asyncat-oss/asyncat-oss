// Load the syntax highlighter and the maths renderer only when a message
// needs them, instead of in the app's startup bundle (they were about half
// a megabyte of it). Until they arrive, code shows as plain text and maths
// as its LaTeX source.

import { useEffect, useState } from 'react';

let highlighter = null;
let highlighterPromise = null;

export function loadHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import('highlight.js/lib/common'),
      import('highlight.js/lib/languages/dockerfile'),
      import('highlight.js/lib/languages/powershell'),
    ]).then(([common, dockerfile, powershell]) => {
      const hljs = common.default;
      hljs.registerLanguage('dockerfile', dockerfile.default);
      hljs.registerLanguage('powershell', powershell.default);
      hljs.registerAliases(['js'], { languageName: 'javascript' });
      hljs.registerAliases(['ts'], { languageName: 'typescript' });
      hljs.registerAliases(['py'], { languageName: 'python' });
      hljs.registerAliases(['sh', 'zsh'], { languageName: 'bash' });
      hljs.registerAliases(['md'], { languageName: 'markdown' });
      hljs.registerAliases(['html'], { languageName: 'xml' });
      highlighter = hljs;
      return hljs;
    });
  }
  return highlighterPromise;
}

/** highlight.js once loaded, or null while it loads. */
export function useHighlighter() {
  const [hljs, setHljs] = useState(highlighter);
  useEffect(() => {
    if (hljs) return undefined;
    let active = true;
    loadHighlighter().then((loaded) => { if (active) setHljs(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [hljs]);
  return hljs;
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Highlighted HTML for code, or escaped plain text when hljs isn't ready. */
export function highlightCode(hljs, code, language) {
  if (!code) return '';
  if (!hljs) return escapeHtml(code);
  const lang = String(language || '').toLowerCase();
  try {
    if (lang && lang !== 'text' && lang !== 'plaintext' && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

let katexModule = null;
let katexPromise = null;

export function loadKatex() {
  if (!katexPromise) {
    katexPromise = Promise.all([
      import('katex'),
      import('katex/dist/katex.min.css'),
    ]).then(async ([katex]) => {
      await import('katex/contrib/mhchem/mhchem.js');
      katexModule = katex.default;
      return katexModule;
    });
  }
  return katexPromise;
}

/** KaTeX once loaded, or null while it loads. */
export function useKatex() {
  const [katex, setKatex] = useState(katexModule);
  useEffect(() => {
    if (katex) return undefined;
    let active = true;
    loadKatex().then((loaded) => { if (active) setKatex(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [katex]);
  return katex;
}
