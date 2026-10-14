// A grey placeholder that pulses while something loads.

import PropTypes from 'prop-types';

/** <Skeleton className="h-10" /> — give it a height (and a width if not full). */
export default function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-hover ${className}`} />;
}

Skeleton.propTypes = { className: PropTypes.string };
