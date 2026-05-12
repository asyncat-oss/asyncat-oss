import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, Volume2, Play, Square, Trash2, FolderOpen, Plus, RefreshCw, AlertTriangle, CheckCircle2, Info, Search, Download, X, Loader2, AlertCircle } from 'lucide-react';
import { audioApi, localModelsApi } from '../Settings/settingApi.js';
import { Badge, Panel, SectionHeader } from './modelPageShared.jsx';

const STATUS_COLORS = {
  idle: 'bg-gray-400',
  loading: 'bg-amber-400 animate-pulse',
  ready: 'bg-green-500',
  error: 'bg-red-500',
};

const AudioModelCard = ({ model, isLoaded, isStarting, onStart, onDelete, type }) => {
  const typeLabel = type === 'whisper' ? 'Whisper' : 'Piper';
  const icon = type === 'whisper' ? <Mic className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />;

  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white transition-all duration-200 hover:shadow-sm dark:bg-gray-900 midnight:bg-slate-900
      ${isLoaded ? 'border-gray-400 dark:border-gray-500 midnight:border-slate-600 shadow-sm' : 'border-gray-200 dark:border-gray-700 midnight:border-slate-800/80 hover:border-gray-300 dark:hover:border-gray-600'}`}
    >
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isLoaded ? 'bg-gray-800 text-white dark:bg-gray-700 midnight:bg-slate-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 midnight:bg-slate-800/50 midnight:text-slate-400'}`}>
              {model.isExternal ? <FolderOpen className="w-5 h-5" /> : icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100 truncate capitalize" title={model.name}>
                {model.name || model.filename}
              </h3>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge color="gray">{typeLabel}</Badge>
                {model.isExternal && <Badge color="gray">External</Badge>}
                {model.isMissing && <Badge color="red">Missing</Badge>}
                {model.missingConfig && <Badge color="amber">No .json config</Badge>}
                {model.sizeFormatted && (
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    {model.sizeFormatted}
                  </span>
                )}
              </div>
            </div>
          </div>
          {isLoaded && (
            <span className="flex h-2.5 w-2.5 relative flex-shrink-0 mt-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
          )}
        </div>

        {type === 'whisper' && model.quality && (
          <div className="mt-2 flex gap-2 flex-wrap">
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 font-medium">{model.quality}</span>
            {model.language && <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 font-medium capitalize">{model.language}</span>}
          </div>
        )}
        {type === 'tts' && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {model.qualityLabel && <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 font-medium">{model.qualityLabel}</span>}
            {model.languageName && model.languageName !== 'unknown' && <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 font-medium">{model.languageName}</span>}
          </div>
        )}
        {model.missingConfig && (
          <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 rounded-lg px-2.5 py-1.5 border border-gray-200 dark:border-gray-700">
            <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5 text-amber-500" />
            Requires a matching <code className="text-[10px] bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded font-mono">.onnx.json</code> config file to work.
          </p>
        )}
      </div>

      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-950/50 midnight:bg-slate-950/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
        <button
          onClick={() => onStart(model)}
          disabled={isStarting || isLoaded || model.isMissing || model.missingConfig}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-50
            ${isLoaded
              ? 'bg-green-600 text-white'
              : 'bg-gray-900 hover:bg-gray-800 text-white dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900'}`}
        >
          {isStarting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : isLoaded ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {isStarting ? 'Loading…' : isLoaded ? 'Active' : 'Load'}
        </button>
        <button
          onClick={() => onDelete(model)}
          disabled={isLoaded}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors disabled:opacity-50"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const EngineStatusBanner = ({ type, status, binaryFound, onCheck }) => {
  const label = type === 'whisper' ? 'whisper.cpp' : 'Piper TTS';
  const icon = type === 'whisper' ? <Mic className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />;

  if (binaryFound === false) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm shadow-sm">
        <div className="flex-shrink-0 w-6 h-6 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
          <AlertTriangle className="w-3 h-3 text-amber-500" />
        </div>
        <div className="flex-1">
          <span className="font-medium text-gray-700 dark:text-gray-200">{label} not found.</span>
          <span className="text-gray-500 dark:text-gray-400 ml-1">
            {type === 'whisper'
              ? 'Install whisper.cpp or set WHISPER_BINARY_PATH in den/.env'
              : 'Install piper-tts or set PIPER_BINARY_PATH in den/.env'}
          </span>
        </div>
        <button onClick={onCheck} className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0">Re-check</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status?.status] || STATUS_COLORS.idle}`} />
      <span className="font-medium">{label}</span>
      <span>·</span>
      <span className="capitalize">{status?.status || 'idle'}</span>
      {status?.model && <><span>·</span><span className="text-gray-700 dark:text-gray-300 font-medium">{status.model}</span></>}
    </div>
  );
};

const AddPathForm = ({ type, onAdd }) => {
  const [pathValue, setPathValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    const p = pathValue.trim();
    if (!p) return;
    setAdding(true);
    setError('');
    try {
      const name = p.split(/[\\/]/).pop()?.replace(/\.(bin|gguf|onnx)$/i, '') || 'Audio Model';
      await audioApi.addCustomPath(name, p, type);
      setPathValue('');
      onAdd?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <div className="relative flex-1 group">
          <input
            type="text"
            value={pathValue}
            onChange={(e) => setPathValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={type === 'whisper' ? 'Path to .bin/.gguf whisper model…' : 'Path to .onnx voice model…'}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600 midnight:border-gray-800/80 midnight:bg-gray-900/50"
          />
          <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
        <button
          onClick={handleAdd}
          disabled={!pathValue.trim() || adding}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:text-slate-400 transition-colors"
        >
          {adding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
};

// ── Format helpers ────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

// Uses the HF search API without gguf filter to find audio models
const useHFAudioSearch = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=15&sort=downloads&direction=-1`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data || []);
    } catch {
      setSearchError("Could not reach HuggingFace. Check your connection.");
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
  }, [search]);

  return { query, handleQueryChange, results, searching, searchError, setResults, setQuery };
};

const HFAudioFilePicker = ({ repoId, onSelect, onClose }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const res = await fetch(`https://huggingface.co/api/models/${repoId}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Failed to fetch model files");
        const data = await res.json();
        const validFiles = (data.siblings || []).filter(
          (f) => f.rfilename.endsWith(".bin") || f.rfilename.endsWith(".gguf") || f.rfilename.endsWith(".onnx") || f.rfilename.endsWith(".json")
        );
        setFiles(validFiles);
      } catch {
        setError("Could not load model files.");
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, [repoId]);

  return (
    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">
          {repoId}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2 flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>}
        {error && <p className="text-xs text-red-500 px-3 py-2">{error}</p>}
        {!loading && !error && files.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">No .bin, .gguf, .onnx, or .json files found.</p>}
        {files.map((f) => (
          <div key={f.rfilename} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
             <div className="min-w-0 flex-1">
               <span className="text-xs text-gray-700 dark:text-gray-300 truncate font-mono block">
                 {f.rfilename}
               </span>
               {f.size && <span className="text-[10px] text-gray-400 dark:text-gray-500 block">{formatBytes(f.size)}</span>}
             </div>
             <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
               {(!f.rfilename.endsWith('.onnx') && !f.rfilename.endsWith('.json')) && (
                 <button onClick={() => onSelect({ url: `https://huggingface.co/${repoId}/resolve/main/${f.rfilename}`, filename: f.rfilename, subDir: 'audio/whisper' })} className="px-2 py-1 bg-violet-50 text-violet-600 hover:bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400 dark:hover:bg-violet-900/50 rounded text-[10px] font-medium transition-colors">
                   STT
                 </button>
               )}
               {(!f.rfilename.endsWith('.bin') && !f.rfilename.endsWith('.gguf')) && (
                 <button onClick={() => onSelect({ url: `https://huggingface.co/${repoId}/resolve/main/${f.rfilename}`, filename: f.rfilename, subDir: 'audio/tts' })} className="px-2 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 rounded text-[10px] font-medium transition-colors">
                   TTS
                 </button>
               )}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const AudioModelsSection = ({ searchQuery = '' }) => {
  const [whisperModels, setWhisperModels] = useState([]);
  const [ttsModels, setTtsModels] = useState([]);
  const [whisperStatus, setWhisperStatus] = useState({ status: 'idle' });
  const [ttsStatus, setTtsStatus] = useState({ status: 'idle' });
  const [whisperBinary, setWhisperBinary] = useState(null);
  const [ttsBinary, setTtsBinary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startingModel, setStartingModel] = useState(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, wStatus, tStatus] = await Promise.all([
        audioApi.listModels(),
        audioApi.whisper.getStatus().catch(() => ({ status: 'idle' })),
        audioApi.tts.getStatus().catch(() => ({ status: 'idle' })),
      ]);
      setWhisperModels(modelsRes.whisper || []);
      setTtsModels(modelsRes.tts || []);
      setWhisperStatus(wStatus);
      setTtsStatus(tStatus);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkBinaries = useCallback(async () => {
    const [w, t] = await Promise.all([
      audioApi.whisper.checkBinary().catch(() => ({ found: false })),
      audioApi.tts.checkBinary().catch(() => ({ found: false })),
    ]);
    setWhisperBinary(w.found);
    setTtsBinary(t.found);
  }, []);

  useEffect(() => {
    loadData();
    checkBinaries();
  }, [loadData, checkBinaries]);

  const handleWhisperStart = async (model) => {
    setStartingModel(model.path || model.filename);
    setError('');
    try {
      await audioApi.whisper.start(model.path);
      const cleanup = audioApi.whisper.pollStatus(
        (snap) => setWhisperStatus(snap),
        (snap) => { setWhisperStatus(snap); setStartingModel(null); },
        (snap) => { setWhisperStatus(snap); setStartingModel(null); setError(snap?.error || 'Failed to start Whisper'); }
      );
      // Auto-cleanup after 2 min
      setTimeout(() => cleanup(), 120000);
    } catch (err) {
      setStartingModel(null);
      setError(err.message);
    }
  };

  const handleWhisperStop = async () => {
    try {
      await audioApi.whisper.stop();
      setWhisperStatus({ status: 'idle' });
    } catch (err) { setError(err.message); }
  };

  const handleTtsStart = async (model) => {
    setStartingModel(model.path || model.filename);
    setError('');
    try {
      const res = await audioApi.tts.start(model.path);
      setTtsStatus(res);
      setStartingModel(null);
    } catch (err) {
      setStartingModel(null);
      setError(err.message);
    }
  };

  const handleTtsStop = async () => {
    try {
      await audioApi.tts.stop();
      setTtsStatus({ status: 'idle' });
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (model) => {
    try {
      await audioApi.deleteModel(model.id, model.isExternal ? undefined : model.type);
      loadData();
    } catch (err) { setError(err.message); }
  };

  const totalModels = whisperModels.length + ttsModels.length;
  const whisperReady = whisperStatus?.status === 'ready';
  const ttsReady = ttsStatus?.status === 'ready';

  const q = searchQuery.toLowerCase();
  const filteredWhisper = q ? whisperModels.filter(m => (m.name || m.filename || '').toLowerCase().includes(q)) : whisperModels;
  const filteredTts = q ? ttsModels.filter(m => (m.name || m.filename || '').toLowerCase().includes(q)) : ttsModels;

  const { query, handleQueryChange, results, searching, searchError, setResults, setQuery } = useHFAudioSearch();
  const [expandedRepo, setExpandedRepo] = useState(null);
  const [downloadingUrl, setDownloadingUrl] = useState(null);

  const handleDownload = async ({ url, filename, subDir }) => {
    setDownloadingUrl(url);
    try {
      await localModelsApi.startDownload(url, filename, subDir);
      // Wait a moment then refresh
      setTimeout(() => loadData(), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingUrl(null);
      setQuery("");
      setResults([]);
      setExpandedRepo(null);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Audio Models"
        description="Local speech-to-text (Whisper) and text-to-speech (Piper) models"
        action={
          <div className="flex items-center gap-2">
            {(whisperReady || ttsReady) && <Badge color="green">{[whisperReady && 'STT', ttsReady && 'TTS'].filter(Boolean).join(' + ')} Active</Badge>}
            {totalModels > 0 && <Badge color="gray">{totalModels} Model{totalModels !== 1 ? 's' : ''}</Badge>}
            <button onClick={loadData} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 midnight:border-slate-800 midnight:bg-slate-900 midnight:text-slate-400 transition-colors">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        }
      />

      {/* HuggingFace Search */}
      <Panel className="p-5 mt-5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Download from HuggingFace
          </h3>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search audio models… e.g. ggerganov/whisper.cpp, rhasspy/piper-voices"
            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-lg bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 transition-shadow"
          />
          {query && (
            <button onClick={() => { handleQueryChange(""); setExpandedRepo(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {searching && <div className="flex items-center gap-2 mt-3 text-xs text-gray-400 dark:text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Searching…</div>}
        {searchError && <p className="mt-2 text-xs text-red-500 dark:text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {searchError}</p>}
        
        {!searching && results.length > 0 && (
          <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {results.map((model, i) => {
              const repoId = model.modelId || model.id;
              const isExpanded = expandedRepo === repoId;
              const downloads = model.downloads ? `${(model.downloads / 1000).toFixed(0)}k downloads` : null;
              return (
                <div key={repoId} className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${i % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-gray-800/30"}`}>
                  <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{repoId}</div>
                      {downloads && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{downloads}</div>}
                    </div>
                    <button onClick={() => setExpandedRepo(isExpanded ? null : repoId)} className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                      <Download className="w-3 h-3" /> {isExpanded ? "Hide" : "Select files"}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <HFAudioFilePicker repoId={repoId} onSelect={handleDownload} onClose={() => setExpandedRepo(null)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!searching && query && results.length === 0 && !searchError && <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">No models found for "{query}"</p>}
        {downloadingUrl && (
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Download started. Check the active downloads list in the Library tab for progress.
          </div>
        )}
      </Panel>

      {error && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-xs shadow-sm">
          <div className="flex-shrink-0 w-5 h-5 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
            <AlertTriangle className="w-3 h-3 text-red-500" />
          </div>
          <span className="flex-1 text-gray-700 dark:text-gray-200">{error}</span>
          <button onClick={() => setError('')} className="hover:opacity-70 text-xs font-medium text-gray-400">✕</button>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Speech-to-Text (Whisper) ─────────────── */}
        <Panel className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 midnight:border-slate-700 midnight:bg-slate-800 midnight:text-slate-400">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Speech-to-Text</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Whisper · Transcribe audio to text</p>
              </div>
            </div>
            {whisperReady && (
              <button onClick={handleWhisperStop} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                <Square className="w-3 h-3 fill-current" /> Stop
              </button>
            )}
          </div>

          <EngineStatusBanner type="whisper" status={whisperStatus} binaryFound={whisperBinary} onCheck={checkBinaries} />

          {loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800/50" />)}
            </div>
          ) : filteredWhisper.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white/70 dark:border-gray-800 dark:bg-gray-900/50 px-4 py-8">
              <Mic className="w-6 h-6 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                No Whisper models found.<br />
                <span className="text-gray-400 dark:text-gray-500">Download a <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">.bin</code> model from <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">ggerganov/whisper.cpp</code> on HuggingFace.<br />Use the search above or place files in <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">data/models/audio/whisper/</code></span>
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {filteredWhisper.map(m => (
                <AudioModelCard
                  key={m.id}
                  model={m}
                  type="whisper"
                  isLoaded={whisperReady && whisperStatus?.model === m.filename?.replace(/\.(bin|gguf)$/i, '')}
                  isStarting={startingModel === (m.path || m.filename)}
                  onStart={handleWhisperStart}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
          <AddPathForm type="whisper" onAdd={loadData} />
        </Panel>

        {/* ── Text-to-Speech (Piper TTS) ─────────────── */}
        <Panel className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 midnight:border-slate-700 midnight:bg-slate-800 midnight:text-slate-400">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Text-to-Speech</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Piper · Generate speech from text</p>
              </div>
            </div>
            {ttsReady && (
              <button onClick={handleTtsStop} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors">
                <Square className="w-3 h-3 fill-current" /> Stop
              </button>
            )}
          </div>

          <EngineStatusBanner type="tts" status={ttsStatus} binaryFound={ttsBinary} onCheck={checkBinaries} />

          {loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800/50" />)}
            </div>
          ) : filteredTts.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white/70 dark:border-gray-800 dark:bg-gray-900/50 px-4 py-8">
              <Volume2 className="w-6 h-6 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                No voice models found.<br />
                <span className="text-gray-400 dark:text-gray-500">Piper needs <strong>both</strong> a <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">.onnx</code> model and its <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">.onnx.json</code> config file.<br />Search for <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">rhasspy/piper-voices</code> above and download both files to <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">data/models/audio/tts/</code></span>
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {filteredTts.map(m => (
                <AudioModelCard
                  key={m.id}
                  model={m}
                  type="tts"
                  isLoaded={ttsReady && ttsStatus?.model === m.filename?.replace(/\.onnx$/i, '')}
                  isStarting={startingModel === (m.path || m.filename)}
                  onStart={handleTtsStart}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
          <AddPathForm type="tts" onAdd={loadData} />
        </Panel>
      </div>

      {/* Info banner */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 midnight:bg-slate-900 shadow-sm px-4 py-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center mt-0.5">
          <Info className="w-3 h-3 text-gray-400 dark:text-gray-500" />
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed space-y-1.5">
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-200">Agent tools:</span>{' '}
            When models are loaded, your agent can use <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">transcribe_audio</code> and{' '}
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">speak_text</code> tools automatically.
          </div>
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-200">Whisper STT:</span>{' '}
            Needs a single <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">.bin</code> file (e.g. <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">ggml-base.en.bin</code>).
          </div>
          <div>
            <span className="font-medium text-gray-700 dark:text-gray-200">Piper TTS:</span>{' '}
            Needs <strong>two files</strong> — the <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">.onnx</code> voice model <strong>and</strong> its matching <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[11px]">.onnx.json</code> config. Download both to the same folder.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioModelsSection;
