export function isCudaRuntimeCompanionAsset(name) {
  return /^cudart(?:[-_]|$)/i.test(String(name || '').trim());
}

export function cudaVersionFromReleaseAsset(name) {
  const match = String(name || '').toLowerCase().match(/(?:^|[-_])(?:cuda|cu)[-_]?(\d+)(?:[._](\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: match[2] == null ? null : Number(match[2]),
    text: match[2] == null ? match[1] : `${match[1]}.${match[2]}`,
  };
}
