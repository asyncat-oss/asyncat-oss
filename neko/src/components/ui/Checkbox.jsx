// Our own checkbox, so ticks match the theme instead of the OS's accent
// colour: an accent box with a check when on, an outlined box when off.

import PropTypes from 'prop-types';
import { Check } from 'lucide-react';

/**
 *   <Checkbox checked={showGrid} onChange={setShowGrid} label="Grid lines" />
 *
 * Without a visible `label`, pass `aria-label`.
 */
export default function Checkbox({ checked, onChange, label, description, disabled = false, id, className = '', 'aria-label': ariaLabel }) {
  const box = (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={Boolean(checked)}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default ${
        checked ? 'border-accent bg-accent' : 'border-control-border bg-canvas'
      }`}
    >
      {checked ? <Check className="h-3 w-3 text-canvas" strokeWidth={3} /> : null}
    </button>
  );
  if (!label) return box;
  return (
    <label className={`inline-flex items-start gap-2 text-[13px] leading-5 text-fg ${disabled ? 'cursor-default opacity-50' : 'cursor-pointer'} ${className}`}>
      <span className="flex h-5 shrink-0 items-center">{box}</span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description ? <span className="block text-[12px] leading-5 text-fg-muted">{description}</span> : null}
      </span>
    </label>
  );
}

Checkbox.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.node,
  description: PropTypes.node,
  disabled: PropTypes.bool,
  id: PropTypes.string,
  className: PropTypes.string,
  'aria-label': PropTypes.string,
};
