export { chatApi, chatFoldersApi } from './chatApi.js';
export { projectsApi } from './projectsApi.js';
export { trashApi } from './trashApi.js';
export { agentApi, agentTaskRunsApi, profilesApi } from './agentApi.js';
export { gitApi } from './gitApi.js';
export { filesApi } from './filesApi.js';
export { schedulerApi } from './schedulerApi.js';
export { bulkApi, workspaceUtils } from './bulkApi.js';
export { apiUtils, cacheUtils, cachedProjectsApi } from './apiUtils.js';
export { installApi } from './installApi.js';

import { chatApi } from './chatApi.js';
import { projectsApi } from './projectsApi.js';
import { trashApi } from './trashApi.js';
import { agentApi } from './agentApi.js';
import { gitApi } from './gitApi.js';
import { filesApi } from './filesApi.js';
import { apiUtils } from './apiUtils.js';
import { cacheUtils } from './apiUtils.js';
import { cachedProjectsApi } from './apiUtils.js';
import { bulkApi } from './bulkApi.js';
import { workspaceUtils } from './bulkApi.js';
import { chatFoldersApi } from './chatApi.js';
import { installApi } from './installApi.js';

export default {
  chat: chatApi,
  projects: projectsApi,
  cachedProjects: cachedProjectsApi,
  bulk: bulkApi,
  chatFolders: chatFoldersApi,
  trash: trashApi,
  agent: agentApi,
  git: gitApi,
  utils: apiUtils,
  cache: cacheUtils,
  workspace: workspaceUtils,
  files: filesApi,
  install: installApi
};
