// den/src/ai/routes/scheduledTaskRoutes.js
// Scheduled tasks: list, create, edit, delete, turn on/off, run now, cancel,
// run history. Mounted at /api/agent/scheduled-tasks. See agent/Scheduler.js.

import express from 'express';
import {
  cancelTask, createTask, deleteTask, enabledTaskCount, getTask, listTaskRuns, listTasks, runTaskNow, updateTask,
} from '../../agent/Scheduler.js';
import { describeSchedule, computeNextRun, normalizeSchedule, resolveTimeZone } from '../../agent/scheduleMath.js';
import { parseScheduleText } from '../../agent/scheduleParser.js';

const EDITABLE = ['name', 'prompt', 'schedule', 'timezone', 'enabled', 'projectId', 'profileId', 'providerProfileId', 'allowedTools'];

function pick(body = {}) {
  const out = {};
  for (const key of EDITABLE) if (Object.hasOwn(body, key)) out[key] = body[key];
  return out;
}

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[scheduled-tasks]', err);
  res.status(status).json({ success: false, error: err?.message || 'Something went wrong.' });
}

export function createScheduledTaskRouter({ withWorkspaceContext }) {
  const router = express.Router();

  router.get('/', withWorkspaceContext, (req, res) => {
    try {
      res.json({ success: true, tasks: listTasks(req.user.id), enabledCount: enabledTaskCount() });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/', withWorkspaceContext, (req, res) => {
    try {
      const task = createTask(req.user.id, pick(req.body), { workspaceId: req.workspaceId || null });
      res.status(201).json({ success: true, task });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Read a schedule written in words, for previews: { text, timezone }.
  router.post('/parse-schedule', withWorkspaceContext, (req, res) => {
    try {
      const timezone = resolveTimeZone(req.body?.timezone);
      const parsed = parseScheduleText(req.body?.text, { timezone });
      if (!parsed) return res.status(400).json({ success: false, error: "That isn't a schedule I understand." });
      const schedule = normalizeSchedule(parsed, { timezone });
      res.json({
        success: true,
        schedule,
        scheduleText: describeSchedule(schedule),
        nextRunAt: computeNextRun(schedule, new Date(), timezone)?.toISOString() || null,
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/:id', withWorkspaceContext, (req, res) => {
    const task = getTask(req.user.id, req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Scheduled task not found.' });
    res.json({ success: true, task });
  });

  router.patch('/:id', withWorkspaceContext, (req, res) => {
    try {
      const task = updateTask(req.user.id, req.params.id, pick(req.body));
      if (!task) return res.status(404).json({ success: false, error: 'Scheduled task not found.' });
      res.json({ success: true, task });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/:id', withWorkspaceContext, (req, res) => {
    if (!deleteTask(req.user.id, req.params.id)) {
      return res.status(404).json({ success: false, error: 'Scheduled task not found.' });
    }
    res.json({ success: true });
  });

  // Starts the run and answers at once; the result arrives in the task's chat.
  router.post('/:id/run', withWorkspaceContext, (req, res) => {
    try {
      const run = runTaskNow(req.user.id, req.params.id);
      if (!run) return res.status(404).json({ success: false, error: 'Scheduled task not found.' });
      res.status(202).json({ success: true, run, task: getTask(req.user.id, req.params.id) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/:id/cancel', withWorkspaceContext, (req, res) => {
    const task = getTask(req.user.id, req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Scheduled task not found.' });
    res.json({ success: true, cancelled: cancelTask(req.user.id, req.params.id) });
  });

  router.get('/:id/runs', withWorkspaceContext, (req, res) => {
    const runs = listTaskRuns(req.user.id, req.params.id, Number.parseInt(req.query.limit, 10) || 20);
    if (!runs) return res.status(404).json({ success: false, error: 'Scheduled task not found.' });
    res.json({ success: true, runs });
  });

  return router;
}

export default createScheduledTaskRouter;
