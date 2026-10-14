// Our own dropdown, used instead of the native <select>, whose open list is
// an OS popup that ignores the app's theme. A button opens a list of options
// in a floating panel; long lists get a search field.

import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { ChevronsUpDown, Search } from 'lucide-react';
import ListboxOptions, { PANEL_CLASS } from './ListboxOptions.jsx';
import { floatingStyle, useDismiss, useFloatingPosition } from './floating.js';
import {
  createTypeahead,
  filterOptions,
  indexOfValue,
  isChoosable,
  listName,
  matchTypeahead,
  moveActive,
  normalizeOptions,
  optionId,
  scrollOptionIntoView,
  searchFieldName,
} from './listbox.js';

const TRIGGER = {
  field: 'flex justify-between gap-2 rounded-lg border border-line-strong bg-canvas px-3 transition-[border-color,box-shadow] focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20',
  inline: 'inline-flex max-w-full -ml-2.5 gap-1.5 rounded-lg px-2.5 transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40 disabled:hover:bg-transparent',
};
const HEIGHTS = { field: { md: 'h-9', sm: 'h-8' }, inline: { md: 'h-8', sm: 'h-7' } };
const SEARCH_AFTER = 10;
const MAX_HEIGHT = 288;
const MIN_WIDTH = 200;
const LIST_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'];

function isPrintable(event) {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

// The text of the trigger's <label> (Field's htmlFor) or of its aria-labelledby.
function labelText(trigger, labelledby) {
  if (labelledby) return labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
  return trigger?.labels?.[0]?.textContent || '';
}

/**
 * A dropdown for choosing one of a few options.
 *
 *   <Select value={kind} onChange={setKind} aria-label="Kind" options={[
 *     { value: 'fact', label: 'Fact' },
 *     { value: 'task', label: 'Task', description: 'Something to do later', hint: '3' },
 *     { separator: true },
 *     { value: 'other', label: 'Other', group: 'More', disabled: true },
 *   ]} />
 *
 * `variant="field"` looks like an Input and fills its width (unless
 * `fullWidth={false}`); `variant="inline"` is a borderless value for a
 * settings row. More than ten options add a search field (or pass
 * `searchable`). `onChange(value, option)` runs only when the value changes.
 * Name it with aria-label, aria-labelledby or a <label htmlFor> on its id;
 * the list and its search field take the same name.
 *
 * Keyboard: Down, Up, Enter or Space opens the list on the chosen option;
 * arrows, Home, End and typing move through it; Enter or Space chooses;
 * Escape closes it and Tab closes it without choosing.
 */
const Select = forwardRef(function Select(
  {
    value,
    onChange,
    options: rawOptions,
    placeholder = 'Choose…',
    variant = 'field',
    size = 'md',
    fullWidth = true,
    searchable,
    searchPlaceholder = 'Search',
    emptyText,
    disabled = false,
    id,
    className = '',
    menuWidth,
    placement = 'bottom-start',
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...rest
  },
  ref,
) {
  const options = useMemo(() => normalizeOptions(rawOptions), [rawOptions]);
  const listId = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const [typeahead] = useState(() => createTypeahead(500));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [label, setLabel] = useState('');

  const withSearch = searchable ?? options.filter((option) => !option.separator).length > SEARCH_AFTER;
  const shown = useMemo(() => filterOptions(options, query), [options, query]);
  const selectedIndex = indexOfValue(options, value);
  const selected = selectedIndex === -1 ? null : options[selectedIndex];

  const setTriggerRef = useCallback((node) => {
    triggerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    typeahead.reset();
  }, [typeahead]);

  // As wide as the trigger. Opened above it with a search field, the list
  // keeps its height while it filters, so the field being typed in stays put.
  const position = useFloatingPosition(triggerRef, panelRef, open, {
    placement,
    measureKey: shown.length,
    minWidth: Math.max(menuWidth || 0, MIN_WIDTH),
    holdHeight: withSearch,
  });
  const placed = Boolean(position);
  useDismiss(panelRef, triggerRef, close, open);

  useEffect(() => {
    if (open && placed && withSearch) searchRef.current?.focus({ preventScroll: true });
  }, [open, placed, withSearch]);

  useLayoutEffect(() => {
    if (open && placed && active >= 0) scrollOptionIntoView(listRef.current, optionId(listId, active));
  }, [open, placed, active, listId]);

  useEffect(() => {
    if (disabled && open) close();
  }, [disabled, open, close]);

  const openList = (initial) => {
    if (disabled) return;
    setLabel(labelText(triggerRef.current, ariaLabelledby));
    setQuery('');
    const start = isChoosable(selected) ? selectedIndex : moveActive(options, -1, 'ArrowDown');
    setActive(initial ?? start);
    setOpen(true);
  };

  const search = (text) => {
    setQuery(text);
    const filtered = filterOptions(options, text);
    const keep = filtered.indexOf(selected);
    setActive(keep !== -1 && isChoosable(selected) ? keep : moveActive(filtered, -1, 'ArrowDown'));
  };

  const choose = (option) => {
    if (!isChoosable(option)) return;
    close();
    triggerRef.current?.focus({ preventScroll: true });
    if (option !== selected) onChange?.(option.value, option);
  };

  // Keys while the list is open, from the trigger or the search field.
  const onListKeyDown = (event) => {
    const { key } = event;
    const inSearch = event.currentTarget === searchRef.current;
    if (LIST_KEYS.includes(key)) {
      // Home and End move the caret once something is typed in the search field.
      if (inSearch && query && (key === 'Home' || key === 'End')) return;
      event.preventDefault();
      setActive((current) => moveActive(shown, current, key));
      return;
    }
    if (key === 'Enter' || (key === ' ' && !inSearch && !typeahead.active())) {
      event.preventDefault();
      if (shown[active]) choose(shown[active]);
      else close();
      return;
    }
    if (key === 'Tab') {
      // Close without choosing; from the search field, Tab carries on from the trigger.
      if (inSearch) triggerRef.current?.focus({ preventScroll: true });
      close();
      return;
    }
    if (!inSearch && isPrintable(event)) {
      event.preventDefault();
      const match = matchTypeahead(shown, typeahead.type(key), active);
      if (match !== -1) setActive(match);
    }
  };

  const onTriggerKeyDown = (event) => {
    if (disabled) return;
    if (open) {
      if (!withSearch) onListKeyDown(event);
      return;
    }
    const { key } = event;
    if (key === 'ArrowDown' || key === 'Enter' || key === ' ') {
      event.preventDefault();
      openList();
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      openList(isChoosable(selected) ? selectedIndex : moveActive(options, -1, 'ArrowUp'));
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      openList(moveActive(options, -1, key));
    } else if (isPrintable(event)) {
      event.preventDefault();
      if (withSearch) {
        openList();
        search(key);
      } else {
        const match = matchTypeahead(options, typeahead.type(key), selectedIndex);
        openList(match === -1 ? undefined : match);
      }
    }
  };

  const SelectedIcon = selected?.icon;
  const listLabel = listName(ariaLabel, label, placeholder);

  return (
    <>
      <button
        ref={setTriggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !withSearch && active >= 0 ? optionId(listId, active) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeyDown}
        className={`items-center text-left text-[13px] text-fg outline-none disabled:cursor-default disabled:opacity-60 ${TRIGGER[variant] || TRIGGER.field} ${(HEIGHTS[variant] || HEIGHTS.field)[size] || 'h-9'} ${variant !== 'inline' && fullWidth ? 'w-full' : ''} ${className}`}
        {...rest}
      >
        {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.75} /> : null}
        <span className={`min-w-0 truncate ${variant === 'inline' ? '' : 'flex-1'} ${selected ? '' : 'text-fg-subtle'}`}>
          {selected ? (selected.label ?? String(selected.value)) : placeholder}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
      </button>
      {open ? createPortal(
        <div
          ref={panelRef}
          style={floatingStyle(position, { maxHeight: MAX_HEIGHT })}
          className={PANEL_CLASS}
          // A click anywhere in the panel (padding, headings, the scrollbar)
          // leaves focus on the trigger or in the search field.
          onMouseDown={(event) => { if (event.target !== searchRef.current) event.preventDefault(); }}
          data-select-panel
        >
          {withSearch ? (
            <label className="-mx-1 -mt-1 mb-1 flex shrink-0 items-center gap-2 border-b border-line px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => search(event.target.value)}
                onKeyDown={onListKeyDown}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 && shown[active] ? optionId(listId, active) : undefined}
                aria-label={searchFieldName(listLabel)}
                placeholder={searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
              />
            </label>
          ) : null}
          <ListboxOptions
            ref={listRef}
            id={listId}
            options={shown}
            activeIndex={active}
            isSelected={(option) => option === selected}
            onActivate={setActive}
            onChoose={choose}
            label={listLabel}
            labelledBy={ariaLabelledby}
            emptyText={emptyText || (query ? 'Nothing matches' : 'Nothing to choose from')}
          />
        </div>,
        document.body,
      ) : null}
    </>
  );
});

Select.propTypes = {
  value: PropTypes.any,
  onChange: PropTypes.func,
  options: PropTypes.arrayOf(PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
    PropTypes.shape({
      value: PropTypes.any,
      label: PropTypes.node,
      text: PropTypes.string,
      description: PropTypes.node,
      hint: PropTypes.node,
      group: PropTypes.string,
      icon: PropTypes.elementType,
      disabled: PropTypes.bool,
      separator: PropTypes.bool,
    }),
  ])).isRequired,
  placeholder: PropTypes.node,
  variant: PropTypes.oneOf(['field', 'inline']),
  size: PropTypes.oneOf(['md', 'sm']),
  fullWidth: PropTypes.bool,
  searchable: PropTypes.bool,
  searchPlaceholder: PropTypes.string,
  emptyText: PropTypes.node,
  disabled: PropTypes.bool,
  id: PropTypes.string,
  className: PropTypes.string,
  menuWidth: PropTypes.number,
  placement: PropTypes.oneOf(['bottom-start', 'bottom-end', 'top-start', 'top-end']),
  'aria-label': PropTypes.string,
  'aria-labelledby': PropTypes.string,
};

export default Select;
