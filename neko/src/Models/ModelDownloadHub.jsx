/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
  Eye,
  File,
  FileArchive,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mic,
  Search,
  ShieldAlert,
  Volume2,
  X,
} from 'lucide-react';
import { configApi, localModelsApi } from '../Settings/settingApi.js';
import { Badge, Panel, SectionHeader } from './modelPageShared.jsx';

const TARGETS = {
  model: {
    label: 'Model',
    color: 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200',
    subDir: '',
    extensions: ['.gguf', '.bin'],
  },
  whisper: {
    label: 'STT',
    color: 'bg-violet-50 text-violet-600 hover:bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400 dark:hover:bg-violet-900/50',
    subDir: 'audio/whisper',
    extensions: ['.bin', '.gguf'],
  },
  tts: {
    label: 'TTS',
    color: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50',
    subDir: 'audio/tts',
    extensions: ['.onnx', '.onnx.json'],
  },
  vision: {
    label: 'Vision',
    color: 'bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50',
    subDir: 'vision',
    extensions: ['.gguf', '.bin', '.mmproj', '.safetensors', '.json'],
  },
  image: {
    label: 'Image',
    color: 'bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 dark:hover:bg-fuchsia-900/50',
    subDir: 'image',
    extensions: ['.safetensors', '.ckpt', '.gguf', '.onnx', '.pt', '.pth', '.bin', '.json'],
  },
};

const formatBytes = (bytes) => {
  if (!bytes) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec || !isFinite(bytesPerSec)) return '0 B/s';
  if (bytesPerSec >= 1e9) return `${(bytesPerSec / 1e9).toFixed(2)} GB/s`;
  if (bytesPerSec >= 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1e3) return `${(bytesPerSec / 1e3).toFixed(0)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
};

const formatETA = (secondsLeft) => {
  if (!secondsLeft || !isFinite(secondsLeft) || secondsLeft < 0) return '--:--';
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = Math.floor(secondsLeft % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const filenameMatches = (filename, extensions) => {
  const lower = String(filename || '').toLowerCase();
  return extensions.some(ext => lower.endsWith(ext));
};

const targetOptionsForFile = (filename, repoId = '') => {
  const lowerName = String(filename || '').toLowerCase();
  const lowerRepo = String(repoId || '').toLowerCase();
  const context = `${lowerRepo}/${lowerName}`;
  const isWhisperLike = (
    context.includes('whisper') ||
    lowerName.startsWith('ggml-')
  );
  const isPiperLike = (
    context.includes('piper') ||
    lowerName.endsWith('.onnx') ||
    lowerName.endsWith('.onnx.json')
  );
  const isVisionLike = (
    context.includes('vision') ||
    context.includes('llava') ||
    context.includes('bakllava') ||
    context.includes('moondream') ||
    context.includes('mmproj') ||
    context.includes('clip') ||
    context.includes('siglip')
  );
  const isImageLike = (
    context.includes('stable-diffusion') ||
    context.includes('sdxl') ||
    context.includes('flux') ||
    context.includes('diffusion') ||
    context.includes('controlnet') ||
    context.includes('lora') ||
    context.includes('vae') ||
    context.includes('text-to-image') ||
    context.includes('image-generation')
  );
  const options = [];

  if ((lowerName.endsWith('.gguf') || lowerName.endsWith('.bin')) && !isWhisperLike && !isVisionLike && !isImageLike) {
    options.push(['model', TARGETS.model]);
  }
  if ((lowerName.endsWith('.bin') || lowerName.endsWith('.gguf')) && isWhisperLike) {
    options.push(['whisper', TARGETS.whisper]);
  }
  if (isPiperLike && (lowerName.endsWith('.onnx') || lowerName.endsWith('.onnx.json'))) {
    options.push(['tts', TARGETS.tts]);
  }
  if (isVisionLike && ['.gguf', '.bin', '.mmproj', '.safetensors', '.json'].some(ext => lowerName.endsWith(ext))) {
    options.push(['vision', TARGETS.vision]);
  }
  if (isImageLike && ['.safetensors', '.ckpt', '.gguf', '.onnx', '.pt', '.pth', '.bin', '.json'].some(ext => lowerName.endsWith(ext))) {
    options.push(['image', TARGETS.image]);
  }

  return options;
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

  const fileIconFor = (filename) => {
    const lower = String(filename).toLowerCase();
    if (lower.endsWith('.gguf')) return FileArchive;
    if (lower.endsWith('.safetensors')) return FileArchive;
    if (lower.endsWith('.bin')) return FileArchive;
    if (lower.endsWith('.onnx') || lower.endsWith('.onnx.json')) return FileArchive;
    if (lower.endsWith('.pt') || lower.endsWith('.pth')) return FileArchive;
    if (lower.endsWith('.ckpt')) return FileArchive;
    return File;
  };

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/60">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{repoId}</span>
        <button onClick={onClose} className="ml-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-5 text-xs text-gray-400 dark:text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading files…
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-red-500 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}
        {!loading && !error && files.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-5 text-xs text-gray-400 dark:text-gray-500">
            <File className="h-5 w-5 opacity-40" />
            No downloadable files found in this repo.
          </div>
        )}
        {files.map((f) => {
          const targets = targetOptionsForFile(f.rfilename, repoId);
          const pathParts = String(f.rfilename).split('/');
          const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') + '/' : '';
          const basename = pathParts[pathParts.length - 1];
          const FileIcon = fileIconFor(f.rfilename);
          return (
            <div
              key={f.rfilename}
              className="flex items-center gap-3 border-b border-gray-50 px-3 py-2.5 last:border-0 transition-colors hover:bg-gray-50/60 dark:border-gray-800/50 dark:hover:bg-gray-800/60"
            >
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400`}>
                <FileIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs text-gray-800 dark:text-gray-200">
                  {folder && <span className="text-gray-400 dark:text-gray-500">{folder}</span>}
                  {basename}
                </div>
                {f.size > 0 && (
                  <span className="mt-0.5 block text-[10px] text-gray-400 dark:text-gray-500">
                    {formatBytes(f.size)}
                  </span>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {targets.map(([key, target]) => (
                  <button
                    key={key}
                    onClick={() => onSelect({
                      url: `https://huggingface.co/${repoId}/resolve/main/${f.rfilename}`,
                      filename: f.rfilename,
                      targetKey: key,
                      subDir: target.subDir,
                    })}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${target.color}`}
                  >
                    {target.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
      <mark className="rounded bg-amber-100 px-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
};

// ── Local result type metadata ───────────────────────────────────────────────
const TYPE_META = {
  model: {
    label: 'Model',
    icon: Cpu,
    iconBg: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    activeIconBg: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    activeBadge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  whisper: {
    label: 'STT',
    icon: Mic,
    iconBg: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    badge: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
  },
  tts: {
    label: 'TTS',
    icon: Volume2,
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  vision: {
    label: 'Vision',
    icon: Eye,
    iconBg: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
    badge: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
  },
  image: {
    label: 'Image',
    icon: ImageIcon,
    iconBg: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
    badge: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  },
  provider: {
    label: 'Provider',
    icon: Cloud,
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    activeIconBg: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    badge: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    activeBadge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
};

const groupMatches = (matches) => {
  const order = [
    { key: 'model', label: 'Models' },
    { key: 'audio', label: 'Audio' },
    { key: 'vision', label: 'Vision' },
    { key: 'image', label: 'Image' },
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

const HuggingFaceAccessPanel = () => {
  const [tokenValue, setTokenValue] = useState('');
  const [maskedToken, setMaskedToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await configApi.getSecrets();
      setMaskedToken(res.secrets?.HF_TOKEN || '');
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load Hugging Face token status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const value = tokenValue.trim();
    if (!value) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await configApi.updateSecret('HF_TOKEN', value);
      setTokenValue('');
      setMessage('Hugging Face token saved.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not save Hugging Face token.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40 midnight:border-gray-800 midnight:bg-gray-900/50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-medium text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-gray-400" />
            Hugging Face token
            {maskedToken && !loading ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                saved {maskedToken}
              </span>
            ) : null}
          </span>
          <input
            type="password"
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            placeholder={maskedToken ? 'Replace saved token' : 'hf_...'}
            className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-600"
          />
        </label>
        <button
          onClick={save}
          disabled={!tokenValue.trim() || saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Save Token
        </button>
      </div>
      {(message || error) && (
        <p className={`mt-2 text-xs ${error ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {error || message}
        </p>
      )}
    </div>
  );
};

const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'model', label: 'Models' },
  { key: 'audio', label: 'Audio' },
  { key: 'vision', label: 'Vision' },
  { key: 'image', label: 'Image' },
  { key: 'provider', label: 'Providers' },
  { key: 'hf', label: 'HuggingFace' },
];

const matchesFilter = (item, filter) => {
  if (filter === 'all') return true;
  if (filter === 'hf') return false; // HF results are separate
  if (filter === 'model') return item.category === 'model';
  if (filter === 'audio') return item.category === 'audio';
  if (filter === 'vision') return item.category === 'vision';
  if (filter === 'image') return item.category === 'image';
  if (filter === 'provider') return item.category === 'provider';
  return true;
};

const matchesHFFilter = (model, filter) => {
  if (filter === 'all' || filter === 'hf') return true;
  if (filter === 'model') {
    const tag = (model.pipeline_tag || '').toLowerCase();
    return ['text-generation', 'image-text-to-text', 'text2text-generation'].some(t => tag.includes(t));
  }
  if (filter === 'vision') {
    const tag = (model.pipeline_tag || '').toLowerCase();
    const tags = (model.tags || []).map(t => t.toLowerCase());
    return tag.includes('vision') || tag.includes('image-to-text') || tags.some(t => t.includes('vision') || t.includes('llava') || t.includes('mmproj'));
  }
  if (filter === 'image') {
    const tag = (model.pipeline_tag || '').toLowerCase();
    const tags = (model.tags || []).map(t => t.toLowerCase());
    return tag.includes('text-to-image') || tag.includes('image-generation') || tags.some(t => t.includes('diffusion') || t.includes('flux') || t.includes('sdxl') || t.includes('stable-diffusion'));
  }
  return false;
};

const ModelDownloadHub = ({
  searchQuery = '',
  downloadedMatches = [],
  onSearchQueryChange,
  onDownloadedSelect,
  onModelRefresh,
  onAudioRefresh,
  onVisualRefresh,
}) => {
  const [activeDownloads, setActiveDownloads] = useState({});
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

  const refreshAfterDownload = useCallback((targetKey) => {
    onModelRefresh?.();
    if (targetKey === 'whisper' || targetKey === 'tts') {
      onAudioRefresh?.();
      window.dispatchEvent(new CustomEvent('asyncat-audio-models-updated'));
      setTimeout(() => {
        onAudioRefresh?.();
        window.dispatchEvent(new CustomEvent('asyncat-audio-models-updated'));
      }, 11000);
    }
    if (targetKey === 'vision' || targetKey === 'image') {
      onVisualRefresh?.();
      window.dispatchEvent(new CustomEvent('asyncat-visual-models-updated'));
      setTimeout(() => {
        onVisualRefresh?.();
        window.dispatchEvent(new CustomEvent('asyncat-visual-models-updated'));
      }, 11000);
    }
  }, [onAudioRefresh, onModelRefresh, onVisualRefresh]);

  const startTrackingDownload = useCallback((downloadId, filename, targetKey = 'model') => {
    const trackingKey = `${targetKey}:${filename}`;
    setActiveDownloads((prev) => ({
      ...prev,
      [trackingKey]: {
        downloadId,
        filename,
        targetKey,
        progress: 0,
        status: 'downloading',
        downloadedFormatted: '0 B',
        totalFormatted: '?',
        speedFormatted: '0 B/s',
        etaFormatted: '--:--',
        _lastBytes: 0,
        _lastTime: Date.now(),
      },
    }));

    const cleanup = localModelsApi.streamDownloadProgress(
      downloadId,
      (data) =>
        setActiveDownloads((prev) => {
          const current = prev[trackingKey] || { _lastBytes: 0, _lastTime: Date.now() };
          const now = Date.now();
          const downloadedNow = data.downloaded || 0;
          let speedFormatted = current.speedFormatted || '0 B/s';
          let etaFormatted = current.etaFormatted || '--:--';
          let _lastBytes = current._lastBytes;
          let _lastTime = current._lastTime;

          if (now - current._lastTime > 800) {
            const bytesDiff = downloadedNow - current._lastBytes;
            const timeDiffSec = (now - current._lastTime) / 1000;
            const speedBps = bytesDiff > 0 ? bytesDiff / timeDiffSec : 0;

            if (speedBps > 0) {
              speedFormatted = formatSpeed(speedBps);
              etaFormatted = data.total && data.total > downloadedNow
                ? formatETA((data.total - downloadedNow) / speedBps)
                : '--:--';
            } else if (bytesDiff === 0 && downloadedNow > 0) {
              speedFormatted = '0 B/s';
              etaFormatted = '--:--';
            }

            _lastBytes = downloadedNow;
            _lastTime = now;
          }

          return {
            ...prev,
            [trackingKey]: {
              ...current,
              ...data,
              downloadId,
              filename,
              targetKey,
              speedFormatted,
              etaFormatted,
              _lastBytes,
              _lastTime,
            },
          };
        }),
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
        if (data.status === 'complete') refreshAfterDownload(targetKey);
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
          const filename = dl.filename || 'download';
          const targetKey = String(dl.subDir || '').includes('audio/tts')
            ? 'tts'
            : String(dl.subDir || '').includes('audio/whisper')
              ? 'whisper'
              : String(dl.subDir || '').includes('vision')
                ? 'vision'
                : String(dl.subDir || '').includes('image')
                  ? 'image'
                  : 'model';
          startTrackingDownload(dl.downloadId, filename, targetKey);
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
    } catch (err) {
      console.error('Download start failed:', err.message || err);
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

  return (
    <Panel className="p-5">
      <SectionHeader
        title="Download Models"
        description="Search HuggingFace once, then save files as local LLM, voice, vision, or image generation assets."
        action={activeEntries.length > 0 ? <Badge color="amber">{activeEntries.length} downloading</Badge> : null}
      />

      {activeEntries.length > 0 && (
        <div className="mt-5 space-y-2">
          {activeEntries.map(([trackingKey, dl]) => {
            const pct = dl.progress || 0;
            const target = TARGETS[dl.targetKey] || TARGETS.model;
            return (
              <div key={trackingKey} className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 midnight:border-gray-800/80 midnight:bg-gray-900">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{target.label}</span>
                    <span className="truncate font-mono text-xs font-medium text-gray-900 dark:text-gray-100">{dl.filename}</span>
                  </div>
                  <button onClick={() => handleCancelDownload(trackingKey)} className="flex-shrink-0 text-gray-400 transition-colors hover:text-red-500" title="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  {dl.status === 'error' ? (
                    <span className="font-medium text-red-500">Download failed</span>
                  ) : (
                    <span>{dl.downloadedFormatted || '0 B'} / {dl.totalFormatted || '?'}</span>
                  )}
                  {dl.status !== 'error' && dl.speedFormatted && dl.etaFormatted && (
                    <span className="opacity-80">{dl.speedFormatted} - {dl.etaFormatted}</span>
                  )}
                  <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{dl.status === 'error' ? 'ERROR' : `${pct}%`}</span>
                </div>
                {dl.status === 'error' ? (
                  <div className="mt-1 text-[11px] text-red-500/90 dark:text-red-400">{dl.error || 'Network request failed'}</div>
                ) : (
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800">
                    <div className="h-full rounded-full bg-gray-700 transition-all duration-300 dark:bg-gray-300 midnight:bg-slate-300" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <HuggingFaceAccessPanel />

      <div className="mt-5">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setActiveFilter(isActive ? 'all' : chip.key)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-sm dark:bg-gray-100 dark:text-gray-900'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search downloads and library... e.g. llama, qwen, whisper.cpp, piper, llava, flux"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-9 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600 dark:focus:ring-gray-600 midnight:border-gray-800/80 midnight:bg-gray-900/50"
          />
          {searchQuery && (
            <button onClick={() => { handleQueryChange(''); setExpandedRepo(null); setActiveFilter('all'); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {searchQuery && activeFilter !== 'hf' && downloadedMatches.filter(m => matchesFilter(m, activeFilter)).length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            {groupMatches(downloadedMatches.filter(m => matchesFilter(m, activeFilter))).map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-800/50">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {group.label}
                  </span>
                  <span className="rounded-full bg-gray-200 px-1.5 py-0 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    {group.items.length}
                  </span>
                </div>
                {group.items.map((item) => {
                  const meta = TYPE_META[item.type] || TYPE_META.model;
                  const Icon = meta.icon;
                  const iconBg = item.isActive ? (meta.activeIconBg || meta.iconBg) : meta.iconBg;
                  const badgeClasses = item.isActive
                    ? `inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${meta.activeBadge || meta.badge}`
                    : `inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`;
                  return (
                    <button
                      key={`${item.type}:${item.id}`}
                      onClick={() => onDownloadedSelect?.(item)}
                      className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-gray-50/60 dark:border-gray-800 dark:hover:bg-gray-800/60"
                    >
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                          <HighlightText text={item.name} query={searchQuery} />
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500">{item.detail}</div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {item.isActive && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                            <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Active</span>
                          </span>
                        )}
                        <span className={badgeClasses}>
                          {meta.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {searching && <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching HuggingFace...</div>}
        {searchError && <p className="mt-2 flex items-center gap-1 text-xs text-red-500 dark:text-red-400"><AlertCircle className="h-3 w-3" /> {searchError}</p>}
        {!searching && results.filter(m => matchesHFFilter(m, activeFilter)).length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-800/50">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                HuggingFace
              </span>
              <span className="rounded-full bg-gray-200 px-1.5 py-0 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                {results.filter(m => matchesHFFilter(m, activeFilter)).length}
              </span>
            </div>
            {results.filter(m => matchesHFFilter(m, activeFilter)).map((model) => {
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
                <div key={repoId} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-gray-500 dark:text-gray-400">{author}</span>
                        <span className="text-gray-300 dark:text-gray-600">/</span>
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                          <HighlightText text={modelName} query={searchQuery} />
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {pipeline && (
                          <span className="inline-flex items-center rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {pipeline}
                          </span>
                        )}
                        {tags.map((tag) => (
                          <span key={tag} className="text-[10px] text-gray-400 dark:text-gray-500">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
                        {downloads && (
                          <span className="flex items-center gap-1">
                            <Download className="h-3 w-3 opacity-70" />
                            {downloads}
                          </span>
                        )}
                        {likes && (
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3 opacity-70" />
                            {likes}
                          </span>
                        )}
                        {updated && (
                          <span>Updated {updated}</span>
                        )}
                        {model.gated && (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <ShieldAlert className="h-3 w-3" />
                            Gated
                          </span>
                        )}
                        {model.private && (
                          <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
                            <Lock className="h-3 w-3" />
                            Private
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedRepo(isExpanded ? null : repoId)}
                      className="mt-0.5 flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-300 midnight:hover:bg-slate-800"
                    >
                      <Download className="h-3 w-3" />
                      {isExpanded ? 'Hide' : 'Select files'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <HFFilePicker repoId={repoId} onSelect={handleHFFilePick} onClose={() => setExpandedRepo(null)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!searching && searchQuery && downloadedMatches.filter(m => matchesFilter(m, activeFilter)).length === 0 && results.filter(m => matchesHFFilter(m, activeFilter)).length === 0 && !searchError && (
          <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-6 dark:border-gray-800 dark:bg-gray-800/20">
            <Search className="h-5 w-5 text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {activeFilter === 'all' ? `No results for "${searchQuery}"` : `No ${FILTER_CHIPS.find(c => c.key === activeFilter)?.label || ''} results for "${searchQuery}"`}
            </p>
            <p className="text-[10px] text-gray-300 dark:text-gray-600">
              {activeFilter === 'all' ? 'Try a broader keyword like "llama", "qwen", or "flux"' : 'Try switching the filter to "All" for broader results'}
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default ModelDownloadHub;
