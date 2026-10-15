// A project's emoji, when the user chose one. Projects get the folder emoji
// by default (den stores it when none is picked), so that one counts as none
// here and the chat shows its plain folder icon instead.

export const DEFAULT_PROJECT_EMOJI = '📁';

/** The emoji to show for a project, or null for none or the default one. */
export function chosenProjectEmoji(emoji) {
  const value = typeof emoji === 'string' ? emoji.trim() : '';
  return value && value !== DEFAULT_PROJECT_EMOJI ? value : null;
}
