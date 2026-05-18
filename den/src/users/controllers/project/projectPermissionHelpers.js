function isValidSingleEmoji(input) {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed) return false;

  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = Array.from(segmenter.segment(trimmed));
  if (segments.length !== 1) return false;

  const char = segments[0].segment;
  const emojiRegex = /^(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}])$/u;
  const extendedEmojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)$/u;
  return emojiRegex.test(char) || extendedEmojiRegex.test(char);
}

function sanitizeEmoji(emoji) {
  const DEFAULT_EMOJI = '📁';
  if (!emoji) return DEFAULT_EMOJI;
  const cleaned = emoji.toString().trim().replace(/[<>"'&]/g, '');
  if (isValidSingleEmoji(cleaned)) return cleaned;
  return DEFAULT_EMOJI;
}

export {
  sanitizeEmoji,
  isValidSingleEmoji,
};
