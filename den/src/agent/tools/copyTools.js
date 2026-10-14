// den/src/agent/tools/copyTools.js
// Copies of the project (a git worktree, or a plain folder copy) to try risky
// changes in, then review and bring back. A copy keeps files apart, not
// programs: its commands run in the command sandbox like any other.
// These were once called sandboxes; the old tool names still work (aliases).

import {
  applySandboxPatch,
  commitSandboxBranch,
  createSandbox,
  createSandboxPatch,
  deleteSandbox,
  getSandboxDiff,
  getSandboxStatus,
  listSandboxJobs,
  listSandboxes,
  runSandboxCommand,
  sandboxRoot,
} from '../SandboxManager.js';
import path from 'path';
import { PermissionLevel } from './toolRegistry.js';
import { isPathInside } from './shared.js';

const RENAMED_KEYS = { sandbox: 'copy', sandboxes: 'copies', sandboxPath: 'copyPath', sandboxId: 'copyId' };

/** A result as the model sees it: copies, never "sandboxes". */
export function forModel(value) {
  if (Array.isArray(value)) return value.map(forModel);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [RENAMED_KEYS[key] || key, forModel(item)]));
}

const idParam = { id: { type: 'string', description: 'Copy id.' } };

export const copyTools = [
  {
    name: 'copy_create',
    description: 'Make a copy of the project to try risky changes or experiments in. Uses a git worktree when possible, so dev servers are not watching the edited files. Review with copy_diff and bring changes back with copy_apply_patch.',
    category: 'workspace',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A short name for the copy.' },
        sourcePath: { type: 'string', description: 'Folder to copy: the active Project folder (the default) or a folder inside it.' },
        strategy: { type: 'string', description: 'auto, worktree, or copy. auto prefers worktree for git repositories.' },
        baseRef: { type: 'string', description: 'Git ref to branch from when using worktree. Defaults to HEAD.' },
      },
    },
    execute: async (args, context) => {
      // A copy's folder is what its commands may read and change in full, so
      // only the project (or a folder inside it) is copied.
      const project = context.workspaceRoot || context.workingDir || null;
      const source = args.sourcePath ? path.resolve(project || process.cwd(), String(args.sourcePath)) : project;
      if (project && !isPathInside(source, project)) {
        return { success: false, error: `copy_create copies the project or a folder inside it, and ${source} is outside it.` };
      }
      return forModel(createSandbox({
        userId: context.userId,
        workspaceId: context.workspaceId,
        name: args.name || 'Copy',
        sourcePath: source,
        strategy: args.strategy || 'auto',
        baseRef: args.baseRef || 'HEAD',
      }));
    },
  },
  {
    name: 'copy_list',
    description: 'List the copies of this workspace.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        includeDeleted: { type: 'boolean', description: 'Include deleted copies.' },
      },
    },
    execute: async (args, context) => forModel({
      success: true,
      root: sandboxRoot(),
      sandboxes: listSandboxes(context.userId, {
        workspaceId: context.workspaceId,
        includeDeleted: args.includeDeleted === true,
      }),
    }),
  },
  {
    name: 'copy_status',
    description: 'Get the status and git summary of a copy.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: { type: 'object', properties: idParam, required: ['id'] },
    execute: async (args, context) => {
      const copy = getSandboxStatus(context.userId, args.id);
      if (!copy) return { success: false, error: 'Copy not found.' };
      return { success: true, copy: forModel(copy) };
    },
  },
  {
    name: 'copy_diff',
    description: 'Review the changed files, or a unified diff, of a copy before bringing changes back.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        filePath: { type: 'string', description: 'Optional relative file path to show a patch for.' },
        includePatch: { type: 'boolean', description: 'Include the full patch. Use carefully for large diffs.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => forModel(getSandboxDiff(context.userId, args.id, {
      filePath: args.filePath || null,
      includePatch: args.includePatch === true,
    })),
  },
  {
    name: 'copy_run_command',
    description: 'Run a command inside a copy and keep its output as a job log. It runs in the command sandbox, with the copy as the folder it may change.',
    category: 'workspace',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        command: { type: 'string', description: 'Shell command to run inside the copy.' },
        cwd: { type: 'string', description: 'Relative directory inside the copy. Defaults to .' },
        kind: { type: 'string', description: 'command, test, or promote.' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds. Max 900000.' },
      },
      required: ['id', 'command'],
    },
    execute: async (args, context) => forModel(await runSandboxCommand(context.userId, args.id, {
      command: args.command,
      cwd: args.cwd || '.',
      kind: args.kind || 'command',
      timeoutMs: args.timeoutMs,
    })),
  },
  {
    name: 'copy_jobs',
    description: 'List the command, test and promote jobs run in a copy.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        limit: { type: 'number', description: 'Maximum jobs to return.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => forModel({
      success: true,
      jobs: listSandboxJobs(context.userId, args.id, { limit: args.limit }),
    }),
  },
  {
    name: 'copy_create_patch',
    description: "Make a unified patch from a copy's changes, for review or use elsewhere.",
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        filePaths: { type: 'array', items: { type: 'string' }, description: 'Optional relative files to include.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => forModel(createSandboxPatch(context.userId, args.id, {
      filePaths: args.filePaths || [],
    })),
  },
  {
    name: 'copy_apply_patch',
    description: "Bring a copy's changes back to the original project after review. Supports dryRun.",
    category: 'workspace',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        filePaths: { type: 'array', items: { type: 'string' }, description: 'Optional relative files to apply.' },
        dryRun: { type: 'boolean', description: 'Only check whether the patch applies cleanly.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => forModel(applySandboxPatch(context.userId, args.id, {
      filePaths: args.filePaths || [],
      dryRun: args.dryRun === true,
    })),
  },
  {
    name: 'copy_commit_branch',
    description: "Commit a copy's changes onto its own branch so it can be pushed or opened as a PR.",
    category: 'workspace',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        message: { type: 'string', description: 'Commit message.' },
        filePaths: { type: 'array', items: { type: 'string' }, description: 'Optional relative files to commit.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => forModel(commitSandboxBranch(context.userId, args.id, {
      message: args.message || 'Asyncat copy changes',
      filePaths: args.filePaths || [],
      agent: true,
    })),
  },
  {
    name: 'copy_delete',
    description: "Delete a copy's folder. This only removes folders under Asyncat's copies folder.",
    category: 'workspace',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        force: { type: 'boolean', description: 'Force cleanup if git worktree removal fails.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => forModel(deleteSandbox(context.userId, args.id, { force: args.force === true })),
  },
  {
    name: 'copy_delegate_task',
    description: 'Run a delegated agent inside an existing copy. Use this for risky implementation work so file edits and commands happen in the copy instead of the live project.',
    category: 'workspace',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        ...idParam,
        task: { type: 'string', description: 'Task for the agent working in the copy.' },
        maxRounds: { type: 'number', description: 'Maximum rounds for that agent. Default is 15.' },
      },
      required: ['id', 'task'],
    },
    execute: async (args, context) => {
      const copy = getSandboxStatus(context.userId, args.id);
      if (!copy || copy.status !== 'ready' || !copy.exists) {
        return { success: false, error: 'That copy is not ready or no longer exists.' };
      }

      const { AgentRuntime } = await import('../AgentRuntime.js');
      const { getAiClientForUser } = await import('../../ai/controllers/ai/clientFactory.js');
      const provider = getAiClientForUser(context.userId);
      const subAgent = new AgentRuntime({
        aiClient: provider.client,
        model: provider.model,
        isLocal: provider.isLocal,
        supportsNativeTools: provider.supportsNativeTools,
        userId: context.userId,
        workspaceId: context.workspaceId,
        workingDir: copy.sandboxPath,
        workspaceRoot: copy.sandboxPath,
        maxRounds: Math.min(Math.max(Number(args.maxRounds) || 15, 1), 30),
        requestPermission: context.requestPermission,
        askUser: context.askUser,
        providerInfo: provider.providerInfo,
        usageContext: { operation: 'copy-agent' },
        ephemeral: context.ephemeral === true,
      });

      const result = await subAgent.run(args.task);
      return {
        success: true,
        copy: forModel(copy),
        answer: result.answer,
        sessionId: result.session?.id || null,
        rounds: result.session?.totalRounds || 0,
      };
    },
  },
];

// The names these tools had before; stored agent and Cat tool lists may
// still use them.
export const copyToolAliases = Object.fromEntries(copyTools.map((tool) => [tool.name.replace(/^copy_/, 'sandbox_'), tool.name]));

export default copyTools;
