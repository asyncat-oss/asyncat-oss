// neko/src/Cats/CatsPage.jsx
// ─── Cats ─────────────────────────────────────────────────────────────────────
// Agents that work on their own. The page shows what is waiting for you
// first (steps they want an OK for, their questions), then your Cats, then
// their latest results. They run in the backend (den/src/cats/).

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCheck, Inbox, Loader2, Plus } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Cat from '../components/ui/Cat.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { catsApi } from '../CommandCenter/api/catsApi.js';
import { useCats, useInbox } from './useCats.js';
import { CatAvatar, StatusPill } from './CatParts.jsx';
import Switch from '../components/ui/Switch.jsx';
import InboxItem from './InboxItem.jsx';
import NewCatDialog from './NewCatDialog.jsx';
import { CAT_TEMPLATES, FREEDOM, lastRunLine, nextWakeText, wakeSummary } from './catFormat.js';

function CatCard({ cat, onToggle }) {
  const navigate = useNavigate();
  const next = nextWakeText(cat);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/cats/${cat.id}`)}
      onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/cats/${cat.id}`); }}
      className="group flex min-h-[9.5rem] cursor-pointer flex-col rounded-2xl border border-line bg-surface p-4 text-left outline-none transition-colors hover:border-line-strong hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/40"
      data-cat-card={cat.name}
    >
      <div className="flex items-start gap-3">
        <CatAvatar cat={cat} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium text-fg">{cat.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill cat={cat} />
            {cat.waiting ? <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">{cat.waiting} waiting</span> : null}
            {cat.unread ? <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white dark:text-gray-950">{cat.unread} new</span> : null}
          </div>
        </div>
        <Switch checked={cat.enabled} onChange={(value) => onToggle(cat, value)} label={`${cat.name} on or off`} />
      </div>
      <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-fg-muted">{cat.mission}</p>
      <div className="mt-auto space-y-1 pt-3 text-[12px] text-fg-subtle">
        <p className="truncate" title={wakeSummary(cat)}>{wakeSummary(cat)}{next ? ` · ${next}` : ''}</p>
        {cat.lastRun ? <p className="truncate" title={lastRunLine(cat.lastRun)}>Last: {lastRunLine(cat.lastRun)}</p> : <p>{FREEDOM[cat.freedom]?.short}</p>}
      </div>
    </div>
  );
}

CatCard.propTypes = { cat: PropTypes.object.isRequired, onToggle: PropTypes.func.isRequired };

function EmptyState({ onNew }) {
  return (
    <div className="mx-auto mt-6 max-w-xl text-center">
      <Cat pose="sleep" className="mx-auto w-28" outline={4} />
      <p className="mt-4 text-[15px] font-medium text-fg">No Cats yet</p>
      <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">
        A Cat is an agent that works on its own. Give it a mission, say what wakes it (a time, new email, a feed, a page or a folder changing), and how much it may do before asking you. It reports to your inbox here.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {CAT_TEMPLATES.map((template) => (
          <button
            key={template.name}
            type="button"
            onClick={() => onNew(template)}
            className="rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            {template.avatar} {template.title}
          </button>
        ))}
      </div>
      <Button className="mt-5" variant="primary" icon={Plus} onClick={() => onNew(null)}>Make a Cat</Button>
    </div>
  );
}

EmptyState.propTypes = { onNew: PropTypes.func.isRequired };

export default function CatsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { cats, counts, error, reload, loading } = useCats();
  const { items, reload: reloadInbox } = useInbox();
  const [newCat, setNewCat] = useState(() => (searchParams.get('new') === '1' ? { template: null } : null));
  const byId = useMemo(() => new Map((cats || []).map((cat) => [cat.id, cat])), [cats]);

  const waiting = (items || []).filter((item) => item.kind === 'approval' || item.kind === 'question');
  const results = (items || []).filter((item) => item.kind === 'result' || item.kind === 'notice');

  const toggle = async (cat, enabled) => {
    try {
      await catsApi.setEnabled(cat.id, enabled);
      reload();
    } catch (err) {
      toast.error(`Couldn't turn ${cat.name} ${enabled ? 'on' : 'off'}`, { detail: errorDetail(err) });
    }
  };

  const openNew = (template) => {
    setNewCat({ template });
    if (searchParams.get('new')) setSearchParams({}, { replace: true });
  };

  const refreshAll = () => {
    reload();
    reloadInbox();
  };

  return (
    <div className="flex h-full flex-col bg-canvas">
      <PageHeader
        title="Cats"
        description="Agents that work on their own. Each has a mission, wakes up when something happens, and reports here."
        actions={<Button variant="primary" icon={Plus} onClick={() => openNew(null)}>New Cat</Button>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-8">
          {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">{error}</p> : null}

          {waiting.length ? (
            <section aria-label="Waiting for you">
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-fg">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Waiting for you <span className="font-normal text-fg-subtle">{waiting.length}</span>
              </h2>
              <div className="space-y-2">
                {waiting.map((item) => <InboxItem key={item.id} item={item} cat={byId.get(item.catId)} showCat onDone={refreshAll} />)}
              </div>
            </section>
          ) : null}

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-hover" />)}
            </div>
          ) : cats.length === 0 ? (
            <EmptyState onNew={openNew} />
          ) : (
            <section aria-label="Your Cats">
              <h2 className="mb-2.5 text-[13px] font-semibold text-fg">Your Cats</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cats.map((cat) => <CatCard key={cat.id} cat={cat} onToggle={toggle} />)}
              </div>
            </section>
          )}

          {results.length ? (
            <section aria-label="Results">
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <Inbox className="h-4 w-4 text-fg-subtle" /> New results <span className="font-normal text-fg-subtle">{counts.result + counts.notice}</span>
                </h2>
                <Button size="xs" variant="ghost" icon={CheckCheck} onClick={async () => { await catsApi.readAll().catch(() => {}); refreshAll(); }}>Mark all read</Button>
              </div>
              <div className="space-y-2">
                {results.slice(0, 20).map((item) => <InboxItem key={item.id} item={item} cat={byId.get(item.catId)} showCat onDone={refreshAll} />)}
              </div>
            </section>
          ) : null}

          {items === null && !loading ? <Loader2 className="h-4 w-4 animate-spin text-fg-subtle" /> : null}
        </div>
      </div>

      {newCat ? (
        <NewCatDialog
          template={newCat.template}
          onClose={() => setNewCat(null)}
          onCreated={(cat) => {
            setNewCat(null);
            reload();
            navigate(`/cats/${cat.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
