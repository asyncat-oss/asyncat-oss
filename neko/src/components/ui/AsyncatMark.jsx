import PropTypes from 'prop-types';

// The lowercase "a" from asyncat.com's icon.
const A_PATH = 'M20 10c-5 0-8 2-8 6h5c0-1.5 1-2.5 3-2.5s3 1 3 2.5v1h-4c-5 0-8 2-8 6 0 4 3 6 7 6 2.5 0 4-1 5-2v2h5V17c0-5-3-7-8-7Zm3 11c0 3-2 4-4 4s-3-1-3-2 1-2 4-2h3Z';

/**
 * The Asyncat mark. `tile` (default) is the blue rounded square with a white
 * "a", as in the app icon; `glyph` is the "a" alone in the current text colour.
 */
export default function AsyncatMark({ className = 'h-7 w-7', variant = 'tile' }) {
  if (variant === 'glyph') {
    return (
      <svg viewBox="9 8 22 24" aria-hidden="true" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d={A_PATH} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#2456dc" />
      <path fill="#fff" d={A_PATH} />
    </svg>
  );
}

AsyncatMark.propTypes = {
  className: PropTypes.string,
  variant: PropTypes.oneOf(['tile', 'glyph']),
};
