// den/src/agent/tools/askUserTool.js
// ─── Ask User Tool ──────────────────────────────────────────────────────────
// Lets the agent ask a clarifying question during an active run.

import { PermissionLevel } from './toolRegistry.js';

function normalizeChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices.map(c => String(c).trim()).filter(Boolean).slice(0, 8);
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
