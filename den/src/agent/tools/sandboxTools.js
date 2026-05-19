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
import { PermissionLevel } from './toolRegistry.js';

export const sandboxTools = [
  {
    name: 'sandbox_create',
    description: 'Create an isolated workspace copy for risky code changes or experiments. Uses a git worktree when possible so live dev servers are not watching the edited files.',
    category: 'workspace',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-readable sandbox name.' },
        sourcePath: { type: 'string', description: 'Source directory. Defaults to the current workspace root.' },
        strategy: { type: 'string', description: 'auto, worktree, or copy. auto prefers worktree for git repositories.' },
        baseRef: { type: 'string', description: 'Git ref to branch from when using worktree. Defaults to HEAD.' },
      },
    },
    execute: async (args, context) => createSandbox({
      userId: context.userId,
      workspaceId: context.workspaceId,
      name: args.name || 'Sandbox',
      sourcePath: args.sourcePath || context.workspaceRoot || context.workingDir,
      strategy: args.strategy || 'auto',
      baseRef: args.baseRef || 'HEAD',
    }),
  },
  {
    name: 'sandbox_list',
    description: 'List isolated sandboxes for this workspace.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        includeDeleted: { type: 'boolean', description: 'Include deleted sandbox records.' },
      },
    },
    execute: async (args, context) => ({
      success: true,
      root: sandboxRoot(),
      sandboxes: listSandboxes(context.userId, {
        workspaceId: context.workspaceId,
        includeDeleted: args.includeDeleted === true,
      }),
    }),
  },
  {
    name: 'sandbox_status',
    description: 'Get status and git summary for a sandbox.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => {
      const sandbox = getSandboxStatus(context.userId, args.id);
      if (!sandbox) return { success: false, error: 'Sandbox not found.' };
      return { success: true, sandbox };
    },
  },
  {
    name: 'sandbox_diff',
    description: 'Review changed files or a unified diff for a sandbox before promoting changes.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
        filePath: { type: 'string', description: 'Optional relative file path to show a patch for.' },
        includePatch: { type: 'boolean', description: 'Include the full sandbox patch. Use carefully for large diffs.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => getSandboxDiff(context.userId, args.id, {
      filePath: args.filePath || null,
      includePatch: args.includePatch === true,
    }),
  },
  {
    name: 'sandbox_run_command',
    description: 'Run a command inside a sandbox and persist stdout/stderr as a sandbox job log.',
    category: 'workspace',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
        command: { type: 'string', description: 'Shell command to run inside the sandbox.' },
        cwd: { type: 'string', description: 'Relative directory inside the sandbox. Defaults to .' },
        kind: { type: 'string', description: 'command, test, or promote.' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds. Max 900000.' },
      },
      required: ['id', 'command'],
    },
    execute: async (args, context) => runSandboxCommand(context.userId, args.id, {
      command: args.command,
      cwd: args.cwd || '.',
      kind: args.kind || 'command',
      timeoutMs: args.timeoutMs,
    }),
  },
  {
    name: 'sandbox_jobs',
    description: 'List persisted command/test/promote jobs for a sandbox.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
        limit: { type: 'number', description: 'Maximum jobs to return.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => ({
      success: true,
      jobs: listSandboxJobs(context.userId, args.id, { limit: args.limit }),
    }),
  },
  {
    name: 'sandbox_create_patch',
    description: 'Create a unified patch from sandbox changes for review or external use.',
    category: 'workspace',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
        filePaths: { type: 'array', items: { type: 'string' }, description: 'Optional relative files to include.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => createSandboxPatch(context.userId, args.id, {
      filePaths: args.filePaths || [],
    }),
  },
  {
    name: 'sandbox_apply_patch',
    description: 'Apply sandbox changes back to the source workspace after review. Supports dryRun.',
    category: 'workspace',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
        filePaths: { type: 'array', items: { type: 'string' }, description: 'Optional relative files to apply.' },
        dryRun: { type: 'boolean', description: 'Only check whether the patch applies cleanly.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => applySandboxPatch(context.userId, args.id, {
      filePaths: args.filePaths || [],
      dryRun: args.dryRun === true,
    }),
  },
  {
    name: 'sandbox_commit_branch',
    description: 'Commit sandbox changes onto the sandbox branch so it can be pushed or opened as a PR.',
    category: 'workspace',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
        message: { type: 'string', description: 'Commit message.' },
        filePaths: { type: 'array', items: { type: 'string' }, description: 'Optional relative files to commit.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => commitSandboxBranch(context.userId, args.id, {
      message: args.message || 'Asyncat sandbox changes',
      filePaths: args.filePaths || [],
    }),
  },
  {
    name: 'sandbox_delete',
    description: 'Delete an isolated sandbox directory. This only removes paths under the Asyncat sandbox root.',
    category: 'workspace',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
        force: { type: 'boolean', description: 'Force cleanup if git worktree removal fails.' },
      },
      required: ['id'],
    },
    execute: async (args, context) => deleteSandbox(context.userId, args.id, { force: args.force === true }),
  },
  {
    name: 'sandbox_delegate_task',
    description: 'Run a delegated agent inside an existing sandbox. Use this for risky implementation work so file edits and commands happen in the sandbox instead of the live workspace.',
    category: 'workspace',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sandbox id.' },
        task: { type: 'string', description: 'Task for the sandboxed agent.' },
        maxRounds: { type: 'number', description: 'Maximum rounds for the sandboxed agent. Default is 15.' },
      },
      required: ['id', 'task'],
    },
    execute: async (args, context) => {
      const sandbox = getSandboxStatus(context.userId, args.id);
      if (!sandbox || sandbox.status !== 'ready' || !sandbox.exists) {
        return { success: false, error: 'Sandbox is not ready or no longer exists.' };
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
        workingDir: sandbox.sandboxPath,
        workspaceRoot: sandbox.sandboxPath,
        maxRounds: Math.min(Math.max(Number(args.maxRounds) || 15, 1), 30),
        requestPermission: context.requestPermission,
        askUser: context.askUser,
        providerInfo: provider.providerInfo,
        usageContext: { operation: 'sandbox-agent' },
      });

      const result = await subAgent.run(args.task);
      return {
        success: true,
        sandbox,
        answer: result.answer,
        sessionId: result.session?.id || null,
        rounds: result.session?.totalRounds || 0,
      };
    },
  },
];

export default sandboxTools;
