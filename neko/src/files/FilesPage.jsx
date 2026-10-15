// Files: what agents made, and everything else Asyncat keeps on this
// computer, in seven places (Made by agents, Uploads, Models, Training,
// Exports, Logs & caches, System). den lists each place and says what can
// be done with each item; this page shows it, filters, sorts and pages it,
// and asks before anything is removed. It never lists a project's own files.
//
// /files opens the place used last; ?kind= picks a filter and ?open= opens
// an item (Models → Images links to /files/made?kind=picture).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Cat from '../components/ui/Cat.jsx';
import Notice from '../components/ui/Notice.jsx';
import SearchField from '../components/ui/SearchField.jsx';
import Select from '../components/ui/Select.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { useConfirm } from '../components/confirmContext.js';
import { errorDetail, useToast } from '../components/toastContext.js';
import { subscribeAppEvent } from '../services/appEvents.js';
import eventBus from '../utils/eventBus.js';
import {
  cleanConfirm, cleanedMessage, goesToTrash, placeCleans, removeConfirm, removedMessage, TRASH_FAILED_CONFIRM,
} from './fileActions.js';
import {
  defaultSort, filterChips, groupLogs, isPlace, isPlaceKind, kindLabel, openId, PLACE_FILTERS, PLACES, SORTS, steadySizes,
} from './fileFormat.js';
import FilesPlaces, { DiskSummary, PlacesRow } from './FilesPlaces.jsx';
import FileList from './FileRow.jsx';
import FileGrid, { FileGridSkeleton } from './FileTile.jsx';
import FileViewer from './FileViewer.jsx';
import SystemPlace from './SystemPlace.jsx';
import { downloadUrl, storageApi } from './storageApi.js';

const LAST_PLACE_KEY = 'asyncat_files_place';
const VIEW_KEY = 'asyncat_files_view';
const PAGE = 100;
// While den counts sizes, ask again this often, this many times.
const POLL_MS = 1500;
const POLLS = 20;

function readStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
}

function useDebounced(value, ms) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

// The place a bare /files link opens: the one used last, unless it asks
// for a kind (or an item) another place has.
function placeFor(search) {
  const params = new URLSearchParams(search);
  const kind = params.get('kind');
  if (kind) {
    const owner = Object.keys(PLACE_FILTERS).find((place) => isPlaceKind(place, kind));
    if (owner) return owner;
  }
  if (params.get('open')) return 'made';
  const last = readStored(LAST_PLACE_KEY);
  return isPlace(last) ? last : 'made';
}

const matches = (needle) => (item) => [item.title, item.name, item.where, item.kindLabel, item.prompt]
  .some((value) => String(value || '').toLowerCase().includes(needle));

function Chips({ chips, value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Show" className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => {
        const selected = chip.value === value;
        return (
          <button
            key={chip.value || 'all'}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(chip.value)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
              selected ? 'border-line-strong bg-selected text-fg' : 'border-line text-fg-muted hover:bg-hover hover:text-fg'
            }`}
          >
            {chip.label}
            <span className="tabular-nums text-fg-subtle">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}

Chips.propTypes = { chips: PropTypes.array.isRequired, value: PropTypes.string, onChange: PropTypes.func.isRequired };

function Loading({ grid }) {
  if (grid) return <FileGridSkeleton />;
  return (
    <div className="space-y-2 px-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex h-8 items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="hidden h-3 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

Loading.propTypes = { grid: PropTypes.bool };

const EMPTY = {
  uploads: 'Nothing here yet. Files you add to notes, chats, agents and projects show up here.',
  models: 'No models downloaded yet.',
  training: 'Nothing from training yet.',
  exports: 'No exports yet. Export everything is in Settings → Privacy & safety.',
  logs: 'No logs yet.',
};

// What a filter that finds nothing says, by kind.
const EMPTY_KIND = {
  picture: 'No pictures yet. Pictures you make in chats or on Models → Images show up here.',
};

function Empty({ place, filtered, kind = '' }) {
  if (kind) {
    const label = kindLabel(place, kind);
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-muted" data-files-empty>
        {EMPTY_KIND[kind] || `No ${String(label || 'items').toLowerCase()} yet.`}
      </p>
    );
  }
  if (place === 'made' && !filtered) {
    return (
      <div className="mx-auto mt-8 max-w-md text-center" data-files-empty>
        <Cat pose="sleep" className="mx-auto w-28" outline={4} />
        <p className="mt-4 text-[15px] font-medium text-fg">Nothing made yet</p>
        <p className="mt-1.5 text-[13px] leading-6 text-fg-muted">Pictures, documents and pages agents make show up here.</p>
      </div>
    );
  }
  return (
    <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-muted" data-files-empty>
      {filtered ? 'Nothing matches.' : EMPTY[place] || 'Nothing here yet.'}
    </p>
  );
}

Empty.propTypes = { place: PropTypes.string.isRequired, filtered: PropTypes.bool, kind: PropTypes.string };

/** One place: its header, filters, items and viewer. Mounted afresh for each place. */
function PlaceView({ place, desktop: desktopHint, onChanged }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const info = PLACES.find((entry) => entry.id === place);

  const kindParam = searchParams.get('kind') || '';
  const kind = isPlaceKind(place, kindParam) ? kindParam : '';
  const openParam = searchParams.get('open');
  const [where, setWhere] = useState('');
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 250);
  const [sort, setSort] = useState(() => defaultSort(place));
  const [view, setView] = useState(() => (readStored(VIEW_KEY) === 'list' ? 'list' : 'grid'));
  const grid = place === 'made' && view === 'grid';

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [cleaning, setCleaning] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  // How many items are loaded, so a reload keeps them; a new filter starts again from the first page.
  const shownRef = useRef(PAGE);
  const loadedFor = useRef(null);
  // Counts loads, so a "Show more" that comes back after a new filter or a reload is dropped.
  const loadRun = useRef(0);

  const desktop = Boolean(data?.desktop ?? desktopHint);

  useEffect(() => {
    let alive = true;
    loadRun.current += 1;
    const filters = [kind, where, q, sort].join('\u0000');
    const limit = loadedFor.current === filters ? Math.max(PAGE, shownRef.current) : PAGE;
    loadedFor.current = filters;
    setLoading(true);
    storageApi.items({ place, kind, where, q, sort, offset: 0, limit })
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError('');
      })
      .catch((err) => { if (alive) setError(errorDetail(err) || "Couldn't load this place."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [place, kind, where, q, sort, reloadKey]);

  useEffect(() => { shownRef.current = Math.max(PAGE, data?.items?.length || 0); }, [data]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  // A picture or file made in a chat shows up when its run finishes.
  useEffect(() => (place === 'made' ? subscribeAppEvent('conversation.updated', reload) : undefined), [place, reload]);

  // ?open= opens that item, wherever it is.
  useEffect(() => {
    const id = openId(openParam);
    if (!id) return undefined;
    let alive = true;
    storageApi.item(id)
      .then((res) => { if (alive) setViewer(res.item); })
      .catch(() => { if (alive) toast.error("Couldn't find that file. It may have been deleted."); });
    return () => { alive = false; };
  }, [openParam, toast]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const closeViewer = () => {
    setViewer(null);
    if (openParam) setParam('open', '');
  };

  const showMore = async () => {
    const run = loadRun.current;
    const offset = data.items.length;
    setMore(true);
    try {
      const res = await storageApi.items({ place, kind, where, q, sort, offset, limit: PAGE });
      if (run !== loadRun.current) return;
      setData((current) => (current?.items?.length === offset ? { ...res, items: [...current.items, ...res.items] } : current));
    } catch (err) {
      if (run === loadRun.current) toast.error("Couldn't load more", { detail: errorDetail(err) });
    } finally {
      setMore(false);
    }
  };

  const remove = async (item) => {
    if (!(await confirm({ ...removeConfirm(item, { desktop }), destructive: true }))) return;
    const failed = item.deleteVerb === 'remove' ? "Couldn't remove it" : "Couldn't delete it";
    let result;
    try {
      result = await storageApi.remove(item.id, { permanent: item.deleteVerb === 'trash' && !goesToTrash(item, { desktop }) });
    } catch (err) {
      if (err.code !== 'TRASH_FAILED') {
        toast.error(failed, { detail: errorDetail(err) });
        return;
      }
      if (!(await confirm({ ...TRASH_FAILED_CONFIRM, destructive: true }))) return;
      try {
        result = await storageApi.remove(item.id, { permanent: true });
      } catch (again) {
        toast.error(failed, { detail: errorDetail(again) });
        return;
      }
    }
    toast.success(removedMessage(item, result));
    setViewer((current) => (current?.id === item.id ? null : current));
    if (openParam) setParam('open', '');
    reload();
    onChanged();
  };

  const onAction = async (item, action) => {
    try {
      if (action === 'remove') await remove(item);
      else if (action === 'reveal') await storageApi.reveal(item.id);
      else if (action === 'open') await storageApi.open(item.id);
      else if (action === 'download') {
        const link = document.createElement('a');
        link.href = downloadUrl(item.id);
        link.download = item.name || '';
        link.click();
      } else if (action === 'copy') {
        await navigator.clipboard.writeText(item.path);
        toast.success('Copied the path');
      } else if (action === 'chat') {
        // A new chat with the request started; the composer takes it once it is there.
        navigate('/home');
        setTimeout(() => eventBus.emit('composer:prefill', `Change the picture ${item.name} from my pictures: `), 400);
      } else if (action === 'source') {
        navigate(`/conversations/${item.conversationId}`);
      } else if (action === 'manage') {
        navigate(item.manageRoute);
      }
    } catch (err) {
      const what = { reveal: "Couldn't show it in its folder", open: "Couldn't open it", copy: "Couldn't copy the path" }[action] || "That didn't work";
      toast.error(what, { detail: errorDetail(err) });
    }
  };

  const clean = async ({ action, kind: cleanKind }) => {
    let files = 0;
    let bytes = 0;
    if (cleanKind) {
      try {
        const res = await storageApi.items({ place, kind: cleanKind, limit: 500 });
        const removable = res.items.filter((item) => item.can?.delete);
        files = removable.length;
        bytes = removable.reduce((sum, item) => sum + (item.bytes || 0), 0);
      } catch { /* the clean-up itself still says how it went */ }
      if (!files) {
        toast.info('Nothing to clear');
        return;
      }
    }
    if (!(await confirm({ ...cleanConfirm(action, { files, bytes }), destructive: true }))) return;
    setCleaning(action);
    try {
      toast.success(cleanedMessage(await storageApi.clean(action)));
      reload();
      onChanged();
    } catch (err) {
      toast.error("Couldn't clear it", { detail: errorDetail(err) });
    } finally {
      setCleaning(null);
    }
  };

  const counts = useMemo(() => data?.counts || {}, [data]);
  const chips = filterChips(place, counts, { selected: kind });
  const items = useMemo(() => {
    const all = data?.items || [];
    const needle = query.trim().toLowerCase();
    // While the search is on its way to den, narrow what is loaded already.
    return needle && needle !== q.toLowerCase() ? all.filter(matches(needle)) : all;
  }, [data, query, q]);
  const filtered = Boolean(kind || where || q);
  const wheres = data?.wheres || [];
  const cleans = placeCleans(place).filter((entry) => {
    if (entry.action === 'unfinished-downloads') return counts.unfinished > 0;
    if (entry.action === 'unused-attachments') return counts.unused > 0;
    if (entry.action === 'old-logs') return (data?.items || []).some((item) => item.kind === 'log' && item.can?.delete);
    return true;
  });
  const hasAny = Boolean(data && (data.total > 0 || filtered));
  // Grid or List, unless there turns out to be nothing to show.
  const viewSwitch = place === 'made' && (!data || hasAny);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-5 lg:px-8" data-files-place={place}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{info.label}</h2>
          <p className="mt-0.5 text-[12px] leading-5 text-fg-subtle">{info.hint}</p>
        </div>
        {cleans.length || viewSwitch ? (
          <div className="flex flex-wrap items-center gap-2">
            {cleans.map((entry) => (
              <Button key={entry.action} loading={cleaning === entry.action} disabled={Boolean(cleaning)} onClick={() => clean(entry)}>{entry.label}</Button>
            ))}
            {viewSwitch ? (
              <Segmented
                size="sm"
                label="Show as"
                value={view}
                onChange={(next) => { setView(next); store(VIEW_KEY, next); }}
                items={[{ value: 'grid', label: 'Grid', icon: LayoutGrid }, { value: 'list', label: 'List', icon: List }]}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {place === 'system' ? (
        error ? <Notice tone="error" action={<Button size="xs" variant="ghost" onClick={reload}>Try again</Button>}>{error}</Notice>
          : <SystemPlace items={data?.items || []} loading={loading} desktop={desktop} onAction={onAction} />
      ) : (
        <>
          {hasAny ? (
            <div className="space-y-3">
              {chips.length > 2 || kind ? <Chips chips={chips} value={kind} onChange={(value) => setParam('kind', value)} /> : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchField size="sm" value={query} onChange={setQuery} placeholder="Search" aria-label={`Search ${info.label}`} className="sm:max-w-xs sm:flex-1" />
                <div className="flex gap-2">
                  {(place === 'made' || place === 'uploads') && wheres.length > 1 ? (
                    <Select
                      size="sm"
                      fullWidth={false}
                      className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                      aria-label="Where"
                      value={where}
                      onChange={setWhere}
                      options={[{ value: '', label: 'Everywhere' }, ...wheres.map((entry) => ({ value: entry.id, label: entry.label }))]}
                    />
                  ) : null}
                  <Select
                    size="sm"
                    fullWidth={false}
                    className="min-w-0 flex-1 sm:w-36 sm:flex-none"
                    aria-label="Sort"
                    value={sort}
                    onChange={setSort}
                    options={SORTS}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <Notice tone="error" action={<Button size="xs" variant="ghost" onClick={reload}>Try again</Button>}>{error}</Notice>
          ) : !data ? (
            <Loading grid={grid} />
          ) : !items.length ? (
            <Empty place={place} filtered={filtered || Boolean(query.trim())} kind={kind && !where && !query.trim() && !Number(counts[kind]) ? kind : ''} />
          ) : place === 'logs' ? (
            <div className="space-y-6">
              {groupLogs(items).map((group) => (
                <section key={group.kind} aria-label={group.label}>
                  <h3 className="mb-1 px-3 text-[13px] font-semibold text-fg">{group.label}</h3>
                  <FileList items={group.items} desktop={desktop} onOpen={setViewer} onAction={onAction} label={group.label} />
                </section>
              ))}
            </div>
          ) : grid ? (
            <FileGrid items={items} desktop={desktop} onOpen={setViewer} onAction={onAction} label={info.label} />
          ) : (
            <FileList items={items} desktop={desktop} onOpen={setViewer} onAction={onAction} label={info.label} />
          )}

          {data && !error && data.total > data.items.length && items.length === data.items.length ? (
            <div className="flex justify-center">
              <Button variant="ghost" loading={more} onClick={showMore}>Show more</Button>
            </div>
          ) : null}
        </>
      )}

      {viewer ? <FileViewer item={viewer} desktop={desktop} onClose={closeViewer} onAction={onAction} /> : null}
    </div>
  );
}

PlaceView.propTypes = { place: PropTypes.string.isRequired, desktop: PropTypes.bool, onChanged: PropTypes.func.isRequired };

/** How much room each place takes, counted again after something is removed. */
function useSizes() {
  const [summary, setSummary] = useState(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer = null;
    let polls = 0;
    const ask = async () => {
      try {
        const res = await storageApi.places();
        if (!alive) return;
        setSummary((current) => steadySizes(current, res));
        if (res.scanning && polls < POLLS) {
          polls += 1;
          timer = setTimeout(ask, POLL_MS);
        }
      } catch (err) {
        if (alive) setSummary((current) => current || { error: errorDetail(err) });
      }
    };
    ask();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [round]);
  const recount = useCallback(() => setRound((value) => value + 1), []);
  return [summary, recount];
}

function Files({ place }) {
  const navigate = useNavigate();
  const [summary, recount] = useSizes();
  useEffect(() => { store(LAST_PLACE_KEY, place); }, [place]);
  const pick = (id) => { if (id !== place) navigate(`/files/${id}`); };

  return (
    <div className="flex h-full flex-col bg-canvas" data-files-page>
      <PageHeader title="Files" description="What agents made and everything else Asyncat keeps on this computer, apart from your project folders." />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-sidebar px-3 py-4 lg:flex">
          <DiskSummary summary={summary} />
          <FilesPlaces summary={summary} current={place} onPick={pick} />
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-2 border-b border-line px-6 pt-3 lg:hidden">
            <DiskSummary summary={summary} compact />
            <PlacesRow current={place} onPick={pick} />
          </div>
          <PlaceView key={place} place={place} desktop={Boolean(summary?.desktop)} onChanged={recount} />
        </div>
      </div>
    </div>
  );
}

Files.propTypes = { place: PropTypes.string.isRequired };

export default function FilesPage() {
  const { place } = useParams();
  const location = useLocation();
  if (!place) return <Navigate to={`/files/${placeFor(location.search)}${location.search}`} replace />;
  if (!isPlace(place)) return <Navigate to="/files/made" replace />;
  return <Files place={place} />;
}
