// Tools & Skills → Memory: what the agents remember, with a search, filters
// for whose memories and what kind, the counts, and each memory with its
// owner, tags and dates. Memories can be added, edited and deleted here.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Bot, Cat as CatIcon, Folder, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { agentApi } from '../CommandCenter/api';
import Button from '../components/ui/Button.jsx';
import Cat from '../components/ui/Cat.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import Notice from '../components/ui/Notice.jsx';
import SearchField from '../components/ui/SearchField.jsx';
import Select from '../components/ui/Select.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { errorDetail, useToast } from '../components/toastContext.js';
import { useConfirm } from '../components/confirmContext.js';
import { Badge } from '../Models/modelPageShared.jsx';
import { TagChip } from './catalogParts.jsx';
import { AddMemoryForm, MemoryEditor, MemoryOwnerSelect } from './memoryParts.jsx';
import { importanceDots, memorySource, memorySummary, memoryTags, sqliteDate } from './memoryFormat.js';
import { MEMORY_KIND_OPTIONS, memoryKindLabel } from './memoryKinds.js';

const KIND_FILTER = [{ value: 'all', label: 'All kinds' }, ...MEMORY_KIND_OPTIONS];

function OwnerBadge({ icon: Icon, label, hint }) {
  return (
    <span title={hint} className="inline-flex">
      <Badge><Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />{label}</Badge>
    </span>
  );
}

OwnerBadge.propTypes = { icon: PropTypes.elementType.isRequired, label: PropTypes.string.isRequired, hint: PropTypes.string };

function Importance({ mem }) {
  const dots = importanceDots(mem);
  const value = Number(mem.importance ?? 0.5);
  return (
    <span role="img" aria-label={`Importance ${dots} of 5`} title={`Importance: ${Number.isFinite(value) ? value.toFixed(1) : '0.5'}`} className="flex items-center gap-0.5 px-1">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={`h-1.5 w-1.5 rounded-full ${index < dots ? 'bg-fg-muted' : 'bg-line-strong'}`} />
      ))}
    </span>
  );
}

Importance.propTypes = { mem: PropTypes.object.isRequired };

function MemoryRow({ mem, onDelete, deleting, onSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const content = mem.content || '';
  const isLong = content.length > 120;
  const source = memorySource(mem.source);
  const meta = [
    source,
    mem.created_at ? `Created ${sqliteDate(mem.created_at).toLocaleDateString()}` : null,
    mem.access_count > 0 ? `Used ${mem.access_count}×` : null,
    mem.last_accessed_at ? `Last used ${sqliteDate(mem.last_accessed_at).toLocaleDateString()}` : null,
  ].filter(Boolean);

  return (
    <div className="group px-3.5 py-3" data-memory={mem.id || mem.key}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge>{memoryKindLabel(mem.kind || mem.memory_type || 'fact')}</Badge>
        {mem.project_id ? <OwnerBadge icon={Folder} label={mem.project_name || 'Project'} hint="Only chats in this project see this memory" /> : null}
        {mem.profile_id ? <OwnerBadge icon={Bot} label={mem.agent_name || 'Agent'} hint="Only this agent sees this memory" /> : null}
        {mem.cat_id ? <OwnerBadge icon={CatIcon} label={mem.cat_name || 'Cat'} hint="This Cat's own memory" /> : null}
        {memoryTags(mem).map((tag) => <TagChip key={tag}>{tag}</TagChip>)}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <Importance mem={mem} />
          <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
            <IconButton icon={Pencil} label="Edit memory" size="sm" onClick={() => setEditing(true)} />
            <IconButton icon={Trash2} label="Delete memory" size="sm" onClick={() => onDelete(mem)} loading={deleting} />
          </span>
        </span>
      </div>

      {editing ? (
        <div className="mt-2">
          <MemoryEditor mem={mem} onCancel={() => setEditing(false)} onSaved={(updated) => { setEditing(false); onSaved(updated); }} />
        </div>
      ) : (
        <div className="mt-1.5 select-text text-[13px] leading-6 text-fg">
          <p className={`whitespace-pre-wrap break-words ${!expanded && isLong ? 'line-clamp-3 cursor-pointer' : ''}`} onClick={() => isLong && !expanded && setExpanded(true)}>
            {content}
          </p>
          {isLong ? (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded text-[12px] text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </div>
      )}

      <p className="mt-1 flex min-w-0 flex-wrap gap-x-1.5 text-[11px] leading-4 text-fg-subtle">
        <span className="min-w-0 truncate font-mono" title="The memory's key">{mem.key}</span>
        {meta.map((text) => <span key={text}>· {text}</span>)}
      </p>
    </div>
  );
}

MemoryRow.propTypes = {
  mem: PropTypes.shape({
    id: PropTypes.string,
    key: PropTypes.string.isRequired,
    kind: PropTypes.string,
    memory_type: PropTypes.string,
    tags: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.string), PropTypes.string]),
    importance: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    content: PropTypes.string,
    source: PropTypes.string,
    project_id: PropTypes.string,
    project_name: PropTypes.string,
    profile_id: PropTypes.string,
    agent_name: PropTypes.string,
    cat_id: PropTypes.string,
    cat_name: PropTypes.string,
    last_accessed_at: PropTypes.string,
    access_count: PropTypes.number,
    created_at: PropTypes.string,
  }).isRequired,
  onDelete: PropTypes.func.isRequired,
  deleting: PropTypes.bool,
  onSaved: PropTypes.func.isRequired,
};

function MemorySkeleton() {
  return (
    <div className="divide-y divide-line rounded-xl border border-line" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-2 px-3.5 py-3.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export default function MemoryTab({ memory, owners }) {
  const { memories, setMemories, query, setQuery, kind, setKind, scope, setScope, loading, error, reload, stats, reloadStats } = memory;
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [consolidating, setConsolidating] = useState(false);
  const filtered = Boolean(query.trim()) || kind !== 'all' || scope !== 'all';

  async function deleteMemory(mem) {
    // The same question the skills ask: a deleted memory can't come back.
    const text = String(mem.content || '').trim();
    const ok = await confirm({
      title: 'Delete this memory?',
      message: `“${text.length > 120 ? `${text.slice(0, 117)}…` : text}” will be deleted. This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(mem.id);
    try {
      await agentApi.deleteMemory(mem.key, mem.id);
      setMemories((prev) => prev.filter((item) => item.id !== mem.id));
      reloadStats();
    } catch (err) {
      toast.error("Couldn't delete the memory", { detail: errorDetail(err) });
    } finally {
      setDeletingId(null);
    }
  }

  async function consolidate() {
    setConsolidating(true);
    try {
      // Say what will merge first; nothing changes without a yes.
      const plan = await agentApi.previewConsolidation();
      if (!plan.memories && !plan.expired) {
        toast.info('Nothing to consolidate', { detail: 'Memories you wrote, and ones that are important or used often, are never merged.' });
        return;
      }
      const parts = [
        plan.memories ? `${plan.memories} memories Asyncat saved on its own will be merged into ${plan.clusters} short ${plan.clusters === 1 ? 'summary' : 'summaries'}` : null,
        plan.expired ? `${plan.expired} expired ${plan.expired === 1 ? 'memory' : 'memories'} will be removed` : null,
      ].filter(Boolean);
      const ok = await confirm({
        title: 'Consolidate memories?',
        message: `${parts.join(', and ')}. Memories you wrote, and ones that are important or used often, stay as they are. This can't be undone.`,
        confirmLabel: 'Consolidate',
      });
      if (!ok) return;
      await agentApi.consolidateMemory();
      await reloadStats();
      await reload();
    } catch (err) {
      toast.error("Couldn't consolidate the memories", { detail: errorDetail(err) });
    } finally {
      setConsolidating(false);
    }
  }

  let list;
  if (error) {
    list = <Notice tone="error" action={<Button size="xs" variant="ghost" onClick={() => reload()}>Try again</Button>}>Couldn&apos;t load the memories: {error}</Notice>;
  } else if (loading && !memories.length) {
    list = <MemorySkeleton />;
  } else if (!memories.length && filtered) {
    list = <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-muted">No memories match.</p>;
  } else if (!memories.length) {
    list = (
      <div className="mx-auto mt-6 max-w-md text-center">
        <Cat pose="sleep" className="mx-auto w-24" outline={4} />
        <p className="mt-4 text-[15px] font-medium text-fg">No memories yet</p>
        <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">Agents keep what matters from your chats here. You can add one yourself too.</p>
      </div>
    );
  } else {
    list = (
      <div className="divide-y divide-line rounded-xl border border-line">
        {memories.map((mem) => (
          <MemoryRow
            key={mem.id || mem.key}
            mem={mem}
            onDelete={deleteMemory}
            deleting={deletingId === mem.id}
            onSaved={(updated) => setMemories((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Memory">
      <div className="shrink-0 space-y-2 px-4 pb-3 pt-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField size="sm" value={query} onChange={setQuery} placeholder="Search memories" className="min-w-0 flex-1 basis-40 sm:max-w-xs" />
          {/* Beside the search on a phone, at the far end on a wider screen. */}
          <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)} className="sm:order-last sm:ml-auto">Add</Button>
          <MemoryOwnerSelect value={scope} onChange={setScope} owners={owners} />
          <Select size="sm" fullWidth={false} value={kind} onChange={setKind} options={KIND_FILTER} aria-label="Kind" />
        </div>
        <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[12px] tabular-nums text-fg-subtle">{memorySummary(stats, { shown: memories.length, filtered })}</p>
          {stats?.total ? (
            <Button
              size="xs"
              variant="ghost"
              icon={RefreshCw}
              loading={consolidating}
              onClick={consolidate}
              title="Merges small memories Asyncat saved of the same kind into short summaries and drops expired ones. Yours and important ones stay as they are."
              className="ml-auto"
            >
              {consolidating ? 'Consolidating…' : 'Consolidate'}
            </Button>
          ) : null}
        </div>
        {stats?.pctUsed >= 80 ? (
          <Notice tone="warning">Memory is {stats.pctUsed}% full. Consolidate merges small memories to make room.</Notice>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8">
        {adding ? (
          <AddMemoryForm
            owners={owners}
            defaultScope={scope}
            onAdded={() => {
              setAdding(false);
              reload();
              reloadStats();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : null}
        {list}
      </div>
    </section>
  );
}

MemoryTab.propTypes = {
  memory: PropTypes.shape({
    memories: PropTypes.array.isRequired,
    setMemories: PropTypes.func.isRequired,
    query: PropTypes.string.isRequired,
    setQuery: PropTypes.func.isRequired,
    kind: PropTypes.string.isRequired,
    setKind: PropTypes.func.isRequired,
    scope: PropTypes.string.isRequired,
    setScope: PropTypes.func.isRequired,
    loading: PropTypes.bool,
    error: PropTypes.string,
    reload: PropTypes.func.isRequired,
    stats: PropTypes.object,
    reloadStats: PropTypes.func.isRequired,
  }).isRequired,
  owners: PropTypes.object.isRequired,
};
