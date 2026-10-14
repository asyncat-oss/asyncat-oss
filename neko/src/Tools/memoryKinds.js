// The kinds a memory can be, and their names in the UI.

export const MEMORY_KINDS = ['fact', 'preference', 'user', 'feedback', 'project', 'reference', 'context', 'task_state'];

/** "task_state" → "Task state". */
export function memoryKindLabel(kind) {
  const text = String(kind || '').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The kinds as Select options. */
export const MEMORY_KIND_OPTIONS = MEMORY_KINDS.map((kind) => ({ value: kind, label: memoryKindLabel(kind) }));
