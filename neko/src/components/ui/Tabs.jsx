import { useRef } from 'react';
import PropTypes from 'prop-types';
import { useEdgeFade } from './edgeFade.js';

/**
 * Page-level tabs drawn as an underlined row.
 *   <Tabs value={tab} onChange={setTab} items={[{ value: 'chat', label: 'Language', icon: MessageSquare, meta: '3' }]} />
 */
export function Tabs({ value, onChange, items, className = '', label }) {
  const rowRef = useRef(null);
  useEdgeFade(rowRef);
  return (
    <div ref={rowRef} role="tablist" aria-label={label} className={`scroll-row -mb-px flex items-center gap-1 overflow-x-auto ${className}`}>
      {items.map(({ value: itemValue, label: itemLabel, icon: Icon, meta }) => {
        const active = itemValue === value;
        return (
          <button
            key={itemValue}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(itemValue)}
            className={`group relative flex h-10 shrink-0 items-center gap-2 rounded-t-lg px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
              active ? 'text-fg' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {Icon ? <Icon className="h-4 w-4" strokeWidth={1.75} /> : null}
            {itemLabel}
            {meta ? (
              <span className={`rounded-md px-1.5 py-px text-[11px] font-medium tabular-nums ${active ? 'bg-selected text-fg' : 'bg-hover text-fg-subtle'}`}>
                {meta}
              </span>
            ) : null}
            <span className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors ${active ? 'bg-fg' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
}

Tabs.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  items: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.node.isRequired,
    icon: PropTypes.elementType,
    meta: PropTypes.node,
  })).isRequired,
  className: PropTypes.string,
  label: PropTypes.string,
};

const SEGMENT_SIZES = {
  md: { track: 'gap-0.5 rounded-xl p-1', item: 'h-7 gap-1.5 rounded-lg px-3 text-[13px]', icon: 'h-3.5 w-3.5' },
  sm: { track: 'gap-0.5 rounded-lg p-0.5', item: 'h-6 gap-1 rounded-md px-2.5 text-[12px]', icon: 'h-3 w-3' },
};
const NEXT = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * A compact switch between a few choices.
 *   <Segmented value={view} onChange={setView} items={[{ value: 'connected', label: 'Connected' }]} />
 *
 * `role="tablist"` (the default) when it switches views on the page;
 * `role="radiogroup"` when it holds a setting. Arrow keys, Home and End move
 * the choice. `size="sm"` is the compact one for dense rows.
 */
export function Segmented({ value, onChange, items, className = '', label, size = 'md', role = 'tablist' }) {
  const look = SEGMENT_SIZES[size] || SEGMENT_SIZES.md;
  const trackRef = useRef(null);
  useEdgeFade(trackRef);
  const radio = role === 'radiogroup';
  const current = items.findIndex((item) => item.value === value);

  const onKeyDown = (event) => {
    const index = Math.max(current, 0);
    let next = null;
    if (event.key in NEXT) next = (index + NEXT[event.key] + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange(items[next].value);
    event.currentTarget.querySelectorAll('[data-segment]')[next]?.focus();
  };

  return (
    <div ref={trackRef} role={radio ? 'radiogroup' : 'tablist'} aria-label={label} onKeyDown={onKeyDown} className={`scroll-row inline-flex items-center bg-hover ${look.track} ${className}`}>
      {items.map(({ value: itemValue, label: itemLabel, icon: Icon, meta }, index) => {
        const active = itemValue === value;
        return (
          <button
            key={itemValue}
            type="button"
            role={radio ? 'radio' : 'tab'}
            aria-selected={radio ? undefined : active}
            aria-checked={radio ? active : undefined}
            tabIndex={active || (current === -1 && index === 0) ? 0 : -1}
            data-segment
            onClick={() => onChange(itemValue)}
            className={`flex items-center font-medium outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent/40 ${look.item} ${
              active ? 'bg-elevated text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {Icon ? <Icon className={look.icon} strokeWidth={1.75} /> : null}
            {itemLabel}
            {meta ? <span className="text-[11px] tabular-nums text-fg-subtle">{meta}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

Segmented.propTypes = {
  ...Tabs.propTypes,
  size: PropTypes.oneOf(['md', 'sm']),
  role: PropTypes.oneOf(['tablist', 'radiogroup']),
};
