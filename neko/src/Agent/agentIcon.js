// An agent's emoji, when the user chose one. Agents used to get the robot
// emoji when none was picked (den stored it), so that one counts as none and
// the agent shows the plain bot glyph or its initial instead.

export const DEFAULT_AGENT_ICON = '🤖';

/** The emoji to show for an agent, or null for none or the old default. */
export function chosenAgentIcon(icon) {
  const value = typeof icon === 'string' ? icon.trim() : '';
  return value && value !== DEFAULT_AGENT_ICON ? value : null;
}
