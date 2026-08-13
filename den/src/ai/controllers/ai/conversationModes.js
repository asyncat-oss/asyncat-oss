const DATABASE_MODES = new Set(['chat', 'build', 'image']);

const MODE_ALIASES = {
  // The product calls the agent experience "Work", while the existing
  // conversations schema stores that experience as "build".
  work: 'build',
  // Kept for compatibility with the retired visual-chat label.
  visual: 'chat',
};

export function normalizeConversationMode(mode = 'chat', { allowAll = false } = {}) {
  const requestedMode = String(mode ?? 'chat').trim().toLowerCase() || 'chat';
  if (allowAll && requestedMode === 'all') return 'all';

  const databaseMode = MODE_ALIASES[requestedMode] || requestedMode;
  if (!DATABASE_MODES.has(databaseMode)) {
    throw new Error(`Unsupported conversation mode: ${mode}`);
  }

  return databaseMode;
}

