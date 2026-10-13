// neko/src/Cats/CatPage.jsx
// ─── One Cat ──────────────────────────────────────────────────────────────────
// Its mission up top, then three tabs: Inbox (what it asks and its results),
// Activity (what it did, step by step) and Settings (everything you can
// change). Run it now, write to it, stop it, open its folder or its browser.

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, FolderOpen, Globe, Inbox, ListChecks, Loader2, MessageSquare, MoreHorizontal, Play, Settings2, Square, Trash2,
} from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import { catsApi } from '../CommandCenter/api/catsApi.js';
import { useCat, useInbox, useTimeline } from './useCats.js';
import { CatAvatar, StatusPill, Switch } from './CatParts.jsx';
import InboxItem from './InboxItem.jsx';
import Timeline from './Timeline.jsx';
import { BrainSection, FreedomSection, IdentitySection, SpaceSection, WakesSection } from './CatForm.jsx';
import { formFromCat, payloadFromForm, useCatFormOptions } from './catFormState.js';
import { FREEDOM, nextWakeText, wakeSummary } from './catFormat.js';

const TAB_KEYS = ['inbox', 'activity', 'settings'];

function Section({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-[14px] font-semibold text-fg">{title}</h3>
      {description ? <p className="mt-0.5 text-[12px] text-fg-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

Section.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string, children: PropTypes.node };

function SettingsTab({ cat, onSaved }) {
  const toast = useToast();
  const options = useCatFormOptions();
  const [form, setForm] = useState(() => formFromCat(cat));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const set = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  // Changes made elsewhere show up unless you're in the middle of editing.
  useEffect(() => {
    if (!dirty) setForm(formFromCat(cat));
  }, [cat, dirty]);

  const save = async () => {
    if (scheduleError) {
      toast.error("The schedule isn't finished", { detail: scheduleError });
      return;
    }
    setSaving(true);
    try {
      const result = await catsApi.update(cat.id, payloadFromForm(form, { cat }));
      setDirty(false);
      onSaved(result.cat);
      toast.success('Saved');
    } catch (err) {
      toast.error("Couldn't save", { detail: errorDetail(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <Section title="Mission" description="Who it is and what it looks after."><IdentitySection form={form} set={set} /></Section>
      <Section title="Wakes up" description="What starts it."><WakesSection form={form} set={set} catId={cat.id} onError={setScheduleError} /></Section>
      <Section title="Brain" description="Which of your agents it thinks with, and what it shares with you."><BrainSection form={form} set={set} options={options} /></Section>
      <Section title="Its space" description="Where it works, and what it keeps to itself."><SpaceSection form={form} set={set} cat={cat} /></Section>
      <Section title="Freedom" description="How much it may do before asking you."><FreedomSection form={form} set={set} options={options} /></Section>
      {dirty ? (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-elevated px-4 py-2.5 shadow-lg">
          <span className="text-[13px] text-fg-muted">You have changes.</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setForm(formFromCat(cat)); setDirty(false); }} disabled={saving}>Undo</Button>
            <Button variant="primary" onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

SettingsTab.propTypes = { cat: PropTypes.object.isRequired, onSaved: PropTypes.func.isRequired };

function InboxTab({ cat }) {
  const [showAll, setShowAll] = useState(false);
  const { items, reload } = useInbox({ catId: cat.id, status: showAll ? 'all' : 'open' });
  if (items === null) return <div className="flex items-center gap-2 py-6 text-[13px] text-fg-subtle"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  const ordered = [...items].sort((a, b) => {
    const rank = (item) => (item.status === 'open' && (item.kind === 'approval' || item.kind === 'question') ? 0 : item.status === 'open' ? 1 : 2);
    return rank(a) - rank(b) || String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return (
    <div className="space-y-2">
      {ordered.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-muted">{showAll ? 'Nothing here yet.' : 'All caught up. Its questions and results show up here.'}</p>
      ) : ordered.map((item) => <InboxItem key={item.id} item={item} onDone={reload} />)}
      <div className="flex justify-center pt-1">
        <Button size="xs" variant="ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Only what needs you' : 'Show answered and read'}</Button>
      </div>
    </div>
  );
}

InboxTab.propTypes = { cat: PropTypes.object.isRequired };

function UsageLine({ cat }) {
  const usage = cat.usageToday || {};
  const parts = [`${usage.runs || 0} run${usage.runs === 1 ? '' : 's'}`];
  if (usage.tokens) parts.push(`${usage.tokens.toLocaleString()} tokens`);
  if (usage.minutes) parts.push(`${usage.minutes} min of work`);
  if (usage.costUsd) parts.push(`$${usage.costUsd.toFixed(2)}`);
  return (
    <p className="text-[12px] text-fg-subtle">
      Today: {parts.join(' · ')}
      {cat.limitReached ? <span className="ml-1 text-amber-700 dark:text-amber-400">· stopped for today: {cat.limitReached}</span> : null}
    </p>
  );
}

UsageLine.propTypes = { cat: PropTypes.object.isRequired };

export default function CatPage() {
  const { catId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const { cat, setCat, missing, reload } = useCat(catId);
  const { events } = useTimeline(catId);
  const [busy, setBusy] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const requestedTab = searchParams.get('inbox') ? 'inbox' : searchParams.get('tab');
  const [tab, setTab] = useState(TAB_KEYS.includes(requestedTab) ? requestedTab : 'inbox');

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas text-center">
        <p className="text-[15px] font-medium text-fg">That Cat isn&apos;t here any more.</p>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/cats')}>All Cats</Button>
      </div>
    );
  }
  if (!cat) {
    return <div className="flex h-full items-center justify-center bg-canvas text-fg-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const act = async (name, fn, success) => {
    setBusy(name);
    try {
      const result = await fn();
      if (result?.cat) setCat(result.cat);
      else reload();
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
    } catch (err) {
      toast.error(`Couldn't ${name}`, { detail: errorDetail(err) });
    } finally {
      setBusy(null);
    }
  };

  const openChat = async (state = undefined) => {
    let conversationId = cat.conversationId;
    if (!conversationId) {
      const result = await catsApi.chat(cat.id).catch(() => null);
      conversationId = result?.conversationId;
    }
    if (conversationId) navigate(`/conversations/${conversationId}`, state ? { state } : undefined);
  };

  const openBrowser = async () => {
    const browser = window.electronAPI?.browser;
    if (!browser) {
      toast.error('Its browser is in the desktop app');
      return;
    }
    await browser.ui('open-cat-profile', { partition: cat.browserPartition, label: cat.name });
    openChat({ openBrowser: true });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${cat.name}?`,
      message: 'It stops, and its runs, inbox and browser sign-ins are deleted. Its chat stays in your chats.',
      confirmLabel: 'Delete Cat',
      destructive: true,
    });
    if (!ok) return;
    try {
      await catsApi.remove(cat.id);
      navigate('/cats');
    } catch (err) {
      toast.error("Couldn't delete it", { detail: errorDetail(err) });
    }
  };

  const next = nextWakeText(cat);
  const tabItems = [
    { value: 'inbox', label: 'Inbox', icon: Inbox, meta: cat.waiting || cat.unread ? String(cat.waiting + cat.unread) : null },
    { value: 'activity', label: 'Activity', icon: ListChecks },
    { value: 'settings', label: 'Settings', icon: Settings2 },
  ];

  return (
    <div className="flex h-full flex-col bg-canvas" data-cat-page={cat.name}>
      <header className="shrink-0 border-b border-line px-6 pt-5 lg:px-8">
        <button type="button" onClick={() => navigate('/cats')} className="mb-3 inline-flex items-center gap-1 text-[12px] text-fg-subtle hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> All Cats
        </button>
        <div className="flex items-start gap-4">
          <CatAvatar cat={cat} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="min-w-0 break-words text-[22px] font-semibold tracking-[-0.02em] text-fg">{cat.name}</h1>
              <StatusPill cat={cat} />
            </div>
            <p className="mt-1 text-[13px] text-fg-muted">{wakeSummary(cat)}{next ? ` · ${next}` : ''}</p>
            <p className="mt-0.5 text-[12px] text-fg-subtle">{FREEDOM[cat.freedom]?.label}{cat.profileName ? ` · Brain: ${cat.profileName}` : ''}{cat.projectName ? ` · Project: ${cat.projectName}` : ''}</p>
          </div>
          <Switch checked={cat.enabled} onChange={(value) => act(value ? 'turn it on' : 'turn it off', () => catsApi.setEnabled(cat.id, value))} label={`${cat.name} on or off`} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            {cat.running ? (
              <Button size="sm" icon={Square} loading={busy === 'stop it'} onClick={() => act('stop it', () => catsApi.cancel(cat.id), 'Stopping')}>Stop</Button>
            ) : (
              <Button size="sm" icon={Play} loading={busy === 'run it'} onClick={() => act('run it', () => catsApi.wake(cat.id), (result) => (result?.queued ? 'It will run as soon as it can' : 'It\'s on it'))}>Run now</Button>
            )}
            <Button size="sm" variant="primary" icon={MessageSquare} onClick={() => openChat()}>Write to it</Button>
            <span ref={menuRef}>
              <Button size="icon" variant="ghost" icon={MoreHorizontal} aria-label="More" onClick={() => setMenuOpen((open) => !open)} />
            </span>
            <Menu anchorRef={menuRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-end" width={220} label="More">
              {window.electronAPI?.shellOpen ? <MenuItem icon={FolderOpen} label="Open its folder" onSelect={() => window.electronAPI.shellOpen(cat.folder)} /> : null}
              <MenuItem icon={Globe} label="Open its browser to sign in" onSelect={openBrowser} />
              <MenuSeparator />
              <MenuItem icon={Trash2} label="Delete" danger onSelect={remove} />
            </Menu>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-hover/60 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Mission</p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-fg">{cat.mission}</p>
        </div>
        <div className="mt-3"><UsageLine cat={cat} /></div>
        <div className="mt-2">
          <Tabs value={tab} onChange={(value) => { setTab(value); setSearchParams(value === 'inbox' ? {} : { tab: value }, { replace: true }); }} items={tabItems} label="Cat" />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {tab === 'inbox' ? <InboxTab cat={cat} /> : null}
          {tab === 'activity' ? <Timeline events={events} /> : null}
          {tab === 'settings' ? <SettingsTab cat={cat} onSaved={setCat} /> : null}
        </div>
      </main>
    </div>
  );
}
