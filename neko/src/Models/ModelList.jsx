import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Brain, Check, Eye, Search, Wrench } from 'lucide-react';

const formatContext = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1000000 ? `${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}M ctx` : `${Math.round(n / 1000)}K ctx`;
};

const formatPrice = (value) => {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return null;
  const perMillion = n < 0.001 ? n * 1000000 : n;
  return perMillion < 0.01 ? '<$0.01' : `$${perMillion.toFixed(2)}`;
};

/**
 * A searchable list of the models a provider offers. Clicking a row calls
 * onSelect(model); the row matching `value` is marked as chosen.
 */
export default function ModelList({ models, value = '', onSelect, loading = false, maxHeight = 'max-h-72', emptyLabel = 'No models found.' }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((model) => [model.id, model.name, model.description, model.owned_by]
      .filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [models, query]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-canvas">
      {models.length > 6 ? (
        <label className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${models.length} models`}
            className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
      ) : null}
      <div className={`${maxHeight} overflow-y-auto p-1`}>
        {loading ? (
          <div className="space-y-1 p-1">
            {[0, 1, 2].map((row) => <div key={row} className="h-10 animate-pulse rounded-lg bg-hover" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-fg-subtle">{query ? 'No models match.' : emptyLabel}</p>
        ) : filtered.map((model) => {
          const modelId = model.id || model.name;
          const chosen = modelId === value;
          const params = Array.isArray(model.supported_parameters) ? model.supported_parameters : [];
          const inputs = Array.isArray(model.architecture?.input_modalities) ? model.architecture.input_modalities : [];
          const vision = Boolean(model.capabilities?.supportsImageInput || inputs.includes('image'));
          const tools = params.includes('tools') || model.capabilities?.supportsTools;
          const reasoning = params.includes('reasoning') || model.capabilities?.supportsReasoning;
          const price = formatPrice(model.pricing?.prompt);
          const context = formatContext(model.context_window);
          return (
            <button
              key={modelId}
              type="button"
              onClick={() => onSelect(model)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
                chosen ? 'bg-selected' : 'hover:bg-hover'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-fg">{model.name || modelId}</span>
                  {chosen ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
                </div>
                {model.name && model.name !== modelId ? (
                  <div className="truncate font-mono text-[11px] text-fg-subtle">{modelId}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-fg-subtle">
                {vision ? <Eye className="h-3.5 w-3.5" aria-label="Image input" /> : null}
                {tools ? <Wrench className="h-3.5 w-3.5" aria-label="Tool calling" /> : null}
                {reasoning ? <Brain className="h-3.5 w-3.5" aria-label="Reasoning" /> : null}
                {price ? <span className="text-[11px] tabular-nums">{price}/M</span> : null}
                {context ? <span className="text-[11px] tabular-nums">{context}</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

ModelList.propTypes = {
  models: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  maxHeight: PropTypes.string,
  emptyLabel: PropTypes.string,
};
