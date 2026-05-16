-- ─── Asyncat OSS — SQLite Schema ─────────────────────────────────────────────
-- Derived from the Supabase/PostgreSQL schema (project lmxnnnfranuagscmxjgd).
--
-- Drops (SaaS-only, not needed locally):
--   public.teams / team_members → replaced by slim "workspaces" table
--   stripe.*  invitations.*  version_collaborators
--   note_version_groups  aichats.usage_tracking  aichats.ai_credits
--
-- Schema prefixes removed (SQLite has no schemas):
--   kanban.Columns  → Columns      kanban.Cards  → Cards
--   kanban.TaskDependencies
--   aichats.conversations / chat_folders
--
-- SQLite adaptations:
--   UUID columns   → TEXT
--   JSON/ARRAY     → TEXT (app serialises to JSON string)
--   boolean        → INTEGER (0/1)
--   timestamptz    → TEXT  (ISO-8601, app uses .toISOString())
--   enum types     → TEXT CHECK(...)
--   float8         → REAL

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,                  -- bcrypt; NULL until first login set
  name            TEXT,
  profile_picture TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Workspaces (replaces public.teams) ──────────────────────────────────────
-- The local account creates its workspace from the first-run walkthrough.

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT 'My Workspace',
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  emoji       TEXT NOT NULL DEFAULT '💼',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Projects ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  due_date        TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  owner_id        TEXT NOT NULL REFERENCES users(id),
  -- Column kept as team_id so existing controller queries don't need renaming.
  -- References workspaces instead of the old teams table.
  team_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  is_archived     INTEGER NOT NULL DEFAULT 0,
  enabled_views   TEXT NOT NULL DEFAULT '["kanban","list","gantt","network","notes"]',
  enabled_widgets TEXT NOT NULL DEFAULT '["metrics","progress","description","quick-stats","deadlines","team-members","features","project-details"]',
  emoji           TEXT NOT NULL DEFAULT '📁',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_folders (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_folder_items (
  id         TEXT PRIMARY KEY,
  folder_id  TEXT NOT NULL REFERENCES project_folders(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Calendar ─────────────────────────────────────────────────────────────────
-- Table name kept as "Events" (capital E) — matches existing controller queries.

CREATE TABLE IF NOT EXISTS Events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  startTime   TEXT NOT NULL,
  endTime     TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'purple',
  location    TEXT,
  isAllDay    INTEGER NOT NULL DEFAULT 0,
  recurrence  TEXT,              -- JSON
  reminders   TEXT NOT NULL DEFAULT '[]',   -- JSON
  status      TEXT NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed','tentative','cancelled')),
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  createdBy   TEXT NOT NULL REFERENCES users(id),
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Notes ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'Untitled Note',
  content     TEXT,
  projectid   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  createdby   TEXT REFERENCES users(id),
  updated_by  TEXT REFERENCES users(id),
  createdat   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedat   TEXT NOT NULL DEFAULT (datetime('now')),
  isarchived  INTEGER NOT NULL DEFAULT 0,
  isstarred   INTEGER NOT NULL DEFAULT 0,
  metadata    TEXT NOT NULL DEFAULT '{}'    -- JSON (block data etc.)
);

-- ─── Kanban ───────────────────────────────────────────────────────────────────
-- Table names kept as "Columns" / "Cards" / "TaskDependencies"
-- to match the existing service and controller code exactly.

CREATE TABLE IF NOT EXISTS Columns (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  "order"            REAL NOT NULL DEFAULT 0,
  projectId          TEXT REFERENCES projects(id) ON DELETE CASCADE,
  createdBy          TEXT NOT NULL REFERENCES users(id),
  updatedBy          TEXT REFERENCES users(id),
  isCompletionColumn INTEGER NOT NULL DEFAULT 0,
  createdAt          TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Cards (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT,
  priority         TEXT DEFAULT 'Medium'
                     CHECK (priority IN ('high','medium','low','High','Medium','Low')),
  dueDate          TEXT,
  startDate        TEXT,
  "order"          REAL NOT NULL DEFAULT 0,
  columnId         TEXT NOT NULL REFERENCES Columns(id) ON DELETE CASCADE,
  tasks            TEXT NOT NULL DEFAULT '{"total":0,"completed":0}',  -- JSON
  progress         INTEGER NOT NULL DEFAULT 0,
  checklist        TEXT NOT NULL DEFAULT '[]',   -- JSON
  tags             TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  attachments      TEXT NOT NULL DEFAULT '[]',   -- JSON
  predictedMinutes INTEGER,
  dependencies     TEXT NOT NULL DEFAULT '[]',   -- JSON array of UUIDs
  commentCount     INTEGER NOT NULL DEFAULT 0,
  startedAt        TEXT,
  completedAt      TEXT,
  administrator_id TEXT REFERENCES users(id),
  createdBy        TEXT NOT NULL REFERENCES users(id),
  updatedBy        TEXT REFERENCES users(id),
  createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS TaskDependencies (
  id           TEXT PRIMARY KEY,
  sourceCardId TEXT NOT NULL REFERENCES Cards(id) ON DELETE CASCADE,
  targetCardId TEXT NOT NULL REFERENCES Cards(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'FS' CHECK (type IN ('FS','SS','FF','SF')),
  lag          INTEGER NOT NULL DEFAULT 0,
  createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── AI Chats ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_folders (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id         TEXT REFERENCES chat_folders(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  mode              TEXT NOT NULL DEFAULT 'chat'
                      CHECK (mode IN ('chat','build','image')),
  is_pinned         INTEGER NOT NULL DEFAULT 0,
  is_archived       INTEGER NOT NULL DEFAULT 0,
  message_count     INTEGER NOT NULL DEFAULT 0,
  last_message_at   TEXT,
  has_attachments   INTEGER NOT NULL DEFAULT 0,
  messages          TEXT NOT NULL DEFAULT '[]',   -- JSON array
  metadata          TEXT NOT NULL DEFAULT '{}',
  project_ids       TEXT NOT NULL DEFAULT '[]',   -- JSON array of UUIDs
  deleted_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_branches (
  id                      TEXT PRIMARY KEY,
  conversation_id         TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id            TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_branch_id        TEXT,
  branch_point_message_id TEXT,
  label                   TEXT NOT NULL DEFAULT 'Branch',
  is_active               INTEGER NOT NULL DEFAULT 0,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  metadata                TEXT NOT NULL DEFAULT '{}',
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  branch_id         TEXT NOT NULL REFERENCES conversation_branches(id) ON DELETE CASCADE,
  message_id        TEXT NOT NULL,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_message_id TEXT,
  role              TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content           TEXT NOT NULL DEFAULT '',
  message_index     INTEGER NOT NULL DEFAULT 0,
  payload           TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(conversation_id, branch_id, message_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_team_id         ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id        ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_notes_projectid          ON notes(projectid);
CREATE INDEX IF NOT EXISTS idx_events_createdBy         ON Events(createdBy);
CREATE INDEX IF NOT EXISTS idx_Columns_projectId        ON Columns(projectId);
CREATE INDEX IF NOT EXISTS idx_Cards_columnId           ON Cards(columnId);
CREATE INDEX IF NOT EXISTS idx_Cards_createdBy          ON Cards(createdBy);
CREATE INDEX IF NOT EXISTS idx_conversations_user       ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace  ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deleted    ON conversations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_conversation_branches_conversation ON conversation_branches(conversation_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversation_branches_user         ON conversation_branches(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_branch       ON conversation_messages(conversation_id, branch_id, message_index);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_user         ON conversation_messages(user_id, workspace_id);
-- ─── AI Provider Config (per-user local model preferences) ───────────────────

CREATE TABLE IF NOT EXISTS ai_provider_config (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_id    TEXT,
  provider_type TEXT NOT NULL DEFAULT 'cloud'
                  CHECK (provider_type IN ('cloud', 'local', 'custom')),
  provider_id   TEXT,          -- 'ollama' | 'lmstudio' | 'llamacpp' | null for cloud/custom
  base_url      TEXT NOT NULL, -- e.g. http://localhost:11434/v1
  model         TEXT NOT NULL, -- e.g. llama3.2:latest
  api_key       TEXT,          -- optional; stored for custom cloud endpoints
  settings      TEXT NOT NULL DEFAULT '{}',
  supports_tools INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_provider_profiles (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  provider_type     TEXT NOT NULL DEFAULT 'cloud'
                       CHECK (provider_type IN ('cloud', 'local', 'custom')),
  provider_id       TEXT NOT NULL,
  base_url          TEXT NOT NULL,
  model             TEXT NOT NULL,
  api_key           TEXT,
  settings          TEXT NOT NULL DEFAULT '{}',
  supports_tools    INTEGER NOT NULL DEFAULT 0,
  last_test_status  TEXT,
  last_test_message TEXT,
  last_test_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_provider_profiles_user ON ai_provider_profiles(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_provider_profiles_provider ON ai_provider_profiles(user_id, provider_id);

-- ─── Agent Memory & Sessions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_memory (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  memory_type      TEXT NOT NULL DEFAULT 'fact'
                     CHECK (memory_type IN ('user','feedback','project','reference','fact','preference','context','task_state')),
  key              TEXT,
  content          TEXT NOT NULL,
  relevance        REAL NOT NULL DEFAULT 1.0,
  tags             TEXT NOT NULL DEFAULT '[]',
  importance       REAL NOT NULL DEFAULT 0.5,
  last_accessed_at TEXT,
  access_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','completed','failed')),
  goal             TEXT NOT NULL,
  plan             TEXT NOT NULL DEFAULT '[]',
  scratchpad       TEXT NOT NULL DEFAULT '{}',
  tool_history     TEXT NOT NULL DEFAULT '[]',
  working_dir      TEXT,
  total_rounds     INTEGER NOT NULL DEFAULT 0,
  feedback_rating  INTEGER,
  feedback_comment TEXT,
  was_helpful      INTEGER,
  corrections      TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_user       ON agent_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace  ON agent_memory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_key        ON agent_memory(user_id, workspace_id, key);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user     ON agent_sessions(user_id);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handle               TEXT,
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  icon                 TEXT NOT NULL DEFAULT '🤖',
  color                TEXT NOT NULL DEFAULT 'indigo',
  soul_name            TEXT NOT NULL DEFAULT 'default',
  soul_override        TEXT,
  working_dir          TEXT,
  max_rounds           INTEGER NOT NULL DEFAULT 25,
  auto_approve         INTEGER NOT NULL DEFAULT 0,
  always_allowed_tools TEXT NOT NULL DEFAULT '[]',
  is_default           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profiles_user_handle ON agent_profiles(user_id, handle);

-- =============================================
-- EPISODIC MEMORY (FTS5) - Full-Text Search
-- =============================================

-- FTS5 virtual table for agent sessions
CREATE VIRTUAL TABLE IF NOT EXISTS agent_sessions_fts USING fts5(
  session_id UNINDEXED,
  goal,
  scratchpad,
  tool_names,
  tokenize='unicode61'
);

-- FTS5 virtual table for agent memory
CREATE VIRTUAL TABLE IF NOT EXISTS agent_memory_fts USING fts5(
  memory_id UNINDEXED,
  key,
  content,
  tokenize='unicode61'
);

-- Triggers to keep FTS5 in sync with agent_sessions
CREATE TRIGGER IF NOT EXISTS agent_sessions_ai AFTER INSERT ON agent_sessions BEGIN
  INSERT INTO agent_sessions_fts(session_id, goal, scratchpad, tool_names)
  VALUES (new.id, new.goal, new.scratchpad,
    (SELECT group_concat(json_each.value->>'tool', ' ') FROM json_each(new.tool_history)));
END;

CREATE TRIGGER IF NOT EXISTS agent_sessions_ad AFTER DELETE ON agent_sessions BEGIN
  DELETE FROM agent_sessions_fts WHERE session_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS agent_sessions_au AFTER UPDATE ON agent_sessions BEGIN
  DELETE FROM agent_sessions_fts WHERE session_id = old.id;
  INSERT INTO agent_sessions_fts(session_id, goal, scratchpad, tool_names)
  VALUES (new.id, new.goal, new.scratchpad,
    (SELECT group_concat(json_each.value->>'tool', ' ') FROM json_each(new.tool_history)));
END;

-- Triggers to keep FTS5 in sync with agent_memory
CREATE TRIGGER IF NOT EXISTS agent_memory_ai AFTER INSERT ON agent_memory BEGIN
  INSERT INTO agent_memory_fts(memory_id, key, content)
  VALUES (new.id, new.key, new.content);
END;

CREATE TRIGGER IF NOT EXISTS agent_memory_ad AFTER DELETE ON agent_memory BEGIN
  DELETE FROM agent_memory_fts WHERE memory_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS agent_memory_au AFTER UPDATE ON agent_memory BEGIN
  DELETE FROM agent_memory_fts WHERE memory_id = old.id;
  INSERT INTO agent_memory_fts(memory_id, key, content)
  VALUES (new.id, new.key, new.content);
END;

-- ─── Agent Feedback & Patterns ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_patterns (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  workspace_id         TEXT,
  pattern_hash         TEXT NOT NULL,
  pattern_summary      TEXT NOT NULL,
  tool_sequence        TEXT NOT NULL,
  success_count        INTEGER DEFAULT 1,
  failure_count        INTEGER DEFAULT 0,
  last_seen_at         TEXT NOT NULL,
  last_failure_at      TEXT,
  created_at           TEXT NOT NULL,
  auto_skill_created   INTEGER DEFAULT 0,
  corrections          TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_patterns_user_pattern ON agent_patterns(user_id, pattern_hash);

CREATE TABLE IF NOT EXISTS agent_tool_audit (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id        TEXT,
  tool_name           TEXT NOT NULL,
  permission_level    TEXT NOT NULL,
  permission_decision TEXT NOT NULL,
  permission_reason   TEXT,
  working_dir         TEXT,
  args                TEXT NOT NULL DEFAULT '{}',
  result              TEXT,
  success             INTEGER,
  round               INTEGER,
  started_at          TEXT NOT NULL,
  completed_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_session ON agent_tool_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_user    ON agent_tool_audit(user_id, started_at);

CREATE TABLE IF NOT EXISTS agent_task_runs (
  id               TEXT PRIMARY KEY,
  card_id          TEXT NOT NULL REFERENCES Cards(id) ON DELETE CASCADE,
  session_id       TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  profile_id       TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  goal             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','running','completed','failed','cancelled')),
  last_event_type  TEXT,
  last_event_label TEXT,
  summary          TEXT,
  error            TEXT,
  started_at       TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_task_runs_card    ON agent_task_runs(card_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_agent_task_runs_user    ON agent_task_runs(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_agent_task_runs_session ON agent_task_runs(session_id);

-- ─── Custom Model Paths ────────────────────────────────────────────────────────
-- Stores absolute paths to models located outside the default directory.

CREATE TABLE IF NOT EXISTS custom_model_paths (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('gguf', 'mlx', 'whisper', 'tts', 'vision', 'image')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
