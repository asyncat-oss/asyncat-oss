// Events the interactive parts of answers send to the chat page.

/** A follow-up button was pressed: { detail: { text } } is sent as the next message. */
export const FOLLOW_UP_EVENT = 'asyncat:follow-up';

/**
 * A button under a model error was pressed: { detail: { action } } is 'pick'
 * (open the composer's model menu) or 'models' (open the Models page).
 */
export const MODEL_ACTION_EVENT = 'asyncat:model-action';
