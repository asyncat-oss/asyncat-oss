// Training/trainingApi.js — Frontend API client for fine-tuning
import authService from '../services/authService.js';

const API_BASE = import.meta.env.VITE_MAIN_URL + '/api/training';

const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'An error occurred');
  }
  return response.json();
};

const apiCall = async (url, options = {}) => {
  const response = await authService.authenticatedFetch(url, options);
  return handleResponse(response);
};

export const trainingApi = {
  // ── Readiness ───────────────────────────────────────────────────────────────
  getReadiness: async () => {
    return apiCall(`${API_BASE}/readiness`);
  },

  // ── Environment install ─────────────────────────────────────────────────────
  startInstall: async (backend) => {
    return apiCall(`${API_BASE}/env/install-jobs`, {
      method: 'POST',
      body: JSON.stringify({ backend }),
    });
  },

  pollInstallJob: (jobId, onUpdate, onDone, onError) => {
    let stopped = false;
    let timerId = null;
    const poll = async () => {
      if (stopped) return;
      try {
        const data = await apiCall(`${API_BASE}/env/install-jobs/${encodeURIComponent(jobId)}`);
        if (stopped) return;
        const job = data.job;
        onUpdate?.(job);
        if (job?.status === 'complete') { stopped = true; onDone?.(job); return; }
        if (job?.status === 'error') { stopped = true; onError?.(job); return; }
      } catch (err) {
        if (!stopped) { stopped = true; onError?.({ status: 'error', error: err.message }); return; }
      }
      if (!stopped) timerId = setTimeout(poll, 2000);
    };
    poll();
    return () => { stopped = true; clearTimeout(timerId); };
  },

  removeEnv: async () => {
    return apiCall(`${API_BASE}/env`, { method: 'DELETE' });
  },

  // ── Datasets ─────────────────────────────────────────────────────────────────
  listDatasets: async () => {
    return apiCall(`${API_BASE}/datasets`);
  },

  // ── Training jobs ───────────────────────────────────────────────────────────
  createJob: async ({ name, baseModel, datasetPath, backend, epochs, lr, rank, alpha, batchSize, maxSeqLen }) => {
    return apiCall(`${API_BASE}/jobs`, {
      method: 'POST',
      body: JSON.stringify({ name, baseModel, datasetPath, backend, epochs, lr, rank, alpha, batchSize, maxSeqLen }),
    });
  },

  listJobs: async (limit = 50) => {
    return apiCall(`${API_BASE}/jobs?limit=${limit}`);
  },

  getJob: async (id) => {
    return apiCall(`${API_BASE}/jobs/${encodeURIComponent(id)}`);
  },

  getJobMetrics: async (id) => {
    return apiCall(`${API_BASE}/jobs/${encodeURIComponent(id)}/metrics`);
  },

  stopJob: async (id) => {
    return apiCall(`${API_BASE}/jobs/${encodeURIComponent(id)}/stop`, { method: 'POST' });
  },

  deleteJob: async (id) => {
    return apiCall(`${API_BASE}/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ── SSE stream ──────────────────────────────────────────────────────────────
  streamJobProgress: (jobId, onEvent, onError) => {
    const token = authService.getAccessToken();
    if (!token) { onError?.('Not authenticated'); return () => {}; }

    const url = `${API_BASE}/jobs/${encodeURIComponent(jobId)}/stream?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        onEvent?.(payload);
      } catch (err) {
        onError?.(err);
      }
    };

    source.onerror = (err) => {
      onError?.(err);
    };

    return () => source.close();
  },

  // ── Poll-based progress (fallback if SSE not available) ─────────────────────
  pollJobProgress: (jobId, onUpdate, onDone, onError) => {
    let stopped = false;
    let timerId = null;
    const poll = async () => {
      if (stopped) return;
      try {
        const data = await apiCall(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`);
        if (stopped) return;
        const job = data.job;
        onUpdate?.(job);
        if (job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled') {
          stopped = true;
          onDone?.(job);
          return;
        }
      } catch (err) {
        if (!stopped) { stopped = true; onError?.(err.message || 'Poll failed'); return; }
      }
      if (!stopped) timerId = setTimeout(poll, 2000);
    };
    poll();
    return () => { stopped = true; clearTimeout(timerId); };
  },
};

export default trainingApi;
