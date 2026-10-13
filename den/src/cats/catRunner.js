// den/src/cats/catRunner.js
// ─── One run of a Cat ────────────────────────────────────────────────────────
// Runs Asyncat's agent as the Cat: its brain (an agent's instructions, files
// and model), its own folder, its project if it shares one, and its own
// memories. Nobody is watching, so approvals and questions come from
// catEngine.js, which decides them by the Cat's freedom or asks the user
// through the inbox. A Cat can't create, change or wake Cats.

import fs from 'fs';
import { AgentRuntime } from '../agent/AgentRuntime.js';
import { getDefaultProfile, getProfile, toolsForCapabilities } from '../agent/ProfileManager.js';
import { toolRegistry } from '../agent/tools/toolRegistry.js';
import { loadSoul } from '../agent/prompts/agentSystemPrompt.js';
import { scheduledRunToolNames } from '../agent/toolScopes.js';
import { formatMultimodalCapabilityPrompt, getMultimodalCapabilities } from '../agent/multimodalCapabilities.js';
import { getAiClientForScheduledProvider } from '../ai/controllers/ai/clientFactory.js';
import { buildChatContext, projectForChat } from '../knowledge/chatContext.js';
import { describeSites } from './catSites.js';

const FREEDOM_TEXT = {
  ask_first: 'Ask first: every step that changes something (writing files, running commands, sending, posting, clicking buttons) waits for the user\'s OK. Reading and searching don\'t.',
  ask_risky: 'Ask for risky steps: you may read, write in your folder and browse freely; risky steps (deleting, sending, paying, running commands that change things) wait for the user\'s OK.',
  alone: 'Work alone: you may do what your mission needs without asking. Payments, passwords and steps a site marks as sensitive still wait for the user\'s OK.',
};

function soulFor(profile) {
  if (profile?.soul_name && profile.soul_name !== 'default') return loadSoul(profile.soul_name);
  return null;
}

/** The Cat's own model, else its brain's, else the one in use now. */
export function clientForCat(cat, profile) {
  const pinned = cat.providerProfileId || cat.providerSnapshot?.model;
  if (!pinned && profile?.model_profile_id) {
    try {
      return getAiClientForScheduledProvider(cat.userId, profile.model_profile_id);
    } catch (err) {
      console.warn(`[cats] ${profile.name}'s model is unavailable for ${cat.name}, using the current one: ${err.message}`);
    }
  }
  return getAiClientForScheduledProvider(cat.userId, cat.providerProfileId, pinned ? cat.providerSnapshot : null);
}

function limitsText(cat) {
  const { limits = {}, usageToday = {} } = cat;
  const parts = [];
  if (limits.runsPerDay) parts.push(`${usageToday.runs || 0} of ${limits.runsPerDay} runs`);
  if (limits.tokensPerDay) parts.push(`${(usageToday.tokens || 0).toLocaleString()} of ${limits.tokensPerDay.toLocaleString()} tokens`);
  if (limits.minutesPerDay) parts.push(`${usageToday.minutes || 0} of ${limits.minutesPerDay} minutes`);
  if (limits.costPerDay && limits.pricePerMillion) parts.push(`$${(usageToday.costUsd || 0).toFixed(2)} of $${limits.costPerDay.toFixed(2)}`);
  return parts.length ? `Used today: ${parts.join(', ')}. Work economically; a run that goes over a limit is stopped.` : '';
}

/** The briefing a Cat gets in every run, after its brain's instructions. */
export function buildCatBriefing({ cat, wake, folder, project = null }) {
  const timeout = cat.approvalTimeoutMinutes >= 120
    ? `${Math.round(cat.approvalTimeoutMinutes / 60)} hours`
    : `${cat.approvalTimeoutMinutes} minutes`;
  return [
    `You are ${cat.name}, a Cat: an agent that works on its own for the user while they do other things.`,
    `Your mission, in the user's words:\n"""\n${cat.mission}\n"""`,
    [
      'How you work:',
      '- Nobody is watching this run. Do what your mission needs, then reply with a short report: put the most useful line first. Your reply goes to your chat and the user\'s inbox, and may be shown as a notification.',
      `- Freedom. ${FREEDOM_TEXT[cat.freedom] || FREEDOM_TEXT.ask_risky}`,
      `- When a step waits for an OK, the user is notified and answers in their inbox; they may take a while (up to ${timeout}). If they say no, carry on without that step.`,
      '- If only the user can tell you something, ask with ask_user: the question goes to their inbox and this run waits for the answer.',
      `- Your working folder is ${folder}. Keep your files there.`,
      cat.allowedSites?.length ? `- You may only visit these sites: ${describeSites(cat.allowedSites)}. Other addresses are refused.` : '',
      '- Your memories are your own: save what will help next time with save_memory. The user\'s feedback on your earlier runs is among them; follow it.',
      project ? `- You share the project "${project.name}" with the user; its instructions and files come with this message.` : '',
      '- You can\'t create, change or wake Cats.',
    ].filter(Boolean).join('\n'),
    limitsText(cat),
    wake?.kind === 'chat'
      ? 'The user wrote to you in your chat; their message follows. Answer them, and do what they ask if it fits your mission and freedom.'
      : `What woke you: ${wake?.reason || 'the user asked you to run now'}.`,
  ].filter(Boolean).join('\n\n');
}

/** The goal of a run: the user's message, or what woke the Cat. */
export function buildCatGoal({ cat, wake }) {
  if (wake?.kind === 'chat') return String(wake.message || '').trim() || 'Hello';
  const head = wake?.kind === 'schedule'
    ? `It's time for your scheduled run (${wake.reason}). Do your mission.`
    : wake?.kind === 'manual'
      ? 'The user asked you to run now. Do your mission.'
      : `${wake?.reason || 'Something happened'}. Do what your mission needs about it.`;
  return [head, wake?.details || ''].filter(Boolean).join('\n\n');
}

/**
 * Run a Cat once. `cat` is hydrated (catStore.hydrateCat). Resolves to
 * { answer, sessionId, stopReason, usage }; rejects on failure or abort.
 */
export async function runCat({ cat, wake, abortSignal, conversationHistory = [], onEvent, requestPermission, askUser }) {
  const profile = cat.profileId ? getProfile(cat.profileId, cat.userId) : getDefaultProfile(cat.userId);
  const resolvedClient = clientForCat(cat, profile);
  const { client, model, isLocal, supportsNativeTools, providerInfo } = resolvedClient;

  const folder = cat.folder;
  fs.mkdirSync(folder, { recursive: true });
  const goal = buildCatGoal({ cat, wake });
  const project = projectForChat(cat.userId, cat.projectId);
  const chatContext = buildChatContext({ project, agent: profile, query: goal, resolvedClient });
  const briefing = buildCatBriefing({ cat, wake, folder, project });

  const scopeTools = scheduledRunToolNames({ hasProject: true });
  const agentTools = toolsForCapabilities(profile?.capabilities, toolRegistry.all());
  const allowedTools = agentTools ? scopeTools.filter((name) => agentTools.includes(name)) : scopeTools;
  const multimodal = await getMultimodalCapabilities(cat.userId).catch(() => null);

  const agent = new AgentRuntime({
    aiClient: client,
    model,
    isLocal,
    supportsNativeTools,
    userId: cat.userId,
    workspaceId: cat.workspaceId,
    projectId: project?.id || null,
    workingDir: folder,
    workspaceRoot: folder,
    maxRounds: profile?.max_rounds || 20,
    autoApprove: false,
    requestPermission,
    askUser,
    soul: soulFor(profile),
    providerInfo,
    agentMode: 'action',
    agentProfileId: profile?.id || null,
    catId: cat.id,
    allowedTools,
    knowledgeContext: chatContext.prompt,
    knowledgeSources: chatContext.sources,
    initialImageUrls: chatContext.images,
    capabilitiesSection: [multimodal ? formatMultimodalCapabilityPrompt(multimodal) : '', briefing].filter(Boolean).join('\n\n'),
    clientTimezone: cat.timezone || null,
    abortSignal,
    onEvent,
    usageContext: { operation: 'cat', conversationId: cat.conversationId || null },
  });
  for (const tool of cat.allowedTools || []) agent.sessionApprovedTools.add(tool);

  try {
    const result = await agent.run(goal, conversationHistory);
    if (result.session?.status === 'failed') {
      throw new Error(`The model call failed: ${String(result.answer || '').replace(/^Error:\s*/, '') || 'no details'}`);
    }
    return {
      answer: result.answer,
      sessionId: result.session?.id || null,
      stopReason: result.stopReason || null,
      usage: { ...agent.usage },
      model,
      isLocal,
    };
  } catch (err) {
    if (agent.session && agent.session.status === 'active') {
      try { agent.session.fail(err?.message || 'Stopped'); } catch { /* cleaned up at the next start */ }
    }
    if (err && typeof err === 'object') {
      err.sessionId = agent.session?.id || null;
      err.usage = { ...agent.usage };
    }
    throw err;
  }
}
