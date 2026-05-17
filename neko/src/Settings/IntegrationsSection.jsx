// Settings/IntegrationsSection.jsx
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, ExternalLink, Loader2, Plug, Unplug,
  AlertTriangle, ChevronDown, ChevronUp, Save, Github,
  Rss, Mail, Bookmark, RefreshCw, Plus, Trash2,
} from 'lucide-react';
import { integrationsApi, configApi, apiUtils } from './settingApi';

const mutedCls = 'text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400';
const panelCls = 'rounded-xl border border-gray-200/80 dark:border-gray-800 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 overflow-hidden';

// ── Credential setup form (inline, collapsible) ───────────────────────────────

function CredentialSetup({ fields, helpUrl, helpText, onSaved }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, '']))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    const filled = fields.filter((f) => values[f.key]?.trim());
    if (filled.length === 0) {
      setError('Enter at least one credential to save.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const field of filled) {
        const val = values[field.key].trim();
        if (field.configType === 'config') {
          await configApi.updateConfig(field.key, val);
        } else {
          await configApi.updateSecret(field.key, val);
        }
      }
      await onSaved?.();
    } catch (err) {
      setError(err.message || 'Failed to save credentials.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-gray-950/50 space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1">
          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400">
            {field.label}
            <code className="ml-1.5 px-1 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 font-mono text-[10px] text-gray-500">
              {field.key}
            </code>
          </label>
          <input
            type={field.configType === 'secret' ? 'password' : 'text'}
            value={values[field.key]}
            onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
            autoComplete="off"
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-400 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-shadow"
          />
        </div>
      ))}

      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400 midnight:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white midnight:bg-gray-100 midnight:hover:bg-white text-white dark:text-gray-900 midnight:text-gray-900 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save credentials
        </button>
        {helpUrl && (
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-gray-200 underline underline-offset-2 transition-colors"
          >
            {helpText || 'Get credentials'} <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({
  logo,
  name,
  description,
  status,
  configured,
  loading,
  onConnect,
  onDisconnect,
  connecting,
  disconnecting,
  setupFields,
  setupHelpUrl,
  setupHelpText,
  onCredsSaved,
  // When true: configured == connected, no separate OAuth step needed
  noOAuth = false,
  children,
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const connected = noOAuth ? configured : status?.connected;

  // Close setup form once credentials make it configured
  useEffect(() => {
    if (configured) setSetupOpen(false);
  }, [configured]);

  const handleCredsSaved = async () => {
    setSetupOpen(false);
    await onCredsSaved?.();
  };

  if (loading) {
    return (
      <div className={`${panelCls} p-5 animate-pulse`}>
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800" />
            <div className="h-3 w-64 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={panelCls}>
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Logo */}
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-800">
          {logo}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
              {name}
            </h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/20 text-green-700 dark:text-green-400 midnight:text-green-400 border border-green-200/70 dark:border-green-800/40 midnight:border-green-800/40">
                <CheckCircle2 size={9} />
                Connected
              </span>
            )}
            {!configured && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/20 text-amber-700 dark:text-amber-400 midnight:text-amber-400 border border-amber-200/70 dark:border-amber-800/40 midnight:border-amber-800/40">
                <AlertTriangle size={9} />
                Needs setup
              </span>
            )}
          </div>

          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-gray-400">
            {description}
          </p>

          {connected && status?.email && (
            <p className={`mt-1.5 ${mutedCls}`}>
              Signed in as{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
                {status.email}
              </span>
            </p>
          )}
          {connected && status?.login && !status?.email && (
            <p className={`mt-1.5 ${mutedCls}`}>
              Signed in as{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
                @{status.login}
              </span>
            </p>
          )}
          {noOAuth && configured && status?.notes !== undefined && (
            <p className={`mt-1.5 ${mutedCls}`}>
              {status.notes} note{status.notes !== 1 ? 's' : ''} · {status.folders} folder{status.folders !== 1 ? 's' : ''}
            </p>
          )}
          {noOAuth && configured && status?.vaultPath && (
            <p className={`mt-1 ${mutedCls} font-mono truncate`} title={status.vaultPath}>
              {status.vaultPath}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {!configured && setupFields?.length > 0 && (
            <button
              type="button"
              onClick={() => setSetupOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 transition-colors"
            >
              {setupOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {setupOpen ? 'Cancel' : 'Configure'}
            </button>
          )}

          {connected && onDisconnect ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />}
              Disconnect
            </button>
          ) : !noOAuth && configured ? (
            <button
              type="button"
              onClick={onConnect}
              disabled={connecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white midnight:bg-gray-100 midnight:hover:bg-white text-white dark:text-gray-900 midnight:text-gray-900 disabled:opacity-45 transition-colors"
            >
              {connecting ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}
              Connect
            </button>
          ) : null}
        </div>
      </div>

      {/* Inline credential setup form */}
      {!configured && setupOpen && setupFields?.length > 0 && (
        <CredentialSetup
          fields={setupFields}
          helpUrl={setupHelpUrl}
          helpText={setupHelpText}
          onSaved={handleCredsSaved}
        />
      )}

      {children && (
        <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Logos ──────────────────────────────────────────────────────────────────────

const GoogleCalendarLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
    <path fill="#4285F4" d="M19 3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    <path fill="#fff" d="M17 12h-5v5h5v-5z" />
    <path fill="#EA4335" d="M8 17H5v-5h3v5z" />
    <path fill="#FBBC05" d="M17 7h-5V5h5v2z" />
    <path fill="#34A853" d="M8 7H5V5h3v2z" />
    <path fill="#fff" d="M8 12H5V9h3v3zm9 0h-5V9h5v3z" />
  </svg>
);

const OutlookLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
    <rect x="1" y="4" width="14" height="16" rx="2" fill="#0078D4" />
    <rect x="8" y="7" width="14" height="10" rx="1.5" fill="#50E6FF" opacity="0.9" />
    <rect x="8" y="7" width="14" height="10" rx="1.5" fill="none" stroke="#0078D4" strokeWidth="0.5" />
    <path d="M8 7l7 5 7-5" stroke="#0078D4" strokeWidth="1" fill="none" />
    <circle cx="5.5" cy="12" r="3.5" fill="#fff" />
    <text x="5.5" y="14.2" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#0078D4">O</text>
  </svg>
);

const GitHubLogo = () => (
  <Github size={22} className="text-gray-800 dark:text-gray-200 midnight:text-gray-200" />
);

const ObsidianLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
    <path fill="#7C3AED" d="M12 2L4 7v10l8 5 8-5V7L12 2z" opacity="0.15" />
    <path fill="#7C3AED" d="M12 2L4 7l8 3 8-3L12 2z" />
    <path fill="#6D28D9" d="M4 7v10l8 5V10L4 7z" />
    <path fill="#8B5CF6" d="M20 7v10l-8 5V10l8-3z" />
    <path fill="#A78BFA" d="M12 10l-8-3 8 3 8-3-8 3z" />
  </svg>
);

const RssLogo = () => (
  <Rss size={22} className="text-orange-500 dark:text-orange-400 midnight:text-orange-400" />
);

const MailLogo = () => (
  <Mail size={22} className="text-sky-600 dark:text-sky-400 midnight:text-sky-400" />
);

function RssReadLaterManager({ onChanged, flash }) {
  const [feeds, setFeeds] = useState([]);
  const [savedLinks, setSavedLinks] = useState([]);
  const [feedUrl, setFeedUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNotes, setLinkNotes] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const [feedsRes, linksRes] = await Promise.all([
      integrationsApi.rss.listFeeds(),
      integrationsApi.rss.listReadLater(5),
    ]);
    setFeeds(feedsRes.feeds || []);
    setSavedLinks(linksRes.items || []);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const addFeed = async () => {
    if (!feedUrl.trim()) return;
    setBusy('feed');
    try {
      const res = await integrationsApi.rss.addFeed(feedUrl.trim());
      setFeedUrl('');
      await load();
      await onChanged?.();
      flash?.({ type: 'success', text: `Added feed${res.imported ? ` with ${res.imported} item${res.imported === 1 ? '' : 's'}` : ''}.` });
    } catch (err) {
      flash?.({ type: 'error', text: apiUtils.handleError(err, 'Failed to add RSS feed') });
    } finally {
      setBusy(null);
    }
  };

  const refreshFeeds = async () => {
    setBusy('refresh');
    try {
      const res = await integrationsApi.rss.refreshAll();
      await load();
      await onChanged?.();
      flash?.({ type: 'success', text: `RSS refresh complete: ${res.refreshed || 0} ok, ${res.failed || 0} failed.` });
    } catch (err) {
      flash?.({ type: 'error', text: apiUtils.handleError(err, 'Failed to refresh feeds') });
    } finally {
      setBusy(null);
    }
  };

  const removeFeed = async (id) => {
    setBusy(`delete-${id}`);
    try {
      await integrationsApi.rss.deleteFeed(id);
      await load();
      await onChanged?.();
    } catch (err) {
      flash?.({ type: 'error', text: apiUtils.handleError(err, 'Failed to remove feed') });
    } finally {
      setBusy(null);
    }
  };

  const addReadLater = async () => {
    if (!linkUrl.trim()) return;
    setBusy('link');
    try {
      await integrationsApi.rss.addReadLater({ url: linkUrl.trim(), notes: linkNotes.trim() });
      setLinkUrl('');
      setLinkNotes('');
      await load();
      await onChanged?.();
      flash?.({ type: 'success', text: 'Saved link to read later.' });
    } catch (err) {
      flash?.({ type: 'error', text: apiUtils.handleError(err, 'Failed to save link') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">Feeds</p>
            <button
              type="button"
              onClick={refreshFeeds}
              disabled={busy === 'refresh' || feeds.length === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              {busy === 'refresh' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 midnight:border-gray-700 midnight:bg-gray-800 midnight:text-gray-100"
            />
            <button
              type="button"
              onClick={addFeed}
              disabled={busy === 'feed' || !feedUrl.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-45 dark:bg-gray-100 dark:text-gray-900 midnight:bg-gray-100 midnight:text-gray-900"
            >
              {busy === 'feed' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add
            </button>
          </div>
          <div className="max-h-36 overflow-auto rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-gray-800">
            {feeds.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400">No feeds yet.</p>
            ) : feeds.map(feed => (
              <div key={feed.id} className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-gray-800 midnight:border-gray-800">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-200">{feed.title}</p>
                  <p className="truncate text-[10px] text-gray-400">{feed.unreadCount || 0} unread · {feed.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFeed(feed.id)}
                  disabled={busy === `delete-${feed.id}`}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
                  aria-label="Remove feed"
                >
                  {busy === `delete-${feed.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">Read Later</p>
          <div className="flex gap-2">
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://article.example.com"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 midnight:border-gray-700 midnight:bg-gray-800 midnight:text-gray-100"
            />
            <button
              type="button"
              onClick={addReadLater}
              disabled={busy === 'link' || !linkUrl.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-45 dark:bg-gray-100 dark:text-gray-900 midnight:bg-gray-100 midnight:text-gray-900"
            >
              {busy === 'link' ? <Loader2 size={12} className="animate-spin" /> : <Bookmark size={12} />}
              Save
            </button>
          </div>
          <input
            value={linkNotes}
            onChange={(e) => setLinkNotes(e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 midnight:border-gray-700 midnight:bg-gray-800 midnight:text-gray-100"
          />
          <div className="max-h-36 overflow-auto rounded-lg border border-gray-100 dark:border-gray-800 midnight:border-gray-800">
            {savedLinks.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400">No saved links yet.</p>
            ) : savedLinks.map(item => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/70 midnight:border-gray-800 midnight:hover:bg-gray-900"
              >
                <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-200">{item.title}</p>
                <p className="truncate text-[10px] text-gray-400">{item.url}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function IntegrationsSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState(null);

  // ── Google Calendar ─────────────────────────────────────────────────────────
  const [gcStatus,        setGcStatus]        = useState(null);
  const [gcLoading,       setGcLoading]       = useState(true);
  const [gcConnecting,    setGcConnecting]    = useState(false);
  const [gcDisconnecting, setGcDisconnecting] = useState(false);

  // ── GitHub ──────────────────────────────────────────────────────────────────
  const [ghStatus,        setGhStatus]        = useState(null);
  const [ghLoading,       setGhLoading]       = useState(true);
  const [ghConnecting,    setGhConnecting]    = useState(false);
  const [ghDisconnecting, setGhDisconnecting] = useState(false);

  // ── Outlook ─────────────────────────────────────────────────────────────────
  const [olStatus,        setOlStatus]        = useState(null);
  const [olLoading,       setOlLoading]       = useState(true);
  const [olConnecting,    setOlConnecting]    = useState(false);
  const [olDisconnecting, setOlDisconnecting] = useState(false);

  // ── Obsidian ────────────────────────────────────────────────────────────────
  const [obStatus,        setObStatus]        = useState(null);
  const [obLoading,       setObLoading]       = useState(true);
  const [obDisconnecting, setObDisconnecting] = useState(false);

  // ── RSS / Read Later ───────────────────────────────────────────────────────
  const [rssStatus,       setRssStatus]       = useState(null);
  const [rssLoading,      setRssLoading]      = useState(true);

  // ── Generic Mail ───────────────────────────────────────────────────────────
  const [mailStatus,        setMailStatus]        = useState(null);
  const [mailLoading,       setMailLoading]       = useState(true);
  const [mailDisconnecting, setMailDisconnecting] = useState(false);
  const [mailTesting,       setMailTesting]       = useState(null);

  const flash = useCallback((msg, ms = 4000) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), ms);
  }, []);

  // ── Load all statuses ───────────────────────────────────────────────────────

  const loadGcStatus = useCallback(async () => {
    try { setGcStatus(await integrationsApi.googleCalendar.fetchStatus()); }
    catch { setGcStatus({ connected: false, configured: false }); }
    finally { setGcLoading(false); }
  }, []);

  const loadGhStatus = useCallback(async () => {
    try { setGhStatus(await integrationsApi.github.fetchStatus()); }
    catch { setGhStatus({ connected: false, configured: false }); }
    finally { setGhLoading(false); }
  }, []);

  const loadOlStatus = useCallback(async () => {
    try { setOlStatus(await integrationsApi.outlook.fetchStatus()); }
    catch { setOlStatus({ connected: false, configured: false }); }
    finally { setOlLoading(false); }
  }, []);

  const loadObStatus = useCallback(async () => {
    try { setObStatus(await integrationsApi.obsidian.fetchStatus()); }
    catch { setObStatus({ connected: false, configured: false }); }
    finally { setObLoading(false); }
  }, []);

  const loadRssStatus = useCallback(async () => {
    try { setRssStatus(await integrationsApi.rss.fetchStatus()); }
    catch { setRssStatus({ connected: false, configured: false }); }
    finally { setRssLoading(false); }
  }, []);

  const loadMailStatus = useCallback(async () => {
    try { setMailStatus(await integrationsApi.mail.fetchStatus()); }
    catch { setMailStatus({ connected: false, configured: false }); }
    finally { setMailLoading(false); }
  }, []);

  useEffect(() => {
    loadGcStatus();
    loadGhStatus();
    loadOlStatus();
    loadObStatus();
    loadRssStatus();
    loadMailStatus();
  }, [loadGcStatus, loadGhStatus, loadOlStatus, loadObStatus, loadRssStatus, loadMailStatus]);

  // ── Handle OAuth redirect-back params ───────────────────────────────────────

  useEffect(() => {
    const gcConnected  = searchParams.get('google_connected');
    const gcError      = searchParams.get('google_error');
    const ghConnected  = searchParams.get('github_connected');
    const ghError      = searchParams.get('github_error');
    const olConnected  = searchParams.get('outlook_connected');
    const olError      = searchParams.get('outlook_error');

    if (gcConnected) {
      flash({ type: 'success', text: 'Google Calendar connected successfully.' });
      loadGcStatus();
    } else if (gcError) {
      flash({ type: 'error', text: `Google OAuth failed: ${gcError}` });
    }

    if (ghConnected) {
      flash({ type: 'success', text: 'GitHub connected successfully.' });
      loadGhStatus();
    } else if (ghError) {
      flash({ type: 'error', text: `GitHub OAuth failed: ${ghError}` });
    }

    if (olConnected) {
      flash({ type: 'success', text: 'Outlook Calendar connected successfully.' });
      loadOlStatus();
    } else if (olError) {
      flash({ type: 'error', text: `Outlook OAuth failed: ${olError}` });
    }

    if (gcConnected || gcError || ghConnected || ghError || olConnected || olError) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, flash, loadGcStatus, loadGhStatus, loadOlStatus]);

  // ── Google actions ──────────────────────────────────────────────────────────

  const handleGcConnect = async () => {
    setGcConnecting(true);
    try {
      const res = await integrationsApi.googleCalendar.getConnectUrl();
      if (!res.success || !res.url) throw new Error(res.error || 'No OAuth URL returned');
      window.location.href = res.url;
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to start Google sign-in') });
      setGcConnecting(false);
    }
  };

  const handleGcDisconnect = async () => {
    setGcDisconnecting(true);
    try {
      await integrationsApi.googleCalendar.disconnect();
      await loadGcStatus();
      flash({ type: 'success', text: 'Google Calendar disconnected.' });
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to disconnect') });
    } finally {
      setGcDisconnecting(false);
    }
  };

  // ── GitHub actions ──────────────────────────────────────────────────────────

  const handleGhConnect = async () => {
    setGhConnecting(true);
    try {
      const res = await integrationsApi.github.getConnectUrl();
      if (!res.success || !res.url) throw new Error(res.error || 'No OAuth URL returned');
      window.location.href = res.url;
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to start GitHub sign-in') });
      setGhConnecting(false);
    }
  };

  const handleGhDisconnect = async () => {
    setGhDisconnecting(true);
    try {
      await integrationsApi.github.disconnect();
      await loadGhStatus();
      flash({ type: 'success', text: 'GitHub disconnected.' });
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to disconnect') });
    } finally {
      setGhDisconnecting(false);
    }
  };

  // ── Outlook actions ─────────────────────────────────────────────────────────

  const handleOlConnect = async () => {
    setOlConnecting(true);
    try {
      const res = await integrationsApi.outlook.getConnectUrl();
      if (!res.success || !res.url) throw new Error(res.error || 'No OAuth URL returned');
      window.location.href = res.url;
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to start Outlook sign-in') });
      setOlConnecting(false);
    }
  };

  const handleOlDisconnect = async () => {
    setOlDisconnecting(true);
    try {
      await integrationsApi.outlook.disconnect();
      await loadOlStatus();
      flash({ type: 'success', text: 'Outlook Calendar disconnected.' });
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to disconnect') });
    } finally {
      setOlDisconnecting(false);
    }
  };

  // ── Obsidian actions ────────────────────────────────────────────────────────

  const handleObDisconnect = async () => {
    setObDisconnecting(true);
    try {
      await configApi.updateConfig('OBSIDIAN_VAULT_PATH', '');
      await loadObStatus();
      flash({ type: 'success', text: 'Obsidian vault disconnected.' });
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to disconnect') });
    } finally {
      setObDisconnecting(false);
    }
  };

  // ── Mail actions ────────────────────────────────────────────────────────────

  const handleMailDisconnect = async () => {
    setMailDisconnecting(true);
    try {
      const keys = [
        'MAIL_IMAP_HOST', 'MAIL_IMAP_PORT', 'MAIL_IMAP_SECURE', 'MAIL_IMAP_USER', 'MAIL_IMAP_PASSWORD',
        'MAIL_SMTP_HOST', 'MAIL_SMTP_PORT', 'MAIL_SMTP_SECURE', 'MAIL_SMTP_USER', 'MAIL_SMTP_PASSWORD',
        'MAIL_FROM_EMAIL', 'MAIL_FROM_NAME',
      ];
      for (const key of keys) {
        await configApi.updateConfig(key, '');
      }
      await loadMailStatus();
      flash({ type: 'success', text: 'Mail integration disconnected.' });
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to disconnect mail') });
    } finally {
      setMailDisconnecting(false);
    }
  };

  const handleMailTest = async (kind) => {
    setMailTesting(kind);
    try {
      if (kind === 'imap') await integrationsApi.mail.testImap();
      else await integrationsApi.mail.testSmtp();
      flash({ type: 'success', text: `${kind === 'imap' ? 'IMAP' : 'SMTP'} connection works.` });
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, `${kind === 'imap' ? 'IMAP' : 'SMTP'} test failed`) });
    } finally {
      setMailTesting(null);
    }
  };

  return (
    <div className="font-sora space-y-5">
      {/* Flash message */}
      {message && (
        <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/40 midnight:bg-green-900/20 midnight:text-green-300 midnight:border-green-800/40'
            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40 midnight:bg-red-900/20 midnight:text-red-300 midnight:border-red-800/40'
        }`}>
          {message.text}
        </div>
      )}

      <p className={`${mutedCls} -mt-1`}>
        Connect external services. Click <strong className="font-medium text-gray-600 dark:text-gray-300">Configure</strong> on any card to enter credentials directly — no need to edit <code className="px-1 rounded bg-gray-100 dark:bg-gray-800 font-mono text-[11px]">.env</code> manually.
      </p>

      <div className="space-y-3">
        {/* Google Calendar */}
        <IntegrationCard
          logo={<GoogleCalendarLogo />}
          name="Google Calendar"
          description="Sync your Google Calendar events into the Asyncat calendar view."
          status={gcStatus}
          configured={gcStatus?.configured ?? false}
          loading={gcLoading}
          onConnect={handleGcConnect}
          onDisconnect={handleGcDisconnect}
          connecting={gcConnecting}
          disconnecting={gcDisconnecting}
          onCredsSaved={loadGcStatus}
          setupHelpUrl="https://console.cloud.google.com/apis/credentials"
          setupHelpText="Create OAuth credentials"
          setupFields={[
            {
              key: 'GOOGLE_CLIENT_ID',
              label: 'Client ID',
              configType: 'secret',
              placeholder: '123456789-abc.apps.googleusercontent.com',
            },
            {
              key: 'GOOGLE_CLIENT_SECRET',
              label: 'Client Secret',
              configType: 'secret',
              placeholder: 'GOCSPX-…',
            },
          ]}
        />

        {/* GitHub */}
        <IntegrationCard
          logo={<GitHubLogo />}
          name="GitHub"
          description="Link pull requests and issues to kanban cards. Trigger actions on CI events."
          status={ghStatus}
          configured={ghStatus?.configured ?? false}
          loading={ghLoading}
          onConnect={handleGhConnect}
          onDisconnect={handleGhDisconnect}
          connecting={ghConnecting}
          disconnecting={ghDisconnecting}
          onCredsSaved={loadGhStatus}
          setupHelpUrl="https://github.com/settings/developers"
          setupHelpText="Create OAuth App"
          setupFields={[
            {
              key: 'GITHUB_CLIENT_ID',
              label: 'Client ID',
              configType: 'secret',
              placeholder: 'Ov23li…',
            },
            {
              key: 'GITHUB_CLIENT_SECRET',
              label: 'Client Secret',
              configType: 'secret',
              placeholder: '…',
            },
          ]}
        />

        {/* Outlook Calendar */}
        <IntegrationCard
          logo={<OutlookLogo />}
          name="Outlook Calendar"
          description="Sync your Microsoft / Outlook calendar events into the Asyncat calendar view."
          status={olStatus}
          configured={olStatus?.configured ?? false}
          loading={olLoading}
          onConnect={handleOlConnect}
          onDisconnect={handleOlDisconnect}
          connecting={olConnecting}
          disconnecting={olDisconnecting}
          onCredsSaved={loadOlStatus}
          setupHelpUrl="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
          setupHelpText="Register Azure app"
          setupFields={[
            {
              key: 'MICROSOFT_CLIENT_ID',
              label: 'Application (client) ID',
              configType: 'secret',
              placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
            },
            {
              key: 'MICROSOFT_CLIENT_SECRET',
              label: 'Client Secret value',
              configType: 'secret',
              placeholder: '…',
            },
          ]}
        />

        {/* Obsidian */}
        <IntegrationCard
          logo={<ObsidianLogo />}
          name="Obsidian"
          description="Browse your local Obsidian vault notes directly inside Asyncat. No OAuth needed — just point to your vault folder."
          status={obStatus}
          configured={obStatus?.configured ?? false}
          loading={obLoading}
          onDisconnect={handleObDisconnect}
          disconnecting={obDisconnecting}
          onCredsSaved={loadObStatus}
          noOAuth
          setupFields={[
            {
              key: 'OBSIDIAN_VAULT_PATH',
              label: 'Vault path',
              configType: 'config',
              placeholder: '/Users/you/Documents/MyVault',
            },
          ]}
        />

        {/* RSS / Read Later */}
        <IntegrationCard
          logo={<RssLogo />}
          name="RSS & Read Later"
          description="Follow RSS/Atom feeds and save links for later reading. Command Center tools can list feeds, refresh items, and save links."
          status={rssStatus}
          configured={rssStatus?.configured ?? false}
          loading={rssLoading}
          onCredsSaved={loadRssStatus}
          noOAuth
        >
          <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400 midnight:text-gray-400">
            <span>{rssStatus?.feeds || 0} feeds</span>
            <span>{rssStatus?.unread || 0} unread feed items</span>
            <span>{rssStatus?.readLater || 0} saved links</span>
          </div>
          <RssReadLaterManager onChanged={loadRssStatus} flash={flash} />
        </IntegrationCard>

        {/* Generic IMAP / SMTP */}
        <IntegrationCard
          logo={<MailLogo />}
          name="Generic Mail"
          description="Connect any IMAP/SMTP mailbox for recent mail lookup and approval-gated email sending."
          status={mailStatus}
          configured={mailStatus?.configured ?? false}
          loading={mailLoading}
          onDisconnect={handleMailDisconnect}
          disconnecting={mailDisconnecting}
          onCredsSaved={loadMailStatus}
          noOAuth
          setupFields={[
            { key: 'MAIL_IMAP_HOST', label: 'IMAP host', configType: 'config', placeholder: 'imap.gmail.com' },
            { key: 'MAIL_IMAP_PORT', label: 'IMAP port', configType: 'config', placeholder: '993' },
            { key: 'MAIL_IMAP_SECURE', label: 'IMAP TLS', configType: 'config', placeholder: 'true' },
            { key: 'MAIL_IMAP_USER', label: 'IMAP username', configType: 'config', placeholder: 'you@example.com' },
            { key: 'MAIL_IMAP_PASSWORD', label: 'IMAP password / app password', configType: 'secret', placeholder: '••••••••' },
            { key: 'MAIL_SMTP_HOST', label: 'SMTP host', configType: 'config', placeholder: 'smtp.gmail.com' },
            { key: 'MAIL_SMTP_PORT', label: 'SMTP port', configType: 'config', placeholder: '465' },
            { key: 'MAIL_SMTP_SECURE', label: 'SMTP TLS', configType: 'config', placeholder: 'true' },
            { key: 'MAIL_SMTP_USER', label: 'SMTP username', configType: 'config', placeholder: 'you@example.com' },
            { key: 'MAIL_SMTP_PASSWORD', label: 'SMTP password / app password', configType: 'secret', placeholder: '••••••••' },
            { key: 'MAIL_FROM_EMAIL', label: 'From email', configType: 'config', placeholder: 'you@example.com' },
            { key: 'MAIL_FROM_NAME', label: 'From name', configType: 'config', placeholder: 'Your Name' },
          ]}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              mailStatus?.imapConfigured
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300'
                : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400'
            }`}>
              IMAP {mailStatus?.imapConfigured ? 'configured' : 'not configured'}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              mailStatus?.smtpConfigured
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300'
                : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400'
            }`}>
              SMTP {mailStatus?.smtpConfigured ? 'configured' : 'not configured'}
            </span>
            {mailStatus?.email && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400 midnight:text-gray-400">{mailStatus.email}</span>
            )}
            <button
              type="button"
              onClick={() => handleMailTest('imap')}
              disabled={!mailStatus?.imapConfigured || mailTesting === 'imap'}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {mailTesting === 'imap' ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              Test IMAP
            </button>
            <button
              type="button"
              onClick={() => handleMailTest('smtp')}
              disabled={!mailStatus?.smtpConfigured || mailTesting === 'smtp'}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {mailTesting === 'smtp' ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
              Test SMTP
            </button>
          </div>
        </IntegrationCard>
      </div>
    </div>
  );
}
