// A search box: a text field with a magnifier in front and a button that
// clears it. Escape clears it too.

import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { Search, X } from 'lucide-react';
import { CONTROL_CLASS } from './Field.jsx';

/**
 *   <SearchField value={query} onChange={setQuery} placeholder="Search memories" />
 *
 * `onChange` gets the text, not the event. Other props go to the <input>.
 */
const SearchField = forwardRef(function SearchField(
  { value, onChange, placeholder = 'Search', size = 'md', className = '', onKeyDown, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            event.stopPropagation();
            onChange('');
          }
          onKeyDown?.(event);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={`${size === 'sm' ? 'h-8' : 'h-9'} ${CONTROL_CLASS} pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden`}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear the search"
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
});

SearchField.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  size: PropTypes.oneOf(['md', 'sm']),
  className: PropTypes.string,
  onKeyDown: PropTypes.func,
  'aria-label': PropTypes.string,
};

export default SearchField;
