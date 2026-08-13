import { normalizeConversationMode } from './conversationModes.js';

function experienceModeFor(mode) {
  return normalizeConversationMode(mode) === 'build' ? 'work' : 'chat';
}

function continuationTitle(title, targetExperienceMode) {
  const baseTitle = String(title || 'Untitled conversation')
    .replace(/\s+\((?:Chat|Work)\)$/i, '')
    .trim() || 'Untitled conversation';
  const label = targetExperienceMode === 'work' ? 'Work' : 'Chat';
  return `${baseTitle} (${label})`;
}

export function buildConversationContinuation(sourceConversation, targetMode, { createId } = {}) {
  if (!sourceConversation || typeof sourceConversation !== 'object') {
    throw new Error('Source conversation is required');
  }
  if (typeof createId !== 'function') {
    throw new Error('Continuation ID factory is required');
  }

  const targetDatabaseMode = normalizeConversationMode(targetMode);
  if (!['chat', 'build'].includes(targetDatabaseMode)) {
    throw new Error('Conversations can only continue in Chat or Work');
  }

  const sourceExperienceMode = experienceModeFor(sourceConversation.mode || 'chat');
  const targetExperienceMode = experienceModeFor(targetDatabaseMode);
  if (sourceExperienceMode === targetExperienceMode) {
    throw new Error(`Conversation is already in ${targetExperienceMode === 'work' ? 'Work' : 'Chat'} mode`);
  }

  const branchId = `branch_${createId()}`;
  const messages = (Array.isArray(sourceConversation.messages) ? sourceConversation.messages : [])
    .filter(message => message?.type === 'user' || message?.type === 'assistant')
    .map(message => ({
      id: `msg_${createId()}`,
      type: message.type,
      content: String(message.content || ''),
      timestamp: message.timestamp || new Date().toISOString(),
      branchId,
    }))
    .filter(message => message.content.trim().length > 0);

  if (messages.length === 0) {
    throw new Error('Conversation has no readable messages to continue');
  }

  const metadata = {
    experienceMode: targetExperienceMode,
    activeBranchId: branchId,
    continuedFrom: {
      conversationId: sourceConversation.id,
      mode: sourceExperienceMode,
      title: sourceConversation.title || 'Untitled conversation',
    },
  };

  return {
    messages,
    title: continuationTitle(sourceConversation.title, targetExperienceMode),
    mode: targetExperienceMode,
    // A continuation is a clean conversation boundary. Workspace folders,
    // project selection, attachments, and agent state must be selected again.
    projectIds: [],
    metadata,
  };
}
