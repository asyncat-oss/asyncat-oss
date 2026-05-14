/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { localModelsApi } from '../Settings/settingApi.js';
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
      const res = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=20&sort=downloads&direction=-1`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(data || []);
    } catch {
      setSearchError('Could not reach HuggingFace. Check your connection.');
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
        const res = await fetch(`https://huggingface.co/api/models/${repoId}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error('Failed to fetch model files');
        const data = await res.json();
        const validFiles = (data.siblings || []).filter(f => targetOptionsForFile(f.rfilename, repoId).length > 0);
        setFiles(validFiles);
      } catch {
        setError('Could not load model files.');
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [repoId]);

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <span className="truncate text-xs font-medium text-gray-600 dark:text-gray-400">{repoId}</span>
        <button onClick={onClose} className="ml-2 flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {loading && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>}
        {error && <p className="px-3 py-2 text-xs text-red-500">{error}</p>}
        {!loading && !error && files.length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400">No downloadable model, voice, vision, or image files found.</p>
        )}
        {files.map((f) => {
          const targets = targetOptionsForFile(f.rfilename, repoId);
          return (
            <div key={f.rfilename} className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
              <div className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-gray-700 dark:text-gray-300">{f.rfilename}</span>
                {f.size && <span className="block text-[10px] text-gray-400 dark:text-gray-500">{formatBytes(f.size)}</span>}
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
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${target.color}`}
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
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [customTarget, setCustomTarget] = useState('model');
  const [customUrlError, setCustomUrlError] = useState('');
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
      setCustomUrlError(err.message || 'Failed to start download');
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

  const handleCustomDownload = async () => {
    setCustomUrlError('');
    const target = TARGETS[customTarget] || TARGETS.model;
    const filename = customFilename.trim();
    if (!customUrl.trim()) return setCustomUrlError('URL is required');
    if (!filename) return setCustomUrlError('Filename is required');
    if (!filenameMatches(filename, target.extensions)) {
      return setCustomUrlError(`${target.label} downloads need ${target.extensions.join(' or ')} files.`);
    }
    try {
      new URL(customUrl);
    } catch {
      return setCustomUrlError('Invalid URL');
    }
    await handleDownload({
      url: customUrl.trim(),
      filename,
      targetKey: customTarget,
      subDir: target.subDir,
    });
    setCustomUrl('');
    setCustomFilename('');
    setShowCustomUrl(false);
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

      <div className="mt-5">
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
            <button onClick={() => { handleQueryChange(''); setExpandedRepo(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {searchQuery && downloadedMatches.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
              Library & Providers
            </div>
            {downloadedMatches.map((item) => {
              const isProvider = item.type === 'provider';
              const target = isProvider ? null : (TARGETS[item.type] || TARGETS.model);
              return (
                <button
                  key={`${item.type}:${item.id}`}
                  onClick={() => onDownloadedSelect?.(item)}
                  className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{item.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500">{item.detail}</div>
                  </div>
                  {isProvider ? (
                    <span className="flex-shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      Provider
                    </span>
                  ) : (
                    <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {target.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {searching && <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching HuggingFace...</div>}
        {searchError && <p className="mt-2 flex items-center gap-1 text-xs text-red-500 dark:text-red-400"><AlertCircle className="h-3 w-3" /> {searchError}</p>}
        {!searching && results.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            {results.map((model, i) => {
              const repoId = model.modelId || model.id;
              const isExpanded = expandedRepo === repoId;
              const downloads = model.downloads ? `${(model.downloads / 1000).toFixed(0)}k downloads` : null;
              return (
                <div key={repoId} className={`border-b border-gray-100 last:border-0 dark:border-gray-800 ${i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/30'}`}>
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{repoId}</div>
                      {downloads && <div className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{downloads}</div>}
                    </div>
                    <button onClick={() => setExpandedRepo(isExpanded ? null : repoId)} className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-300 midnight:hover:bg-slate-800">
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
        {!searching && searchQuery && downloadedMatches.length === 0 && results.length === 0 && !searchError && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">No models found for &quot;{searchQuery}&quot;</p>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80">
        <button
          onClick={() => setShowCustomUrl(v => !v)}
          className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:bg-gray-800/50 dark:text-gray-300 dark:hover:bg-gray-800 midnight:bg-gray-800/50 midnight:hover:bg-gray-800"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Download from URL
          </div>
          {showCustomUrl ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showCustomUrl && (
          <div className="space-y-3 bg-white p-4 dark:bg-gray-800 midnight:bg-gray-900">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(TARGETS).map(([key, target]) => (
                <button
                  key={key}
                  onClick={() => setCustomTarget(key)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    customTarget === key
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {target.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://huggingface.co/.../model.gguf"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-shadow focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:focus:border-gray-600 dark:focus:ring-gray-600"
            />
            <input
              type="text"
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              placeholder="Save as filename"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-shadow focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:focus:border-gray-600 dark:focus:ring-gray-600"
            />
            {customUrlError && <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><AlertCircle className="h-3 w-3" /> {customUrlError}</p>}
            <button onClick={handleCustomDownload} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 midnight:bg-slate-100 midnight:text-slate-900 midnight:hover:bg-slate-200">
              <Download className="h-4 w-4" />
              Start Download
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default ModelDownloadHub;
