// A key combination drawn as key caps: ["Ctrl", "K"] → Ctrl K.

import PropTypes from 'prop-types';

export default function Keys({ keys, className = '' }) {
  if (!keys.length) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {keys.map((part, index) => (
        <kbd
          key={`${part}-${index}`}
          className="min-w-[1.5rem] rounded-md border border-line-strong bg-surface px-1.5 py-0.5 text-center font-sans text-[12px] font-medium leading-4 text-fg-muted"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

Keys.propTypes = { keys: PropTypes.arrayOf(PropTypes.string).isRequired, className: PropTypes.string };
