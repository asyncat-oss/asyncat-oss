// den/src/agent/prompts/agentSystemPrompt.js
// ─── Agent System Prompt ─────────────────────────────────────────────────────
// Generates the system prompt for the ReAct agent loop.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOULS_DIR = path.join(__dirname, '..', 'souls');

const DEFAULT_IDENTITY = `You are an autonomous AI agent running locally on the user's machine. You can think, plan, execute tools, and iterate until the task is complete.`;

export function loadSoul(name = 'default') {
  try {
    const filePath = path.join(SOULS_DIR, `${name}.md`);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    // Strip frontmatter for prompt injection
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/, '').trim();
    return withoutFrontmatter;
  } catch {
    return null;
  }
}

export function readSoulRaw(name = 'default') {
  try {
    const filePath = path.join(SOULS_DIR, `${name}.md`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function writeSoul(name = 'default', content) {
  const filePath = path.join(SOULS_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) throw new Error(`Soul "${name}" not found`);
  fs.writeFileSync(filePath, content, 'utf8');
}

export function listSouls() {
  try {
    return fs.readdirSync(SOULS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

/**
 * Build the agent system prompt.
 * @param {object} opts
 * @param {string} opts.goal - The user's goal/request
 * @param {string} opts.workingDir - Current working directory
 * @param {string} opts.toolDescriptions - Formatted tool descriptions
 * @param {object[]} opts.memories - Relevant memories from store
 * @param {string} opts.scratchpad - Current scratchpad state
 * @param {object[]} opts.skills - Relevant skills from Cerebellum
 * @param {object[]} opts.mentionedAgents - Agent profiles explicitly mentioned by the user
 * @param {string} [opts.soul] - Soul/persona content loaded from souls/*.md
 * @returns {string}
 */
function getShellName(platform) {
  if (platform === 'win32') return 'PowerShell / cmd.exe';
  if (platform === 'darwin') return 'zsh/bash';
  return 'bash';
}

export function buildAgentSystemPrompt(opts = {}) {
  const {
    goal = '',
    workingDir = '.',
    toolDescriptions = '',
    memories = [],
    scratchpad = '',
    skills = [],
    mentionedAgents = [],
    soul = null,
    platform = process.platform,
  } = opts;

  const shellName = getShellName(platform);

  const identity = soul || DEFAULT_IDENTITY;

  const memorySection = memories.length > 0
    ? `\n## Stored Memories\n${memories.map(m => {
      const kind = m.kind || m.memory_type || 'fact';
      const tags = Array.isArray(m.tags) && m.tags.length ? ` [${m.tags.join(', ')}]` : '';
      return `- **${m.key}** (${kind}${tags}): ${m.content}`;
    }).join('\n')}\n`
    : '';

  const scratchpadSection = scratchpad
    ? `\n## Scratchpad (your working notes from previous rounds)\n${scratchpad}\n`
    : '';

  const skillsSection = skills.length > 0
    ? `\n## Relevant Skills (Cerebellum)\n${skills.map(s => {
      const body = s.body || s.description || '';
      return `### ${s.name}\n${s.description ? `_${s.description}_\n\n` : ''}${body}`;
    }).join('\n\n---\n\n')}\n`
    : '';

  const mentionedAgentsSection = mentionedAgents.length > 0
    ? `\n## Mentioned Agent Profiles\n${mentionedAgents.map(agent => {
      const tools = Array.isArray(agent.always_allowed_tools) && agent.always_allowed_tools.length
        ? agent.always_allowed_tools.join(', ')
        : 'none pre-approved';
      return [
        `- @${agent.handle}: ${agent.name}`,
        agent.description ? `  Description: ${agent.description}` : null,
        `  Profile id: ${agent.id}`,
        `  Working dir: ${agent.working_dir || workingDir}`,
        `  Max rounds: ${agent.max_rounds || 25}`,
        `  Auto approve: ${agent.auto_approve ? 'yes' : 'no'}`,
        `  Pre-approved tools: ${tools}`,
      ].filter(Boolean).join('\n');
    }).join('\n')}\n\nUse \`delegate_to_profile\` when the user asks a mentioned profile to investigate or perform a subtask. The delegated profile can load relevant skills itself.\n`
    : '';

  return `${identity}

## Environment
- **Platform**: ${platform}
- **Working directory**: ${workingDir}
- **Shell**: ${shellName}

## How You Work (ReAct Pattern)
For each step, you MUST output your response in this exact format:

**Thought:** [Your reasoning about what to do next, based on the current state]
**Action:** [A single tool call using the <tool_call> format]

OR, when the task is complete:

**Thought:** [Summary of what was accomplished]
**Answer:** [Your final response to the user]

## Rules
1. **Plan first.** For ANY multi-step task (2+ steps), call \`todo_write\` BEFORE your first tool action. This creates a visible plan the user can follow. Keep it updated as you work — mark exactly one item \`in_progress\` while working on it, then flip it to \`completed\` before moving to the next. The user sees your plan in real time, so keep items concise and actionable.
2. **Batch independent tool calls.** When two or more read-only actions don't depend on each other (e.g. reading multiple files, listing several dirs), emit them in the same turn. The runtime executes them in parallel.
3. **Think before acting.** Explain your reasoning in the Thought section before tool calls.
4. **Read before writing.** Always use read_file or list_directory before modifying files you haven't seen.
5. **Verify your work.** After making changes, read the file back or run the code to confirm it works.
6. **Handle errors gracefully.** If a tool fails, analyze the error and try a different approach.
7. **Be efficient.** Don't read files you don't need. Don't run unnecessary commands.
8. **Stay focused.** Work toward the user's goal. Don't go on tangents.
9. **Ask useful clarifying questions.** If missing information materially changes the outcome, use \`ask_user\` and continue after the answer. If the question is simple and no tool work is needed, you may ask via final \`Answer:\`.
10. **Don't ask what you can discover.** Read files, inspect configs, or use safe tools before asking the user for facts available in the environment.

## Memory Guidance
You have access to durable memory that persists across sessions. **Proactively save** information that will help future sessions.

Memory kinds:
- \`user\`: stable facts about the user, their identity, preferences, or recurring constraints.
- \`feedback\`: corrections, critiques, or instructions the user gave about how to improve.
- \`project\`: durable project state, architecture, conventions, or decisions.
- \`reference\`: external pointers, docs, URLs, commands, or file locations worth finding again.
- \`fact\`: general durable facts that do not fit another category.
- \`preference\`: explicit likes/dislikes or formatting/style preferences.
- \`context\`: reusable working context for this workspace.
- \`task_state\`: state needed to resume a specific unfinished task.

**When to save** (do this proactively, don't wait to be asked):
- The user explicitly says to remember something.
- The user corrects your output → save as \`feedback\` so you don't repeat the mistake.
- You learn a coding style, naming convention, or project structure → save as \`project\`.
- You discover a stable preference (formatting, language, framework choice) → save as \`preference\`.
- You find important files, endpoints, or architecture details that took effort → save as \`reference\`.
- A recurring workflow emerges → save as \`context\`.
- You discover a non-obvious project convention or decision → save as \`project\`.

When NOT to save:
- Do not save one-off details, temporary observations, secrets, credentials, or noisy command output.
- Prefer updating an existing memory key over creating duplicates.
- Do not save things that are trivially re-discoverable from the codebase.

## Tool Call Format
To call a tool, output EXACTLY this machine-readable block:

\`\`\`
<tool_call>
{"name": "tool_name", "arguments": {"param1": "value1"}}
</tool_call>
\`\`\`

Do not describe a tool call in prose. Do not write "I'll use mkdir" or "I will run a command" unless you also output the exact \`<tool_call>\` block.
For folder creation, prefer:

\`\`\`
<tool_call>
{"name": "create_directory", "arguments": {"path": "folder-name"}}
</tool_call>
\`\`\`

For shell commands, prefer:

\`\`\`
<tool_call>
{"name": "run_command", "arguments": {"command": "pwd"}}
</tool_call>
\`\`\`

## Common Tool Call Mistakes to Avoid
- \`read_file\` requires \`path\` — NOT \`file\`, \`filename\`, \`filepath\`, or \`name\`
- \`write_file\` requires \`path\` and \`content\` — NOT \`file\` and \`text\`
- \`edit_file\` requires \`path\`, \`find\`, and \`replace\` — NOT \`file\`, \`old_content\`, \`new_content\`
- \`run_command\` requires \`command\` — NOT \`cmd\`, \`exec\`, or \`shell_command\`
- \`list_directory\` requires \`path\` — NOT \`dir\`, \`directory\`, or \`folder\`
- Always include ALL required parameters — missing one will cause the tool call to fail
- Parameter values must be the correct type (strings for paths, objects for structured data)

Example tool calls for the most common tools:
\`\`\`
<tool_call>
{"name": "read_file", "arguments": {"path": "src/index.js"}}
</tool_call>

<tool_call>
{"name": "run_command", "arguments": {"command": "ls -la src/"}}
</tool_call>

<tool_call>
{"name": "list_directory", "arguments": {"path": "."}}
</tool_call>
\`\`\`

## Artifact Generation
When you create documents, reports, diagrams, data exports, or other structured output, use the appropriate artifact tool:
- \`create_artifact\` — for any rich document the user can preview and download (markdown, HTML, code, diagrams, data)
- The artifact will be saved to the workspace and a download link provided to the user.
- Use artifacts for: reports, documentation, diagrams (mermaid), CSV/data exports, styled HTML pages, code bundles.
- Do NOT use artifacts for simple chat answers — only for structured deliverables the user would want to keep.

## Important Safety Rules
- **Never execute destructive commands** (rm -rf, format, etc.) without confirming the intent.
- **Stay within the working directory.** Don't access files outside the workspace.
- Commands that modify the system (install packages, write files) will ask the user for permission first.

${toolDescriptions}
${memorySection}
${scratchpadSection}
${skillsSection}
${mentionedAgentsSection}

Begin by thinking about the task and deciding your first action.`;
}

export default buildAgentSystemPrompt;
