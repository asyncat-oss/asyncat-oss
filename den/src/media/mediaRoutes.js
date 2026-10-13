// den/src/media/mediaRoutes.js
// /api/media: "Set up voice" and "Set up images" (status, catalog, a plan
// with sizes, the setup job, choices, voice previews and samples) and the
// gallery of pictures Asyncat made.

import express from 'express';
import { getSetupJob, cancelSetupJob, latestSetupJob } from './setupJobs.js';
import {
  chooseVoice, elevenLabsVoices, planVoiceSetup, previewVoice, startVoiceSetup, voiceCatalog, voiceSample, voiceStatus,
} from './voiceService.js';
import { chooseImage, imageCatalog, imageStatus, planImageSetup, startImageSetup } from './imageService.js';
import { deleteGalleryImage, galleryFile, listGallery } from './gallery.js';
import { generateImageTool } from '../agent/tools/visualTools.js';

const router = express.Router();

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[media]', err);
  res.status(status).json({ success: false, error: err?.message || 'Something went wrong.', ...(err?.job ? { job: err.job } : {}) });
}

const flag = (value, fallback = true) => (value === undefined ? fallback : !['0', 'false', 'no'].includes(String(value).toLowerCase()));

function voiceOptions(source = {}, userId = null) {
  return {
    listen: flag(source.listen),
    speak: flag(source.speak),
    whisperId: source.whisper || source.whisperId || null,
    english: source.english === undefined ? null : flag(source.english),
    voiceId: source.voice || source.voiceId || null,
    language: source.language || 'en',
    userId,
  };
}

// ── Voice ─────────────────────────────────────────────────────────────────────

router.get('/voice', async (_req, res) => {
  try {
    res.json({ success: true, status: await voiceStatus(), catalog: voiceCatalog(), setup: latestSetupJob('voice') });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/voice/plan', async (req, res) => {
  try {
    res.json({ success: true, plan: await planVoiceSetup(voiceOptions(req.query, req.user?.id)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/voice/setup', async (req, res) => {
  try {
    res.status(202).json({ success: true, job: await startVoiceSetup(voiceOptions(req.body || {}, req.user?.id)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/voice/choose', async (req, res) => {
  try {
    res.json({ success: true, status: await chooseVoice(req.body || {}) });
  } catch (err) {
    sendError(res, err);
  }
});

// Hear a voice: { provider, voice, text } → audio.
router.post('/voice/preview', async (req, res) => {
  try {
    const { buffer, mime } = await previewVoice(req.body || {});
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    sendError(res, err);
  }
});

// The spoken sample of a voice that isn't downloaded yet.
router.get('/voice/samples/:voiceId', async (req, res) => {
  try {
    const buffer = await voiceSample(req.params.voiceId, { userId: req.user?.id });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/voice/elevenlabs-voices', async (_req, res) => {
  try {
    res.json({ success: true, voices: await elevenLabsVoices() });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Images ────────────────────────────────────────────────────────────────────

router.get('/images', async (_req, res) => {
  try {
    res.json({ success: true, status: await imageStatus(), catalog: imageCatalog(), setup: latestSetupJob('images') });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/images/plan', async (req, res) => {
  try {
    res.json({ success: true, plan: await planImageSetup({ modelId: req.query.model || null, userId: req.user?.id }) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/images/setup', async (req, res) => {
  try {
    res.status(202).json({ success: true, job: await startImageSetup({ modelId: req.body?.modelId || null, userId: req.user?.id }) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/images/choose', async (req, res) => {
  try {
    res.json({ success: true, status: await chooseImage(req.body || {}) });
  } catch (err) {
    sendError(res, err);
  }
});

// Make a picture with what is chosen, to try it: { prompt }.
router.post('/images/try', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim() || 'A small cat asleep on a windowsill in the afternoon sun';
    const result = await generateImageTool.execute({ prompt }, { workingDir: process.cwd() });
    if (!result?.success) return res.status(422).json({ success: false, error: result?.error || "Couldn't make the picture." });
    res.json({ success: true, image: { url: result.media?.url || null, prompt, runtime: result.runtime, width: result.width, height: result.height } });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Setup jobs ────────────────────────────────────────────────────────────────

router.get('/setup/:jobId', (req, res) => {
  const job = getSetupJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'No such setup.' });
  res.json({ success: true, job });
});

router.post('/setup/:jobId/cancel', (req, res) => {
  const job = cancelSetupJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'No such setup.' });
  res.json({ success: true, job });
});

// ── Gallery ───────────────────────────────────────────────────────────────────

router.get('/gallery', (req, res) => {
  try {
    res.json({ success: true, ...listGallery({ limit: req.query.limit, offset: req.query.offset }) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/gallery/file/:name', (req, res) => {
  const file = galleryFile(req.params.name);
  if (!file) return res.status(404).json({ success: false, error: 'No such picture.' });
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(file);
});

router.delete('/gallery/:name', (req, res) => {
  try {
    if (!deleteGalleryImage(req.params.name)) return res.status(404).json({ success: false, error: 'No such picture.' });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
