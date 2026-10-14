import { API_BASE_URL, apiRequest, addWorkspaceToUrl, getCurrentWorkspaceId, handleResponse } from './client.js';
import apiClient from '../../services/apiClient.js';

// A saved artifact's address: its name, and the folder's id when known.
export function artifactUrl(filename, root = null, download = false) {
  const query = new URLSearchParams();
  if (download) query.set('download', '1');
  if (root) query.set('root', root);
  const search = query.toString();
  return `${API_BASE_URL}/agent/artifacts/${encodeURIComponent(filename)}${search ? `?${search}` : ''}`;
}

export const agentApi = {
  // Agent CLIs installed on this computer (Claude Code, Codex) and whether
  // they are signed in.
  getEngines: async () => apiRequest(`${API_BASE_URL}/agent/engines`),

  // Agents spoken to over the Agent Client Protocol (den/src/agent/acp/).
  acpAgents: {
    list: async () => apiRequest(`${API_BASE_URL}/agent/acp-agents`),
    add: async (agent) => apiRequest(`${API_BASE_URL}/agent/acp-agents`, { method: 'POST', body: JSON.stringify(agent) }),
    update: async (name, agent) => apiRequest(`${API_BASE_URL}/agent/acp-agents/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(agent) }),
    remove: async (name) => apiRequest(`${API_BASE_URL}/agent/acp-agents/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    check: async (name) => apiRequest(`${API_BASE_URL}/agent/acp-agents/${encodeURIComponent(name)}/check`, { method: 'POST', body: '{}' }),
    checkDownload: async (target) => apiRequest(`${API_BASE_URL}/agent/acp-agents/check-download`, { method: 'POST', body: JSON.stringify(target) }),
  },

  // Claude Code and Codex sessions on this computer, and opening one as a chat.
  listExternalSessions: async ({ engine = 'all', limit = 30 } = {}) =>
    apiRequest(`${API_BASE_URL}/agent/external-sessions?engine=${encodeURIComponent(engine)}&limit=${limit}`),
  openExternalSession: async (engine, sessionId) =>
    apiRequest(`${API_BASE_URL}/agent/external-sessions/open`, {
      method: 'POST',
      body: JSON.stringify({ engine, sessionId }),
    }),

  runStream: async function* (goal, conversationHistory = [], workingDir = null, maxRounds = 25, signal = null, continueSessionId = null, opts = {}) {
    const workspaceId = (() => {
      try {
        const savedWorkspace = sessionStorage.getItem('currentWorkspace');
        if (savedWorkspace) {
          const workspace = JSON.parse(savedWorkspace);
          return workspace?.id || null;
        }
        return window.__CURRENT_WORKSPACE_ID__ || null;
      } catch { return null; }
    })();
    const response = await apiClient.request(`${API_BASE_URL}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        goal, conversationHistory, workingDir, workingContext: opts.workingContext || null, maxRounds, workspaceId, continueSessionId,
        autoApprove: opts.autoApprove || false,
        preApprovedTools: opts.preApprovedTools || [],
        profileId: opts.profileId || null,
        agentMentions: opts.agentMentions || [],
        fileAttachments: opts.fileAttachments || [],
        enableTools: opts.enableTools !== false,
        agentMode: opts.agentMode || (opts.enableTools === false ? 'plan' : 'action'),
        experienceMode: opts.experienceMode || 'work',
        reasoningEffort: opts.reasoningEffort || 'auto',
        enabledIntegrationTools: Array.isArray(opts.enabledIntegrationTools) ? opts.enabledIntegrationTools : null,
        conversationId: opts.conversationId || null,
        userMessageId: opts.userMessageId || null,
        assistantMessageId: opts.assistantMessageId || null,
        clientTimestamp: opts.clientTimestamp || new Date().toISOString(),
        clientTimezone: opts.clientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        engine: opts.engine || 'asyncat',
        externalSessionId: opts.externalSessionId || null,
        externalCwd: opts.externalCwd || null,
        engineModel: opts.engineModel || null,
        // A temporary chat: the server keeps nothing from this run.
        ephemeral: opts.ephemeral === true,
      })
    });

    if (!response.ok) {
      try {
        const errData = await response.json();
        const err = new Error(errData.message || errData.error || `Agent failed: ${response.statusText}`);
        throw err;
      } catch (parseErr) {
        if (parseErr.message && !parseErr.message.startsWith('Agent failed')) throw parseErr;
        throw new Error(`Agent failed: ${response.statusText}`);
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'done') { yield parsed; return; }
              yield parsed;
            } catch (e) {
              console.warn('Failed to parse agent SSE:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  getSessions: async (limit = 30) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions?limit=${limit}`);
  },

  getSession: async (sessionId) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions/${sessionId}`);
  },

  deleteSession: async (sessionId) => {
    const res = await apiClient.request(`${API_BASE_URL}/agent/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  renameSession: async (sessionId, goal) => {
    const res = await apiClient.request(`${API_BASE_URL}/agent/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal }),
    });
    return res.json();
  },

  updatePlan: async (sessionId, plan) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions/${sessionId}/plan`, {
      method: 'PATCH',
      body: JSON.stringify({ plan }),
    });
  },

  getSessionAudit: async (sessionId) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions/${sessionId}/audit`);
  },

  getSessionChangesState: async (sessionId) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions/${sessionId}/changes/state`);
  },

  // ── Semantic search + embeddings status ──────────────────────────────────
  semanticSearch: async (q, limit = 8, { signal } = {}) => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return await apiRequest(`${API_BASE_URL}/agent/semantic/search?${params}`, { signal });
  },
  getEmbeddingStatus: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/embeddings/status`);
  },

  revertSession: async (sessionId) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions/${sessionId}/revert`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  respondPermission: async (requestId, decision, reason = null) => {
    const res = await apiClient.request(`${API_BASE_URL}/agent/permissions/${requestId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision, reason })
    });
    return await handleResponse(res);
  },

  respondAskUser: async (requestId, answer) => {
    const res = await apiClient.request(`${API_BASE_URL}/agent/ask/${requestId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ answer })
    });
    return await handleResponse(res);
  },

  loadEntry: async (entryPath = '.') => {
    const params = new URLSearchParams({ rootId: 'workspace', path: entryPath });
    return await apiRequest(`${API_BASE_URL}/files/entry?${params}`);
  },

  getTools: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/tools`);
  },

  getMultimodalCapabilities: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/capabilities/multimodal`);
  },

  getModelStatus: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/runtime/status`);
  },

  getSkills: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/skills`);
  },

  getSkill: async (name) => {
    return await apiRequest(`${API_BASE_URL}/agent/skills/${encodeURIComponent(name)}`);
  },

  reloadSkills: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/skills/reload`, { method: 'POST' });
  },

  createSkill: async (skill) => {
    return await apiRequest(`${API_BASE_URL}/agent/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skill),
    });
  },

  updateSkill: async (name, fields) => {
    return await apiRequest(`${API_BASE_URL}/agent/skills/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
  },

  deleteSkill: async (name) => {
    return await apiRequest(`${API_BASE_URL}/agent/skills/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  },

  getSoul: async (name = 'default') => {
    return await apiRequest(`${API_BASE_URL}/agent/soul?name=${encodeURIComponent(name)}`);
  },

  updateSoul: async (content, name = 'default') => {
    return await apiRequest(`${API_BASE_URL}/agent/soul`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
  },

  listSouls: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/souls`);
  },

  getMemories: async ({ q = '', kind = 'all', limit = 50, scope = 'all' } = {}) => {
    const params = new URLSearchParams({ kind, limit: String(limit) });
    if (q) params.set('q', q);
    if (scope && scope !== 'all') params.set('scope', scope);
    return await apiRequest(`${API_BASE_URL}/agent/memory?${params}`);
  },

  /** A memory written by hand: { content, kind, scope: shared | project:<id> | agent:<id> | cat:<id> }. */
  addMemory: async (memory) => {
    return await apiRequest(`${API_BASE_URL}/agent/memory`, { method: 'POST', body: JSON.stringify(memory) });
  },

  updateMemory: async (id, patch) => {
    return await apiRequest(`${API_BASE_URL}/agent/memory/by-id/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  getMemoryStats: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/memory/stats`);
  },

  consolidateMemory: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/memory/consolidate`, { method: 'POST' });
  },

  deleteMemory: async (key, id = null) => {
    const query = id ? `?id=${encodeURIComponent(id)}` : '';
    return await apiRequest(`${API_BASE_URL}/agent/memory/${encodeURIComponent(key)}${query}`, {
      method: 'DELETE',
    });
  },

  listArtifacts: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/artifacts`);
  },

  // root: the id of the folder the file is in ("chats", "project:<id>", …),
  // from the tool's result. Without it den answers only when one folder has
  // a file by that name.
  getArtifact: async (filename, root = null) => {
    return await apiRequest(artifactUrl(filename, root));
  },

  getArtifactDownloadUrl: (filename, root = null) => {
    return artifactUrl(filename, root, true);
  },

  downloadArtifact: async (filename, root = null) => {
    const workspaceId = getCurrentWorkspaceId();
    const url = artifactUrl(filename, root, true);
    const response = await apiClient.request(
      workspaceId ? addWorkspaceToUrl(url, workspaceId) : url,
      { method: 'GET' }
    );
    if (!response.ok) {
      let message = `Download failed: ${response.status} ${response.statusText}`;
      try {
        const data = await response.json();
        message = data.message || data.error || message;
      } catch { /* response may not be JSON */ }
      throw new Error(message);
    }
    return {
      blob: await response.blob(),
      filename,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  },

  // root: the folder's id from a listing ("chats", "project:<id>", …).
  deleteArtifact: async (filename, root) => {
    return await apiRequest(artifactUrl(filename, root), {
      method: 'DELETE',
    });
  },
};

export const sandboxesApi = {
  list: async ({ includeDeleted = false } = {}) => {
    const params = new URLSearchParams();
    if (includeDeleted) params.set('includeDeleted', 'true');
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes${suffix}`);
  },

  create: async ({ name = 'Copy', sourcePath = null, strategy = 'auto', baseRef = 'HEAD' } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes`, {
      method: 'POST',
      body: JSON.stringify({ name, sourcePath, strategy, baseRef }),
    });
  },

  get: async (id) => {
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes/${encodeURIComponent(id)}`);
  },

  diff: async (id, { file = null, includePatch = false } = {}) => {
    const params = new URLSearchParams();
    if (file) params.set('file', file);
    if (includePatch) params.set('includePatch', 'true');
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes/${encodeURIComponent(id)}/diff${suffix}`);
  },

  createPatch: async (id, { filePaths = [] } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes/${encodeURIComponent(id)}/patch`, {
      method: 'POST',
      body: JSON.stringify({ filePaths }),
    });
  },

  apply: async (id, { filePaths = [], dryRun = false } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes/${encodeURIComponent(id)}/apply`, {
      method: 'POST',
      body: JSON.stringify({ filePaths, dryRun }),
    });
  },

  commitBranch: async (id, { message = 'Asyncat copy changes', filePaths = [] } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes/${encodeURIComponent(id)}/commit-branch`, {
      method: 'POST',
      body: JSON.stringify({ message, filePaths }),
    });
  },

  listJobs: async (id, { limit = 50 } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes/${encodeURIComponent(id)}/jobs?limit=${encodeURIComponent(String(limit))}`);
  },

  runJob: async (id, { command, cwd = '.', kind = 'command', timeoutMs = 120000 } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes/${encodeURIComponent(id)}/jobs`, {
      method: 'POST',
      body: JSON.stringify({ command, cwd, kind, timeoutMs }),
    });
  },

  delete: async (id, { force = true } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/sandboxes/${encodeURIComponent(id)}?force=${force ? 'true' : 'false'}`, {
      method: 'DELETE',
    });
  },
};

export const profilesApi = {
  listProfiles: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/profiles`);
  },

  createProfile: async (data) => {
    return await apiRequest(`${API_BASE_URL}/agent/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  updateProfile: async (id, data) => {
    return await apiRequest(`${API_BASE_URL}/agent/profiles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  deleteProfile: async (id) => {
    return await apiRequest(`${API_BASE_URL}/agent/profiles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getCapabilities: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/profiles-capabilities`);
  },

  listKnowledge: async (id) => {
    return await apiRequest(`${API_BASE_URL}/agent/profiles/${encodeURIComponent(id)}/knowledge`);
  },

  /** Upload files; resolves to { data: added[], errors: [{ name, error }] }. */
  uploadKnowledge: async (id, files) => {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    const response = await apiClient.request(`${API_BASE_URL}/agent/profiles/${encodeURIComponent(id)}/knowledge`, {
      method: 'POST',
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !(Array.isArray(data.errors) && data.errors.length)) {
      throw new Error(data.error || `Upload failed (HTTP ${response.status})`);
    }
    return { data: data.data || [], errors: data.errors || [] };
  },

  deleteKnowledge: async (id, fileId) => {
    return await apiRequest(`${API_BASE_URL}/agent/profiles/${encodeURIComponent(id)}/knowledge/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
  },

  getContextFit: async (id) => {
    return await apiRequest(`${API_BASE_URL}/agent/profiles/${encodeURIComponent(id)}/context`);
  },

  getProcesses: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/processes`);
  },

  killProcess: async (key) => {
    return await apiRequest(`${API_BASE_URL}/agent/processes/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
  },
};
