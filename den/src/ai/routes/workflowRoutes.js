// den/src/ai/routes/workflowRoutes.js
// CRUD + run + run-history for automation workflows. Mounted under /api/agent.

import express from 'express';
import {
  listWorkflows, getWorkflow, createWorkflow, updateWorkflow,
  deleteWorkflow, runWorkflow, listWorkflowRuns, listRecentRuns,
} from '../../agent/WorkflowEngine.js';

export function createWorkflowRouter({ authenticate }) {
  const router = express.Router();

  router.get('/', authenticate, (req, res) => {
    try {
      res.json({ success: true, workflows: listWorkflows(req.user.id) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/', authenticate, (req, res) => {
    try {
      const workflow = createWorkflow({ userId: req.user.id, workspaceId: req.workspaceId || null, ...req.body });
      res.status(201).json({ success: true, workflow });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Recent runs across all workflows (activity center). Registered before /:id
  // so the literal path is matched first.
  router.get('/runs/recent', authenticate, (req, res) => {
    try {
      const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 30));
      res.json({ success: true, runs: listRecentRuns(req.user.id, limit) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/:id', authenticate, (req, res) => {
    const workflow = getWorkflow(req.params.id, req.user.id);
    if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });
    res.json({ success: true, workflow });
  });

  router.put('/:id', authenticate, (req, res) => {
    try {
      res.json({ success: true, workflow: updateWorkflow(req.params.id, req.user.id, req.body) });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ success: false, error: err.message });
    }
  });

  router.delete('/:id', authenticate, (req, res) => {
    const ok = deleteWorkflow(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Workflow not found' });
    res.json({ success: true });
  });

  // Fire-and-forget: the run record is created synchronously inside runWorkflow
  // before the first await, so the client can poll /:id/runs immediately.
  router.post('/:id/run', authenticate, (req, res) => {
    try {
      const workflow = getWorkflow(req.params.id, req.user.id);
      if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });
      runWorkflow(req.params.id, { trigger: 'manual', userId: req.user.id })
        .catch(err => console.error('[workflows] manual run failed:', err.message));
      res.json({ success: true, started: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/:id/runs', authenticate, (req, res) => {
    try {
      res.json({ success: true, runs: listWorkflowRuns(req.params.id, req.user.id, 20) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export default createWorkflowRouter;
