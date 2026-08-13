// den/src/index.js — Asyncat unified backend monolith
// Merges: ai, users, kanban, notes
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import logger, { flushLogs, logError, morganStream } from './logger.js';
import { attachLocalContext } from './middleware/localContext.js';

// ─── AI / MCP routes (from asy_b_main) ───────────────────────────────────────
import aiAgentRoutes from './ai/routes/aiAgentRoutes.js';
import providerRoutes from './ai/routes/providerRoutes.js';
import fileRoutes from './files/fileRoutes.js';

// ─── Users / Projects (from asy_b_users) ──────────────────────────────
import userRoutes from './users/routes/userRoutes.js';
import teamRoutes from './users/routes/teamRoutes.js';
import projectRoutes from './users/routes/projectRouters.js';

// ─── Kanban (from asy_b_kanban) ───────────────────────────────────────────────
import cardRoutes from './kanban/routes/cardRoutes.js';
import columnRoutes from './kanban/routes/columnRoutes.js';

// ─── Notes (from asy_b_notes) ─────────────────────────────────────────────────
import noteRoutes from './notes/routes/noteRoutes.js';
import attachmentRoutes from './notes/routes/attachmentRoutes.js';

// ─── Config ────────────────────────────────────────────────────────────────────
import configRouter from './config/configRouter.js';

// ─── Storage ───────────────────────────────────────────────────────────────────
import storageRouter from './storage/storageRouter.js';

// ─── Update ───────────────────────────────────────────────────────────────────
import updateRouter from './update/updateRouter.js';

// ─── Install / Runtime Readiness ─────────────────────────────────────────────
import installRouter from './install/installRouter.js';

// ─── Search ───────────────────────────────────────────────────────────────────
import searchRouter from './search/searchRouter.js';

// ─── Training / Fine-Tuning ───────────────────────────────────────────────────
import trainingRouter from './ai/routes/trainingRoutes.js';

// Local browser history (cookies/cache remain in Electron sessions)
import browserRouter from './browser/browserRouter.js';

// ─── Integrations ─────────────────────────────────────────────────────────────
import integrationsRouter from './integrations/integrationsRouter.js';

// ─── Database ─────────────────────────────────────────────────────────────────
import db from './db/client.js';         // opens SQLite, applies schema
import { seed } from './db/seed.js';     // creates the local profile on first boot
import { recoverSandboxJobs } from './agent/SandboxManager.js';
import { recoverTrainingJobs } from './ai/controllers/ai/trainingJobManager.js';

try {
  const recoveredSandboxJobs = recoverSandboxJobs();
  if (recoveredSandboxJobs > 0) {
    logger.info(`Marked ${recoveredSandboxJobs} interrupted sandbox job(s) as failed`);
  }
} catch (e) {
  logger.warn('Could not recover sandbox jobs:', e.message);
}

try {
  const recoveredTrainingJobs = recoverTrainingJobs();
  if (recoveredTrainingJobs > 0) {
    logger.info(`Marked ${recoveredTrainingJobs} interrupted training job(s) as failed`);
  }
} catch (e) {
  logger.warn('Could not recover training jobs:', e.message);
}

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 8716;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:8717',
  'http://localhost:8716',
  'http://127.0.0.1:8717',
  'http://127.0.0.1:8716',
  process.env.FRONTEND_URL,
].filter(Boolean);

// All other routes use the restricted allow-list
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'X-Requested-With',
    'x-client-timestamp', 'x-update-type', 'x-auto-save', 'x-client-timezone',
    'Cache-Control',
  ],
  exposedHeaders: ['Content-Type', 'Content-Length', 'Content-Disposition', 'Cache-Control'],
}));

// ─── Core middleware ──────────────────────────────────────────────────────────
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'tiny', {
  stream: morganStream,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Every API request uses the single local profile as its ownership context.
app.use(attachLocalContext);

// ─── Routes: AI ──────────────────────────────────────────────────────────────
// Provider routes MUST be mounted before aiAgentRoutes to avoid the /api/ai catch-all
// matching /api/ai/providers/* requests first.
app.use('/api/ai/providers', providerRoutes);
app.use('/api/ai', aiAgentRoutes);
app.use('/api/agent', aiAgentRoutes);
app.use('/api/files', fileRoutes);

// ─── Routes: Users / Projects ────────────────────────────────────────────────
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/projects', projectRoutes);

// ─── Routes: Kanban ───────────────────────────────────────────────────────────
app.use('/api/cards', cardRoutes);
app.use('/api/columns', columnRoutes);

// ─── Routes: Notes ────────────────────────────────────────────────────────────
app.use('/api/notes', noteRoutes);
app.use('/api/attachments', attachmentRoutes);

// ─── Routes: Config ──────────────────────────────────────────────────────────
app.use('/api/config', configRouter);

// ─── Routes: Storage ─────────────────────────────────────────────────────────
app.use('/files', storageRouter);
app.use('/api/storage', storageRouter);

// ─── Routes: Update ───────────────────────────────────────────────────────────
app.use('/api/update', updateRouter);

// ─── Routes: Install / Runtime Readiness ─────────────────────────────────────
app.use('/api/install', installRouter);

// ─── Routes: Integrations ─────────────────────────────────────────────────────
app.use('/api/integrations', integrationsRouter);

// ─── Routes: Search ───────────────────────────────────────────────────────────
app.use('/api/search', searchRouter);

// Routes: Browser
app.use('/api/browser', browserRouter);

// ─── Routes: Training / Fine-Tuning ──────────────────────────────────────────
app.use('/api/training', trainingRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logError('Unhandled error:', err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Payload too large' });
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
// Seed DB (no-op if already populated), then open the HTTP server.
seed().then(async () => {
  // Initialize storage containers
  try {
    const { initializeAllContainers } = await import('./storage/localStorageService.js');
    await initializeAllContainers();
    logger.info('Storage initialized');
  } catch (err) {
    logger.warn('Storage initialization warning:', err.message);
  }

  const server = app.listen(PORT, '127.0.0.1', () => {
    logger.info(`den running on port ${PORT}`);
    logger.info(`environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`frontend: ${process.env.FRONTEND_URL || 'http://127.0.0.1:8717'}`);
  });
  server.on('error', async (err) => {
    logError('HTTP server failed:', err);
    await flushLogs();
    process.exit(1);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} - shutting down`);
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');

    // Give graceful shutdown 5s, then force-exit
    const forceExit = setTimeout(() => {
      logger.warn('Force exit: graceful shutdown timed out');
      process.exit(1);
    }, 5000);

    try {
      // Stop child processes (whisper, llama, mlx, tts)
      const { stopWhisper } = await import('./ai/controllers/ai/whisperServerManager.js');
      const { stopTts } = await import('./ai/controllers/ai/ttsServerManager.js');
      const { stopServer: stopLlama } = await import('./ai/controllers/ai/llamaServerManager.js');
      const { stopServer: stopMlx } = await import('./ai/controllers/ai/mlxServerManager.js');
      const { stopAllTraining } = await import('./ai/controllers/ai/trainingJobManager.js');
      await Promise.all([
        stopWhisper().catch(e => logger.warn('Whisper stop error:', e.message)),
        stopTts().catch(e => logger.warn('TTS stop error:', e.message)),
        stopLlama().catch(e => logger.warn('Llama stop error:', e.message)),
        stopMlx().catch(e => logger.warn('MLX stop error:', e.message)),
        stopAllTraining().catch(e => logger.warn('Training stop error:', e.message)),
      ]);
    } catch (err) {
      logger.warn('Error stopping child processes:', err.message);
    }

    try {
      // Close SQLite database
      db.close();
    } catch {
      // ignore if already closed
    }

    // Forcibly close all active HTTP connections so the port is released
    // immediately instead of waiting for browser keep-alive sockets.
    try { server.closeAllConnections(); } catch { /* ignore if unsupported */ }

    server.close(async () => {
      clearTimeout(forceExit);
      await flushLogs();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}).catch(async (err) => {
  logError('Startup failed:', err);
  await flushLogs();
  process.exit(1);
});

export default app;
