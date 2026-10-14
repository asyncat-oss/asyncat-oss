// A search snippet with the matched words highlighted. The server marks
// matches (see sidebar/chatSearch.js); they are rendered as text, never HTML.
import { memo } from 'react';
import PropTypes from 'prop-types';
import { snippetParts } from '../sidebar/chatSearch.js';

function SearchSnippet({ snippet, className = '' }) {
  return (
    <span className={className}>
      {snippetParts(snippet).map((part, index) => (
        part.match
          ? <mark key={index} className="rounded-[3px] bg-accent-soft px-px text-fg">{part.text}</mark>
          : <span key={index}>{part.text}</span>
      ))}
    </span>
  );
}

SearchSnippet.propTypes = {
  snippet: PropTypes.string,
  className: PropTypes.string,
};

export default memo(SearchSnippet);
