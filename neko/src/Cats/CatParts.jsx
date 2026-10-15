// Small pieces shared by the Cats pages: the Cat's picture and its state
// pill.

import PropTypes from 'prop-types';
import { Cat as CatIcon } from 'lucide-react';
import { catStatus } from './catFormat.js';

const SIZES = {
  xs: 'h-5 w-5 text-[13px] rounded-md',
  sm: 'h-8 w-8 text-lg rounded-lg',
  md: 'h-11 w-11 text-2xl rounded-xl',
  lg: 'h-16 w-16 text-4xl rounded-2xl',
};
const ICON_SIZES = { xs: 'h-3 w-3', sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' };

/** A Cat's picture: an uploaded image, the emoji it was given, or a plain cat glyph. */
export function CatAvatar({ cat, size = 'sm', className = '' }) {
  const box = `${SIZES[size] || SIZES.sm} inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`;
  const avatar = cat?.avatar || '';
  if (avatar.startsWith('data:image/')) return <img src={avatar} alt="" className={`${box} object-cover`} />;
  return (
    <span className={`${box} border border-line bg-canvas`} aria-hidden="true">
      {avatar || <CatIcon className={`${ICON_SIZES[size] || ICON_SIZES.sm} text-fg-subtle`} strokeWidth={1.75} />}
    </span>
  );
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
