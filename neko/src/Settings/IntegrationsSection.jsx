// Settings → Connections → Services: outside services Asyncat's tools use.
// RSS feeds and links to read later, a mailbox (IMAP and SMTP), messages to
// Discord, Slack, Telegram or email, and a Hugging Face token. What people
// enter goes to den's config, or its encrypted secrets for passwords and
// tokens (configApi).

import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Bell, Bookmark, ChevronDown, ChevronRight, ExternalLink, Mail, Plus, RefreshCw, Rss, Trash2, Unplug,
} from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import Checkbox from '../components/ui/Checkbox.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import Switch from '../components/ui/Switch.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { LogoTile, ProviderLogo } from '../Models/modelLogos.jsx';
import { integrationsApi, configApi } from './settingApi';

const CHANNELS = [
  { id: 'discord', label: 'Discord' },
  { id: 'slack', label: 'Slack' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'email', label: 'Email' },
];

function count(n, word) {
  const value = Number(n) || 0;
  return `${value} ${word}${value === 1 ? '' : 's'}`;
}

const SEVERITY = { error: 'Error', warning: 'Warning', success: 'Done', info: 'Info' };

function Dot({ on, tone = 'ok' }) {
  const color = !on ? 'bg-fg-subtle/50' : tone === 'error' ? 'bg-red-500' : 'bg-emerald-500';
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

Dot.propTypes = { on: PropTypes.bool, tone: PropTypes.string };

function TextLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
      {children} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

TextLink.propTypes = { href: PropTypes.string.isRequired, children: PropTypes.node };

// ── Entering keys ────────────────────────────────────────────────────────────

// The settings' own names (MAIL_IMAP_HOST …) show only with Settings →
// About → Developer options on.
function developerOptionsOn() {
  try { return localStorage.getItem('asyncat_developer_options') === 'true'; } catch { return false; }
}

function initialValue(field) {
  if (field.type === 'switch') return field.defaultValue !== false;
  if (field.type === 'channels') return [];
  return '';
}

/**
 * A service's settings as a plain form: text fields, a switch for a yes/no
 * setting (type: 'switch') and ticks for a list (type: 'channels', with
 * `options`). Switches are saved along with the fields filled in.
 */
function CredentialSetup({ fields, helpUrl, helpText, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.key, initialValue(field)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showKeys] = useState(developerOptionsOn);
  const setValue = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    const filled = fields.filter((field) => (
      field.type === 'channels' ? values[field.key].length > 0 : field.type !== 'switch' && values[field.key]?.trim()
    ));
    if (filled.length === 0) {
      setError('Fill in at least one field.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const field of [...filled, ...fields.filter((item) => item.type === 'switch')]) {
        const raw = values[field.key];
        const value = field.type === 'switch' ? String(Boolean(raw)) : field.type === 'channels' ? raw.join(',') : raw.trim();
        if (field.configType === 'config') await configApi.updateConfig(field.key, value);
        else await configApi.updateSecret(field.key, value);
      }
      await onSaved?.();
    } catch (err) {
      setError(errorDetail(err) || "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  const label = (field) => (
    <>
      {field.label}
      {showKeys ? <span className="ml-1.5 font-mono text-[11px] font-normal text-fg-subtle">{field.key}</span> : null}
    </>
  );

  return (
    <form onSubmit={save} className="space-y-3 border-t border-line px-4 py-4">
      <div className={`grid gap-3 ${fields.length > 2 ? 'sm:grid-cols-2' : ''}`}>
        {fields.map((field) => {
          const id = `service-${field.key}`;
          if (field.type === 'switch') {
            return (
              <div key={field.key} className="flex items-center justify-between gap-3 self-end rounded-lg px-0.5 py-1.5">
                <span id={`${id}-label`} className="text-[12px] font-medium text-fg-muted">{label(field)}</span>
                <Switch size="sm" checked={Boolean(values[field.key])} onChange={(value) => setValue(field.key, value)} aria-labelledby={`${id}-label`} />
              </div>
            );
          }
          if (field.type === 'channels') {
            const picked = values[field.key];
            return (
              <Field key={field.key} label={label(field)}>
                <div role="group" aria-label={field.label} className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1.5">
                  {field.options.map((option) => (
                    <Checkbox
                      key={option.id}
                      label={option.label}
                      checked={picked.includes(option.id)}
                      onChange={(on) => setValue(field.key, on ? [...picked, option.id] : picked.filter((item) => item !== option.id))}
                    />
                  ))}
                </div>
              </Field>
            );
          }
          return (
            <Field key={field.key} htmlFor={id} label={label(field)}>
              <Input
                id={id}
                type={field.configType === 'secret' ? 'password' : 'text'}
                value={values[field.key]}
                onChange={(event) => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          );
        })}
      </div>
      {error ? <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={saving}>Save</Button>
        {helpUrl ? <TextLink href={helpUrl}>{helpText || 'Where to find these'}</TextLink> : null}
      </div>
    </form>
  );
}

const setupFieldShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  configType: PropTypes.oneOf(['config', 'secret']),
  type: PropTypes.oneOf(['text', 'switch', 'channels']),
  defaultValue: PropTypes.bool,
  options: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.string.isRequired })),
  placeholder: PropTypes.string,
});

CredentialSetup.propTypes = {
  fields: PropTypes.arrayOf(setupFieldShape).isRequired,
  helpUrl: PropTypes.string,
  helpText: PropTypes.string,
  onSaved: PropTypes.func,
};

// ── One service ──────────────────────────────────────────────────────────────

function ServiceCard({
  id, logo, name, description, configured, loading, details, showStatus = true,
  onDisconnect, disconnecting, setupFields, setupHelpUrl, setupHelpText, onCredsSaved, children,
}) {
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    if (configured) setSetupOpen(false);
  }, [configured]);

  if (loading) return <Skeleton className="h-[74px] rounded-xl" />;

  const canSetUp = !configured && Boolean(setupFields?.length);
  const canDisconnect = configured && Boolean(onDisconnect);

  return (
    <section className="scroll-mt-6 rounded-xl border border-line bg-surface" data-service={id} data-settings-section={id}>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {logo}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <h3 className="text-[14px] font-medium text-fg">{name}</h3>
              {showStatus ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
                  <Dot on={configured} />
                  {configured ? 'Connected' : 'Not set up'}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">{description}</p>
            {details ? <div className="mt-1 text-[12px] leading-5 text-fg-subtle">{details}</div> : null}
          </div>
        </div>
        {canSetUp || canDisconnect ? (
          <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
            {canSetUp ? (
              <Button size="sm" variant={setupOpen ? 'ghost' : 'secondary'} onClick={() => setSetupOpen((open) => !open)} aria-expanded={setupOpen}>
                {setupOpen ? 'Cancel' : 'Set up'}
              </Button>
            ) : null}
            {canDisconnect ? (
              <Button size="sm" variant="ghost" icon={Unplug} loading={disconnecting} onClick={onDisconnect}>Disconnect</Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!configured && setupOpen && setupFields?.length ? (
        <CredentialSetup
          fields={setupFields}
          helpUrl={setupHelpUrl}
          helpText={setupHelpText}
          onSaved={async () => {
            setSetupOpen(false);
            await onCredsSaved?.();
          }}
        />
      ) : null}
      {children ? <div className="border-t border-line px-4 py-3">{children}</div> : null}
    </section>
  );
}

ServiceCard.propTypes = {
  id: PropTypes.string.isRequired,
  logo: PropTypes.node,
  name: PropTypes.string.isRequired,
  description: PropTypes.node,
  configured: PropTypes.bool,
  loading: PropTypes.bool,
  details: PropTypes.node,
  showStatus: PropTypes.bool,
  onDisconnect: PropTypes.func,
  disconnecting: PropTypes.bool,
  setupFields: PropTypes.arrayOf(setupFieldShape),
  setupHelpUrl: PropTypes.string,
  setupHelpText: PropTypes.string,
  onCredsSaved: PropTypes.func,
  children: PropTypes.node,
};

// ── RSS and read later ───────────────────────────────────────────────────────

function ListBox({ empty, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  return (
    <div className="max-h-40 overflow-auto rounded-lg border border-line">
      {items && (!Array.isArray(items) || items.length) ? <div className="divide-y divide-line">{items}</div> : (
        <p className="px-3 py-2.5 text-[12px] text-fg-subtle">{empty}</p>
      )}
    </div>
  );
}

ListBox.propTypes = { empty: PropTypes.string.isRequired, children: PropTypes.node };

function RssReadLaterManager({ onChanged }) {
  const toast = useToast();
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

  const run = async (key, fn, failure) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(failure, { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  const addFeed = (event) => {
    event.preventDefault();
    if (!feedUrl.trim()) return;
    run('feed', async () => {
      const res = await integrationsApi.rss.addFeed(feedUrl.trim());
      setFeedUrl('');
      await load();
      await onChanged?.();
      toast.success(res.imported ? `Added the feed with ${res.imported} item${res.imported === 1 ? '' : 's'}` : 'Added the feed');
    }, "Couldn't add the feed");
  };

  const refreshFeeds = () => run('refresh', async () => {
    const res = await integrationsApi.rss.refreshAll();
    await load();
    await onChanged?.();
    toast.success('Feeds refreshed', { detail: res.failed ? `${res.refreshed || 0} worked, ${res.failed} failed.` : undefined });
  }, "Couldn't refresh the feeds");

  const removeFeed = (id) => run(`delete-${id}`, async () => {
    await integrationsApi.rss.deleteFeed(id);
    await load();
    await onChanged?.();
  }, "Couldn't remove the feed");

  const addReadLater = (event) => {
    event.preventDefault();
    if (!linkUrl.trim()) return;
    run('link', async () => {
      await integrationsApi.rss.addReadLater({ url: linkUrl.trim(), notes: linkNotes.trim() });
      setLinkUrl('');
      setLinkNotes('');
      await load();
      await onChanged?.();
      toast.success('Saved the link to read later');
    }, "Couldn't save the link");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="flex h-7 items-center justify-between">
          <p className="text-[12px] font-medium text-fg-muted">Feeds</p>
          <Button size="xs" variant="ghost" icon={RefreshCw} loading={busy === 'refresh'} disabled={feeds.length === 0} onClick={refreshFeeds}>Refresh</Button>
        </div>
        <form onSubmit={addFeed} className="flex gap-2">
          <Input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="https://example.com/feed.xml" aria-label="Feed address" className="min-w-0 flex-1" />
          <Button type="submit" icon={Plus} loading={busy === 'feed'} disabled={!feedUrl.trim()}>Add</Button>
        </form>
        <ListBox empty="No feeds yet.">
          {feeds.map((feed) => (
            <div key={feed.id} className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-fg">{feed.title}</p>
                <p className="truncate text-[11px] text-fg-subtle">{feed.unreadCount || 0} unread · {feed.url}</p>
              </div>
              <IconButton size="sm" icon={Trash2} label={`Remove ${feed.title}`} loading={busy === `delete-${feed.id}`} onClick={() => removeFeed(feed.id)} />
            </div>
          ))}
        </ListBox>
      </div>

      <div className="space-y-2">
        <div className="flex h-7 items-center">
          <p className="text-[12px] font-medium text-fg-muted">Read later</p>
        </div>
        <form onSubmit={addReadLater} className="space-y-2">
          <div className="flex gap-2">
            <Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://article.example.com" aria-label="Link to read later" className="min-w-0 flex-1" />
            <Button type="submit" icon={Bookmark} loading={busy === 'link'} disabled={!linkUrl.trim()}>Save</Button>
          </div>
          <Input value={linkNotes} onChange={(event) => setLinkNotes(event.target.value)} placeholder="A note, if you like" aria-label="Note for the link" />
        </form>
        <ListBox empty="No saved links yet.">
          {savedLinks.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="block px-3 py-1.5 transition-colors hover:bg-hover">
              <p className="truncate text-[13px] text-fg">{item.title}</p>
              <p className="truncate text-[11px] text-fg-subtle">{item.url}</p>
            </a>
          ))}
        </ListBox>
      </div>
    </div>
  );
}

RssReadLaterManager.propTypes = { onChanged: PropTypes.func };

// ── Messages elsewhere ───────────────────────────────────────────────────────

function DeliveryHistory() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (log !== null) return;
    setLoading(true);
    try {
      const result = await integrationsApi.notifications.fetchLog(50);
      setLog(result.entries || []);
    } catch (err) {
      toast.error("Couldn't load the history", { detail: errorDetail(err) });
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await integrationsApi.notifications.clearLog();
      setLog([]);
      toast.success('History cleared');
    } catch (err) {
      toast.error("Couldn't clear the history", { detail: errorDetail(err) });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-1 rounded text-[12px] font-medium text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        What was sent
      </button>
      {open ? (
        <div className="mt-2">
          {loading ? <Skeleton className="h-16" /> : !log?.length ? (
            <p className="text-[12px] text-fg-subtle">Nothing sent yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {log.slice(0, 20).map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2.5 px-3 py-2">
                    <span className="mt-1.5"><Dot on tone={entry.success ? 'ok' : 'error'} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-fg">{entry.title}</p>
                      {entry.error ? <p className="truncate text-[11px] text-red-600 dark:text-red-400">{entry.error}</p> : null}
                      <p className="text-[11px] text-fg-subtle">
                        {SEVERITY[entry.severity] || entry.severity} · {CHANNELS.find((channel) => channel.id === entry.channel)?.label || entry.channel} · {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 flex justify-end">
                <Button size="xs" variant="ghost" icon={Trash2} loading={clearing} onClick={clear}>Clear history</Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function IntegrationsSection() {
  const toast = useToast();

  const [rssStatus, setRssStatus] = useState(null);
  const [rssLoading, setRssLoading] = useState(true);

  const [mailStatus, setMailStatus] = useState(null);
  const [mailLoading, setMailLoading] = useState(true);
  const [mailDisconnecting, setMailDisconnecting] = useState(false);
  const [mailTesting, setMailTesting] = useState(null);

  const [notifyStatus, setNotifyStatus] = useState(null);
  const [notifyLoading, setNotifyLoading] = useState(true);
  const [notifyDisconnecting, setNotifyDisconnecting] = useState(false);
  const [notifyTesting, setNotifyTesting] = useState(null);
  const [telegramDiscovering, setTelegramDiscovering] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState(null);
  const [telegramSaving, setTelegramSaving] = useState(false);

  const [hfConfigured, setHfConfigured] = useState(false);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfDisconnecting, setHfDisconnecting] = useState(false);

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

  const loadNotifyStatus = useCallback(async () => {
    try { setNotifyStatus(await integrationsApi.notifications.fetchStatus()); }
    catch { setNotifyStatus({ connected: false, configured: false, channels: {} }); }
    finally { setNotifyLoading(false); }
  }, []);

  const loadHfStatus = useCallback(async () => {
    try {
      const res = await configApi.getSecrets();
      setHfConfigured(Boolean(res.secrets?.HF_TOKEN));
    } catch {
      setHfConfigured(false);
    } finally {
      setHfLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRssStatus();
    loadMailStatus();
    loadNotifyStatus();
    loadHfStatus();
  }, [loadRssStatus, loadMailStatus, loadNotifyStatus, loadHfStatus]);

  const clearKeys = async (keys, setBusy, reload, done, failure) => {
    setBusy(true);
    try {
      for (const key of keys) await configApi.updateConfig(key, '');
      await reload();
      toast.success(done);
    } catch (err) {
      toast.error(failure, { detail: errorDetail(err) });
    } finally {
      setBusy(false);
    }
  };

  const disconnectMail = () => clearKeys([
    'MAIL_IMAP_HOST', 'MAIL_IMAP_PORT', 'MAIL_IMAP_SECURE', 'MAIL_IMAP_USER', 'MAIL_IMAP_PASSWORD',
    'MAIL_SMTP_HOST', 'MAIL_SMTP_PORT', 'MAIL_SMTP_SECURE', 'MAIL_SMTP_USER', 'MAIL_SMTP_PASSWORD',
    'MAIL_FROM_EMAIL', 'MAIL_FROM_NAME',
  ], setMailDisconnecting, loadMailStatus, 'Email disconnected', "Couldn't disconnect email");

  const disconnectNotify = () => clearKeys([
    'NOTIFY_EMAIL_TO', 'NOTIFY_DEFAULT_CHANNELS', 'NOTIFY_DISCORD_WEBHOOK', 'NOTIFY_SLACK_WEBHOOK',
    'NOTIFY_TELEGRAM_BOT_TOKEN', 'NOTIFY_TELEGRAM_CHAT_ID',
  ], setNotifyDisconnecting, loadNotifyStatus, 'Messages elsewhere turned off', "Couldn't turn them off");

  const testMail = async (kind) => {
    const name = kind === 'imap' ? 'IMAP' : 'SMTP';
    setMailTesting(kind);
    try {
      if (kind === 'imap') await integrationsApi.mail.testImap();
      else await integrationsApi.mail.testSmtp();
      toast.success(`${name} works`);
    } catch (err) {
      toast.error(`${name} didn't work`, { detail: errorDetail(err) });
    } finally {
      setMailTesting(null);
    }
  };

  const testChannel = async (channel) => {
    const label = CHANNELS.find((item) => item.id === channel)?.label || channel;
    setNotifyTesting(channel);
    try {
      await integrationsApi.notifications.test(channel);
      toast.success(`Sent a test to ${label}`);
    } catch (err) {
      toast.error(`The test to ${label} failed`, { detail: errorDetail(err) });
    } finally {
      setNotifyTesting(null);
    }
  };

  const discoverTelegram = async () => {
    setTelegramDiscovering(true);
    setTelegramChatId(null);
    try {
      const result = await integrationsApi.notifications.discoverTelegramChatId();
      if (result.chatId) setTelegramChatId(result.chatId);
      else toast.error('No chat found', { detail: result.message || 'Send your bot a message first.' });
    } catch (err) {
      toast.error("Couldn't find the chat", { detail: errorDetail(err) });
    } finally {
      setTelegramDiscovering(false);
    }
  };

  const saveTelegramChatId = async () => {
    if (!telegramChatId) return;
    setTelegramSaving(true);
    try {
      await configApi.updateConfig('NOTIFY_TELEGRAM_CHAT_ID', telegramChatId);
      setTelegramChatId(null);
      await loadNotifyStatus();
      toast.success('Telegram is ready');
    } catch (err) {
      toast.error("Couldn't save the chat ID", { detail: errorDetail(err) });
    } finally {
      setTelegramSaving(false);
    }
  };

  const disconnectHf = async () => {
    setHfDisconnecting(true);
    try {
      await configApi.updateSecret('HF_TOKEN', '');
      await loadHfStatus();
      toast.success('Hugging Face token removed');
    } catch (err) {
      toast.error("Couldn't remove the token", { detail: errorDetail(err) });
    } finally {
      setHfDisconnecting(false);
    }
  };

  const readyChannels = CHANNELS.filter((channel) => notifyStatus?.channels?.[channel.id]);
  const defaultChannels = (notifyStatus?.defaultChannels || []).map((id) => CHANNELS.find((channel) => channel.id === id)?.label || id);

  return (
    <div className="space-y-3" data-services>
      <p className="text-[12px] leading-5 text-fg-subtle">
        Services agents can use. What you enter is kept on this computer, with passwords and tokens encrypted.
      </p>

      <ServiceCard
        id="rss"
        logo={<LogoTile cfg={{ component: Rss }} size="sm" />}
        name="RSS and read later"
        description="Follow RSS and Atom feeds and keep links to read later. Agents can list feeds, refresh them and save links."
        configured={rssStatus?.configured ?? false}
        loading={rssLoading}
        details={rssStatus ? [count(rssStatus.feeds, 'feed'), count(rssStatus.unread, 'unread item'), count(rssStatus.readLater, 'saved link')].join(' · ') : null}
        showStatus={false}
      >
        <RssReadLaterManager onChanged={loadRssStatus} />
      </ServiceCard>

      <ServiceCard
        id="mail"
        logo={<LogoTile cfg={{ component: Mail }} size="sm" />}
        name="Email"
        description="Any IMAP and SMTP mailbox. Agents can look up recent mail, and send mail once you approve it."
        configured={mailStatus?.configured ?? false}
        loading={mailLoading}
        details={mailStatus?.email ? `Signed in as ${mailStatus.email}` : null}
        onDisconnect={disconnectMail}
        disconnecting={mailDisconnecting}
        onCredsSaved={loadMailStatus}
        setupFields={[
          { key: 'MAIL_IMAP_HOST', label: 'IMAP server', configType: 'config', placeholder: 'imap.example.com' },
          { key: 'MAIL_IMAP_PORT', label: 'IMAP port', configType: 'config', placeholder: '993' },
          { key: 'MAIL_IMAP_SECURE', label: 'Use TLS for IMAP', configType: 'config', type: 'switch', defaultValue: true },
          { key: 'MAIL_IMAP_USER', label: 'IMAP user name', configType: 'config', placeholder: 'you@example.com' },
          { key: 'MAIL_IMAP_PASSWORD', label: 'IMAP password or app password', configType: 'secret', placeholder: '••••••••' },
          { key: 'MAIL_SMTP_HOST', label: 'SMTP server', configType: 'config', placeholder: 'smtp.example.com' },
          { key: 'MAIL_SMTP_PORT', label: 'SMTP port', configType: 'config', placeholder: '465' },
          { key: 'MAIL_SMTP_SECURE', label: 'Use TLS for SMTP', configType: 'config', type: 'switch', defaultValue: true },
          { key: 'MAIL_SMTP_USER', label: 'SMTP user name', configType: 'config', placeholder: 'you@example.com' },
          { key: 'MAIL_SMTP_PASSWORD', label: 'SMTP password or app password', configType: 'secret', placeholder: '••••••••' },
          { key: 'MAIL_FROM_EMAIL', label: 'Send from', configType: 'config', placeholder: 'you@example.com' },
          { key: 'MAIL_FROM_NAME', label: 'Sender name', configType: 'config', placeholder: 'Your name' },
        ]}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {[['imap', 'IMAP', mailStatus?.imapConfigured], ['smtp', 'SMTP', mailStatus?.smtpConfigured]].map(([kind, name, ready]) => (
            <span key={kind} className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
              <Dot on={Boolean(ready)} />
              {name} {ready ? 'set up' : 'not set up'}
            </span>
          ))}
          <span className="flex gap-2 sm:ml-auto">
            <Button size="xs" icon={Mail} loading={mailTesting === 'imap'} disabled={!mailStatus?.imapConfigured} onClick={() => testMail('imap')}>Test IMAP</Button>
            <Button size="xs" icon={Mail} loading={mailTesting === 'smtp'} disabled={!mailStatus?.smtpConfigured} onClick={() => testMail('smtp')}>Test SMTP</Button>
          </span>
        </div>
      </ServiceCard>

      <ServiceCard
        id="notify"
        logo={<LogoTile cfg={{ component: Bell }} size="sm" />}
        name="Messages elsewhere"
        description="Agents can message you on Discord, Slack, Telegram or by email when long work finishes or needs you."
        configured={notifyStatus?.configured ?? false}
        loading={notifyLoading}
        details={defaultChannels.length ? `Sends to ${defaultChannels.join(', ')} unless told otherwise` : null}
        onDisconnect={disconnectNotify}
        disconnecting={notifyDisconnecting}
        onCredsSaved={loadNotifyStatus}
        setupFields={[
          { key: 'NOTIFY_DEFAULT_CHANNELS', label: 'Send to', configType: 'config', type: 'channels', options: CHANNELS },
          { key: 'NOTIFY_EMAIL_TO', label: 'Email address', configType: 'config', placeholder: 'you@example.com' },
          { key: 'NOTIFY_DISCORD_WEBHOOK', label: 'Discord webhook address', configType: 'secret', placeholder: 'https://discord.com/api/webhooks/…' },
          { key: 'NOTIFY_SLACK_WEBHOOK', label: 'Slack webhook address', configType: 'secret', placeholder: 'https://hooks.slack.com/services/…' },
          { key: 'NOTIFY_TELEGRAM_BOT_TOKEN', label: 'Telegram bot token', configType: 'secret', placeholder: '123456:ABC…' },
          { key: 'NOTIFY_TELEGRAM_CHAT_ID', label: 'Telegram chat ID', configType: 'config', placeholder: '123456789' },
        ]}
        setupHelpUrl="https://core.telegram.org/bots/tutorial"
        setupHelpText="Making a Telegram bot"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {CHANNELS.map((channel) => {
              const ready = Boolean(notifyStatus?.channels?.[channel.id]);
              return (
                <span key={channel.id} className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted" data-channel={channel.id}>
                  <Dot on={ready} />
                  {channel.label}
                </span>
              );
            })}
            {readyChannels.length ? (
              <span className="flex flex-wrap gap-2 sm:ml-auto">
                {readyChannels.map((channel) => (
                  <Button key={channel.id} size="xs" icon={Bell} loading={notifyTesting === channel.id} disabled={Boolean(notifyTesting) && notifyTesting !== channel.id} onClick={() => testChannel(channel.id)}>
                    Test {channel.label}
                  </Button>
                ))}
              </span>
            ) : null}
          </div>

          {/* Telegram: the bot token is saved but the chat ID is missing. */}
          {notifyStatus?.telegramTokenSet && !notifyStatus?.channels?.telegram ? (
            <div className="rounded-lg border border-line px-3 py-2.5" data-telegram-setup>
              <p className="text-[13px] font-medium text-fg">Telegram needs your chat ID</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[12px] leading-5 text-fg-muted">
                <li>In Telegram, find your bot by its user name.</li>
                <li>Send it any message, such as &ldquo;hello&rdquo;.</li>
                <li>Choose Find my chat ID here.</li>
              </ol>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="xs" icon={RefreshCw} loading={telegramDiscovering} disabled={telegramSaving} onClick={discoverTelegram}>Find my chat ID</Button>
                {telegramChatId ? (
                  <>
                    <span className="font-mono text-[12px] text-fg">{telegramChatId}</span>
                    <Button size="xs" variant="primary" loading={telegramSaving} onClick={saveTelegramChatId}>Save and turn on</Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {!notifyStatus?.configured ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <TextLink href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks">Discord webhooks</TextLink>
              <TextLink href="https://api.slack.com/messaging/webhooks">Slack webhooks</TextLink>
              <TextLink href="https://core.telegram.org/bots/tutorial">Telegram bots</TextLink>
            </div>
          ) : null}

          <DeliveryHistory />
        </div>
      </ServiceCard>

      <ServiceCard
        id="huggingface"
        logo={<ProviderLogo providerId="huggingface" name="Hugging Face" size="sm" />}
        name="Hugging Face"
        description="Download gated models and private repositories from the Hugging Face Hub on the Models page."
        configured={hfConfigured}
        loading={hfLoading}
        onDisconnect={disconnectHf}
        disconnecting={hfDisconnecting}
        onCredsSaved={loadHfStatus}
        setupFields={[{ key: 'HF_TOKEN', label: 'Access token', configType: 'secret', placeholder: 'hf_…' }]}
        setupHelpUrl="https://huggingface.co/settings/tokens"
        setupHelpText="Make a token"
      />
    </div>
  );
}
