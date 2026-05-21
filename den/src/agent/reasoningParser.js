// Shared reasoning extraction for OpenAI-compatible and local model outputs.

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
  const startRe = /<\|channel\>thought\s*\n?/i;
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

function extractMarkdownThought(text) {
  const raw = String(text || '');
  const labelRe = /(?:\*\*)?(Thought|Action|Final Answer|Answer):(?:\*\*)?\s*/gi;
  const matches = [...raw.matchAll(labelRe)];
  if (!matches.length) return { thinking: null, answer: text };

  const hasThought = matches.some(match => match[1]?.toLowerCase() === 'thought');
  const hasAnswer = matches.some(match => /^(?:final answer|answer)$/i.test(match[1] || ''));
  if (!hasThought && !hasAnswer) return { thinking: null, answer: text };

  const thinkingParts = [];
  const answerParts = [];

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
    .replace(/^\s*(?:\*\*)?(?:Final Answer|Answer):(?:\*\*)?\s*/i, '')
    .replace(/(?:\*\*)?Action:(?:\*\*)?\s*/gi, '')
    .replace(/(?:\*\*)?Thought:(?:\*\*)?\s*/gi, '')
    .replace(/<\|channel\>thought\s*\n?<channel\|>/gi, '')
    .replace(/<\|turn\|>|<turn\|>|<eos>|<\/s>/gi, '')
    .trim();
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

export function reasoningTextFromDelta(delta = {}) {
  const candidates = [
    delta.reasoning,
    delta.reasoning_content,
    delta.thinking,
    delta.thought,
    delta.reasoningText,
    delta.reasoning_text,
  ];

  if (Array.isArray(delta.reasoning_details)) {
    candidates.push(...delta.reasoning_details);
  } else if (delta.reasoning_details) {
    candidates.push(delta.reasoning_details);
  }

  return candidates
    .map(value => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      if (typeof value.text === 'string') return value.text;
      if (typeof value.content === 'string') return value.content;
      if (typeof value.reasoning === 'string') return value.reasoning;
      return '';
    })
    .join('');
}

export function appendReasoningText(existing = '', incoming = '') {
  const current = String(existing || '');
  const next = String(incoming || '');
  if (!next) return current;
  if (!current) return next;
  if (current.endsWith(next)) return current;
  if (next.startsWith(current)) return next;

  const max = Math.min(current.length, next.length);
  for (let size = max; size > 0; size--) {
    if (current.slice(-size) === next.slice(0, size)) {
      return current + next.slice(size);
    }
  }
  return current + next;
}

export function combineReasoningParts(...parts) {
  const combined = [];
  for (const part of parts) {
    const text = cleanText(part);
    if (!text) continue;
    if (combined.some(existing => existing === text || existing.includes(text))) continue;
    combined.push(text);
  }
  return compactParts(combined);
}
