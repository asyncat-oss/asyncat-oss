// The first-run setup's calls to den (den/src/setup/setupRoutes.js). A local
// model download is a setup job, read and cancelled like Voice's and Images'.

import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';
import { mediaApi } from '../Models/media/mediaApi.js';

const BASE = `${API_BASE_URL}/setup`;
const send = (method, body = {}) => ({ method, body: JSON.stringify(body) });

export const setupApi = {
  /** { setup: { done, hasModel, hasChats, show }, job }: job is the latest local model download. */
  get: () => apiRequest(BASE),
  /** Finished or skipped (true), or offered again (false). */
  setDone: (done) => apiRequest(BASE, send('PUT', { done })),
  /** { plan: { hardware, engine, models }, job } for "Run a model on this computer". */
  local: () => apiRequest(`${BASE}/local`),
  /** Start downloading one of the models offered: { job }. */
  startLocal: (modelId) => apiRequest(`${BASE}/local`, send('POST', { modelId })),
  job: (jobId) => mediaApi.setup.get(jobId),
  cancel: (jobId) => mediaApi.setup.cancel(jobId),
};

export default setupApi;
