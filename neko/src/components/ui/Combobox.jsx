// A text field with a list of suggestions, used instead of <input list> and
// <datalist>, whose list is an OS popup. Any text is allowed; the list only
// helps. Its panel and options look like Select's.

import { forwardRef, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import ListboxOptions, { PANEL_CLASS } from './ListboxOptions.jsx';
import { CONTROL_CLASS } from './Field.jsx';
import { floatingStyle, useDismiss, useFloatingPosition } from './floating.js';
import { keyClosesSuggestions, moveActive, normalizeOptions, optionId, scrollOptionIntoView, suggestionMatches } from './listbox.js';

const MAX_HEIGHT = 288;
const MIN_WIDTH = 200;

/**
 *   <Combobox value={model} onChange={setModel} aria-label="Base model"
 *     options={[{ value: 'Qwen/Qwen2.5-1.5B-Instruct', description: '1.5B' }]} />
 *
 * The list opens on a click, on typing and on Down, and shows the options
 * that contain the text, those starting with it first. Down and Up move
 * through it, Enter takes the active option, Escape closes it. `onSelect`
 * runs after an option is taken; other keys reach `onKeyDown`. Enter without
 * an active option, Tab, and any key `onKeyDown` takes (preventDefault)
 * close the list until the next keystroke. `mono` shows the text and the
 * suggestions in a monospace font, for names like tool ids.
 */
const Combobox = forwardRef(function Combobox(
  {
    value,
    onChange,
    onSelect,
    options: rawOptions,
    onKeyDown,
    onBlur,
    size = 'md',
    mono = false,
    className = '',
    placement = 'bottom-start',
    'aria-label': ariaLabel,
    ...rest
  },
  ref,
) {
  const options = useMemo(() => normalizeOptions(rawOptions), [rawOptions]);
  const listId = useId();
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const text = value ?? '';
  const hasList = options.length > 0;
  const matches = useMemo(() => suggestionMatches(options, text), [options, text]);
  // Nothing to suggest once the text is exactly the only match.
  const visible = open && matches.length > 0 && !(matches.length === 1 && String(matches[0].value) === text);

  const setInputRef = useCallback((node) => {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  // The list hides while nothing matches. Until it closes (Escape, Tab, a
  // choice, focus leaving), it comes back on the side it was on, so it doesn't
  // hop across the field as you type.
  const position = useFloatingPosition(inputRef, panelRef, visible, { placement, measureKey: matches.length, minWidth: MIN_WIDTH, keepSideWhile: open });
  const placed = Boolean(position);
  useDismiss(panelRef, inputRef, close, visible);

  useLayoutEffect(() => {
    if (visible && placed && active >= 0) scrollOptionIntoView(listRef.current, optionId(listId, active));
  }, [visible, placed, active, listId]);

  const show = () => setOpen(true);

  const choose = (option) => {
    if (!option || option.disabled) return;
    onChange?.(String(option.value));
    onSelect?.(option);
    close();
  };

  const handleKeyDown = (event) => {
    const { key } = event;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!visible) {
        show();
        setActive(moveActive(matches, -1, key));
      } else {
        setActive((current) => moveActive(matches, current, key));
      }
      return;
    }
    if (visible && (key === 'PageDown' || key === 'PageUp')) {
      event.preventDefault();
      setActive((current) => moveActive(matches, current, key));
      return;
    }
    if (visible && key === 'Enter' && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
      return;
    }
    onKeyDown?.(event);
    if (keyClosesSuggestions(event)) close();
  };

  return (
    <>
      <input
        ref={setInputRef}
        value={text}
        // With nothing to suggest it is a plain text field to screen readers.
        role={hasList ? 'combobox' : undefined}
        aria-autocomplete={hasList ? 'list' : undefined}
        aria-expanded={hasList ? visible : undefined}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && active >= 0 ? optionId(listId, active) : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(event) => {
          onChange?.(event.target.value);
          setActive(-1);
          show();
        }}
        onClick={show}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          close();
          onBlur?.(event);
        }}
        className={`${size === 'sm' ? 'h-8' : 'h-9'} ${CONTROL_CLASS} ${mono ? 'font-mono' : ''} ${className}`}
        {...rest}
      />
      {visible ? createPortal(
        <div
          ref={panelRef}
          style={floatingStyle(position, { maxHeight: MAX_HEIGHT })}
          className={PANEL_CLASS}
          // A click anywhere in the panel keeps focus in the field, so it
          // doesn't blur (and run the caller's onBlur) halfway through.
          onMouseDown={(event) => event.preventDefault()}
          data-combobox-panel
        >
          <ListboxOptions
            ref={listRef}
            id={listId}
            options={matches}
            activeIndex={active}
            isSelected={(option) => String(option.value) === text}
            onActivate={setActive}
            onChoose={choose}
            label={ariaLabel ? `${ariaLabel} suggestions` : 'Suggestions'}
            mono={mono}
          />
        </div>,
        document.body,
      ) : null}
    </>
  );
});

Combobox.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  onSelect: PropTypes.func,
  options: PropTypes.arrayOf(PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.node,
      description: PropTypes.node,
      hint: PropTypes.node,
      group: PropTypes.string,
      disabled: PropTypes.bool,
    }),
  ])).isRequired,
  onKeyDown: PropTypes.func,
  onBlur: PropTypes.func,
  size: PropTypes.oneOf(['md', 'sm']),
  mono: PropTypes.bool,
  className: PropTypes.string,
  placement: PropTypes.oneOf(['bottom-start', 'bottom-end', 'top-start', 'top-end']),
  'aria-label': PropTypes.string,
};

export default Combobox;
