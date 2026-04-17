// den/src/index.js — Asyncat unified backend monolith
// Merges: ai, users, calendar, habits, kanban, notes
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

// ─── Auth ─────────────────────────────────────────────────────────────────────
import authRouter from './auth/authRouter.js';

// ─── AI / MCP routes (from asy_b_main) ───────────────────────────────────────
import aiRoutes from './ai/routes/aiRoutes.js';
import labsRoutes from './ai/routes/labsRoutes.js';
import providerRoutes from './ai/routes/providerRoutes.js';

// ─── Users / Projects / Dashboard (from asy_b_users) ─────────────────────────
import userRoutes from './users/routes/userRoutes.js';
import teamRoutes from './users/routes/teamRoutes.js';
import projectRoutes from './users/routes/projectRouters.js';
import dashboardRoutes from './users/routes/dashboardRoutes.js';

// ─── Calendar (from asy_b_calendar) ──────────────────────────────────────────
import eventRoutes from './calendar/routes/eventRoutes.js';
import eventInviteRoutes from './calendar/routes/eventInviteRoutes.js';

// ─── Habits (from asy_b_habit) ────────────────────────────────────────────────
import habitsRoutes from './habits/routes/habitsRoutes.js';

// ─── Kanban (from asy_b_kanban) ───────────────────────────────────────────────
import cardRoutes from './kanban/routes/cardRoutes.js';
import columnRoutes from './kanban/routes/columnRoutes.js';
import timeRoutes from './kanban/routes/timeRoutes.js';
import dependencyRoutes from './kanban/routes/dependencyRoutes.js';

// ─── Notes (from asy_b_notes) ─────────────────────────────────────────────────
import noteRoutes from './notes/routes/noteRoutes.js';
import attachmentRoutes from './notes/routes/attachmentRoutes.js';
import sharedAttachmentRoutes from './notes/routes/sharedAttachmentRoutes.js';

// ─── Database ─────────────────────────────────────────────────────────────────
import db from './db/client.js';         // opens SQLite, applies schema
import { seed } from './db/seed.js';     // auto-seeds solo user on first boot

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
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
app.use(helmet({ contentSecurityPolicy: false })); // CSP off — frontend handles it
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Routes: Auth ────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ─── Routes: AI ──────────────────────────────────────────────────────────────
// Provider routes MUST be mounted before aiRoutes to avoid the /api/ai catch-all
// matching /api/ai/providers/* requests first.
app.use('/api/ai/providers', providerRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/labs', labsRoutes);

// ─── Routes: Users / Projects ────────────────────────────────────────────────
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ─── Routes: Calendar ─────────────────────────────────────────────────────────
app.use('/api/events', eventRoutes);
app.use('/api/event-invites', eventInviteRoutes);

// ─── Routes: Habits ───────────────────────────────────────────────────────────
app.use('/api/habits', habitsRoutes);

// ─── Routes: Kanban ───────────────────────────────────────────────────────────
app.use('/api/cards', cardRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/dependencies', dependencyRoutes);
app.use('/api', timeRoutes); // timeRoutes defines its own sub-paths under /api

// ─── Routes: Notes ────────────────────────────────────────────────────────────
app.use('/api/notes', noteRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/shared-attachments', sharedAttachmentRoutes);

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
  console.error('Unhandled error:', err);

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
seed().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`den running on port ${PORT}`);
    console.log(`environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`frontend: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} — shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}).catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});

export default app;
