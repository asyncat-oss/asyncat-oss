// den/src/agent/tools/askUserTool.js
// ─── Ask User Tool ──────────────────────────────────────────────────────────
// Lets the agent ask a clarifying question during an active run.

import { PermissionLevel } from './toolRegistry.js';

function normalizeChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices.map(c => String(c).trim()).filter(Boolean).slice(0, 8);
}

const FIELD_KINDS = ['text', 'long_text', 'number', 'choice'];

/** A small form: up to six labelled fields, each text, long text, a number or a choice. */
export function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.slice(0, 6).map((field, index) => {
    const label = String(field?.label || '').trim().slice(0, 80);
    if (!label) return null;
    const choices = normalizeChoices(field.choices);
    const kind = FIELD_KINDS.includes(field.kind) ? field.kind : (choices.length ? 'choice' : 'text');
    if (kind === 'choice' && !choices.length) return null;
    return {
      id: `f${index}`,
      label,
      kind,
      choices: kind === 'choice' ? choices : [],
      placeholder: field.placeholder ? String(field.placeholder).slice(0, 80) : '',
    };
  }).filter(Boolean);
}

export const askUserTool = {
  name: 'ask_user',
  description: 'Ask the user a clarifying question when missing information materially changes the task outcome. Do not use for facts that can be discovered with available tools.',
  category: 'interaction',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The concise question to ask the user.' },
      choices: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional short answer choices. If supplied, keep the list small.',
      },
      default: { type: 'string', description: 'Optional default answer if the user submits an empty response.' },
      fields: {
        type: 'array',
        description: 'Optional small form, when several details are needed at once (at most 6). The answer comes back as "Label: value" lines.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'What to fill in, e.g. "Balcony size".' },
            kind: { type: 'string', enum: FIELD_KINDS, description: 'text, long_text, number, or choice (pick one of `choices`).' },
            choices: { type: 'array', items: { type: 'string' } },
            placeholder: { type: 'string' },
          },
          required: ['label'],
        },
      },
    },
    required: ['question'],
  },
  execute: async (args, context) => {
    if (!context.askUser) {
      return { success: false, error: 'ask_user is not available in this run' };
    }

    const question = String(args.question || '').trim();
    if (!question) return { success: false, error: 'question is required' };

    const result = await context.askUser({
      question,
      choices: normalizeChoices(args.choices),
      fields: normalizeFields(args.fields),
      default: args.default === undefined ? null : String(args.default),
      sessionId: context.session?.id || null,
    });

    if (!result?.success) {
      return { success: false, error: result?.error || 'User did not answer in time' };
    }

    return { success: true, answer: String(result.answer || '') };
  },
};

export const askUserTools = [askUserTool];
export default askUserTools;
