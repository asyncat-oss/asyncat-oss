// A bordered list of choices with our own radio dots, for picking one option
// that needs a line of explanation (a voice, a model size). Replaces native
// radios and the hand-made "choice card" lists.

import { useRef } from 'react';
import PropTypes from 'prop-types';
import { moveActive } from './listbox.js';

const KEYS = { ArrowDown: 'ArrowDown', ArrowRight: 'ArrowDown', ArrowUp: 'ArrowUp', ArrowLeft: 'ArrowUp', Home: 'Home', End: 'End' };

/**
 *   <RadioGroup value={size} onChange={setSize} label="Model size" options={[
 *     { value: 'base', label: 'Base', aside: 'Recommended', meta: '142 MB', description: 'Good for most voices.' },
 *     { value: 'large', label: 'Large', meta: '1.5 GB', group: 'Bigger', extra: <PlayButton /> },
 *   ]} />
 *
 * Arrow keys move the choice, going round at the ends, and Tab leaves the
 * group. `extra` is a slot on the right that doesn't choose the row when
 * clicked.
 */
export default function RadioGroup({ value, onChange, label, options, maxHeight, disabled = false, className = '' }) {
  const refs = useRef([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const enabled = options.map((option) => ({ ...option, disabled: disabled || option.disabled }));
  // Roving tab stop: the chosen option, or the first one that can be chosen.
  const tabStop = selectedIndex !== -1 && !enabled[selectedIndex].disabled ? selectedIndex : moveActive(enabled, -1, 'ArrowDown');

  const choose = (index) => {
    const option = enabled[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value, option);
  };

  const onKeyDown = (event, index) => {
    if (event.key === ' ') {
      event.preventDefault();
      choose(index);
      return;
    }
    const key = KEYS[event.key];
    if (!key) return;
    event.preventDefault();
    const next = moveActive(enabled, index, key, { wrap: true });
    if (next === -1 || next === index) return;
    refs.current[next]?.focus();
    choose(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`divide-y divide-line rounded-xl border border-line ${maxHeight ? 'overflow-y-auto' : 'overflow-hidden'} ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {enabled.map((option, index) => {
        const checked = index === selectedIndex;
        const showGroup = option.group && option.group !== enabled[index - 1]?.group;
        return (
          <div key={String(option.value)}>
            {showGroup ? <div className="px-3.5 pb-1 pt-3 text-[11px] font-medium text-fg-subtle">{option.group}</div> : null}
            <div
              onClick={() => choose(index)}
              className={`flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-accent/40 ${
                option.disabled ? 'cursor-default opacity-50' : 'cursor-pointer hover:bg-hover'
              } ${checked ? 'bg-selected' : ''}`}
            >
              <div
                ref={(node) => { refs.current[index] = node; }}
                role="radio"
                aria-checked={checked}
                aria-disabled={option.disabled || undefined}
                tabIndex={index === tabStop ? 0 : -1}
                onKeyDown={(event) => onKeyDown(event, index)}
                className="flex min-w-0 flex-1 items-start gap-3 outline-none"
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border bg-canvas ${checked ? 'border-accent' : 'border-control-border'}`}>
                  {checked ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  {/* The meta sits at the right of the first line, and goes under the name when the row is too narrow for both. */}
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-medium leading-5 text-fg">{option.label}</span>
                    {option.aside ? <span className="text-[11px] text-fg-subtle">{option.aside}</span> : null}
                    {option.meta ? <span className="ml-auto shrink-0 pl-2 text-[12px] leading-5 tabular-nums text-fg-subtle">{option.meta}</span> : null}
                  </span>
                  {option.description ? <span className="block text-[12px] leading-5 text-fg-muted">{option.description}</span> : null}
                </span>
              </div>
              {option.extra ? (
                <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                  {option.extra}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

RadioGroup.propTypes = {
  value: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.any.isRequired,
    label: PropTypes.node.isRequired,
    aside: PropTypes.node,
    meta: PropTypes.node,
    description: PropTypes.node,
    group: PropTypes.string,
    extra: PropTypes.node,
    disabled: PropTypes.bool,
  })).isRequired,
  maxHeight: PropTypes.number,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};
