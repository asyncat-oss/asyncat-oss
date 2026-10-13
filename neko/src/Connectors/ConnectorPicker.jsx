// Which connectors an agent or a Cat may use: all of them (or, for a Cat,
// whatever its brain may use), or only the ones picked here.

import { useId } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Field } from '../components/ui/Field.jsx';
import { useConnectors } from './useConnectors.js';
import { statusLine } from './connectorFormat.js';

export default function ConnectorPicker({ value, onChange, inheritLabel = 'All connectors', inheritHint = 'Including ones you add later.', label = 'Connectors' }) {
  const { connectors } = useConnectors();
  const group = useId();
  const list = connectors || [];
  const limited = Array.isArray(value);
  const picked = new Set(limited ? value : []);
  const missing = limited ? value.filter((name) => !list.some((item) => item.name === name)) : [];

  const toggle = (name) => {
    const next = new Set(picked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next]);
  };

  return (
    <Field
      label={label}
      hint={list.length ? 'Tools from other apps and services (Settings → Connections → Connectors).' : null}
    >
      {connectors !== null && !list.length ? (
        <p className="rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-[13px] text-fg-muted">
          No connectors yet. <Link to="/settings/connectors" className="text-accent hover:underline">Add one</Link> to give it tools from apps like Notion or GitHub.
        </p>
      ) : (
        <div role="radiogroup" aria-label={label} className="divide-y divide-line rounded-xl border border-line" data-connector-picker>
          <label className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 hover:bg-hover">
            <input type="radio" name={group} className="mt-0.5 h-4 w-4 accent-[var(--as-accent)]" checked={!limited} onChange={() => onChange(null)} />
            <span>
              <span className="block text-[13px] font-medium text-fg">{inheritLabel}</span>
              {inheritHint ? <span className="block text-[12px] leading-5 text-fg-muted">{inheritHint}</span> : null}
            </span>
          </label>
          <div>
            <label className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 hover:bg-hover">
              <input type="radio" name={group} className="mt-0.5 h-4 w-4 accent-[var(--as-accent)]" checked={limited} onChange={() => onChange(limited ? value : [])} />
              <span>
                <span className="block text-[13px] font-medium text-fg">Only the ones I pick</span>
                <span className="block text-[12px] leading-5 text-fg-muted">
                  {limited ? `${picked.size ? `${value.length - missing.length} picked` : 'None picked yet: it can use no connectors'}.` : 'Nothing else, even ones you add later.'}
                </span>
              </span>
            </label>
            {limited ? (
              <div className="grid gap-1 px-3.5 pb-3 sm:grid-cols-2">
                {list.map((connector) => (
                  <label key={connector.name} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                    <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-[var(--as-accent)]" checked={picked.has(connector.name)} onChange={() => toggle(connector.name)} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-fg">{connector.title}</span>
                      <span className="block truncate text-[11px] text-fg-subtle">{connector.enabled ? statusLine(connector) : 'Off'}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Field>
  );
}

ConnectorPicker.propTypes = {
  value: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  inheritLabel: PropTypes.string,
  inheritHint: PropTypes.string,
  label: PropTypes.string,
};
