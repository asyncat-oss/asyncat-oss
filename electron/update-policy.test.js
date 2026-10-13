import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_UPDATE_REPO,
  compareVersions,
  isTrustedReleaseUrl,
  updateRepo,
  selectLatestRelease,
  selectReleaseAsset,
} from './update-policy.js';

test('SemVer comparison handles beta versions correctly', () => {
  assert.equal(compareVersions('0.7.5-beta.2', '0.7.5-beta.1'), 1);
  assert.equal(compareVersions('0.7.5', '0.7.5-beta.9'), 1);
  assert.equal(compareVersions('v0.8.0', '0.7.99'), 1);
});

test('the newest published version above the installed version is selected', () => {
  const releases = [
    { tag_name: 'v0.7.5-beta.1', draft: false, prerelease: true },
    { tag_name: 'v0.7.6-beta.1', draft: true, prerelease: true },
    { tag_name: 'v0.7.5-beta.3', draft: false, prerelease: true },
    { tag_name: 'not-a-version', draft: false },
  ];
  assert.equal(selectLatestRelease(releases, '0.7.5-beta.2').tag_name, 'v0.7.5-beta.3');
  assert.equal(selectLatestRelease(releases, '0.7.5-beta.3'), null);
  assert.equal(selectLatestRelease(releases, '0.7.5'), null);
});

test('stable users are offered only stable versions; beta users get betas or stable', () => {
  const releases = [
    { tag_name: 'v0.8.0', draft: false, prerelease: false },
    { tag_name: 'v0.8.1-beta.1', draft: false, prerelease: true },
    // A tag without a suffix that GitHub still marks as a prerelease.
    { tag_name: 'v0.8.2', draft: false, prerelease: true },
  ];
  assert.equal(selectLatestRelease(releases, '0.7.9').tag_name, 'v0.8.0');
  assert.equal(selectLatestRelease(releases, '0.8.0'), null);
  assert.equal(selectLatestRelease(releases, '0.8.0-beta.7').tag_name, 'v0.8.2');
  assert.equal(selectLatestRelease([releases[0]], '0.8.0-beta.7').tag_name, 'v0.8.0');
  // A suffixed tag is a prerelease even if the GitHub flag was forgotten.
  assert.equal(selectLatestRelease([{ tag_name: 'v0.9.0-rc.1', prerelease: false }], '0.8.0'), null);
});

test('installer selection requires the correct platform and architecture', () => {
  const assets = [
    { name: 'Asyncat-0.8.0-windows-x64.exe', browser_download_url: 'win-x64' },
    { name: 'Asyncat-0.8.0-windows-arm64.exe', browser_download_url: 'win-arm64' },
    { name: 'Asyncat-0.8.0-macos-arm64.dmg', browser_download_url: 'mac-arm64' },
    { name: 'Asyncat-0.8.0-linux-x64.deb', browser_download_url: 'linux-deb' },
    { name: 'Asyncat-0.8.0-linux-x64.AppImage', browser_download_url: 'linux-x64' },
  ];
  assert.equal(selectReleaseAsset(assets, 'win32', 'x64').browser_download_url, 'win-x64');
  assert.equal(selectReleaseAsset(assets, 'darwin', 'arm64').browser_download_url, 'mac-arm64');
  assert.equal(selectReleaseAsset(assets, 'linux', 'x64').browser_download_url, 'linux-x64');
  assert.equal(selectReleaseAsset(assets, 'linux', 'x64', '.deb').browser_download_url, 'linux-deb');
  assert.equal(selectReleaseAsset(assets, 'linux', 'arm64'), null);
});

test('only this repository release URLs may be opened on renderer request', () => {
  assert.equal(isTrustedReleaseUrl('https://github.com/asyncat-oss/asyncat-oss/releases/tag/v0.8.0', DEFAULT_UPDATE_REPO), true);
  assert.equal(isTrustedReleaseUrl('https://example.com/asyncat-oss/asyncat-oss/releases/tag/v0.8.0', DEFAULT_UPDATE_REPO), false);
  assert.equal(isTrustedReleaseUrl('https://github.com/someone/asyncat-oss/releases/tag/v0.8.0', DEFAULT_UPDATE_REPO), false);
  assert.equal(isTrustedReleaseUrl('javascript:alert(1)', DEFAULT_UPDATE_REPO), false);
});

test('ASYNCAT_UPDATE_REPO points the updater at a fork for hand-testing', () => {
  assert.equal(updateRepo({}), 'asyncat-oss/asyncat-oss');
  assert.equal(updateRepo({ ASYNCAT_UPDATE_REPO: 'me/asyncat-test' }), 'me/asyncat-test');
  for (const bad of ['me', 'me/repo/extra', '../x', 'me/..', 'https://github.com/me/repo', 'me/re po']) {
    assert.equal(updateRepo({ ASYNCAT_UPDATE_REPO: bad }), 'asyncat-oss/asyncat-oss', bad);
  }
  assert.equal(isTrustedReleaseUrl('https://github.com/me/asyncat-test/releases/download/v9.0.0/a.AppImage', 'me/asyncat-test'), true);
  assert.equal(isTrustedReleaseUrl('https://github.com/asyncat-oss/asyncat-oss/releases/tag/v0.8.0', 'me/asyncat-test'), false);
});
