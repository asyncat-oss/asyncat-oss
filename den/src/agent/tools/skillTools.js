// den/src/agent/tools/skillTools.js
// ─── Skill Tools ──────────────────────────────────────────────────────────────
// Lets the agent list and load skills on demand during a run.

import { listSkills } from '../skills.js';
import { PermissionLevel } from './toolRegistry.js';

export const skillTools = [
  {
    name: 'list_skills',
    description: 'List all available skills (Cerebellum). Returns skill names, descriptions, and tags so you can decide which to load.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    permission: PermissionLevel.SAFE,
    category: 'agent',
    execute: async () => {
      const skills = listSkills();
      return {
        skills: skills.map(s => ({
          name: s.name,
          description: s.description || '',
          tags: Array.isArray(s.tags) ? s.tags : (typeof s.tags === 'string' ? s.tags.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean) : []),
          when_to_use: s.when_to_use || '',
        })),
        count: skills.length,
      };
    },
  },
  {
    name: 'load_skill',
    description: 'Load the full content of a skill by name. Use this when a task matches a skill\'s domain — the skill gives you detailed step-by-step guidance. Call list_skills first if you\'re unsure of the name.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The exact skill name (e.g. "systematic-debugging", "git-workflow"). Use list_skills to see available names.',
        },
      },
      required: ['name'],
    },
    permission: PermissionLevel.SAFE,
    category: 'agent',
    execute: async ({ name }) => {
      const skills = listSkills();
      const skill = skills.find(s => s.name === name);
      if (!skill) {
        const available = skills.map(s => s.name).join(', ');
        return { error: `Skill "${name}" not found. Available skills: ${available}` };
      }
      return {
        name: skill.name,
        description: skill.description || '',
        when_to_use: skill.when_to_use || '',
        body: skill.body || '',
        source: skill.source || 'bundled',
      };
    },
  },
];
