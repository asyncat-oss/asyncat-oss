// Keeping the previous AppImage until an update has proved it starts. Plain
// Node.js (no Electron imports) so it can be tested directly.
//
// When an AppImage update is put in place, the running version stays beside
// it as `<AppImage>.previous`, and update-state.json (in userData) records
// the swap. The new version marks itself "booted" once its window and backend
// are up; then the previous copy is deleted. If it never gets there (the
// backend fails, it hangs, or the last launch never finished), the updater
// offers to go back to the previous version.

import fs from 'fs';

export function previousCopyPath(appImagePath) {
  return `${appImagePath}.previous`;
}

export function readUpdateState(stateFile) {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return state && typeof state === 'object' ? state : {};
  } catch {
    return {};
  }
}

export function writeUpdateState(stateFile, state) {
  try {
    if (!state || !state.pending) {
      fs.rmSync(stateFile, { force: true });
      return;
    }
    const temp = `${stateFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2));
    fs.renameSync(temp, stateFile);
  } catch (error) {
    console.warn('[updater] could not save the update state:', error.message);
  }
}

/**
 * Put a downloaded AppImage in place of the running one, keeping the running
 * file as `.previous`. Linux keeps the old file open for the running app, so
 * this is safe while Asyncat runs; the next start runs the new version.
 * Records the swap in `stateFile`. Returns the `.previous` path.
 */
export function installAppImageUpdate({ downloaded, appImagePath, stateFile, newVersion, currentVersion }) {
  const previous = previousCopyPath(appImagePath);
  const pending = readUpdateState(stateFile).pending;
  // A second update before restarting: `.previous` already holds the
  // version that is running now. Keep that one, not the never-started file.
  const keepExisting = pending?.appImage === appImagePath
    && pending?.previousVersion === currentVersion
    && fs.existsSync(previous);

  fs.chmodSync(downloaded, 0o755);
  if (keepExisting) {
    fs.renameSync(downloaded, appImagePath);
  } else {
    fs.rmSync(previous, { force: true });
    let linked = false;
    try {
      // A second name for the running file: no copy, and the AppImage path
      // is never missing.
      fs.linkSync(appImagePath, previous);
      linked = true;
    } catch {
      fs.renameSync(appImagePath, previous);
    }
    try {
      fs.renameSync(downloaded, appImagePath);
    } catch (error) {
      if (!linked) fs.renameSync(previous, appImagePath);
      else fs.rmSync(previous, { force: true });
      throw error;
    }
  }

  writeUpdateState(stateFile, {
    pending: {
      version: newVersion,
      previousVersion: keepExisting ? pending.previousVersion : currentVersion,
      appImage: appImagePath,
      previous,
      installedAt: new Date().toISOString(),
      launches: 0,
    },
  });
  return previous;
}

/**
 * Call once at startup. Returns what to do about a recent AppImage update:
 *   none            nothing pending for the version that is running
 *   watch           first start of the new version: wait for markBooted()
 *   offer-rollback  the last start of this version never finished
 */
export function noteLaunch(stateFile, { currentVersion, appImagePath }) {
  const state = readUpdateState(stateFile);
  const pending = state.pending;
  if (!pending) return { action: 'none' };
  if (pending.appImage !== appImagePath || pending.version !== currentVersion) {
    // Rolled back, or started some other copy: forget the old swap unless the
    // new version simply hasn't been started yet.
    if (pending.previousVersion !== currentVersion) writeUpdateState(stateFile, null);
    return { action: 'none' };
  }
  const launches = Number(pending.launches || 0) + 1;
  writeUpdateState(stateFile, { pending: { ...pending, launches } });
  const canRollBack = fs.existsSync(pending.previous || '');
  if (!canRollBack) return { action: 'watch', pending: { ...pending, launches }, canRollBack };
  return {
    action: launches > 1 && !pending.dismissed ? 'offer-rollback' : 'watch',
    pending: { ...pending, launches },
    canRollBack,
  };
}

/** The new version started properly: drop the previous copy. */
export function markBooted(stateFile, { currentVersion }) {
  const pending = readUpdateState(stateFile).pending;
  if (!pending || pending.version !== currentVersion) return false;
  if (pending.previous) fs.rmSync(pending.previous, { force: true });
  writeUpdateState(stateFile, null);
  return true;
}

/** The user chose to keep the new version even though it hasn't booted yet. */
export function dismissRollback(stateFile) {
  const pending = readUpdateState(stateFile).pending;
  if (pending) writeUpdateState(stateFile, { pending: { ...pending, dismissed: true } });
}

/**
 * Put the previous version back in place. Returns the AppImage path to start,
 * or throws when the previous copy is gone.
 */
export function rollBack(stateFile) {
  const pending = readUpdateState(stateFile).pending;
  if (!pending?.previous || !fs.existsSync(pending.previous)) {
    throw new Error('The previous version is no longer there to go back to.');
  }
  fs.renameSync(pending.previous, pending.appImage);
  writeUpdateState(stateFile, null);
  return pending.appImage;
}
