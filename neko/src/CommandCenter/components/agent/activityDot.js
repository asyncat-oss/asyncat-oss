// The dot beside a step in the Steps panel. Calm by default: grey, and red
// only for an error. The chat page still passes a colour per kind of step.

export const ERROR_DOT = 'bg-red-500';
export const STEP_DOT = 'bg-fg-subtle/60';

/** The class for a step's dot, from the colour class the chat page gave it. */
export function activityDot(given = '') {
  return /\bbg-red-/.test(String(given || '')) ? ERROR_DOT : STEP_DOT;
}
