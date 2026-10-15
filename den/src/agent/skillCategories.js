// den/src/agent/skillCategories.js
// Skill categories by their plain names (Planning, Workflow, …), and the
// brain_region key skill files have always kept them under. Files keep that
// key, so older skills and other copies of Asyncat still read them; the API
// and the Skills page use the plain name.

export const SKILL_CATEGORIES = [
  { name: 'Planning', region: 'prefrontal', description: 'Shaping a goal and reasoning step by step' },
  { name: 'Workflow', region: 'cerebellum', description: 'Procedures and repeatable ways of working' },
  { name: 'Recall', region: 'hippocampus', description: 'Finding context and what was learned before' },
  { name: 'Risk checks', region: 'amygdala', description: 'Safety, permissions and care with big changes' },
  { name: 'Habits', region: 'basal_ganglia', description: 'Default behaviour and working preferences' },
  { name: 'Tone', region: 'limbic', description: 'Style, empathy and how answers read' },
  { name: 'Other', region: 'unknown', description: 'Skills with no category' },
];

const OTHER = SKILL_CATEGORIES.at(-1);

function key(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

/** The category for a value: its plain name or a brain_region key, in any case. */
function find(value) {
  const wanted = key(value);
  return SKILL_CATEGORIES.find((category) => key(category.name) === wanted || key(category.region) === wanted) || null;
}

/** The plain name for a skill file's brain_region (Other when missing or unknown). */
export function categoryForRegion(region) {
  return (find(region) || OTHER).name;
}

/** The brain_region to write for a category's plain name (or an old region key). */
export function regionForCategory(category) {
  return (find(category) || OTHER).region;
}
