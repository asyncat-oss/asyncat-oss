import PropTypes from 'prop-types';

/**
 * Page-level tabs drawn as an underlined row.
 *   <Tabs value={tab} onChange={setTab} items={[{ value: 'chat', label: 'Language', icon: MessageSquare, meta: '3' }]} />
 */
export function Tabs({ value, onChange, items, className = '', label }) {
  return (
    <div role="tablist" aria-label={label} className={`-mb-px flex items-center gap-1 overflow-x-auto ${className}`}>
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
              <span className={`rounded-md px-1.5 py-px text-[11px] font-medium tabular-nums ${active ? 'bg-accent-soft text-accent' : 'bg-hover text-fg-subtle'}`}>
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

/**
 * A compact switch between a few views inside one page.
 *   <Segmented value={view} onChange={setView} items={[{ value: 'connected', label: 'Connected' }]} />
 */
export function Segmented({ value, onChange, items, className = '', label }) {
  return (
    <div role="tablist" aria-label={label} className={`inline-flex items-center gap-0.5 rounded-xl bg-hover p-1 ${className}`}>
      {items.map(({ value: itemValue, label: itemLabel, icon: Icon, meta }) => {
        const active = itemValue === value;
        return (
          <button
            key={itemValue}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(itemValue)}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent/40 ${
              active ? 'bg-elevated text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
            {itemLabel}
            {meta ? <span className="text-[11px] tabular-nums text-fg-subtle">{meta}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

Segmented.propTypes = Tabs.propTypes;
