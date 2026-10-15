// Settings → Personalization: the rules behind its two fields and the
// instructions file row. No React, so node:test can cover it.

// den's limits (users/personalization.js, agent/prompts/agentSystemPrompt.js);
// the server sends its own with the values and refuses anything longer.
export const PREFERENCE_LIMIT = 1500;
export const INSTRUCTIONS_LIMIT = 20000;

const number = (n) => Number(n || 0).toLocaleString('en');

/** "120 / 1,500", the quiet count under a field. */
export function countLabel(length, limit) {
  return `${number(length)} / ${number(limit)}`;
}

/** Near the limit, the count turns amber so it is noticed before typing stops. */
export function nearLimit(length, limit) {
  return limit > 0 && length >= limit * 0.9;
}

/** Text as den saves it: plain line endings, ends trimmed. */
export function cleanPreference(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').trim();
}

/** True when the fields differ from what is saved, ignoring what saving trims. */
export function preferencesChanged(saved = {}, draft = {}) {
  return cleanPreference(saved.about) !== cleanPreference(draft.about)
    || cleanPreference(saved.answerStyle) !== cleanPreference(draft.answerStyle);
}

/** What the instructions file row says about the file in use. */
export function instructionsStatus(info) {
  if (!info) return '';
  return info.edited ? 'Edited' : 'Default';
}
