const escapeExportHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const stringifyExportValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const sanitizeExportFilename = (title = 'conversation') => {
  const cleaned = String(title || 'conversation')
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return cleaned || 'conversation';
};

const formatExportTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const triggerExportDownload = (content, mimeType, filename) => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const getEventExportTimestamp = (event) => {
  if (event?.data?.timestamp) return event.data.timestamp;
  if (event?.arrivedAt) return event.arrivedAt;
  if (event?.completedAt) return event.completedAt;
  return null;
};

const eventToExportEntry = (event) => {
  const type = event?.type;
  const data = event?.data || {};

  if (type === 'user_goal') {
    return {
      role: 'You',
      kind: 'message',
      timestamp: getEventExportTimestamp(event),
      content: data.goal || '',
    };
  }

  if (type === 'answer') {
    return {
      role: 'The Cat',
      kind: 'message',
      timestamp: getEventExportTimestamp(event),
      content: data.answer || '',
    };
  }

  if (type === 'thinking') {
    return {
      role: 'Agent',
      kind: 'thinking',
      timestamp: getEventExportTimestamp(event),
      content: data.thought || '',
    };
  }

  if (type === 'tool_start') {
    const parts = [`Tool: ${data.tool || 'tool'}`];
    const args = stringifyExportValue(data.args);
    const result = stringifyExportValue(event.result);
    if (args) parts.push(`Args:\n${args}`);
    if (result) parts.push(`Result:\n${result}`);
    return {
      role: 'Agent',
      kind: 'tool',
      timestamp: getEventExportTimestamp(event),
      content: parts.join('\n\n'),
    };
  }

  if (type === 'permission_request') {
    return {
      role: 'Agent',
      kind: 'permission',
      timestamp: getEventExportTimestamp(event),
      content: [
        `Permission requested for ${data.tool || 'tool'}`,
        data.permission ? `Level: ${data.permission}` : '',
        data.resolved ? `Decision: ${data.decision || 'resolved'}` : 'Decision: pending',
        stringifyExportValue(data.args),
      ].filter(Boolean).join('\n'),
    };
  }

  if (type === 'ask_user') {
    return {
      role: 'Agent',
      kind: 'question',
      timestamp: getEventExportTimestamp(event),
      content: data.question || '',
    };
  }

  if (type === 'plan_update') {
    const plan = Array.isArray(data.plan) ? data.plan : [];
    return {
      role: 'Agent',
      kind: 'plan',
      timestamp: getEventExportTimestamp(event),
      content: plan.map(item => `- [${item.status || 'pending'}] ${item.step || item.title || ''}`).join('\n'),
    };
  }

  if (type === 'agent_delegate_start' || type === 'agent_delegate_result') {
    return {
      role: 'Agent',
      kind: 'delegate',
      timestamp: getEventExportTimestamp(event),
      content: stringifyExportValue(data),
    };
  }

  if (type === 'error') {
    return {
      role: 'Agent',
      kind: 'error',
      timestamp: getEventExportTimestamp(event),
      content: data.message || data.error || 'Agent error',
    };
  }

  if (type === 'status' || type === 'skills_loaded' || type === 'run_start') {
    return {
      role: 'Agent',
      kind: type,
      timestamp: getEventExportTimestamp(event),
      content: data.message || stringifyExportValue(data),
    };
  }

  return null;
};

const buildConversationExportEntries = (messages = [], events = [], streamingText = '') => {
  const entries = [];

  if (messages.length > 0) {
    messages.forEach(msg => {
      entries.push({
        role: msg.type === 'user' || msg.role === 'user' ? 'You' : 'The Cat',
        kind: 'message',
        timestamp: msg.timestamp,
        content: msg.content || '',
        projectIds: msg.projectIds || [],
      });
    });

    events
      .filter(event => event?.type && !['user_goal', 'answer', 'delta', 'done', 'session_start'].includes(event.type))
      .map(eventToExportEntry)
      .filter(Boolean)
      .forEach(entry => entries.push(entry));
  } else {
    events
      .map(eventToExportEntry)
      .filter(Boolean)
      .forEach(entry => entries.push(entry));
  }

  if (streamingText?.trim()) {
    entries.push({
      role: 'The Cat',
      kind: 'draft',
      timestamp: new Date().toISOString(),
      content: streamingText,
    });
  }

  return entries.filter(entry => String(entry.content || '').trim());
};

const buildExportHtmlDocument = (title, date, entries) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeExportHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.6; }
    h1 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    .entry { margin: 24px 0; padding: 18px; border-radius: 8px; page-break-inside: avoid; }
    .you { background: #f0f0f0; }
    .the-cat { background: #f9f9f9; border-left: 3px solid #4a9eff; }
    .agent { background: #fffaf0; border-left: 3px solid #f59e0b; }
    .error { background: #fff1f2; border-left: 3px solid #e11d48; }
    .speaker { font-weight: 600; margin-bottom: 10px; color: #111; }
    .kind { color: #777; font-size: 12px; font-weight: 500; margin-left: 6px; text-transform: uppercase; }
    .time { color: #999; font-size: 13px; margin-left: 8px; }
    .content { white-space: pre-wrap; overflow-wrap: anywhere; }
    @media print { body { margin: 20px auto; } .entry { border: 1px solid #eee; } }
  </style>
</head>
<body>
  <h1>${escapeExportHtml(title)}</h1>
  <div class="meta">Exported from Asyncat - ${escapeExportHtml(date)}</div>
  ${entries.map(entry => {
    const roleClass = entry.kind === 'error'
      ? 'error'
      : entry.role === 'You'
        ? 'you'
        : entry.role === 'The Cat'
          ? 'the-cat'
          : 'agent';
    const time = formatExportTime(entry.timestamp);
    return `
      <section class="entry ${roleClass}">
        <div class="speaker">${escapeExportHtml(entry.role)}<span class="kind">${escapeExportHtml(entry.kind)}</span>${time ? `<span class="time">${escapeExportHtml(time)}</span>` : ''}</div>
        <div class="content">${escapeExportHtml(entry.content || '')}</div>
      </section>
    `;
  }).join('')}
</body>
</html>`;

export {
  escapeExportHtml,
  stringifyExportValue,
  sanitizeExportFilename,
  formatExportTime,
  triggerExportDownload,
  getEventExportTimestamp,
  eventToExportEntry,
  buildConversationExportEntries,
  buildExportHtmlDocument,
};
