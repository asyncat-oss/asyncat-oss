// One connector in Settings → Connections → Connectors: its status, what it
// needs from you (a sign-in, an OK to download), its tools, and actions.

import { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, ChevronRight, LogIn, LogOut, MoreHorizontal, Pencil, RotateCw, Trash2 } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import { openWebLink } from '../utils/openWebLink.js';
import Switch from '../components/ui/Switch.jsx';
import { connectorsApi } from './connectorsApi.js';
import { PERMISSION_TEXT, whereLine } from './connectorFormat.js';
import { ConnectorIcon, ConnectorStatus } from './ConnectorParts.jsx';
import DownloadNotice from './DownloadNotice.jsx';

const PERMISSION_TONE = {
  safe: 'text-fg-subtle',
  moderate: 'text-fg-muted',
  dangerous: 'text-amber-700 dark:text-amber-400',
};

function ToolList({ tools }) {
  return (
    <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
      {tools.map((tool) => (
        <li key={tool.name} className="flex items-start justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block font-mono text-[12px] text-fg">{tool.tool}</span>
            {tool.description ? <span className="mt-0.5 block text-[12px] leading-5 text-fg-muted">{tool.description}</span> : null}
          </span>
          <span className={`shrink-0 text-[11px] ${PERMISSION_TONE[tool.permission] || ''}`} title={tool.permission === 'safe' ? 'Runs without asking' : 'Asks you first, unless you allowed it'}>
            {PERMISSION_TEXT[tool.permission] || tool.permission}
          </span>
        </li>
      ))}
    </ul>
  );
}

ToolList.propTypes = { tools: PropTypes.array.isRequired };

export default function ConnectorRow({ connector, onEdit, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState('');
  const { name, title } = connector;

  const act = async (label, fn, { success = null } = {}) => {
    setBusy(label);
    try {
      const result = await fn();
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      onChanged?.();
      return result;
    } catch (err) {
      toast.error(`Couldn't ${label}`, { detail: errorDetail(err) });
      return null;
    } finally {
      setBusy('');
    }
  };

  const signIn = () => act(`sign in to ${title}`, async () => {
    const res = await connectorsApi.signIn(name);
    if (res.authorizationUrl) {
      openWebLink(res.authorizationUrl, 'system');
      toast.info(`Finish signing in to ${title} in your browser`);
    }
    return res;
  });

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${title}?`,
      message: 'Agents and Cats lose its tools. Its saved keys and sign-in are deleted from this computer.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) act(`remove ${title}`, () => connectorsApi.remove(name), { success: `Removed ${title}` });
  };

  const checkSize = useCallback((opts) => connectorsApi.downloadSize(name, Boolean(opts?.deep)), [name]);
  const tools = connector.tools || [];

  return (
    <div className="rounded-xl border border-line bg-surface" data-connector={name}>
      <div className="flex items-center gap-3 px-4 py-3">
        <ConnectorIcon title={title} kind={connector.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <span className="truncate text-[14px] font-medium text-fg">{title}</span>
            <ConnectorStatus connector={connector} />
          </div>
          <p className="truncate text-[12px] text-fg-subtle" title={whereLine(connector)}>
            {connector.kind === 'remote' ? whereLine(connector) : <span className="font-mono">{whereLine(connector)}</span>}
            {connector.kind === 'remote' && connector.signedIn ? ' · Signed in' : ''}
          </p>
        </div>
        <Switch
          checked={connector.enabled}
          disabled={Boolean(busy)}
          label={`${title} on or off`}
          onChange={(enabled) => act(enabled ? `turn ${title} on` : `turn ${title} off`, () => connectorsApi.setEnabled(name, enabled))}
        />
        <span ref={menuRef}>
          <Button size="icon" variant="ghost" icon={MoreHorizontal} aria-label={`More for ${title}`} onClick={() => setMenuOpen((open) => !open)} />
        </span>
        <Menu anchorRef={menuRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-end" width={200} label={`More for ${title}`}>
          <MenuItem icon={Pencil} label="Edit…" onSelect={() => onEdit(connector)} />
          {connector.enabled ? <MenuItem icon={RotateCw} label="Restart" onSelect={() => act(`restart ${title}`, () => connectorsApi.restart(name))} /> : null}
          {connector.kind === 'remote' && connector.signedIn ? (
            <MenuItem icon={LogOut} label="Sign out" onSelect={() => act(`sign out of ${title}`, () => connectorsApi.signOut(name), { success: `Signed out of ${title}` })} />
          ) : null}
          <MenuSeparator />
          <MenuItem icon={Trash2} label="Remove" danger onSelect={remove} />
        </Menu>
      </div>

      {connector.enabled && connector.status === 'needs_sign_in' ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <p className="min-w-0 flex-1 text-[13px] leading-5 text-fg-muted">
            {connector.error || `Sign in to ${title} so agents can use it.`}
          </p>
          <Button size="sm" variant="primary" icon={LogIn} loading={busy === `sign in to ${title}`} onClick={signIn}>Sign in</Button>
        </div>
      ) : null}

      {connector.enabled && connector.status === 'needs_download' ? (
        <div className="border-t border-line px-4 py-3">
          {connector.error ? <p className="mb-2 text-[13px] text-fg-muted">{connector.error}</p> : null}
          <DownloadNotice
            check={checkSize}
            busy={busy === `download ${title}`}
            onApprove={(version) => act(`download ${title}`, () => connectorsApi.approveDownload(name, version))}
          />
        </div>
      ) : null}

      {connector.enabled && connector.status === 'starting' && connector.approvedDownload ? (
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-fg-subtle">The first start downloads it, which can take a few minutes.</p>
      ) : null}

      {connector.enabled && connector.status === 'error' ? (
        <div className="border-t border-line px-4 py-3">
          <div className="flex flex-wrap items-start gap-3">
            <p className="min-w-0 flex-1 text-[13px] leading-5 text-red-700 dark:text-red-400">{connector.error}</p>
            <Button size="sm" icon={RotateCw} loading={busy === `restart ${title}`} onClick={() => act(`restart ${title}`, () => connectorsApi.restart(name))}>Try again</Button>
          </div>
          {connector.log ? (
            <>
              <button type="button" onClick={() => setShowLog(!showLog)} className="mt-2 flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg">
                {showLog ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} What it printed
              </button>
              {showLog ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-hover/60 p-2.5 font-mono text-[11px] leading-4 text-fg-muted">{connector.log}</pre> : null}
            </>
          ) : null}
        </div>
      ) : null}

      {connector.enabled && connector.status === 'connected' && tools.length ? (
        <div className="border-t border-line px-4 py-2.5">
          <button type="button" onClick={() => setShowTools(!showTools)} className="flex items-center gap-1 text-[12px] font-medium text-fg-muted hover:text-fg" aria-expanded={showTools}>
            {showTools ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Tools
          </button>
          {showTools ? <ToolList tools={tools} /> : null}
        </div>
      ) : null}
    </div>
  );
}

ConnectorRow.propTypes = {
  connector: PropTypes.object.isRequired,
  onEdit: PropTypes.func.isRequired,
  onChanged: PropTypes.func,
};
