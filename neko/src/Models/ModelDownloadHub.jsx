// Language → Local models → Download models: one search over the models and
// providers already here and over Hugging Face, the files of a Hugging Face
// repo to download, and the downloads in progress.

import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Cloud,
  Cpu,
  Download,
  FileArchive,
  Heart,
  Image as ImageIcon,
  Loader2,
  Lock,
  Mic,
  ShieldAlert,
  Volume2,
  X,
} from 'lucide-react';
import { localModelsApi } from '../Settings/settingApi.js';
import { useToast, errorDetail } from '../components/toastContext.js';
import Button from '../components/ui/Button.jsx';
import IconButton from '../components/ui/IconButton.jsx';
import Notice from '../components/ui/Notice.jsx';
import { DownloadLine } from '../components/ui/Progress.jsx';
import SearchField from '../components/ui/SearchField.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { Badge, Panel, SectionHeader } from './modelPageShared.jsx';
import { HFAuthorLogo } from './modelLogos.jsx';

// Voice and image files are found and added on Models → Voice and Images;
// this hub downloads language models only.
const TARGETS = {
  model: {
    label: 'Download',
    subDir: '',
    extensions: ['.gguf', '.bin'],
  },
};

const formatBytes = (bytes) => {
  if (!bytes) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

const targetOptionsForFile = (filename, repoId = '') => {
  const lowerName = String(filename || '').toLowerCase();
  const context = `${String(repoId || '').toLowerCase()}/${lowerName}`;
  // Whisper models and image models are .bin and .gguf files too; they belong on Voice and Images.
  const isWhisperLike = context.includes('whisper') || lowerName.startsWith('ggml-');
  const isImageLike = [
    'stable-diffusion', 'sdxl', 'flux', 'diffusion', 'controlnet', 'lora', 'vae', 'text-to-image', 'image-generation',
  ].some((word) => context.includes(word));
  if ((lowerName.endsWith('.gguf') || lowerName.endsWith('.bin')) && !isWhisperLike && !isImageLike) {
    return [['model', TARGETS.model]];
  }
  return [];
};

const useHFSearch = (query, setQuery) => {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const data = await localModelsApi.searchHuggingFace(q, { limit: 20 });
      setResults(data.models || []);
    } catch (err) {
      setSearchError(err.message || 'Could not reach HuggingFace. Check your connection.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback((q) => {
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(() => search(q), 500);
  }, [search, setQuery]);

  return { query, handleQueryChange, results, searching, searchError, setResults, setQuery };
};

// The downloadable files of one Hugging Face repo, opened under its result.
const HFFilePicker = ({ repoId, onSelect, onClose }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const data = await localModelsApi.listHuggingFaceFiles(repoId);
        const validFiles = (data.files || []).filter(f => targetOptionsForFile(f.rfilename, repoId).length > 0);
        setFiles(validFiles);
      } catch (err) {
        setError(err.message || 'Could not load model files.');
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [repoId]);

  return (
    <div className="mt-2 rounded-lg border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line py-1 pl-3 pr-1">
        <span className="min-w-0 truncate font-mono text-[12px] text-fg-muted">{repoId}</span>
        <IconButton icon={X} label="Close the file list" size="sm" onClick={onClose} />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {loading && (
          <p className="flex items-center gap-2 px-3 py-4 text-[12px] text-fg-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading files…
          </p>
        )}
        {error && <Notice tone="error" className="m-2">{error}</Notice>}
        {!loading && !error && files.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-fg-subtle">This repo has no language model files to download.</p>
        )}
        <div className="divide-y divide-line">
          {files.map((f) => {
            const targets = targetOptionsForFile(f.rfilename, repoId);
            const pathParts = String(f.rfilename).split('/');
            const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') + '/' : '';
            const basename = pathParts[pathParts.length - 1];
            return (
              <div key={f.rfilename} className="flex items-center gap-3 px-3 py-2">
                <FileArchive className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  {/* Wraps rather than cuts off, so the quantisation at the end stays visible. */}
                  <div className="break-all font-mono text-[12px] text-fg">
                    {folder && <span className="text-fg-subtle">{folder}</span>}
                    {basename}
                  </div>
                  {f.size > 0 && (
                    <span className="mt-0.5 block text-[11px] tabular-nums text-fg-subtle">{formatBytes(f.size)}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {targets.map(([key, target]) => (
                    <Button
                      key={key}
                      size="xs"
                      icon={Download}
                      aria-label={`${target.label} ${basename}`}
                      onClick={() => onSelect({
                        url: `https://huggingface.co/${repoId}/resolve/main/${f.rfilename}`,
                        filename: f.rfilename,
                        targetKey: key,
                        subDir: target.subDir,
                      })}
                    >
                      <span className="hidden sm:inline">{target.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

HFFilePicker.propTypes = {
  repoId: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

// ── Search highlight ───────────────────────────────────────────────────────────
const HighlightText = ({ text, query }) => {
  if (!query?.trim()) return <>{text}</>;
  const q = query.trim().toLowerCase();
  const lowerText = String(text || '').toLowerCase();
  const idx = lowerText.indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-fg">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
};

HighlightText.propTypes = { text: PropTypes.string, query: PropTypes.string };

// ── Local result type metadata ───────────────────────────────────────────────
const TYPE_META = {
  model: { label: 'Model', icon: Cpu },
  whisper: { label: 'Listening', icon: Mic },
  tts: { label: 'Speaking', icon: Volume2 },
  image: { label: 'Images', icon: ImageIcon },
  provider: { label: 'Provider', icon: Cloud },
};

const groupMatches = (matches) => {
  const order = [
    { key: 'model', label: 'Models' },
    { key: 'audio', label: 'Voice' },
    { key: 'image', label: 'Images' },
    { key: 'provider', label: 'Providers' },
  ];
  const groups = {};
  for (const m of matches) {
    const cat = m.category || m.type;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  }
  return order.filter(o => groups[o.key]).map(o => ({ ...o, items: groups[o.key] }));
};

// ── Relative time ────────────────────────────────────────────────────────────
const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

const FILTER_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'model', label: 'Models' },
  { value: 'provider', label: 'Providers' },
  { value: 'hf', label: 'Hugging Face' },
];

const matchesFilter = (item, filter) => {
  if (filter === 'all') return true;
  if (filter === 'hf') return false; // HF results are separate
  if (filter === 'model') return item.category === 'model';
  if (filter === 'provider') return item.category === 'provider';
  return true;
};

const matchesHFFilter = (model, filter) => {
  if (filter === 'all' || filter === 'hf') return true;
  if (filter === 'model') {
    const tag = (model.pipeline_tag || '').toLowerCase();
    return ['text-generation', 'image-text-to-text', 'text2text-generation'].some(t => tag.includes(t));
  }
  return false;
};

// A group of results: a small heading with its count, then the rows.
const ResultGroup = ({ label, count, children }) => (
  <div>
    <p className="px-3 pb-1 pt-2.5 text-[12px] text-fg-subtle">
      {label} <span className="tabular-nums">{count}</span>
    </p>
    <div className="divide-y divide-line">{children}</div>
  </div>
);

ResultGroup.propTypes = { label: PropTypes.string, count: PropTypes.number, children: PropTypes.node };

const ModelDownloadHub = ({
  searchQuery = '',
  downloadedMatches = [],
  onSearchQueryChange,
  onDownloadedSelect,
  onModelRefresh,
}) => {
  const [activeDownloads, setActiveDownloads] = useState({});
  const toast = useToast();
  const [expandedRepo, setExpandedRepo] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const cleanupFnsRef = useRef({});

  const {
    handleQueryChange,
    results,
    searching,
    searchError,
    setResults,
    setQuery,
  } = useHFSearch(searchQuery, onSearchQueryChange || (() => {}));

  const refreshAfterDownload = useCallback(() => {
    onModelRefresh?.();
  }, [onModelRefresh]);

  const startTrackingDownload = useCallback((downloadId, filename, targetKey = 'model') => {
    const trackingKey = `${targetKey}:${filename}`;
    setActiveDownloads((prev) => ({
      ...prev,
      [trackingKey]: { downloadId, filename, targetKey, progress: 0, status: 'downloading' },
    }));

    // DownloadLine works out the speed and time left from the byte counts.
    const cleanup = localModelsApi.streamDownloadProgress(
      downloadId,
      (data) =>
        setActiveDownloads((prev) => ({
          ...prev,
          [trackingKey]: { ...(prev[trackingKey] || {}), ...data, downloadId, filename, targetKey },
        })),
      (data) => {
        if (data.status === 'error') {
          setActiveDownloads((prev) => ({
            ...prev,
            [trackingKey]: { ...prev[trackingKey], status: 'error', error: data.error },
          }));
          return;
        }

        setActiveDownloads((prev) => {
          const next = { ...prev };
          delete next[trackingKey];
          return next;
        });
        if (data.status === 'complete') refreshAfterDownload();
        delete cleanupFnsRef.current[trackingKey];
      },
      () => {
        setActiveDownloads((prev) => {
          const next = { ...prev };
          delete next[trackingKey];
          return next;
        });
        delete cleanupFnsRef.current[trackingKey];
      },
    );
    cleanupFnsRef.current[trackingKey] = cleanup;
  }, [refreshAfterDownload]);

  useEffect(() => {
    localModelsApi.listDownloads()
      .then((res) => {
        if (!res.success || !res.downloads?.length) return;
        res.downloads.forEach((dl) => {
          if (dl.status !== 'downloading') return;
          // Voice and image files show their progress on the Voice and Images tabs.
          if (/^(audio|image)/.test(String(dl.subDir || ''))) return;
          startTrackingDownload(dl.downloadId, dl.filename || 'download', 'model');
        });
      })
      .catch(() => {});

    const cleanupFns = cleanupFnsRef.current;
    return () => {
      Object.values(cleanupFns).forEach(fn => fn?.());
    };
  }, [startTrackingDownload]);

  const handleDownload = async ({ url, filename, targetKey = 'model', subDir = '' }) => {
    const trackingKey = `${targetKey}:${filename}`;
    if (activeDownloads[trackingKey]) return;
    try {
      const res = await localModelsApi.startDownload(url, filename, subDir);
      if (res.success) startTrackingDownload(res.downloadId, filename, targetKey);
      else toast.error(`Couldn't start downloading ${filename}`, { detail: res.error || '' });
    } catch (err) {
      console.error('Download start failed:', err.message || err);
      toast.error(`Couldn't start downloading ${filename}`, { detail: errorDetail(err) });
    }
  };

  const handleCancelDownload = async (trackingKey) => {
    const dl = activeDownloads[trackingKey];
    cleanupFnsRef.current[trackingKey]?.();
    delete cleanupFnsRef.current[trackingKey];
    setActiveDownloads((prev) => {
      const next = { ...prev };
      delete next[trackingKey];
      return next;
    });
    if (!dl?.downloadId) return;
    try {
      await localModelsApi.cancelDownload(dl.downloadId);
    } catch (err) {
      if (!err.message?.toLowerCase().includes('not found')) console.warn('Backend cancel notice:', err);
    }
  };

  const handleHFFilePick = (payload) => {
    setExpandedRepo(null);
    setQuery('');
    setResults([]);
    handleDownload(payload);
  };

  const activeEntries = Object.entries(activeDownloads);
  const localShown = downloadedMatches.filter(m => matchesFilter(m, activeFilter));
  const hfShown = results.filter(m => matchesHFFilter(m, activeFilter));

  const onSearchChange = (text) => {
    handleQueryChange(text);
    if (!text) {
      setExpandedRepo(null);
      setActiveFilter('all');
    }
  };

  return (
    <Panel className="p-5">
      <SectionHeader
        title="Download models"
        description="Find language models on Hugging Face to run on this computer. Voice and image files are added on the Voice and Images tabs."
      />

      {activeEntries.length > 0 && (
        <div className="mt-4 space-y-3">
          {activeEntries.map(([trackingKey, dl]) => (
            <DownloadLine
              key={trackingKey}
              label={<span className="font-mono text-[12px]">{dl.filename}</span>}
              bytes={Number.isFinite(dl.downloaded) ? dl.downloaded : undefined}
              total={Number.isFinite(dl.total) ? dl.total : undefined}
              percent={dl.progress || 0}
              error={dl.status === 'error' ? (dl.error || 'Network request failed') : null}
              onCancel={() => handleCancelDownload(trackingKey)}
              cancelLabel={dl.status === 'error' ? 'Dismiss' : 'Cancel'}
            />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <Segmented value={activeFilter} onChange={setActiveFilter} items={FILTER_CHIPS} label="Show" size="sm" className="max-w-full overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap" />
        <SearchField
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search your models and Hugging Face"
          aria-label="Search your models and Hugging Face"
        />

        {searchQuery && activeFilter !== 'hf' && localShown.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line">
            {groupMatches(localShown).map((group) => (
              <ResultGroup key={group.key} label={group.label} count={group.items.length}>
                {group.items.map((item) => {
                  const meta = TYPE_META[item.type] || TYPE_META.model;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={`${item.type}:${item.id}`}
                      type="button"
                      onClick={() => onDownloadedSelect?.(item)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-fg">
                          <HighlightText text={item.name} query={searchQuery} />
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-fg-subtle">{item.detail}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-[12px]">
                        {item.isActive && <span className="font-medium text-accent">In use</span>}
                        <span className="text-fg-subtle">{meta.label}</span>
                      </div>
                    </button>
                  );
                })}
              </ResultGroup>
            ))}
          </div>
        )}

        {searching && (
          <p className="flex items-center gap-2 text-[12px] text-fg-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Searching Hugging Face…
          </p>
        )}
        {searchError && <Notice tone="error">{searchError}</Notice>}
        {!searching && hfShown.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line">
            <ResultGroup label="Hugging Face" count={hfShown.length}>
              {hfShown.map((model) => {
                const repoId = model.modelId || model.id;
                const isExpanded = expandedRepo === repoId;
                const downloads = model.downloads ? `${(model.downloads >= 1000 ? (model.downloads / 1000).toFixed(0) + 'k' : model.downloads)}` : null;
                const likes = model.likes ? `${(model.likes >= 1000 ? (model.likes / 1000).toFixed(1) + 'k' : model.likes)}` : null;
                const author = model.author || (repoId.includes('/') ? repoId.split('/')[0] : '');
                const modelName = repoId.includes('/') ? repoId.split('/').slice(1).join('/') : repoId;
                const updated = timeAgo(model.updated);
                const tags = (model.tags || []).slice(0, 3);
                const pipeline = model.pipeline_tag || '';
                return (
                  <div key={repoId} className="px-3 py-2.5">
                    {/* On a phone the button goes under the details instead of squeezing them. */}
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="flex min-w-0 flex-1 basis-60 items-start gap-2.5">
                        <HFAuthorLogo author={author} size="sm" />
                        <div className="min-w-0 flex-1">
                          {author && <p className="truncate text-[11px] text-fg-subtle">{author}</p>}
                          <p className="truncate text-[13px] font-medium text-fg">
                            <HighlightText text={modelName} query={searchQuery} />
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-fg-subtle">
                            {pipeline && <Badge>{pipeline}</Badge>}
                            {tags.map((tag) => <span key={tag}>{tag}</span>)}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] tabular-nums text-fg-subtle">
                            {downloads && (
                              <span className="flex items-center gap-1" title="Downloads">
                                <Download className="h-3 w-3" />
                                {downloads}
                              </span>
                            )}
                            {likes && (
                              <span className="flex items-center gap-1" title="Likes">
                                <Heart className="h-3 w-3" />
                                {likes}
                              </span>
                            )}
                            {updated && <span>{updated}</span>}
                            {model.gated && (
                              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                <ShieldAlert className="h-3 w-3" />
                                Gated
                              </span>
                            )}
                            {model.private && (
                              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                <Lock className="h-3 w-3" />
                                Private
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        icon={isExpanded ? undefined : Download}
                        onClick={() => setExpandedRepo(isExpanded ? null : repoId)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Hide' : 'Get'}
                      </Button>
                    </div>
                    {isExpanded && (
                      <HFFilePicker repoId={repoId} onSelect={handleHFFilePick} onClose={() => setExpandedRepo(null)} />
                    )}
                  </div>
                );
              })}
            </ResultGroup>
          </div>
        )}
        {!searching && searchQuery && localShown.length === 0 && hfShown.length === 0 && !searchError && (
          <div className="py-6 text-center">
            <p className="text-[13px] text-fg-muted">
              {activeFilter === 'all' ? `No results for "${searchQuery}"` : `No ${FILTER_CHIPS.find(c => c.value === activeFilter)?.label || ''} results for "${searchQuery}"`}
            </p>
            <p className="mt-1 text-[12px] text-fg-subtle">
              {activeFilter === 'all' ? 'Try a broader word like "llama", "qwen" or "gemma".' : 'Try All for more results.'}
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
};

ModelDownloadHub.propTypes = {
  searchQuery: PropTypes.string,
  downloadedMatches: PropTypes.array,
  onSearchQueryChange: PropTypes.func,
  onDownloadedSelect: PropTypes.func,
  onModelRefresh: PropTypes.func,
};

export default ModelDownloadHub;
