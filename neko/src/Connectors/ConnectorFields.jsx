// The fields for adding or editing a connector: a remote server (address,
// optional headers and sign-in settings) or a local program (command,
// environment variables, folder).

import { useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import Button from '../components/ui/Button.jsx';

const TEXTAREA = 'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2.5 font-mono text-[12px] leading-5 text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20';

function Disclosure({ open, onToggle, children }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-1 text-[12px] font-medium text-fg-muted transition-colors hover:text-fg">
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

Disclosure.propTypes = { open: PropTypes.bool, onToggle: PropTypes.func.isRequired, children: PropTypes.node };

export function RemoteFields({ form, set, autoFocus = false }) {
  const [advanced, setAdvanced] = useState(Boolean(form.headersText || form.clientId || form.scope || form.transport === 'sse'));
  return (
    <div className="space-y-4">
      <Field label="Address" htmlFor="connector-url" hint="The service's MCP address, often ending in /mcp. Its own docs give it.">
        <Input id="connector-url" type="url" required autoFocus={autoFocus} value={form.url} onChange={(event) => set({ url: event.target.value })} placeholder="https://mcp.example.com/mcp" />
      </Field>
      <Field label="Name" htmlFor="connector-title" hint="Optional. How Asyncat shows it.">
        <Input id="connector-title" value={form.title} onChange={(event) => set({ title: event.target.value })} placeholder="Example" />
      </Field>
      <Disclosure open={advanced} onToggle={() => setAdvanced(!advanced)}>Key, headers and sign-in settings</Disclosure>
      {advanced ? (
        <div className="space-y-4 rounded-xl border border-line p-3.5">
          <Field label="Headers" htmlFor="connector-headers" hint="One per line, like Authorization: Bearer your-key. Saved encrypted; ******** keeps the saved value.">
            <textarea id="connector-headers" rows={3} className={TEXTAREA} value={form.headersText} onChange={(event) => set({ headersText: event.target.value })} placeholder="Authorization: Bearer …" spellCheck={false} />
          </Field>
          <Field label="Connection" htmlFor="connector-transport">
            <Select id="connector-transport" value={form.transport} onChange={(event) => set({ transport: event.target.value })}>
              <option value="http">Streamable HTTP (current servers)</option>
              <option value="sse">SSE (older servers)</option>
            </Select>
          </Field>
          <p className="text-[12px] leading-5 text-fg-subtle">
            Most services that need a sign-in register Asyncat themselves. Some ask you to make an app with them first: put its client ID here.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="OAuth client ID" htmlFor="connector-client-id">
              <Input id="connector-client-id" value={form.clientId} onChange={(event) => set({ clientId: event.target.value })} autoComplete="off" />
            </Field>
            <Field label="Client secret" htmlFor="connector-client-secret">
              <Input id="connector-client-secret" type="password" value={form.clientSecret} onChange={(event) => set({ clientSecret: event.target.value })} autoComplete="new-password" />
            </Field>
          </div>
          <Field label="Scopes" htmlFor="connector-scope" hint="Optional, separated by spaces.">
            <Input id="connector-scope" value={form.scope} onChange={(event) => set({ scope: event.target.value })} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

RemoteFields.propTypes = { form: PropTypes.object.isRequired, set: PropTypes.func.isRequired, autoFocus: PropTypes.bool };

export function LocalFields({ form, set, autoFocus = false }) {
  const [advanced, setAdvanced] = useState(Boolean(form.cwd));
  const chooseFolder = async () => {
    const result = await window.electronAPI.openDirectory({ title: 'Choose its working folder', defaultPath: form.cwd || undefined });
    if (!result?.canceled && result?.filePaths?.[0]) set({ cwd: result.filePaths[0] });
  };
  return (
    <div className="space-y-4">
      <Field label="Command" htmlFor="connector-command" hint="The program and its arguments, as you'd type them in a terminal.">
        <Input id="connector-command" required autoFocus={autoFocus} className="font-mono text-[12px]" value={form.commandLine} onChange={(event) => set({ commandLine: event.target.value })} placeholder="npx -y @modelcontextprotocol/server-everything" spellCheck={false} />
      </Field>
      <Field label="Name" htmlFor="connector-local-title" hint="Optional. How Asyncat shows it.">
        <Input id="connector-local-title" value={form.title} onChange={(event) => set({ title: event.target.value })} placeholder="Example" />
      </Field>
      <Field label="Environment variables" htmlFor="connector-env" hint="KEY=value, one per line. API keys go here; they're saved encrypted, and ******** keeps the saved value.">
        <textarea id="connector-env" rows={3} className={TEXTAREA} value={form.envText} onChange={(event) => set({ envText: event.target.value })} placeholder="API_KEY=…" spellCheck={false} />
      </Field>
      <Disclosure open={advanced} onToggle={() => setAdvanced(!advanced)}>Working folder</Disclosure>
      {advanced ? (
        <Field label="Working folder" htmlFor="connector-cwd" hint="Where it starts. Leave empty for your home folder.">
          <div className="flex gap-2">
            <Input id="connector-cwd" value={form.cwd} onChange={(event) => set({ cwd: event.target.value })} placeholder="/path/to/folder" />
            {window.electronAPI?.openDirectory ? <Button icon={FolderOpen} onClick={chooseFolder}>Choose</Button> : null}
          </div>
        </Field>
      ) : null}
    </div>
  );
}

LocalFields.propTypes = { form: PropTypes.object.isRequired, set: PropTypes.func.isRequired, autoFocus: PropTypes.bool };
