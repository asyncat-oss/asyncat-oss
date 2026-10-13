// den/src/cats/catRoutes.js
// /api/cats: Cats (list, create, change, delete, wake, stop), their runs and
// timeline, the inbox (answer approvals and questions, mark results read)
// and feedback on runs. See catEngine.js.

import express from 'express';
import {
  cancelCat, checkTriggerNow, createCat, deleteCat, getCat, listCatRuns, listCats, updateCat, wakeCatNow,
} from './catEngine.js';
import { defaultWorkspaceId, enabledCatCount } from './catStore.js';
import {
  answerInboxItem, dismissInboxItem, inboxCounts, listInbox, listTimeline, markAllRead, recordRunFeedback,
} from './catInbox.js';
import { computeNextRun, describeSchedule, normalizeSchedule, resolveTimeZone } from '../agent/scheduleMath.js';
import { parseScheduleText } from '../agent/scheduleParser.js';

const EDITABLE = [
  'name', 'avatar', 'mission', 'profileId', 'providerProfileId', 'projectId', 'folderMode', 'folder', 'freedom',
  'limits', 'allowedSites', 'allowedTools', 'connectors', 'approvalTimeoutMinutes', 'timezone', 'enabled', 'triggers',
];

function pick(body = {}) {
  const out = {};
  for (const key of EDITABLE) if (Object.hasOwn(body, key)) out[key] = body[key];
  return out;
}

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[cats]', err);
  res.status(status).json({ success: false, error: err?.message || 'Something went wrong.' });
}

function workspaceOf(req) {
  return req.query?.workspaceId || req.body?.workspaceId || defaultWorkspaceId(req.user.id);
}

const router = express.Router();

router.get('/', (req, res) => {
  try {
    res.json({ success: true, cats: listCats(req.user.id), inbox: inboxCounts(req.user.id), enabledCount: enabledCatCount() });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/', async (req, res) => {
  try {
    const cat = await createCat(req.user.id, pick(req.body), { workspaceId: workspaceOf(req) });
    res.status(201).json({ success: true, cat });
  } catch (err) {
    sendError(res, err);
  }
});

// Read a schedule written in words, for previews: { text, timezone }.
router.post('/parse-schedule', (req, res) => {
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
    sendError(res, { status: 400, message: err.message });
  }
});

// ── Inbox ─────────────────────────────────────────────────────────────────────

router.get('/inbox', (req, res) => {
  try {
    const kinds = req.query.kind ? String(req.query.kind).split(',').filter(Boolean) : null;
    res.json({
      success: true,
      items: listInbox(req.user.id, {
        status: req.query.status || 'open',
        catId: req.query.catId || null,
        kinds,
        limit: req.query.limit,
      }),
      counts: inboxCounts(req.user.id),
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/inbox/read-all', (req, res) => {
  try {
    const done = markAllRead(req.user.id, { catId: req.body?.catId || null });
    res.json({ success: true, done, counts: inboxCounts(req.user.id) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/inbox/:itemId/answer', (req, res) => {
  try {
    res.json({ success: true, item: answerInboxItem(req.user.id, req.params.itemId, req.body || {}) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/inbox/:itemId/dismiss', (req, res) => {
  try {
    res.json({ success: true, item: dismissInboxItem(req.user.id, req.params.itemId) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/runs/:runId/feedback', (req, res) => {
  try {
    res.json({ success: true, feedback: recordRunFeedback(req.user.id, req.params.runId, req.body || {}) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── One Cat ───────────────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  const cat = getCat(req.user.id, req.params.id);
  if (!cat) return res.status(404).json({ success: false, error: 'That Cat was not found.' });
  res.json({ success: true, cat });
});

router.patch('/:id', (req, res) => {
  try {
    const cat = updateCat(req.user.id, req.params.id, pick(req.body));
    if (!cat) return res.status(404).json({ success: false, error: 'That Cat was not found.' });
    res.json({ success: true, cat });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/:id', (req, res) => {
  try {
    if (!deleteCat(req.user.id, req.params.id)) return res.status(404).json({ success: false, error: 'That Cat was not found.' });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Wake it now: { message } writes to it in its chat; without, Run now.
router.post('/:id/wake', async (req, res) => {
  try {
    const result = await wakeCatNow(req.user.id, req.params.id, { message: req.body?.message ?? null });
    if (!result) return res.status(404).json({ success: false, error: 'That Cat was not found.' });
    res.status(202).json({ success: true, ...result, cat: getCat(req.user.id, req.params.id) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    if (!cancelCat(req.user.id, req.params.id)) {
      return res.status(409).json({ success: false, error: "It isn't working right now." });
    }
    res.json({ success: true, cat: getCat(req.user.id, req.params.id) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id/runs', (req, res) => {
  const runs = listCatRuns(req.user.id, req.params.id, req.query.limit);
  if (!runs) return res.status(404).json({ success: false, error: 'That Cat was not found.' });
  res.json({ success: true, runs });
});

router.get('/:id/timeline', (req, res) => {
  if (!getCat(req.user.id, req.params.id)) return res.status(404).json({ success: false, error: 'That Cat was not found.' });
  res.json({
    success: true,
    events: listTimeline(req.params.id, { limit: req.query.limit, before: req.query.before || null, runId: req.query.runId || null }),
  });
});

router.post('/:id/chat', async (req, res) => {
  try {
    const cat = getCat(req.user.id, req.params.id);
    if (!cat) return res.status(404).json({ success: false, error: 'That Cat was not found.' });
    const { ensureCatChat } = await import('./catChat.js');
    res.json({ success: true, conversationId: await ensureCatChat(cat) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/triggers/:triggerId/check', async (req, res) => {
  try {
    const result = await checkTriggerNow(req.user.id, req.params.id, req.params.triggerId);
    if (!result) return res.status(404).json({ success: false, error: 'That trigger was not found.' });
    res.json({
      success: !result.error,
      error: result.error || undefined,
      fired: Boolean(result.fire),
      reason: result.reason || null,
      note: result.note || null,
      cat: getCat(req.user.id, req.params.id),
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
