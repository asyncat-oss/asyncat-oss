// neko/src/Tools/skillCategories.js
// Skills by their plain category (Planning, Workflow, Recall, Risk checks,
// Habits, Tone, Other), for the Skills page's groups, search and New skill
// form. den names each skill's category and sends the list in order; the
// brain_region key skill files keep never reaches the page
// (den/src/agent/skillCategories.js maps the two).

export const DEFAULT_CATEGORY = 'Workflow';
const OTHER = 'Other';

/** A skill's category, Other when it has none. */
export function skillCategory(skill) {
  return String(skill?.category || '').trim() || OTHER;
}

/** True when the query is in a skill's name, description, category or tags. */
export function skillMatches(skill, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [skill?.name, skill?.description, skillCategory(skill), ...(Array.isArray(skill?.tags) ? skill.tags : [])]
    .some((text) => String(text || '').toLowerCase().includes(q));
}

/**
 * Skills in groups: [{ name, description, skills }], in the order den gave
 * the categories, then any category it didn't list. Empty groups are left out.
 */
export function groupByCategory(skills = [], categories = []) {
  const groups = new Map(categories.map((category) => [category.name, { name: category.name, description: category.description || '', skills: [] }]));
  for (const skill of skills) {
    const name = skillCategory(skill);
    if (!groups.has(name)) groups.set(name, { name, description: '', skills: [] });
    groups.get(name).skills.push(skill);
  }
  return [...groups.values()].filter((group) => group.skills.length > 0);
}

/** The New skill form's choices: [{ value, label }]. */
export function categoryOptions(categories = []) {
  const names = categories.map((category) => category.name).filter(Boolean);
  return (names.length ? names : [DEFAULT_CATEGORY, OTHER]).map((name) => ({ value: name, label: name }));
}
