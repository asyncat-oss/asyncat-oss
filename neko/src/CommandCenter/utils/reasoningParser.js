// Frontend mirror of the backend reasoning parser for live previews/fallbacks.

const REASONING_TAGS = ['think', 'thought', 'reasoning'];

function cleanText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function compactParts(parts) {
  const text = parts.map(cleanText).filter(Boolean).join('\n\n').trim();
  return text || null;
}

function stripToolWrappers(text) {
  return String(text || '')
    .replace(/\s*<tool_call>[\s\S]*?<\/(?:\w+:)?tool_call>/gi, '')
    .replace(/\s*<tool_call[\s\S]*$/i, '')
    .replace(/\s*<｜tool▁call▁begin｜>[\s\S]*?<｜tool▁call▁end｜>/gi, '')
    .trim();
}

function stripSpuriousGemmaThoughtLabel(text) {
  return String(text || '').replace(/^\s*thought\s*\n/i, '').trim();
}

function extractGemmaChannel(text) {
  const startRe = /<\|channel>thought\s*\n?/i;
  const start = text.search(startRe);
  if (start === -1) return null;

  const startMatch = text.slice(start).match(startRe);
  const thinkingStart = start + (startMatch?.[0]?.length || 0);
  const endToken = '<channel|>';
  const end = text.indexOf(endToken, thinkingStart);

  if (end === -1) {
    return {
      thinking: cleanText(text.slice(thinkingStart)),
      answer: cleanText(text.slice(0, start)),
    };
  }

  return {
    thinking: cleanText(text.slice(thinkingStart, end)),
    answer: cleanText(`${text.slice(0, start)}${text.slice(end + endToken.length)}`),
  };
}

function extractTaggedReasoning(text) {
  const thinkingParts = [];
  let answer = text;

  for (const tag of REASONING_TAGS) {
    const closedRe = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, 'gi');
    answer = answer.replace(closedRe, (_match, thought) => {
      thinkingParts.push(thought);
      return '';
    });

    const openRe = new RegExp(`<${tag}>`, 'i');
    const openMatch = answer.match(openRe);
    if (openMatch) {
      const idx = openMatch.index || 0;
      thinkingParts.push(answer.slice(idx + openMatch[0].length));
      answer = answer.slice(0, idx);
      break;
    }
  }

  return {
    thinking: compactParts(thinkingParts),
    answer: cleanText(answer),
  };
}

function stripReasoningLabels(text) {
  return String(text || '')
    // "Action:" glued straight to the next label ("Action: Thought: …").
    .replace(/(?:\*\*)?Action:\s*(?:\*\*)?(?=(?:\*\*)?(?:Thought|Answer|Final Answer)\s*:)/gi, '\n')
    // Labels count only at the start of a line, never inside a sentence.
    .replace(/(?:^|\n)[ \t]*(?:\*\*)?(?:Thought|Action|Final Answer|Answer)(?:\*\*)?:(?:\*\*)?[ \t]*/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// A ReAct label counts only at the start of a line. In a normal sentence
// ("The short answer: yes", "Food for thought:", "Call to action:") the words
// are part of the answer and must stay where they are.
const LABEL_RE = /(?:^|\n)[ \t]*(?:\*\*)?(Thought|Action|Final Answer|Answer)(?:\*\*)?:(?:\*\*)?[ \t]*/gi;

function extractMarkdownThought(text) {
  const raw = String(text || '');
  const matches = [...raw.matchAll(LABEL_RE)];
  // Only a reply that starts a line with "Thought:" is written in ReAct form.
  if (!matches.some(match => match[1]?.toLowerCase() === 'thought')) return { thinking: null, answer: text };

  const hasAnswer = matches.some(match => /^(?:final answer|answer)$/i.test(match[1] || ''));
  const thinkingParts = [];
  const answerParts = [];

  const preamble = raw.slice(0, matches[0].index).trim();
  if (preamble) thinkingParts.push(preamble);

  matches.forEach((match, index) => {
    const label = String(match[1] || '').toLowerCase();
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? raw.length;
    const segment = raw.slice(start, end).trim();
    if (!segment) return;

    if (label === 'thought') {
      thinkingParts.push(segment);
    } else if (label === 'answer' || label === 'final answer') {
      answerParts.push(segment);
    }
  });

  return {
    thinking: compactParts(thinkingParts),
    answer: hasAnswer ? cleanText(answerParts.join('\n\n')) : '',
  };
}

export function cleanReasoningAnswer(text) {
  return stripSpuriousGemmaThoughtLabel(stripToolWrappers(text))
    .replace(/^\s*(?:\*\*)?(?:Final Answer|Answer)(?:\*\*)?:(?:\*\*)?\s*/i, '')
    // A bare "Action:" left on the last line once its tool call is gone.
    .replace(/(?:^|\n)[ \t]*(?:\*\*)?Action(?:\*\*)?:(?:\*\*)?[ \t]*$/i, '')
    .replace(/<\|channel>thought\s*\n?<channel\|>/gi, '')
    .replace(/<\|turn\|>|<turn\|>|<eos>|<\/s>/gi, '')
    .trim();
}

function tokenKey(token = '') {
  return String(token || '')
    .toLowerCase()
    .replace(/^[^\w]+|[^\w]+$/g, '');
}

function collapseGluedDuplicateWords(text = '') {
  return String(text || '').replace(/\b([A-Za-z][A-Za-z]{1,24})\1\b/g, '$1');
}

export function normalizeReasoningForDisplay(text) {
  const raw = stripReasoningLabels(collapseGluedDuplicateWords(text));
  const tokens = raw.match(/\S+\s*/g) || [];
  if (tokens.length < 8) return raw;

  const output = [];
  let collapsed = 0;
  for (let i = 0; i < tokens.length;) {
    const maxWindow = Math.min(10, output.length, tokens.length - i);
    let duplicateSize = 0;
    for (let size = maxWindow; size >= 1; size--) {
      const prev = output.slice(output.length - size).map(tokenKey);
      const next = tokens.slice(i, i + size).map(tokenKey);
      if (prev.every(Boolean) && prev.every((value, index) => value === next[index])) {
        duplicateSize = size;
        break;
      }
    }
    if (duplicateSize > 0) {
      collapsed += duplicateSize;
      i += duplicateSize;
      continue;
    }
    output.push(tokens[i]);
    i++;
  }

  return collapsed >= 4 ? output.join('') : raw;
}

export function extractReasoningFromText(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { thinking: null, answer: '' };

  const thinkingParts = [];
  let answer = raw;

  const gemma = extractGemmaChannel(answer);
  if (gemma) {
    if (gemma.thinking) thinkingParts.push(gemma.thinking);
    answer = gemma.answer;
  }

  const tagged = extractTaggedReasoning(answer);
  if (tagged.thinking) thinkingParts.push(tagged.thinking);
  answer = tagged.answer;

  const markdown = extractMarkdownThought(answer);
  if (markdown.thinking) thinkingParts.push(markdown.thinking);
  answer = markdown.answer;

  return {
    thinking: compactParts(thinkingParts),
    answer: cleanReasoningAnswer(answer),
  };
}
