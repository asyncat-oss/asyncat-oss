// den/src/agent/tools/agentTools.js
import { PermissionLevel } from './toolRegistry.js';

export const agentTools = [
  {
    name: 'delegate_task',
    description: 'Delegate a complex sub-task to a specialized sub-agent. The sub-agent has the same capabilities but runs in isolation. Use this to break down huge tasks.',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'The role of the sub-agent, e.g. "Web Scraper", "Code Reviewer"' },
        task: { type: 'string', description: 'The specific task for the sub-agent to accomplish' }
      },
      required: ['role', 'task']
    },
    execute: async (args, context) => {
      // Dynamically import AgentRuntime to avoid circular dependencies
      const { AgentRuntime } = await import('../AgentRuntime.js');
      const { getAiClientForUser } = await import('../../ai/controllers/ai/clientFactory.js');
      
      const providerInfo = await getAiClientForUser(context.userId);
      if (!providerInfo || !providerInfo.client) {
        return { success: false, error: 'Could not initialize AI client for sub-agent.' };
      }

      // We give the sub-agent a modified goal so it adopts its role
      const subGoal = `You are a specialized sub-agent with the role: ${args.role}.\nYour specific task is: ${args.task}\n\nDo not ask the user for permission or clarification, just do the task to the best of your ability and return the final answer.`;

      const subAgent = new AgentRuntime({
        aiClient: providerInfo.client,
        model: providerInfo.model,
        isLocal: providerInfo.isLocal,
        supportsNativeTools: providerInfo.supportsNativeTools,
        userId: context.userId,
        workspaceId: context.workspaceId,
        workingDir: context.workingDir,
        maxRounds: 15, // Cap sub-agents at 15 rounds
      });

      try {
        const result = await subAgent.run(subGoal);
        return { success: true, answer: result.answer, rounds_taken: result.session.totalRounds };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }
];
