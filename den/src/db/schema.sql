-- ─── Asyncat OSS — SQLite Schema ─────────────────────────────────────────────
-- Derived from the Supabase/PostgreSQL schema (project lmxnnnfranuagscmxjgd).
--
-- Drops (SaaS-only, not needed locally):
--   public.teams / team_members → replaced by slim "workspaces" table
--   stripe.*  invitations.*  event_attendees  version_collaborators
--   note_version_groups  aichats.usage_tracking  aichats.ai_credits
--
-- Schema prefixes removed (SQLite has no schemas):
--   kanban.Columns  → Columns      kanban.Cards  → Cards
--   kanban.TaskDependencies         kanban.TimeEntries
--   habits.habits   → habits        habits.habit_completions / habit_streaks
--   aichats.conversations / chat_folders
--   studylab.flashcard_decks / flashcards / recall_sessions / mind_maps
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
-- Solo-mode: one row is auto-seeded at first boot.
-- Server-mode: each account gets a workspace on registration.

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
  enabled_views   TEXT NOT NULL DEFAULT '["kanban","list","timeline","gantt","network","notes","habits","gallery"]',
  enabled_widgets TEXT NOT NULL DEFAULT '["metrics","progress","description","quick-stats","deadlines","team-members","features","project-details"]',
  emoji           TEXT NOT NULL DEFAULT '📁',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role               TEXT NOT NULL DEFAULT 'member'
                       CHECK (role IN ('owner','admin','member','viewer')),
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('pending','active','rejected')),
  view_preferences   TEXT,   -- JSON
  widget_preferences TEXT,   -- JSON
  accessible_views   TEXT,   -- JSON
  view_permissions   TEXT,   -- JSON
  starred            INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
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
  projectId   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  description TEXT,
  startTime   TEXT NOT NULL,
  endTime     TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'purple',
  location    TEXT,
  isAllDay    INTEGER NOT NULL DEFAULT 0,
  recurrence  TEXT,              -- JSON
  attendees   TEXT NOT NULL DEFAULT '[]',   -- JSON array (inline, no join table)
  reminders   TEXT NOT NULL DEFAULT '[]',   -- JSON
  status      TEXT NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed','tentative','cancelled')),
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  createdBy   TEXT NOT NULL REFERENCES users(id),
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_attendees (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES Events(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  responded_at TEXT,
  UNIQUE(event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_attendees_event  ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user   ON event_attendees(user_id);

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

CREATE TABLE IF NOT EXISTS note_versions (
  id                TEXT PRIMARY KEY,
  note_id           TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  title             TEXT NOT NULL,
  content           TEXT,
  blocks            TEXT NOT NULL DEFAULT '[]',  -- JSON
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  metadata          TEXT NOT NULL DEFAULT '{}',
  is_major_version  INTEGER NOT NULL DEFAULT 0,
  parent_version_id TEXT REFERENCES note_versions(id),
  size_bytes        INTEGER
);

CREATE TABLE IF NOT EXISTS note_operations (
  id             TEXT PRIMARY KEY,
  note_id        TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  version_id     TEXT REFERENCES note_versions(id),
  operation_type TEXT NOT NULL,
  block_id       TEXT,
  position       INTEGER,
  content        TEXT,
  old_content    TEXT,
  user_id        TEXT NOT NULL REFERENCES users(id),
  timestamp      TEXT NOT NULL DEFAULT (datetime('now')),
  metadata       TEXT NOT NULL DEFAULT '{}'
);

-- ─── Kanban ───────────────────────────────────────────────────────────────────
-- Table names kept as "Columns" / "Cards" / "TaskDependencies" / "TimeEntries"
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
  timeSpent        INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS TimeEntries (
  id          TEXT PRIMARY KEY,
  cardId      TEXT NOT NULL REFERENCES Cards(id) ON DELETE CASCADE,
  userId      TEXT NOT NULL REFERENCES users(id),
  startTime   TEXT NOT NULL,
  endTime     TEXT,
  description TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Habits ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS habits (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  frequency     TEXT NOT NULL DEFAULT 'daily'
                  CHECK (frequency IN ('daily','weekly','monthly')),
  tracking_type TEXT NOT NULL DEFAULT 'boolean'
                  CHECK (tracking_type IN ('boolean','numeric','duration')),
  target_value  INTEGER NOT NULL DEFAULT 1,
  unit          TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  is_private    INTEGER NOT NULL DEFAULT 1,
  category      TEXT NOT NULL DEFAULT 'general',
  color         TEXT NOT NULL DEFAULT '#6366f1',
  icon          TEXT NOT NULL DEFAULT '🎯',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_completions (
  id             TEXT PRIMARY KEY,
  habit_id       TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id),
  completed_date TEXT NOT NULL,   -- DATE as TEXT: 'YYYY-MM-DD'
  value          INTEGER NOT NULL DEFAULT 1,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_streaks (
  id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  habit_id             TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id              TEXT NOT NULL REFERENCES users(id),
  current_streak       INTEGER NOT NULL DEFAULT 0,
  longest_streak       INTEGER NOT NULL DEFAULT 0,
  last_completion_date TEXT,   -- DATE as TEXT: 'YYYY-MM-DD'
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(habit_id, user_id)
);

-- ─── AI Chats ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_folders (
  id           TEXT PRIMARY KEY,
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
  is_public         INTEGER NOT NULL DEFAULT 0,
  public_token      TEXT UNIQUE,
  public_expires_at TEXT,
  public_created_at TEXT,
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

-- ─── Study Lab ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flashcard_decks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  topic        TEXT,
  color        TEXT NOT NULL DEFAULT '#6366f1',
  card_count   INTEGER NOT NULL DEFAULT 0,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flashcards (
  id               TEXT PRIMARY KEY,
  deck_id          TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  front            TEXT NOT NULL,
  back             TEXT NOT NULL,
  ease_factor      REAL NOT NULL DEFAULT 2.5,
  interval_days    INTEGER NOT NULL DEFAULT 0,
  repetitions      INTEGER NOT NULL DEFAULT 0,
  next_review_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_reviewed_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recall_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,
  questions     TEXT NOT NULL DEFAULT '[]',   -- JSON
  answers       TEXT NOT NULL DEFAULT '[]',   -- JSON
  score_correct INTEGER NOT NULL DEFAULT 0,
  score_total   INTEGER NOT NULL DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mind_maps (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  topic        TEXT,
  nodes        TEXT NOT NULL DEFAULT '{}',   -- JSON
  is_archived  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_team_id         ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id        ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id  ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_projectid          ON notes(projectid);
CREATE INDEX IF NOT EXISTS idx_note_versions_note_id    ON note_versions(note_id);
CREATE INDEX IF NOT EXISTS idx_note_operations_note_id  ON note_operations(note_id);
CREATE INDEX IF NOT EXISTS idx_events_projectId         ON Events(projectId);
CREATE INDEX IF NOT EXISTS idx_events_createdBy         ON Events(createdBy);
CREATE INDEX IF NOT EXISTS idx_Columns_projectId        ON Columns(projectId);
CREATE INDEX IF NOT EXISTS idx_Cards_columnId           ON Cards(columnId);
CREATE INDEX IF NOT EXISTS idx_Cards_createdBy          ON Cards(createdBy);
CREATE INDEX IF NOT EXISTS idx_TimeEntries_cardId       ON TimeEntries(cardId);
CREATE INDEX IF NOT EXISTS idx_TimeEntries_userId       ON TimeEntries(userId);
CREATE INDEX IF NOT EXISTS idx_habits_project_id        ON habits(project_id);
CREATE INDEX IF NOT EXISTS idx_habit_completions_habit  ON habit_completions(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_streaks_habit      ON habit_streaks(habit_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user       ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace  ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deleted    ON conversations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user     ON flashcard_decks(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck          ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_recall_sessions_user     ON recall_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mind_maps_user           ON mind_maps(user_id);

-- ─── AI Provider Config (per-user local model preferences) ───────────────────

CREATE TABLE IF NOT EXISTS ai_provider_config (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL DEFAULT 'cloud'
                  CHECK (provider_type IN ('cloud', 'local', 'custom')),
  provider_id   TEXT,          -- 'ollama' | 'lmstudio' | 'llamacpp' | null for cloud/custom
  base_url      TEXT NOT NULL, -- e.g. http://localhost:11434/v1
  model         TEXT NOT NULL, -- e.g. llama3.2:latest
  api_key       TEXT,          -- optional; stored for custom cloud endpoints
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── MCP OAuth (was mcp schema in Supabase) ──────────────────────────────────
-- Stores short-lived auth codes and long-lived access tokens for MCP clients.

CREATE TABLE IF NOT EXISTS mcp_auth_codes (
  id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  code                  TEXT NOT NULL UNIQUE,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id             TEXT NOT NULL,
  redirect_uri          TEXT NOT NULL,
  code_challenge        TEXT,
  code_challenge_method TEXT,
  workspace_id          TEXT,
  expires_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_access_tokens (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  token_hash   TEXT NOT NULL UNIQUE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL,
  workspace_id TEXT,
  expires_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_code       ON mcp_auth_codes(code);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_hash    ON mcp_access_tokens(token_hash);

-- ─── Agent Memory & Sessions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_memory (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  memory_type  TEXT NOT NULL DEFAULT 'fact'
                 CHECK (memory_type IN ('fact','preference','context','task_state')),
  key          TEXT,
  content      TEXT NOT NULL,
  relevance    REAL NOT NULL DEFAULT 1.0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','completed','failed')),
  goal          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT '[]',
  scratchpad    TEXT NOT NULL DEFAULT '{}',
  tool_history  TEXT NOT NULL DEFAULT '[]',
  total_rounds  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_user       ON agent_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace  ON agent_memory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_key        ON agent_memory(user_id, workspace_id, key);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user     ON agent_sessions(user_id);

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

-- =============================================
-- FEEDBACK LEARNING
-- =============================================

-- Add feedback fields to agent_sessions
ALTER TABLE agent_sessions ADD COLUMN feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5);
ALTER TABLE agent_sessions ADD COLUMN feedback_comment TEXT;
ALTER TABLE agent_sessions ADD COLUMN was_helpful INTEGER CHECK (was_helpful IN (0, 1));
ALTER TABLE agent_sessions ADD COLUMN corrections TEXT NOT NULL DEFAULT '[]';

-- Add failure tracking to agent_patterns
ALTER TABLE agent_patterns ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_patterns ADD COLUMN last_failure_at TEXT;

-- Pattern quality score (positive - negative, higher = better)
-- Will be computed as: success_count - failure_count

