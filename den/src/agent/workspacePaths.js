import path from 'path';

export const ASYNCAT_WORKSPACE_DIR = '.asyncat';

export function getAsyncatWorkspaceDir(workingDir) {
  return path.join(path.resolve(workingDir || process.cwd()), ASYNCAT_WORKSPACE_DIR);
}

export function getAsyncatWorkspaceSubdir(workingDir, name) {
  return path.join(getAsyncatWorkspaceDir(workingDir), name);
}

export function getArtifactsDir(workingDir) {
  return getAsyncatWorkspaceSubdir(workingDir, 'artifacts');
}

export function getAttachmentsDir(workingDir) {
  return getAsyncatWorkspaceSubdir(workingDir, 'attachments');
}

export function getSnapshotsDir(workingDir) {
  return getAsyncatWorkspaceSubdir(workingDir, 'snapshots');
}

export function getTmpDir(workingDir) {
  return getAsyncatWorkspaceSubdir(workingDir, 'tmp');
}

export function getLegacyArtifactsDir(workingDir) {
  return path.join(path.resolve(workingDir || process.cwd()), '.asyncat-artifacts');
}

export function getLegacyAttachmentsDir(workingDir) {
  return path.join(path.resolve(workingDir || process.cwd()), '.asyncat-attachments');
}

export function getLegacyTmpDir(workingDir) {
  return path.join(path.resolve(workingDir || process.cwd()), '.agent_tmp');
}
