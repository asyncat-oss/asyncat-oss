// den/src/agent/tools/workflowTools.js
// ─── Workflow Tools ──────────────────────────────────────────────────────────
// Let the agent discover and trigger the user's saved automation workflows
// (e.g. "run my morning briefing"). Running is fire-and-forget — the workflow's
// steps execute in the background as their own agent runs.

import { PermissionLevel } from './toolRegistry.js';
import { listWorkflows, getWorkflow, runWorkflow } from '../WorkflowEngine.js';

export const listWorkflowsTool = {
  name: 'list_workflows',
  description: 'List the user\'s saved automation workflows (name, trigger, step count). Use this to find a workflow to run.',
  category: 'workflow',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args, context) => {
    try {
      const workflows = listWorkflows(context.userId).map(w => ({
        id: w.id,
        name: w.name,
        trigger: w.triggerType,
        schedule: w.schedule || null,
        steps: w.steps.length,
        enabled: w.enabled,
      }));
      return { success: true, count: workflows.length, workflows };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const runWorkflowTool = {
  name: 'run_workflow',
  description: 'Run an automation workflow by id or name. It runs in the background, executing its agent steps in sequence. Call list_workflows first if you do not know the id.',
  category: 'workflow',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Workflow id to run.' },
      name: { type: 'string', description: 'Workflow name to run (used when id is omitted; case-insensitive, partial match allowed).' },
    },
    required: [],
  },
  execute: async (args, context) => {
    try {
      let wf = null;
      if (args.id) wf = getWorkflow(args.id, context.userId);
      if (!wf && args.name) {
        const all = listWorkflows(context.userId);
        const needle = String(args.name).trim().toLowerCase();
        wf = all.find(w => w.name.toLowerCase() === needle)
          || all.find(w => w.name.toLowerCase().includes(needle))
          || null;
      }
      if (!wf) return { success: false, error: `No workflow found matching ${args.id || args.name || '(no id or name provided)'}.` };
      if (!wf.steps.length) return { success: false, error: `Workflow "${wf.name}" has no steps to run.` };

      // Fire-and-forget: the run record is created synchronously inside
      // runWorkflow before its first await, so it shows up immediately in Activity.
      runWorkflow(wf.id, { trigger: 'manual', userId: context.userId })
        .catch(err => console.error('[workflows] agent-triggered run failed:', err.message));

      return {
        success: true,
        started: true,
        workflowId: wf.id,
        name: wf.name,
        steps: wf.steps.length,
        message: `Started workflow "${wf.name}" (${wf.steps.length} step${wf.steps.length === 1 ? '' : 's'}). It runs in the background — results appear on the Activity page.`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const workflowTools = [listWorkflowsTool, runWorkflowTool];
export default workflowTools;
