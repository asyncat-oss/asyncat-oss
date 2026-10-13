// llama.cpp build numbers: release tag "b6123" is build 6123. New builds come
// out several times a day, so a newer tag is only worth calling an update
// when it really is newer, and saying how much newer reads better than a tag.

export const buildFromTag = (tag) => {
  if (typeof tag === 'number') return Number.isFinite(tag) && tag > 0 ? tag : null;
  const match = /^b(\d+)$/i.exec(String(tag || '').trim());
  return match ? Number(match[1]) : null;
};

/** How many builds newer `latest` is than `installed` (tags or numbers); 0 when not newer or unknown. */
export const buildsBehind = (installed, latest) => {
  const have = buildFromTag(installed);
  const newest = buildFromTag(latest);
  if (!have || !newest) return 0;
  return Math.max(0, newest - have);
};

export const buildsNewerText = (count) => `${count} ${count === 1 ? 'build' : 'builds'} newer`;

const PROFILE_FOR_CAPABILITY = {
  cpu_safe: 'cpu_safe',
  nvidia: 'nvidia_gpu',
  amd: 'amd_rocm',
  apple: 'apple_metal',
  vulkan: 'vulkan',
  intel: 'intel_sycl',
};

/** The managed build profile that matches an engine's capability ("nvidia" → "nvidia_gpu"). */
export const profileForCapability = (hint) => PROFILE_FOR_CAPABILITY[hint] || 'cpu_safe';
