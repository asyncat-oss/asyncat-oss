import { API_BASE_URL, apiRequest, addWorkspaceToUrl, getCurrentWorkspaceId } from './client.js';
import authService from '../../services/authService.js';
import eventBus from '../../utils/eventBus.js';

export const agentApi = {
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
    const token = await authService.getSession();

    const response = await fetch(`${API_BASE_URL}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token?.access_token}`
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
        reasoningEffort: opts.reasoningEffort || 'auto',
        enabledIntegrationTools: Array.isArray(opts.enabledIntegrationTools) ? opts.enabledIntegrationTools : null,
        conversationId: opts.conversationId || null,
        userMessageId: opts.userMessageId || null,
        assistantMessageId: opts.assistantMessageId || null,
        clientTimestamp: opts.clientTimestamp || new Date().toISOString(),
        clientTimezone: opts.clientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || null,
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
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/agent/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token?.access_token}` },
    });
    return res.json();
  },

  renameSession: async (sessionId, goal) => {
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/agent/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token?.access_token}` },
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

  getHealth: async (limit = 80) => {
    return await apiRequest(`${API_BASE_URL}/agent/health?limit=${encodeURIComponent(String(limit))}`);
  },

  getToolMetrics: async ({ days = 30, limit = 100 } = {}) => {
    const params = new URLSearchParams({ days: String(days), limit: String(limit) });
    return await apiRequest(`${API_BASE_URL}/agent/metrics/tools?${params}`);
  },

  getMetricsSummary: async ({ days = 30 } = {}) => {
    const params = new URLSearchParams({ days: String(days) });
    return await apiRequest(`${API_BASE_URL}/agent/metrics/summary?${params}`);
  },

  runEval: async ({ mode = 'deterministic', confirmLive = false, keepSandbox = false } = {}) => {
    return await apiRequest(`${API_BASE_URL}/agent/metrics/evals`, {
      method: 'POST',
      body: JSON.stringify({ mode, confirmLive, keepSandbox }),
    });
  },

  getEvalHistory: async ({ limit = 10 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    return await apiRequest(`${API_BASE_URL}/agent/metrics/evals?${params}`);
  },

  getActiveEval: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/metrics/evals/active`);
  },

  clearDiagnostics: async ({ days = 30, all = false } = {}) => {
    const params = new URLSearchParams(all ? { all: 'true' } : { days: String(days) });
    return await apiRequest(`${API_BASE_URL}/agent/metrics/audit?${params}`, {
      method: 'DELETE',
      body: JSON.stringify({ days, all }),
    });
  },

  revertSession: async (sessionId) => {
    return await apiRequest(`${API_BASE_URL}/agent/sessions/${sessionId}/revert`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  respondPermission: async (requestId, decision, reason = null) => {
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/agent/permissions/${requestId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token?.access_token}`
      },
      body: JSON.stringify({ decision, reason })
    });
    return await handleResponse(res);
  },

  respondAskUser: async (requestId, answer) => {
    const token = await authService.getSession();
    const res = await fetch(`${API_BASE_URL}/agent/ask/${requestId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token?.access_token}`
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

  getBrainStats: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/brain-stats`);
  },

  getMemories: async ({ q = '', kind = 'all', limit = 50 } = {}) => {
    const params = new URLSearchParams({ kind, limit: String(limit) });
    if (q) params.set('q', q);
    return await apiRequest(`${API_BASE_URL}/agent/memory?${params}`);
  },

  deleteMemory: async (key) => {
    return await apiRequest(`${API_BASE_URL}/agent/memory/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
  },

  listArtifacts: async () => {
    return await apiRequest(`${API_BASE_URL}/agent/artifacts`);
  },

  getArtifact: async (filename) => {
    return await apiRequest(`${API_BASE_URL}/agent/artifacts/${encodeURIComponent(filename)}`);
  },

  getArtifactDownloadUrl: (filename) => {
    return `${API_BASE_URL}/agent/artifacts/${encodeURIComponent(filename)}?download=1`;
  },

  downloadArtifact: async (filename) => {
    const workspaceId = getCurrentWorkspaceId();
    const url = `${API_BASE_URL}/agent/artifacts/${encodeURIComponent(filename)}?download=1`;
    const response = await authService.authenticatedFetch(
      workspaceId ? addWorkspaceToUrl(url, workspaceId) : url,
      { method: 'GET', credentials: 'include' }
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

  deleteArtifact: async (filename) => {
    return await apiRequest(`${API_BASE_URL}/agent/artifacts/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
  },
};

export const agentTaskRunsApi = {
  list: async ({ projectId = null, cardId = null } = {}) => {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (cardId) params.set('cardId', cardId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return await apiRequest(`${API_BASE_URL}/agent/task-runs${suffix}`);
  },

  create: async ({ cardId, profileId = null, goal = null }) => {
    return await apiRequest(`${API_BASE_URL}/agent/task-runs`, {
      method: 'POST',
      body: JSON.stringify({ cardId, profileId, goal }),
    });
  },

  get: async (runId) => {
    return await apiRequest(`${API_BASE_URL}/agent/task-runs/${encodeURIComponent(runId)}`);
  },

  cancel: async (runId) => {
    return await apiRequest(`${API_BASE_URL}/agent/task-runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
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

  create: async ({ name = 'Sandbox', sourcePath = null, strategy = 'auto', baseRef = 'HEAD' } = {}) => {
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

  commitBranch: async (id, { message = 'Asyncat sandbox changes', filePaths = [] } = {}) => {
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
};
