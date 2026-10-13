// The answer a filled-in question form sends back: "Label: value" lines.

export function formAnswer(fields = [], values = {}) {
  return fields
    .map((field) => `${field.label}: ${String(values[field.id] ?? '').trim() || '(no answer)'}`)
    .join('\n');
}

/** Is anything filled in? */
export function formHasAnswer(fields = [], values = {}) {
  return fields.some((field) => String(values[field.id] ?? '').trim());
}
