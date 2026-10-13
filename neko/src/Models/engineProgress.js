// Small helpers for showing engine install progress (Settings → Runtime).

export const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(unit === 0 ? 0 : 1) : value.toFixed(2)} ${units[unit]}`;
};

/** "12.4 MB of 340 MB" while an install downloads a file, otherwise ''. */
export const downloadProgressText = (progress) => {
  const done = Number(progress?.downloadedBytes);
  const total = Number(progress?.totalBytes);
  if (progress?.phase !== 'downloading' || !Number.isFinite(done) || done <= 0) return '';
  return total > 0 ? `${formatBytes(done)} of ${formatBytes(total)}` : `${formatBytes(done)} downloaded`;
};
