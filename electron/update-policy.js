// Pure update-selection helpers. Kept separate from Electron so the release
// and updater contract can be tested with plain Node.js.

const PLATFORM_ASSET = {
  win32: { os: 'windows', extensions: ['.exe'] },
  darwin: { os: 'macos', extensions: ['.dmg'] },
  linux: { os: 'linux', extensions: ['.AppImage', '.deb'] },
};

export function parseVersion(value) {
  const match = String(value || '').trim().match(
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  if (!match) return null;
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split('.') : [],
    version: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`,
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;

    const leftNumeric = /^\d+$/.test(left[index]);
    const rightNumeric = /^\d+$/.test(right[index]);
    if (leftNumeric && rightNumeric) return Number(left[index]) > Number(right[index]) ? 1 : -1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

export function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  if (!left || !right) throw new Error(`Cannot compare invalid versions: ${leftValue}, ${rightValue}`);

  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] > right.core[index] ? 1 : -1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function selectLatestRelease(releases, currentVersion) {
  const candidates = (Array.isArray(releases) ? releases : [])
    .filter((release) => release && !release.draft && parseVersion(release.tag_name))
    .sort((left, right) => compareVersions(right.tag_name, left.tag_name));

  return candidates.find((release) => compareVersions(release.tag_name, currentVersion) > 0) || null;
}

export function selectReleaseAsset(assets, platform, arch, preferredExtension = null) {
  const target = PLATFORM_ASSET[platform];
  if (!target) return null;

  const candidates = (Array.isArray(assets) ? assets : []).filter((asset) => {
    const name = String(asset?.name || '');
    return target.extensions.some((extension) => name.endsWith(extension));
  });

  const exactToken = `-${target.os}-${arch}`.toLowerCase();
  const exactCandidates = candidates.filter((asset) => String(asset.name).toLowerCase().includes(exactToken));
  const exact = exactCandidates.find((asset) => preferredExtension && String(asset.name).endsWith(preferredExtension))
    || target.extensions
      .map((extension) => exactCandidates.find((asset) => String(asset.name).endsWith(extension)))
      .find(Boolean);
  if (exact) return exact;

  // Support older release names while never handing an ARM build to x64 (or
  // vice versa). New releases use the exact token above.
  return candidates.find((asset) => {
    const name = String(asset.name).toLowerCase();
    const mentionsOtherArch = ['x64', 'arm64'].some((knownArch) => knownArch !== arch && name.includes(knownArch));
    return !mentionsOtherArch && name.includes(arch.toLowerCase());
  }) || null;
}

export function isTrustedReleaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith('/asyncat-oss/asyncat-oss/releases/');
  } catch {
    return false;
  }
}
