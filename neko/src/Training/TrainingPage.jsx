// Training/TrainingPage.jsx — Fine-tuning / LoRA training page
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GraduationCap, Cpu, HardDrive, Zap, AlertTriangle, CheckCircle2,
  Play, Square, Trash2, RefreshCw, ChevronDown, ChevronUp,
  Download, Loader2, Info, XCircle, Settings2, Brain,
} from 'lucide-react';
import { trainingApi } from './trainingApi.js';

// ── Status badge ────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const styles = {
    queued: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.queued}`}>
      {status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'failed' && <XCircle className="w-3 h-3" />}
      {status}
    </span>
  );
};

// ── Progress bar ────────────────────────────────────────────────────────────

const ProgressBar = ({ percent = 0, loss = null }) => (
  <div className="w-full">
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="text-gray-500 dark:text-gray-400">{percent.toFixed(1)}%</span>
      {loss !== null && (
        <span className="text-gray-500 dark:text-gray-400">Loss: {loss.toFixed(4)}</span>
      )}
    </div>
    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800/60 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  </div>
);

// ── Readiness banner ────────────────────────────────────────────────────────

const ReadinessBanner = ({ readiness, onInstall, installing, onRemove }) => {
  if (!readiness) return null;

  return (
    <div className="rounded-xl border border-gray-200/60 dark:border-white/[0.06] midnight:border-white/[0.04] p-5">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 flex items-center justify-center">
          <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white mb-2">
            Training Environment
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* GPU */}
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">
                {readiness.gpu
                  ? `${readiness.gpu.name || readiness.gpu.vendor}${readiness.gpu.vramGb ? ` (${readiness.gpu.vramGb}GB)` : ''}`
                  : 'No GPU detected (CPU only)'}
              </span>
            </div>
            {/* Backend */}
            <div className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">
                Backend: <span className="font-medium">{readiness.backend.toUpperCase()}</span>
              </span>
            </div>
            {/* Disk */}
            <div className="flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">
                {readiness.disk?.freeGb != null ? `${readiness.disk.freeGb}GB free` : 'Disk: unknown'}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {readiness.warnings?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {readiness.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Install / Status */}
          <div className="mt-3 flex items-center gap-3">
            {readiness.envReady ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Training environment ready</span>
                </div>
                <button
                  onClick={onRemove}
                  className="text-xs font-medium text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Uninstall training environment"
                >
                  (Remove Environment)
                </button>
              </div>
            ) : (
              <button
                onClick={onInstall}
                disabled={installing || !readiness.canInstall}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-indigo-600 text-white hover:bg-indigo-700
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-150"
              >
                {installing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Installing…
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Install Training Environment
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── New Job Form ────────────────────────────────────────────────────────────

const DEFAULT_HYPERPARAMS = {
  epochs: 3,
  lr: 0.0002,
  rank: 16,
  alpha: 32,
  batchSize: 4,
  maxSeqLen: 2048,
};

const NewJobForm = ({ readiness, onSubmit, submitting }) => {
  const [name, setName] = useState('');
  const [baseModel, setBaseModel] = useState('');
  const [datasetPath, setDatasetPath] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hyper, setHyper] = useState(DEFAULT_HYPERPARAMS);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !baseModel.trim() || !datasetPath.trim()) return;
    onSubmit({
      name: name.trim(),
      baseModel: baseModel.trim(),
      datasetPath: datasetPath.trim(),
      backend: readiness?.backend || 'cpu',
      ...hyper,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200/60 dark:border-white/[0.06] midnight:border-white/[0.04] p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white mb-4 flex items-center gap-2">
        <Play className="w-4 h-4 text-indigo-500" />
        New Training Job
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Job Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. alpaca-qwen-lora"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700
              bg-white dark:bg-gray-900 midnight:bg-gray-900
              text-gray-900 dark:text-white midnight:text-white
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Base Model</label>
          <input
            type="text"
            value={baseModel}
            onChange={(e) => setBaseModel(e.target.value)}
            placeholder="e.g. unsloth/Qwen3-1.7B"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700
              bg-white dark:bg-gray-900 midnight:bg-gray-900
              text-gray-900 dark:text-white midnight:text-white
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            required
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Dataset Path (JSONL)</label>
        <input
          type="text"
          value={datasetPath}
          onChange={(e) => setDatasetPath(e.target.value)}
          placeholder="e.g. ~/.asyncat/datasets/alpaca-train-alpaca.jsonl"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700
            bg-white dark:bg-gray-900 midnight:bg-gray-900
            text-gray-900 dark:text-white midnight:text-white
            placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          required
        />
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          Download datasets using the agent: "download alpaca dataset for fine-tuning"
        </p>
      </div>

      {/* Advanced settings toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-2 transition-colors"
      >
        <Settings2 className="w-3.5 h-3.5" />
        Hyperparameters
        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 midnight:bg-gray-800/30">
          {[
            { key: 'epochs', label: 'Epochs', type: 'number', min: 1, max: 50 },
            { key: 'lr', label: 'Learning Rate', type: 'number', step: '0.0001' },
            { key: 'rank', label: 'LoRA Rank', type: 'number', min: 4, max: 256 },
            { key: 'alpha', label: 'LoRA Alpha', type: 'number', min: 4, max: 512 },
            { key: 'batchSize', label: 'Batch Size', type: 'number', min: 1, max: 64 },
            { key: 'maxSeqLen', label: 'Max Seq Length', type: 'number', min: 128, max: 8192 },
          ].map(({ key, label, ...props }) => (
            <div key={key}>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{label}</label>
              <input
                {...props}
                value={hyper[key]}
                onChange={(e) => setHyper({ ...hyper, [key]: key === 'lr' ? parseFloat(e.target.value) : parseInt(e.target.value) })}
                className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                  focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
            </div>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !readiness?.canTrain || !name.trim() || !baseModel.trim() || !datasetPath.trim()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
          bg-indigo-600 text-white hover:bg-indigo-700
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-150"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Starting…
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Start Training
          </>
        )}
      </button>
    </form>
  );
};

// ── Job Card ────────────────────────────────────────────────────────────────

const JobCard = ({ job, onStop, onDelete, onRefresh }) => {
  const progress = job.progress || {};
  const isActive = job.status === 'running' || job.status === 'queued';

  return (
    <div className="rounded-xl border border-gray-200/60 dark:border-white/[0.06] midnight:border-white/[0.04] p-4 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white truncate">
              {job.name}
            </h4>
            <StatusBadge status={job.status} />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
            <span title="Base model">{job.baseModel}</span>
            <span>•</span>
            <span title="Backend">{job.backend?.toUpperCase()}</span>
            {job.hyperparams?.rank && (
              <>
                <span>•</span>
                <span>r={job.hyperparams.rank}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive && (
            <button
              onClick={() => onStop(job.id)}
              title="Stop training"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          {!isActive && (
            <button
              onClick={() => onDelete(job.id)}
              title="Delete job"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {isActive && progress.percent != null && (
        <div className="mt-2">
          <ProgressBar percent={progress.percent || 0} loss={progress.loss} />
          {progress.step != null && progress.totalSteps != null && (
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              <span>Step {progress.step} / {progress.totalSteps}</span>
              {progress.epoch != null && <span>Epoch {progress.epoch}</span>}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {job.status === 'failed' && job.error && (
        <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/10">
          <p className="text-xs text-red-600 dark:text-red-400 break-words">{job.error}</p>
        </div>
      )}

      {/* Completed output */}
      {job.status === 'completed' && job.outputDir && (
        <div className="mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/10 midnight:bg-green-900/10">
          <p className="text-xs text-green-600 dark:text-green-400">
            ✓ Adapter saved to: <code className="text-[10px] bg-green-100 dark:bg-green-900/30 px-1 rounded">{job.outputDir}</code>
          </p>
        </div>
      )}

      {/* Timestamps */}
      <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
        Created {new Date(job.createdAt).toLocaleString()}
        {job.completedAt && ` • Finished ${new Date(job.completedAt).toLocaleString()}`}
      </div>
    </div>
  );
};

// ── Main Page ───────────────────────────────────────────────────────────────

const TrainingPage = () => {
  const [readiness, setReadiness] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const pollCleanups = useRef([]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [readinessData, jobsData] = await Promise.all([
        trainingApi.getReadiness(),
        trainingApi.listJobs(),
      ]);
      setReadiness(readinessData);
      setJobs(jobsData.jobs || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Poll active jobs
    const interval = setInterval(() => {
      trainingApi.listJobs().then((data) => {
        setJobs(data.jobs || []);
      }).catch(() => {});
    }, 5000);
    return () => {
      clearInterval(interval);
      pollCleanups.current.forEach(fn => fn());
    };
  }, [loadData]);

  // ── Install handler ───────────────────────────────────────────────────────
  const handleInstall = async () => {
    setInstalling(true);
    setInstallProgress(null);
    try {
      const { job } = await trainingApi.startInstall(readiness?.backend || 'cpu');
      const cleanup = trainingApi.pollInstallJob(
        job.id,
        (j) => setInstallProgress(j),
        () => {
          setInstalling(false);
          setInstallProgress(null);
          loadData(); // Refresh readiness
        },
        (j) => {
          setInstalling(false);
          setError(j?.error || 'Installation failed');
          setInstallProgress(null);
        },
      );
      pollCleanups.current.push(cleanup);
    } catch (err) {
      setInstalling(false);
      setError(err.message);
    }
  };

  // ── Remove handler ────────────────────────────────────────────────────────
  const handleRemove = async () => {
    if (!window.confirm('Are you sure you want to remove the training virtual environment? This will delete the venv directory.')) {
      return;
    }
    setLoading(true);
    try {
      await trainingApi.removeEnv();
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Start job ─────────────────────────────────────────────────────────────
  const handleStartJob = async (jobConfig) => {
    setSubmitting(true);
    try {
      await trainingApi.createJob(jobConfig);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Stop job ──────────────────────────────────────────────────────────────
  const handleStopJob = async (id) => {
    try {
      await trainingApi.stopJob(id);
      setTimeout(loadData, 1000);
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Delete job ────────────────────────────────────────────────────────────
  const handleDeleteJob = async (id) => {
    try {
      await trainingApi.deleteJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading training environment…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-white">
                  Training
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Fine-tune LLMs with LoRA adapters
                </p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Install progress */}
        {installing && installProgress && (
          <div className="mb-4 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/30">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
                {installProgress.message || 'Installing…'}
              </span>
            </div>
            <ProgressBar percent={installProgress.percent || 0} />
          </div>
        )}

        <div className="space-y-4">
          {/* Readiness */}
          <ReadinessBanner
            readiness={readiness}
            onInstall={handleInstall}
            installing={installing}
            onRemove={handleRemove}
          />

          {/* New job form — only show when environment is ready */}
          {readiness?.canTrain && (
            <NewJobForm
              readiness={readiness}
              onSubmit={handleStartJob}
              submitting={submitting}
            />
          )}

          {/* Info when env not ready */}
          {readiness && !readiness.envReady && !installing && (
            <div className="rounded-xl border border-gray-200/60 dark:border-white/[0.06] p-5 text-center">
              <Info className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Install the training environment to get started with fine-tuning.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Or ask the agent: "set up fine-tuning environment"
              </p>
            </div>
          )}

          {/* Jobs list */}
          {jobs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white mb-3 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-gray-400" />
                Training Jobs
                <span className="text-xs font-normal text-gray-400">({jobs.length})</span>
              </h3>
              <div className="space-y-3">
                {jobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onStop={handleStopJob}
                    onDelete={handleDeleteJob}
                    onRefresh={loadData}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {jobs.length === 0 && readiness?.canTrain && (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 midnight:border-gray-700 p-8 text-center">
              <GraduationCap className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No training jobs yet
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Create a job above, or ask the agent to start fine-tuning.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingPage;
