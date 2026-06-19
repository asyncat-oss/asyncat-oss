// den/src/agent/tools/agentTools.js
import { PermissionLevel } from './toolRegistry.js';
import { createSandbox } from '../SandboxManager.js';
import { randomUUID } from 'crypto';

function looksLikeCodingTask(task = '') {
  return /\b(code|implement|fix|bug|refactor|test|build|component|route|api|schema|migration|file|repo|repository|frontend|backend|package|dependency)\b/i
    .test(String(task || ''));
}

function isolationChoice(value) {
  return ['auto', 'sandbox', 'same_workspace'].includes(value) ? value : 'auto';
}

export const agentTools = [
  {
    name: 'delegate_task',
    description: 'Delegate a complex sub-task to a specialized sub-agent that runs in its own isolated context and returns only a concise result — ideal for fanning out big tasks (deep repo exploration, research, a self-contained coding chunk) without bloating your own context window. Set read_only:true for pure investigation/research (the sub-agent then cannot modify anything), and pass `tools` to restrict it to a focused toolset.',
    category: 'agent',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'The role of the sub-agent, e.g. "Web Scraper", "Code Reviewer"' },
        task: { type: 'string', description: 'The specific task for the sub-agent to accomplish' },
        isolation: { type: 'string', enum: ['auto', 'sandbox', 'same_workspace'], description: 'Where the sub-agent should work. auto creates a sandbox for coding tasks and otherwise uses the current workspace.' },
        read_only: { type: 'boolean', description: 'If true, the sub-agent runs in read-only mode (inspect/search/read only, no writes or side effects). Use for research and exploration.' },
        tools: { type: 'array', description: 'Optional allow-list of tool names to restrict the sub-agent to (planning and ask_user are always available).', items: { type: 'string' } },
        max_rounds: { type: 'number', description: 'Optional cap on the sub-agent\'s reasoning rounds (default 15, max 30).' },
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

      const subagentSessionId = randomUUID();
      const isolation = isolationChoice(args.isolation);
      const wantsSandbox = isolation === 'sandbox' || (isolation === 'auto' && looksLikeCodingTask(args.task));
      let sandbox = null;
      let workingDir = context.workingDir;
      let workspaceRoot = context.workspaceRoot || context.workingDir;

      if (wantsSandbox) {
        try {
          const created = createSandbox({
            userId: context.userId,
            workspaceId: context.workspaceId,
            name: `delegate-${args.role || 'agent'}`,
            sourcePath: context.workspaceRoot || context.workingDir,
            strategy: 'auto',
            baseRef: 'HEAD',
          });
          sandbox = created?.sandbox || null;
          if (sandbox?.sandboxPath) {
            workingDir = sandbox.sandboxPath;
            workspaceRoot = sandbox.sandboxPath;
          }
        } catch (err) {
          if (isolation === 'sandbox') {
            return { success: false, error: `Could not create sandbox for delegated task: ${err.message}` };
          }
        }
      }

      // We give the sub-agent a modified goal so it adopts its role
      const subGoal = [
        `You are a specialized sub-agent with the role: ${args.role}.`,
        sandbox ? `You are working in an isolated sandbox at ${sandbox.sandboxPath}. Do not apply changes back to the source workspace yourself; report what changed and how to review/apply it.` : null,
        `Your specific task is: ${args.task}`,
        'Do not ask the user for permission or clarification, just do the task to the best of your ability and return the final answer.',
      ].filter(Boolean).join('\n\n');

      context.emitEvent?.({
        type: 'agent_delegate_start',
        data: {
          profileId: 'default',
          profileHandle: args.role.toLowerCase().replace(/\s+/g, '-'),
          profileName: args.role,
          profileIcon: '🤖',
          task: args.task,
          sessionId: subagentSessionId,
          sandbox,
          readOnly: !!args.read_only,
          scopedToolCount: Array.isArray(args.tools) ? args.tools.filter(Boolean).length : null,
        },
      });

      const subAgentRounds = Math.min(Math.max(Number(args.max_rounds) || 15, 1), 30);
      const subAgentTools = Array.isArray(args.tools)
        ? args.tools.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim())
        : null;

      const subAgent = new AgentRuntime({
        aiClient: providerInfo.client,
        model: providerInfo.model,
        isLocal: providerInfo.isLocal,
        supportsNativeTools: providerInfo.supportsNativeTools,
        userId: context.userId,
        workspaceId: context.workspaceId,
        workingDir,
        workspaceRoot,
        maxRounds: subAgentRounds,
        // read_only research sub-agents reuse plan mode, which already restricts
        // execution to safe inspect/read/search tools with no side effects.
        agentMode: args.read_only ? 'plan' : 'action',
        allowedTools: subAgentTools,
        requestPermission: context.requestPermission,
        askUser: context.askUser,
        providerInfo: providerInfo.providerInfo,
        usageContext: { operation: 'delegated-agent' },
        sessionIdOverride: subagentSessionId,
        onEvent: (event) => {
          context.emitEvent?.({
            type: 'subagent_event',
            data: {
              parentSessionId: context.session?.id,
              subagentSessionId,
              role: args.role,
              task: args.task,
              event,
            }
          });
        }
      });

      try {
        const result = await subAgent.run(subGoal);
        const payload = {
          success: true,
          profile: {
            id: 'default',
            handle: args.role.toLowerCase().replace(/\s+/g, '-'),
            name: args.role,
            icon: '🤖',
          },
          answer: result.answer,
          sessionId: subagentSessionId,
          sandbox,
          readOnly: !!args.read_only,
          scopedToolCount: Array.isArray(args.tools) ? args.tools.filter(Boolean).length : null,
          roundsTaken: result.session.totalRounds,
          status: result.session.status,
        };
        context.emitEvent?.({ type: 'agent_delegate_result', data: payload });
        return payload;
      } catch (err) {
        const payload = {
          success: false,
          profile: {
            id: 'default',
            handle: args.role.toLowerCase().replace(/\s+/g, '-'),
            name: args.role,
            icon: '🤖',
          },
          readOnly: !!args.read_only,
          scopedToolCount: Array.isArray(args.tools) ? args.tools.filter(Boolean).length : null,
          error: err.message,
          sessionId: subagentSessionId,
        };
        context.emitEvent?.({ type: 'agent_delegate_result', data: payload });
        return payload;
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

      const subagentSessionId = randomUUID();

      context.emitEvent?.({
        type: 'agent_delegate_start',
        data: {
          profileId: profile.id,
          profileHandle: profile.handle,
          profileName: profile.name,
          profileIcon: profile.icon,
          task: args.task,
          sessionId: subagentSessionId,
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
        usageContext: { operation: 'delegated-agent' },
        sessionIdOverride: subagentSessionId,
        onEvent: (event) => {
          context.emitEvent?.({
            type: 'subagent_event',
            data: {
              parentSessionId: context.session?.id,
              subagentSessionId,
              role: profile.name,
              task: args.task,
              event,
            }
          });
        }
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
          sessionId: subagentSessionId,
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
          sessionId: subagentSessionId,
        };
        context.emitEvent?.({ type: 'agent_delegate_result', data: payload });
        return payload;
      }
    }
  }
];
