// The on/off switch: accent when on, a neutral track when off.

import PropTypes from 'prop-types';

const SIZES = {
  md: { track: 'h-5 w-9', knob: 'h-4 w-4', on: 'translate-x-[18px]', off: 'translate-x-0.5' },
  sm: { track: 'h-4 w-7', knob: 'h-3 w-3', on: 'translate-x-3.5', off: 'translate-x-0.5' },
};

/**
 *   <Switch checked={on} onChange={setOn} label="Use quiet hours" />
 *
 * `label` is the accessible name when no visible label points at it. A click
 * doesn't reach the row around it, so a switch can sit inside a clickable row.
 */
export default function Switch({ checked, onChange, label, disabled = false, size = 'md', id, className = '', 'aria-labelledby': labelledBy }) {
  const look = SIZES[size] || SIZES.md;
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={Boolean(checked)}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas disabled:cursor-default disabled:opacity-50 ${look.track} ${
        checked ? 'bg-accent' : 'bg-line-strong'
      } ${className}`}
    >
      <span className={`inline-block rounded-full bg-white shadow-sm transition-transform ${look.knob} ${checked ? look.on : look.off}`} />
    </button>
  );
}

Switch.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(Object.keys(SIZES)),
  id: PropTypes.string,
  className: PropTypes.string,
  'aria-labelledby': PropTypes.string,
};
