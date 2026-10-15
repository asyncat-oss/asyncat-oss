// Settings → Connections → Connectors: MCP servers that give agents and Cats
// tools from other apps and services. Lists each one with its status and
// tools; adds new ones from a small catalog, by address or by command.

import { useState } from 'react';
import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { useConnectors } from './useConnectors.js';
import AddConnectorDialog from './AddConnectorDialog.jsx';
import EditConnectorDialog from './EditConnectorDialog.jsx';
import ConnectorRow from './ConnectorRow.jsx';
import { ConnectorIcon } from './ConnectorParts.jsx';

export default function ConnectorsSection() {
  const { connectors, catalog, fileError, error, reload } = useConnectors();
  const [adding, setAdding] = useState(null); // { entry } while the dialog is open
  const [editing, setEditing] = useState(null);

  const loading = connectors === null;
  const suggestions = catalog.filter((entry) => !(connectors || []).some((item) => item.catalogId === entry.id)).slice(0, 6);

  return (
    <div className="space-y-5" data-connectors>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-[13px] leading-5 text-fg-muted">
          Connectors give your agents and Cats tools from other apps and services: your issue tracker, notes, docs, or a program on this computer. Each agent and Cat can be limited to the ones it needs.
        </p>
        <Button variant="primary" icon={Plus} onClick={() => setAdding({ entry: null })}>Add connector</Button>
      </div>

      {fileError ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] leading-5 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {fileError}
        </p>
      ) : null}
      {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading connectors…</div>
      ) : connectors.length ? (
        <div className="space-y-2.5">
          {connectors.map((connector) => (
            <ConnectorRow key={connector.name} connector={connector} onEdit={setEditing} onChanged={reload} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong px-5 py-6 text-center">
          <p className="text-[14px] font-medium text-fg">No connectors yet</p>
          <p className="mt-1 text-[13px] text-fg-muted">Start with one of these, or add any MCP server by its address or command.</p>
        </div>
      )}

      {!loading && suggestions.length ? (
        <section aria-label="Suggested connectors">
          <h3 className="mb-2 text-[12px] font-medium text-fg-subtle">From the catalog</h3>
          {/* One column on a phone; minmax(0, 1fr) so a long description
              truncates instead of widening the column past the screen. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setAdding({ entry })}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-hover"
              >
                <ConnectorIcon title={entry.title} kind={entry.kind} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-fg">{entry.title}</span>
                  <span className="block truncate text-[12px] text-fg-subtle">{entry.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-[12px] leading-5 text-fg-subtle">
        Connectors are saved in data/mcp.json, in the format other MCP apps use, so you can also paste a server in there. Tools that only read run without asking; any other tool asks you first unless you allowed it.
      </p>

      {adding ? (
        <AddConnectorDialog
          catalog={catalog}
          connectors={connectors || []}
          initialEntry={adding.entry}
          onClose={() => setAdding(null)}
          onAdded={() => { setAdding(null); reload(); }}
        />
      ) : null}
      {editing ? (
        <EditConnectorDialog
          connector={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      ) : null}
    </div>
  );
}
