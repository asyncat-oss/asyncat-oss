// Small pieces shared by the Cats pages: the Cat's picture, its state pill
// and an on/off switch.

import PropTypes from 'prop-types';
import { catStatus } from './catFormat.js';

const SIZES = {
  xs: 'h-5 w-5 text-[13px] rounded-md',
  sm: 'h-8 w-8 text-lg rounded-lg',
  md: 'h-11 w-11 text-2xl rounded-xl',
  lg: 'h-16 w-16 text-4xl rounded-2xl',
};

/** A Cat's picture: an uploaded image or an emoji. */
export function CatAvatar({ cat, size = 'sm', className = '' }) {
  const box = `${SIZES[size] || SIZES.sm} inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`;
  const avatar = cat?.avatar || '🐱';
  if (avatar.startsWith('data:image/')) return <img src={avatar} alt="" className={`${box} object-cover`} />;
  return <span className={`${box} border border-line bg-canvas`} aria-hidden="true">{avatar}</span>;
}

CatAvatar.propTypes = {
  cat: PropTypes.shape({ avatar: PropTypes.string }),
  size: PropTypes.oneOf(Object.keys(SIZES)),
  className: PropTypes.string,
};

const TONES = {
  green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  blue: 'bg-accent-soft text-accent',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  gray: 'bg-hover text-fg-muted',
};

export function StatusPill({ cat, className = '' }) {
  const { label, tone } = catStatus(cat);
  if (!label) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone] || TONES.gray} ${className}`}>
      {tone === 'blue' || tone === 'amber' ? <span className={`h-1.5 w-1.5 rounded-full ${tone === 'blue' ? 'bg-accent' : 'bg-amber-500'} animate-pulse`} /> : null}
      {label}
    </span>
  );
}

StatusPill.propTypes = { cat: PropTypes.object, className: PropTypes.string };

export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? 'On' : 'Off'}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); onChange(!checked); }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-line-strong'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

Switch.propTypes = { checked: PropTypes.bool, onChange: PropTypes.func.isRequired, label: PropTypes.string, disabled: PropTypes.bool };
