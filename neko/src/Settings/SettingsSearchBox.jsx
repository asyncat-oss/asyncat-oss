// The search box at the top of Settings, and the pages it finds.

import PropTypes from 'prop-types';
import { Search, X } from 'lucide-react';

export function SettingsSearchBox({ value, onChange, onSubmit }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          } else if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Search settings"
        aria-label="Search settings"
        className="h-8 w-full rounded-lg border border-line bg-canvas pl-8 pr-7 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 [&::-webkit-search-cancel-button]:hidden"
        data-settings-search
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Clear the search" className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg">
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

SettingsSearchBox.propTypes = { value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, onSubmit: PropTypes.func.isRequired };

export function SettingsSearchResults({ results, icons, onPick }) {
  if (!results.length) return <p className="px-2.5 py-2 text-[13px] text-fg-muted">No settings match.</p>;
  return (
    <ul className="space-y-px" aria-label="Matching settings" data-settings-results>
      {results.map((result) => {
        const Icon = icons[result.tab];
        return (
          <li key={`${result.tab}:${result.view || ''}`}>
            <button
              type="button"
              onClick={() => onPick(result)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">{Icon ? <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} /> : null}</span>
              <span className="min-w-0">
                <span className="block text-fg">{result.label}</span>
                {result.term ? <span className="block truncate text-[11px] text-fg-subtle">{result.term}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

SettingsSearchResults.propTypes = { results: PropTypes.array.isRequired, icons: PropTypes.object.isRequired, onPick: PropTypes.func.isRequired };
