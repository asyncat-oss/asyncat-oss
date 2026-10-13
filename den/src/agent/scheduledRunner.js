// den/src/agent/scheduledRunner.js
// ─── One unattended run of a scheduled task ──────────────────────────────────
// Runs the built-in agent with the task's model, agent and Project, the way a
// chat in that Project would, except that nobody is there to approve tools:
// only safe tools and the tools the task pre-approves can run, and the run
// can't create, change or start scheduled tasks.

import { AgentRuntime } from './AgentRuntime.js';
import { getDefaultProfile, getProfile } from './ProfileManager.js';
import { loadSoul } from './prompts/agentSystemPrompt.js';
import { scheduledRunToolNames } from './toolScopes.js';
import { taskWorkingContext } from './scheduledTaskChat.js';
import { formatMultimodalCapabilityPrompt, getMultimodalCapabilities } from './multimodalCapabilities.js';
import { getAiClientForScheduledProvider } from '../ai/controllers/ai/clientFactory.js';
import { getWorkspaceRoot, resolveWorkingDirectoryContext } from '../files/fileExplorerService.js';

function soulFor(profile) {
  if (profile?.soul_override) {
    return profile.soul_override.replace(/^---[\s\S]*?---\n?/, '').trim() || null;
  }
  if (profile?.soul_name && profile.soul_name !== 'default') return loadSoul(profile.soul_name);
  return null;
}

/**
 * Extra system-prompt text for a scheduled run: where it runs and that nobody
 * is watching. Project instructions and knowledge belong here too.
 */
export function buildRunContext({ task, workingContext }) {
  const parts = [
    `This is an unattended scheduled run of the task "${task.name}" (${task.scheduleText}). Nobody is watching, so don't ask questions: do the task, then reply with the result. Your reply is saved to the task's chat and shown in a notification, so put the most useful line first.`,
    'Only safe tools and the tools this task pre-approves can run. If a tool you need is refused, say which one so the user can pre-approve it.',
    workingContext
      ? `Project: ${workingContext.projectName || 'the selected Project'}. Work inside its folder.`
      : 'Project scope: this task has no Project, so local files, code, shell and Git tools are unavailable.',
  ];
  return { capabilitiesSection: parts.join('\n\n') };
}

/**
 * Run a task once. Resolves to { answer, sessionId }; rejects on failure or
 * when `abortSignal` fires.
 */
export async function runScheduledTask({ task, abortSignal, conversationHistory = [], onEvent }) {
  const { client, model, isLocal, supportsNativeTools, providerInfo } = getAiClientForScheduledProvider(
    task.userId, task.providerProfileId, task.providerSnapshot,
  );
  const profile = task.profileId ? getProfile(task.profileId, task.userId) : getDefaultProfile(task.userId);

  const projectContext = taskWorkingContext(task);
  const workingContext = projectContext
    ? { ...resolveWorkingDirectoryContext(projectContext, { userId: task.userId, projectId: task.projectId }), projectName: projectContext.projectName }
    : null;
  const runContext = buildRunContext({ task, workingContext });
  const multimodal = await getMultimodalCapabilities(task.userId).catch(() => null);
  const workingDir = workingContext?.workingDir || getWorkspaceRoot();

  const agent = new AgentRuntime({
    aiClient: client,
    model,
    isLocal,
    supportsNativeTools,
    userId: task.userId,
    workspaceId: task.workspaceId,
    projectId: workingContext?.projectId || null,
    workingDir,
    workspaceRoot: workingContext?.rootPath || workingDir,
    maxRounds: profile?.max_rounds || 20,
    // Never auto-approve unattended: the profile's auto-approve doesn't apply.
    autoApprove: false,
    requestPermission: async ({ tool, permission }) => ({
      decision: 'deny',
      reason: `Scheduled runs can't ask for approval, and "${tool}" (${permission}) isn't pre-approved for this task. Add it under Advanced → Pre-approved tools to allow it.`,
    }),
    soul: soulFor(profile),
    providerInfo,
    agentMode: 'action',
    agentProfileId: profile?.id || null,
    allowedTools: scheduledRunToolNames({ hasProject: Boolean(workingContext) }),
    capabilitiesSection: [multimodal ? formatMultimodalCapabilityPrompt(multimodal) : '', runContext.capabilitiesSection]
      .filter(Boolean).join('\n\n'),
    clientTimezone: task.timezone || null,
    abortSignal,
    onEvent,
    usageContext: { operation: 'scheduled', conversationId: task.conversationId || null },
  });
  for (const tool of task.allowedTools || []) agent.sessionApprovedTools.add(tool);

  try {
    const result = await agent.run(task.prompt, conversationHistory);
    // A model error comes back as an "Error: …" answer on a failed session.
    if (result.session?.status === 'failed') {
      throw new Error(`The model call failed: ${String(result.answer || '').replace(/^Error:\s*/, '') || 'no details'}`);
    }
    return { answer: result.answer, sessionId: result.session?.id || null, stopReason: result.stopReason || null };
  } catch (err) {
    if (agent.session && agent.session.status === 'active') {
      try {
        agent.session.fail(err?.message || 'Stopped');
      } catch { /* the session row is cleaned up at the next start */ }
    }
    if (err && typeof err === 'object') err.sessionId = agent.session?.id || null;
    throw err;
  }
}
