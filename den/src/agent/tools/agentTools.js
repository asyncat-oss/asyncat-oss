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
        requestPermission: context.requestPermission,
        askUser: context.askUser,
      });

      try {
        const result = await subAgent.run(subGoal);
        return { success: true, answer: result.answer, rounds_taken: result.session.totalRounds };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },
  {
    name: 'delegate_to_profile',
    description: 'Delegate a subtask to a named agent profile, usually one the user mentioned with @handle. The delegated agent uses that profile soul, working directory, max rounds, and pre-approved tools.',
    permission: PermissionLevel.MODERATE,
    category: 'agent',
    parameters: {
      type: 'object',
      properties: {
        profileHandle: { type: 'string', description: 'Agent profile handle without @, for example "research-agent".' },
        profileId: { type: 'string', description: 'Agent profile id. Use this when the profile id is known.' },
        task: { type: 'string', description: 'The concrete task for the delegated profile to complete.' },
        context: { type: 'string', description: 'Optional extra context, constraints, or expected output for the delegated profile.' }
      },
      required: ['task']
    },
    execute: async (args, context) => {
      const { AgentRuntime } = await import('../AgentRuntime.js');
      const { getAiClientForUser } = await import('../../ai/controllers/ai/clientFactory.js');
      const { getProfile, getProfileByHandle } = await import('../ProfileManager.js');
      const { loadSoul } = await import('../prompts/agentSystemPrompt.js');

      const profile = args.profileId
        ? getProfile(args.profileId, context.userId)
        : args.profileHandle
          ? getProfileByHandle(String(args.profileHandle).replace(/^@/, ''), context.userId)
          : null;

      if (!profile) {
        return { success: false, error: 'Agent profile not found. Use a valid profileHandle or profileId.' };
      }

      const providerInfo = await getAiClientForUser(context.userId);
      if (!providerInfo || !providerInfo.client) {
        return { success: false, error: 'Could not initialize AI client for delegated agent.' };
      }

      let resolvedSoul = null;
      if (profile.soul_override) {
        resolvedSoul = profile.soul_override.replace(/^---[\s\S]*?---\n?/, '').trim() || null;
      } else if (profile.soul_name && profile.soul_name !== 'default') {
        resolvedSoul = loadSoul(profile.soul_name);
      }

      const subGoal = [
        `You are running as @${profile.handle} (${profile.name}).`,
        profile.description ? `Profile description: ${profile.description}` : null,
        `Delegated task: ${args.task}`,
        args.context ? `Context from parent agent:\n${args.context}` : null,
        'Complete only this delegated task and return a concise final answer for the parent agent.',
      ].filter(Boolean).join('\n\n');

      context.emitEvent?.({
        type: 'agent_delegate_start',
        data: {
          profileId: profile.id,
          profileHandle: profile.handle,
          profileName: profile.name,
          profileIcon: profile.icon,
          task: args.task,
        },
      });

      const subAgent = new AgentRuntime({
        aiClient: providerInfo.client,
        model: providerInfo.model,
        isLocal: providerInfo.isLocal,
        supportsNativeTools: providerInfo.supportsNativeTools,
        userId: context.userId,
        workspaceId: context.workspaceId,
        workingDir: profile.working_dir || context.workingDir,
        maxRounds: profile.max_rounds || 15,
        autoApprove: profile.auto_approve || false,
        requestPermission: context.requestPermission,
        askUser: context.askUser,
        soul: resolvedSoul,
        providerInfo: providerInfo.providerInfo,
      });

      if (Array.isArray(profile.always_allowed_tools)) {
        profile.always_allowed_tools.forEach(tool => {
          if (typeof tool === 'string' && tool.trim()) {
            subAgent.sessionApprovedTools.add(tool.trim());
          }
        });
      }

      try {
        const result = await subAgent.run(subGoal);
        const payload = {
          success: true,
          profile: {
            id: profile.id,
            handle: profile.handle,
            name: profile.name,
            icon: profile.icon,
          },
          answer: result.answer,
          sessionId: result.session.id,
          roundsTaken: result.session.totalRounds,
          status: result.session.status,
        };
        context.emitEvent?.({ type: 'agent_delegate_result', data: payload });
        return payload;
      } catch (err) {
        const payload = {
          success: false,
          profile: {
            id: profile.id,
            handle: profile.handle,
            name: profile.name,
            icon: profile.icon,
          },
          error: err.message,
        };
        context.emitEvent?.({ type: 'agent_delegate_result', data: payload });
        return payload;
      }
    }
  }
];
