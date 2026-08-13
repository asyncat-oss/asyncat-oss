import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareVersions,
  isTrustedReleaseUrl,
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
    { tag_name: 'v0.7.5-beta.1', draft: false },
    { tag_name: 'v0.7.6-beta.1', draft: true },
    { tag_name: 'v0.7.5-beta.3', draft: false },
    { tag_name: 'not-a-version', draft: false },
  ];
  assert.equal(selectLatestRelease(releases, '0.7.4').tag_name, 'v0.7.5-beta.3');
  assert.equal(selectLatestRelease(releases, '0.7.5'), null);
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
  assert.equal(isTrustedReleaseUrl('https://github.com/asyncat-oss/asyncat-oss/releases/tag/v0.8.0'), true);
  assert.equal(isTrustedReleaseUrl('https://example.com/asyncat-oss/asyncat-oss/releases/tag/v0.8.0'), false);
  assert.equal(isTrustedReleaseUrl('javascript:alert(1)'), false);
});
