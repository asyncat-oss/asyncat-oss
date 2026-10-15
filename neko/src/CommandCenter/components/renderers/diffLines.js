// What a line of a unified diff is, so the diff block can colour only the
// added and removed lines.

/** 'added', 'removed', 'hunk' (@@), 'meta' (file headers) or 'plain'. */
export function diffLineKind(line = '') {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'added';
  if (line.startsWith('-') && !line.startsWith('---')) return 'removed';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) return 'meta';
  return 'plain';
}
