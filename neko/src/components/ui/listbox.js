// The logic behind Select and Combobox, kept apart from React so it can be
// tested: reading options, filtering them, moving the active option with the
// keyboard, and type-ahead.

/** Options may be plain strings; turn them into { value, label } objects. */
export function normalizeOptions(options) {
  return (options || []).filter((option) => option !== null && option !== undefined && option !== false).map((option) => (
    typeof option === 'object' ? option : { value: option, label: String(option) }
  ));
}

/** The text an option is searched and type-ahead matched by. */
export function optionText(option) {
  if (!option || option.separator) return '';
  if (typeof option.text === 'string') return option.text;
  if (typeof option.label === 'string' || typeof option.label === 'number') return String(option.label);
  return String(option.value ?? '');
}

export function isChoosable(option) {
  return Boolean(option) && !option.separator && !option.disabled;
}

/** The index of the option holding `value`, or -1. Compares as text too, since form values often are. */
export function indexOfValue(options, value) {
  const exact = options.findIndex((option) => !option.separator && option.value === value);
  if (exact !== -1 || value === null || value === undefined) return exact;
  return options.findIndex((option) => !option.separator && option.value !== null && option.value !== undefined && String(option.value) === String(value));
}

/** Options whose label, description or group contain every word of `query`. Separators go while filtering. */
export function filterOptions(options, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter((option) => {
    if (option.separator) return false;
    // Not the value (often an id) or the hint (often a size): typing "4"
    // shouldn't match every option with a 4 in its id or "14 MB".
    const haystack = [optionText(option), option.description, option.group]
      .filter((part) => typeof part === 'string' || typeof part === 'number')
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * Suggestions for a combobox holding `text`: every option when it is empty,
 * otherwise the ones containing it, those starting with it first.
 */
export function suggestionMatches(options, text, limit = 50) {
  const query = String(text || '').trim().toLowerCase();
  const usable = options.filter((option) => !option.separator);
  if (!query) return usable.slice(0, limit);
  const starts = [];
  const contains = [];
  for (const option of usable) {
    const values = [String(option.value ?? ''), optionText(option)].map((part) => part.toLowerCase());
    if (values.some((part) => part.startsWith(query))) starts.push(option);
    else if (values.some((part) => part.includes(query)) || String(option.description || option.hint || '').toLowerCase().includes(query)) contains.push(option);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Whether a key that a combobox hands on to its caller closes the list. Tab
 * and Enter do, and so does any key the caller takes for itself (Chips adds
 * the text as a chip on Enter or a comma): the field then holds new text, so
 * the list waits for the next keystroke instead of showing every suggestion.
 */
export function keyClosesSuggestions(event) {
  return event.key === 'Tab' || event.key === 'Enter' || Boolean(event.defaultPrevented);
}

/**
 * What a Select's list is called: its aria-label, else the text of its
 * <label> (Field's htmlFor) or aria-labelledby, else the placeholder.
 */
export function listName(ariaLabel, labelText, placeholder) {
  return ariaLabel
    || String(labelText || '').replace(/\s+/g, ' ').trim()
    || (typeof placeholder === 'string' && placeholder)
    || 'Options';
}

/** The name of a list's search field: "Search model". A leading acronym keeps its capitals. */
export function searchFieldName(name) {
  const first = String(name).split(' ')[0];
  const acronym = first.length > 1 && first === first.toUpperCase() && first !== first.toLowerCase();
  return `Search ${acronym ? name : String(name).charAt(0).toLowerCase() + String(name).slice(1)}`;
}

function firstChoosable(options, from, step) {
  for (let index = from; index >= 0 && index < options.length; index += step) {
    if (isChoosable(options[index])) return index;
  }
  return -1;
}

/**
 * Where the active option goes for a key: ArrowDown/ArrowUp step (stopping at
 * the ends, or going round to the other end with `wrap`), Home/End jump,
 * PageDown/PageUp move ten. Disabled options and separators are skipped.
 * Returns the new index, or `current` when the key doesn't move it.
 */
export function moveActive(options, current, key, { wrap = false } = {}) {
  const last = options.length - 1;
  const first = firstChoosable(options, 0, 1);
  const end = firstChoosable(options, last, -1);
  if (first === -1) return -1;
  switch (key) {
    case 'Home':
      return first;
    case 'End':
      return end;
    case 'ArrowDown': {
      if (current < 0) return first;
      const next = firstChoosable(options, current + 1, 1);
      if (next !== -1) return next;
      return wrap ? first : current;
    }
    case 'ArrowUp': {
      if (current < 0) return end;
      const previous = firstChoosable(options, current - 1, -1);
      if (previous !== -1) return previous;
      return wrap ? end : current;
    }
    case 'PageDown': {
      const target = Math.min(last, Math.max(current, 0) + 10);
      const next = firstChoosable(options, target, -1);
      return next > current ? next : (current < 0 ? first : current);
    }
    case 'PageUp': {
      const target = Math.max(0, current - 10);
      const previous = firstChoosable(options, target, 1);
      return previous !== -1 && (previous < current || current < 0) ? previous : current;
    }
    default:
      return current;
  }
}

/**
 * Collects typed characters into a search string that resets after
 * `timeout` ms without typing. `now` is passed in so tests can control time.
 */
export function createTypeahead(timeout = 500) {
  let buffer = '';
  let last = -Infinity;
  return {
    type(char, now = Date.now()) {
      buffer = now - last > timeout ? char : buffer + char;
      last = now;
      return buffer;
    },
    active(now = Date.now()) {
      return buffer !== '' && now - last <= timeout;
    },
    reset() {
      buffer = '';
      last = -Infinity;
    },
  };
}

/**
 * The option type-ahead lands on for `buffer`, searching from `current`.
 * Typing one letter again and again cycles through the options starting with
 * it; a longer string stays on the current option while it still matches.
 */
export function matchTypeahead(options, buffer, current = -1) {
  const query = String(buffer || '').toLowerCase();
  if (!query || !options.length) return -1;
  const repeated = query.length > 1 && [...query].every((char) => char === query[0]);
  const needle = repeated ? query[0] : query;
  const start = repeated || query.length === 1 ? current + 1 : Math.max(current, 0);
  for (let step = 0; step < options.length; step += 1) {
    const index = (start + step) % options.length;
    const option = options[index];
    if (isChoosable(option) && optionText(option).toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

/**
 * Splits options into runs for rendering: consecutive options with the same
 * `group` share a heading, and separators stand alone. Each option keeps its
 * index in `options`.
 */
export function optionSections(options) {
  const sections = [];
  options.forEach((option, index) => {
    if (option.separator) {
      sections.push({ separator: true, key: `separator-${index}` });
      return;
    }
    const group = option.group || null;
    const previous = sections[sections.length - 1];
    if (previous && !previous.separator && previous.group === group) {
      previous.items.push({ option, index });
    } else {
      sections.push({ group, key: `section-${index}`, items: [{ option, index }] });
    }
  });
  return sections;
}

/** The DOM id of option `index` in list `listId`, for aria-activedescendant. */
export function optionId(listId, index) {
  return `${listId}-option-${index}`;
}

/** Scrolls `list` just enough to show the element with id `id`. */
export function scrollOptionIntoView(list, id) {
  const option = list ? list.querySelector(`[id="${id}"]`) : null;
  if (!option) return;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top - 4;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
}
