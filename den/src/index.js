// den/src/index.js — Asyncat unified backend monolith
// Merges: ai, users, calendar, kanban, notes
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import logger, { flushLogs, logError, morganStream } from './logger.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────
import authRouter from './auth/authRouter.js';

// ─── AI / MCP routes (from asy_b_main) ───────────────────────────────────────
import aiAgentRoutes from './ai/routes/aiAgentRoutes.js';
import providerRoutes from './ai/routes/providerRoutes.js';
import fileRoutes from './files/fileRoutes.js';

// ─── Users / Projects (from asy_b_users) ──────────────────────────────
import userRoutes from './users/routes/userRoutes.js';
import teamRoutes from './users/routes/teamRoutes.js';
import projectRoutes from './users/routes/projectRouters.js';

// ─── Calendar (from asy_b_calendar) ──────────────────────────────────────────
import eventRoutes from './calendar/routes/eventRoutes.js';

// ─── Kanban (from asy_b_kanban) ───────────────────────────────────────────────
import cardRoutes from './kanban/routes/cardRoutes.js';
import columnRoutes from './kanban/routes/columnRoutes.js';
import dependencyRoutes from './kanban/routes/dependencyRoutes.js';

// ─── Notes (from asy_b_notes) ─────────────────────────────────────────────────
import noteRoutes from './notes/routes/noteRoutes.js';
import attachmentRoutes from './notes/routes/attachmentRoutes.js';

// ─── Config ────────────────────────────────────────────────────────────────────
import configRouter from './config/configRouter.js';

// ─── Storage ───────────────────────────────────────────────────────────────────
import storageRouter from './storage/storageRouter.js';

// ─── Update ───────────────────────────────────────────────────────────────────
import updateRouter from './update/updateRouter.js';

// ─── Database ─────────────────────────────────────────────────────────────────
import db from './db/client.js';         // opens SQLite, applies schema
import { seed } from './db/seed.js';     // auto-seeds solo user on first boot

// ─── Machine token ────────────────────────────────────────────────────────────
import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const MACHINE_TOKEN_PATH = join(homedir(), '.asyncat_machine_token');
const MACHINE_TOKEN = randomUUID();
try {
  writeFileSync(MACHINE_TOKEN_PATH, MACHINE_TOKEN, { mode: 0o600 });
} catch (e) {
  logger.warn('Could not write machine token:', e.message);
}
export { MACHINE_TOKEN };

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 8716;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:8717',
  'http://localhost:8716',
  process.env.FRONTEND_URL,
].filter(Boolean);

// All other routes use the restricted allow-list
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'Cookie', 'X-Requested-With',
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
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Routes: Auth ────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

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

// ─── Routes: Calendar ─────────────────────────────────────────────────────────
app.use('/api/events', eventRoutes);

// ─── Routes: Kanban ───────────────────────────────────────────────────────────
app.use('/api/cards', cardRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/dependencies', dependencyRoutes);

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
  if (err.message?.includes('JWT')) {
    return res.status(401).json({ success: false, error: 'Authentication failed' });
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`den running on port ${PORT}`);
    logger.info(`environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`frontend: ${process.env.FRONTEND_URL || 'http://localhost:8717'}`);
  });
  server.on('error', async (err) => {
    logError('HTTP server failed:', err);
    await flushLogs();
    process.exit(1);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} - shutting down`);
    server.close(async () => {
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
