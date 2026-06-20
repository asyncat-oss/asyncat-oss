// trainingTools.js — Agent tools for fine-tuning / LoRA training
// Exposes training capabilities to the AI agent so it can start, monitor,
// and manage fine-tuning jobs programmatically.

import { PermissionLevel } from './toolRegistry.js';
import {
  startTrainingJob,
  getTrainingJob,
  listTrainingJobs,
  stopTrainingJob,
  getTrainingReadiness,
  startInstallJob,
  getInstallJob,
} from '../../ai/controllers/ai/trainingJobManager.js';

// ── check_finetune_readiness ──────────────────────────────────────────────────

export const checkFinetuneReadinessTool = {
  name: 'check_finetune_readiness',
  description:
    'Check if the system is ready for LoRA fine-tuning. Returns GPU info (vendor, VRAM), training backend (cuda/mlx/cpu), whether the training Python environment is installed, and disk space. Run this before starting any fine-tuning job.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (args, context = {}) => {
    try {
      const readiness = await getTrainingReadiness();
      return { success: true, ...readiness };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── install_training_env ──────────────────────────────────────────────────────

export const installTrainingEnvTool = {
  name: 'install_training_env',
  description:
    'Install the Python training environment (PyTorch, transformers, peft, trl, etc.). This is required before running any fine-tuning job. The installation is GPU-aware: CUDA/ROCm on NVIDIA, mlx-lm on Apple Silicon, CPU fallback otherwise. This creates a SEPARATE venv from the inference engine to avoid conflicts. Takes several minutes.',
  category: 'ai',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      backend: {
        type: 'string',
        enum: ['cuda', 'mlx', 'cpu'],
        description: 'Training backend. Use check_finetune_readiness to determine the best option. Default: auto-detected.',
      },
    },
    required: [],
  },
  execute: async (args, context = {}) => {
    try {
      const readiness = await getTrainingReadiness();
      const backend = args.backend || readiness.backend;
      const job = startInstallJob({ backend });
      return {
        success: true,
        installJobId: job.id,
        backend,
        message: `Training environment installation started (backend: ${backend}). Poll with get_install_job_status to check progress.`,
        tip: 'This will take several minutes. The install runs in the background.',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── start_finetune_job ────────────────────────────────────────────────────────

export const startFinetuneJobTool = {
  name: 'start_finetune_job',
  description:
    'Start a LoRA fine-tuning job. Requires: a base model (HuggingFace model ID like "unsloth/Qwen3-1.7B" or local path), and a dataset (path to a JSONL file, typically from download_dataset_jsonl). The dataset format is auto-detected (Alpaca, ChatML/ShareGPT, or raw text). Training runs in the background — use get_finetune_status to monitor progress.',
  category: 'ai',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A human-readable name for this training run, e.g. "alpaca-qwen-lora".' },
      base_model: { type: 'string', description: 'HuggingFace model ID (e.g. "unsloth/Qwen3-1.7B") or local path to model weights.' },
      dataset_path: { type: 'string', description: 'Absolute path to a JSONL dataset file. Use list_local_datasets to find downloaded datasets.' },
      backend: { type: 'string', enum: ['cuda', 'mlx', 'cpu'], description: 'Training backend. Default: auto-detected from GPU.' },
      epochs: { type: 'number', description: 'Number of training epochs. Default 3.' },
      lr: { type: 'number', description: 'Learning rate. Default 2e-4.' },
      rank: { type: 'number', description: 'LoRA rank (r). Higher = more capacity but more VRAM. Default 16.' },
      alpha: { type: 'number', description: 'LoRA alpha. Usually 2x rank. Default 32.' },
      batch_size: { type: 'number', description: 'Training batch size. Lower = less VRAM. Default 4.' },
      max_seq_len: { type: 'number', description: 'Maximum sequence length. Default 2048.' },
    },
    required: ['name', 'base_model', 'dataset_path'],
  },
  execute: async (args, context = {}) => {
    try {
      const job = startTrainingJob({
        userId: context.userId,
        name: String(args.name),
        baseModel: String(args.base_model),
        datasetPath: String(args.dataset_path),
        backend: args.backend,
        epochs: args.epochs,
        lr: args.lr,
        rank: args.rank,
        alpha: args.alpha,
        batchSize: args.batch_size,
        maxSeqLen: args.max_seq_len,
      });
      return {
        success: true,
        jobId: job.id,
        status: job.status,
        outputDir: job.outputDir,
        message: `Training job "${args.name}" started. Use get_finetune_status with job_id="${job.id}" to monitor progress.`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── get_finetune_status ─────────────────────────────────────────────────────

export const getFinetuneStatusTool = {
  name: 'get_finetune_status',
  description:
    'Get the current status and progress of a fine-tuning job. Returns status (queued/running/completed/failed/cancelled), current step, total steps, loss, and percent complete.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      job_id: { type: 'string', description: 'The training job ID returned by start_finetune_job.' },
    },
    required: ['job_id'],
  },
  execute: async (args, context = {}) => {
    try {
      const job = getTrainingJob(args.job_id, context.userId);
      if (!job) return { success: false, error: 'Training job not found.' };
      return { success: true, ...job };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── list_finetune_jobs ──────────────────────────────────────────────────────

export const listFinetuneJobsTool = {
  name: 'list_finetune_jobs',
  description:
    'List all fine-tuning jobs for the current user. Shows status, model, dataset, and progress for each job.',
  category: 'ai',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max results. Default 20.' },
    },
    required: [],
  },
  execute: async (args, context = {}) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const jobs = listTrainingJobs(context.userId, limit);
      return { success: true, jobs, count: jobs.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── stop_finetune_job ───────────────────────────────────────────────────────

export const stopFinetuneJobTool = {
  name: 'stop_finetune_job',
  description:
    'Stop a running fine-tuning job. The training script saves a checkpoint before exiting so progress is not lost. The saved checkpoint can be found in the job output directory.',
  category: 'ai',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      job_id: { type: 'string', description: 'The training job ID to stop.' },
    },
    required: ['job_id'],
  },
  execute: async (args, context = {}) => {
    try {
      const stopped = stopTrainingJob(args.job_id, context.userId);
      if (!stopped) return { success: false, error: 'Job not found or already stopped.' };
      return {
        success: true,
        message: 'Stop signal sent. The training script will save a checkpoint before exiting.',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── Export ───────────────────────────────────────────────────────────────────

export const trainingTools = [
  checkFinetuneReadinessTool,
  installTrainingEnvTool,
  startFinetuneJobTool,
  getFinetuneStatusTool,
  listFinetuneJobsTool,
  stopFinetuneJobTool,
];

export default trainingTools;
