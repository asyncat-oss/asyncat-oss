import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKGROUND_DEFAULTS, applyBackgroundUpdate, autostartDesktopEntry, autostartFilePath, keepRunningOnClose,
  launchTarget, mergeBackgroundSettings, quoteDesktopExecArg, stillRunningMessage,
} from './background-config.js';

test('settings fall back to the defaults', () => {
  assert.deepEqual(mergeBackgroundSettings(null), { ...BACKGROUND_DEFAULTS });
  assert.deepEqual(mergeBackgroundSettings({ whenClosed: 'nope', openAtLogin: 'yes' }), { ...BACKGROUND_DEFAULTS });
  assert.equal(mergeBackgroundSettings({ whenClosed: 'always' }).whenClosed, 'always');
  assert.equal(BACKGROUND_DEFAULTS.whenClosed, 'scheduled');
  assert.equal(BACKGROUND_DEFAULTS.openAtLogin, false);
});

test('changes are checked', () => {
  const settings = mergeBackgroundSettings(null);
  assert.equal(applyBackgroundUpdate(settings, { whenClosed: 'quit' }).settings.whenClosed, 'quit');
  assert.equal(applyBackgroundUpdate(settings, { openAtLogin: true }).settings.openAtLogin, true);
  assert.ok(applyBackgroundUpdate(settings, { whenClosed: 'sometimes' }).error);
  assert.ok(applyBackgroundUpdate(settings, { openAtLogin: 1 }).error);
});

test('closing the window keeps the app only when it should', () => {
  const linux = (whenClosed, enabledTasks) => keepRunningOnClose({ whenClosed, enabledTasks, platform: 'linux' });
  assert.equal(linux('scheduled', 2), true);
  assert.equal(linux('scheduled', 0), false);
  assert.equal(linux('scheduled', null), false, 'unknown counts as none');
  assert.equal(linux('always', 0), true);
  assert.equal(linux('quit', 5), false);
  assert.equal(keepRunningOnClose({ whenClosed: 'scheduled', enabledTasks: 0, platform: 'win32' }), false);
  // macOS keeps its usual behaviour unless the user chose Quit.
  assert.equal(keepRunningOnClose({ whenClosed: 'scheduled', enabledTasks: 0, platform: 'darwin' }), true);
  assert.equal(keepRunningOnClose({ whenClosed: 'quit', enabledTasks: 3, platform: 'darwin' }), false);
  assert.match(stillRunningMessage('scheduled'), /scheduled tasks can run/);
  assert.match(stillRunningMessage('always'), /in the background/);
});

test('the login item starts the AppImage only when we really run from it', () => {
  const exists = (file) => file === '/home/me/Apps/Asyncat.AppImage';
  const fromAppImage = {
    env: { APPIMAGE: '/home/me/Apps/Asyncat.AppImage', APPDIR: '/tmp/.mount_AsyncaXYZ' },
    execPath: '/tmp/.mount_AsyncaXYZ/asyncat',
    exists,
  };
  assert.equal(launchTarget(fromAppImage), '/home/me/Apps/Asyncat.AppImage');
  // APPIMAGE inherited from another AppImage that started us.
  assert.equal(launchTarget({ ...fromAppImage, execPath: '/opt/Asyncat/asyncat' }), '/opt/Asyncat/asyncat');
  assert.equal(launchTarget({ ...fromAppImage, env: { APPIMAGE: fromAppImage.env.APPIMAGE } }), '/tmp/.mount_AsyncaXYZ/asyncat');
  assert.equal(launchTarget({ ...fromAppImage, exists: () => false }), '/tmp/.mount_AsyncaXYZ/asyncat');
});

test('the autostart entry starts Asyncat hidden and quotes its path', () => {
  assert.equal(quoteDesktopExecArg('/opt/Asyncat/asyncat'), '/opt/Asyncat/asyncat');
  assert.equal(quoteDesktopExecArg('/home/me/My Apps/Asyncat.AppImage'), '"/home/me/My Apps/Asyncat.AppImage"');
  assert.equal(quoteDesktopExecArg('/x/$HOME"`'), '"/x/\\$HOME\\"\\`"');
  const entry = autostartDesktopEntry({ target: '/home/me/My Apps/Asyncat.AppImage' });
  assert.match(entry, /^\[Desktop Entry\]\n/);
  assert.match(entry, /\nExec="\/home\/me\/My Apps\/Asyncat\.AppImage" --hidden\n/);
  assert.match(entry, /\nX-Asyncat-Autostart=true\n/);
  assert.equal(autostartFilePath({ env: {}, home: '/home/me' }), '/home/me/.config/autostart/asyncat.desktop');
  assert.equal(autostartFilePath({ env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/me' }), '/cfg/autostart/asyncat.desktop');
  assert.equal(autostartFilePath({ env: { XDG_CONFIG_HOME: 'relative' }, home: '/home/me' }), '/home/me/.config/autostart/asyncat.desktop');
});
