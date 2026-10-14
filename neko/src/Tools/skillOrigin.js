// neko/src/Tools/skillOrigin.js
// Where a skill came from, for the Skills page's filters and counts: bundled
// with Asyncat ("default"), written or saved by the user ("user"), or
// written on its own by an older version of Asyncat ("auto").

/** 'default', 'user' or 'auto'. */
export function getSkillOrigin(skill) {
  if (skill?.source !== 'user') return 'default';
  // Saved with "Save this as a skill?" in a chat: the user chose it.
  if (skill.created_by === 'chat-suggestion') return 'user';
  const tags = Array.isArray(skill.tags) ? skill.tags.map(tag => String(tag).toLowerCase()) : [];
  if (
    skill.created_by === 'basal-ganglia' ||
    skill.created_by === 'skill-synthesizer' ||
    tags.includes('auto-generated') ||
    tags.includes('auto-synthesized') ||
    tags.includes('learned')
  ) {
    return 'auto';
  }
  return 'user';
}
