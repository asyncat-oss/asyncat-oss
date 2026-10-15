// The option list Select and Combobox share, so both look the same: group
// headings, separators, a check on the chosen option, hints on the right and
// an optional second line.

import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { Check } from 'lucide-react';
import { optionId, optionSections } from './listbox.js';

/**
 * The floating panel's shell, shared with Menu's look. max-h-72 also caps the
 * height the panel is measured at, so a flipped panel sits right on its anchor.
 */
export const PANEL_CLASS = 'z-[250] flex max-h-72 flex-col rounded-xl border border-line bg-elevated p-1 text-fg shadow-xl shadow-black/10 dark:shadow-black/40 animate-[fadeIn_120ms_ease-out]';

const ListboxOptions = forwardRef(function ListboxOptions(
  { id, options, activeIndex, isSelected, onActivate, onChoose, label, labelledBy, emptyText = 'Nothing matches', mono = false, className = '' },
  ref,
) {
  const sections = optionSections(options);
  const renderOption = ({ option, index }) => {
    const Icon = option.icon;
    const selected = isSelected(option);
    const active = index === activeIndex;
    return (
      <div
        key={`${String(option.value)}-${index}`}
        id={optionId(id, index)}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled || undefined}
        onMouseMove={() => { if (!option.disabled && !active) onActivate(index); }}
        onClick={() => { if (!option.disabled) onChoose(option, index); }}
        className={`flex min-h-8 cursor-default select-none items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] ${
          option.disabled ? 'opacity-50' : ''
        } ${active ? 'bg-hover text-fg' : selected ? 'text-fg' : 'text-fg-muted'}`}
      >
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} /> : null}
        <span className="min-w-0 flex-1">
          <span className={`block truncate leading-5 ${mono ? 'font-mono' : ''}`}>{option.label ?? String(option.value)}</span>
          {option.description ? <span className="block text-[12px] leading-5 text-fg-subtle">{option.description}</span> : null}
        </span>
        {option.hint ? <span className="shrink-0 text-[12px] leading-5 tabular-nums text-fg-subtle">{option.hint}</span> : null}
        <span className="flex h-5 w-3.5 shrink-0 items-center">
          {selected ? <Check className="h-3.5 w-3.5 text-fg" strokeWidth={2} /> : null}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={ref}
      id={id}
      role="listbox"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      // Never scrolls sideways: a wide option is cut off with an ellipsis.
      className={`relative min-h-0 overflow-y-auto overflow-x-hidden ${className}`}
    >
      {sections.length === 0 ? <p className="px-2.5 py-2 text-[13px] text-fg-subtle">{emptyText}</p> : null}
      {sections.map((section) => {
        // Only options and groups may sit in a listbox, so the divider is
        // hidden from screen readers (groups already carry their headings).
        if (section.separator) return <div key={section.key} aria-hidden="true" className="my-1 h-px bg-line" />;
        if (!section.group) return section.items.map(renderOption);
        const headingId = `${id}-${section.key}`;
        return (
          <div key={section.key} role="group" aria-labelledby={headingId}>
            <div id={headingId} className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-fg-subtle">{section.group}</div>
            {section.items.map(renderOption)}
          </div>
        );
      })}
    </div>
  );
});

ListboxOptions.propTypes = {
  id: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.object).isRequired,
  activeIndex: PropTypes.number,
  isSelected: PropTypes.func.isRequired,
  onActivate: PropTypes.func.isRequired,
  onChoose: PropTypes.func.isRequired,
  label: PropTypes.string,
  labelledBy: PropTypes.string,
  emptyText: PropTypes.node,
  mono: PropTypes.bool,
  className: PropTypes.string,
};

export default ListboxOptions;
