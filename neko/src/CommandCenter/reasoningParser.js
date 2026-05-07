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
  const thoughtMatch = text.match(/(?:\*\*)?Thought:(?:\*\*)?\s*([\s\S]*?)(?=(?:\*\*)?(?:Action|Answer):(?:\*\*)?|<tool_call>|<think>|<thought>|<reasoning>|$)/i);
  if (!thoughtMatch) return { thinking: null, answer: text };

  const thinking = cleanText(thoughtMatch[1]);
  const answer = text.replace(thoughtMatch[0], '').replace(/^\s*(?:\*\*)?Answer:(?:\*\*)?\s*/i, '').trim();
  return { thinking: thinking || null, answer };
}

export function cleanReasoningAnswer(text) {
  return stripSpuriousGemmaThoughtLabel(stripToolWrappers(text))
    .replace(/^\s*(?:\*\*)?Answer:(?:\*\*)?\s*/i, '')
    .replace(/(?:\*\*)?Action:(?:\*\*)?\s*/i, '')
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
