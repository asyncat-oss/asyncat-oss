function normalizeAgentToolRows(rows = []) {
  return rows.map(row => ({
    tool: row.tool_name || row.tool,
    toolCallId: row.tool_call_id || row.toolCallId || row.call_id || row.callId,
    args: row.args,
    result: row.result,
    round: row.round,
    permission: row.permission_level || row.permission,
    permissionDecision: row.permission_decision || row.permissionDecision,
    permissionReason: row.permission_reason || row.permissionReason,
    workingDir: row.working_dir || row.workingDir,
    timestamp: row.started_at || row.timestamp,
  }));
}

function normalizePermissionDecision(decision) {
  if (!decision) return null;
  if (['allow', 'allow_session', 'allow_always', 'session_approved', 'auto_approved', 'local_auto'].includes(decision)) {
    return decision;
  }
  if (['deny', 'denied', 'not_executed'].includes(decision)) return 'deny';
  return decision;
}

function argsFingerprint(args) {
  try {
    return JSON.stringify(args || {});
  } catch {
    return '';
  }
}

function inferHistoricalPermissionDecision(events, permissionIndex) {
  const permissionEvent = events[permissionIndex];
  const tool = permissionEvent?.data?.tool || permissionEvent?.data?.toolName;
  const argsKey = argsFingerprint(permissionEvent?.data?.args);

  for (let i = permissionIndex + 1; i < events.length; i += 1) {
    const event = events[i];
    if (event?.type === 'permission_request') break;
    if (event?.type !== 'tool_start') continue;
    if ((event.data?.tool || event.data?.toolName) !== tool) continue;
    if (argsFingerprint(event.data?.args) !== argsKey) continue;

    return normalizePermissionDecision(event.data?.permissionDecision)
      || (event.result?.error || event.result?.success === false ? 'deny' : 'allow');
  }

  return normalizePermissionDecision(permissionEvent?.data?.decision) || 'resolved';
}

function asHistoricalPermissionEvent(event, decision) {
  const { requestId, expiresInMs, resolving, ...restData } = event.data || {};
  return {
    ...event,
    data: {
      ...restData,
      resolved: true,
      historical: true,
      decision: normalizePermissionDecision(decision) || 'resolved',
    },
  };
}

function buildAgentEventsFromSession(session, auditRows = []) {
  const rounds = Array.isArray(session?.scratchpad?.conversationRounds)
    ? session.scratchpad.conversationRounds
    : [];
  const toolRows = normalizeAgentToolRows(
    auditRows.length ? auditRows : (session?.toolHistory || [])
  );

  if (!rounds.length) {
    const events = [];
    if (session?.goal) events.push({ type: 'user_goal', data: { goal: session.goal } });
    toolRows.forEach(tc => {
      events.push({
        type: 'tool_start',
        data: {
          tool: tc.tool,
          toolCallId: tc.toolCallId,
          args: tc.args,
          round: tc.round,
          permission: tc.permission,
          permissionDecision: tc.permissionDecision,
          permissionReason: tc.permissionReason,
          workingDir: tc.workingDir,
        },
        result: tc.result,
      });
    });
    const finalAnswer = session?.scratchpad?.finalAnswer;
    if (finalAnswer) {
      events.push({ type: 'answer', data: { answer: finalAnswer, round: session?.totalRounds } });
    }
    return events;
  }

  const events = [];
  rounds.forEach((round, idx) => {
    events.push({ type: 'user_goal', data: { goal: round.goal, timestamp: round.timestamp } });

    const hasRange = Number.isFinite(round.startRound) && Number.isFinite(round.endRound);
    const scopedTools = hasRange
      ? toolRows.filter(tc => tc.round > round.startRound && tc.round <= round.endRound)
      : [];
    const scopedReasoning = Array.isArray(round.reasoning)
      ? round.reasoning.filter(item => item?.thought)
      : [];

    [
      ...scopedReasoning.map(item => ({ kind: 'thinking', round: item.round, timestamp: item.timestamp, item })),
      ...scopedTools.map(item => ({ kind: 'tool', round: item.round, timestamp: item.timestamp, item })),
    ]
      .sort((a, b) => {
        const roundDelta = (a.round || 0) - (b.round || 0);
        if (roundDelta !== 0) return roundDelta;
        if (a.kind !== b.kind) return a.kind === 'thinking' ? -1 : 1;
        return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
      })
      .forEach(entry => {
        if (entry.kind === 'thinking') {
          events.push({
            type: 'thinking',
            data: { thought: entry.item.thought, round: entry.item.round },
          });
          return;
        }

        const tc = entry.item;
        events.push({
          type: 'tool_start',
          data: {
            tool: tc.tool,
            toolCallId: tc.toolCallId,
            args: tc.args,
            round: tc.round,
            permission: tc.permission,
            permissionDecision: tc.permissionDecision,
            permissionReason: tc.permissionReason,
            workingDir: tc.workingDir,
          },
          result: tc.result,
        });
      });

    if (round.answer) {
      const displayRound = hasRange ? Math.max(1, round.endRound - round.startRound) : idx + 1;
      events.push({ type: 'answer', data: { answer: round.answer, round: displayRound } });
    }
  });

  return events;
}

function isLikelyToolActionRequest(goal = '') {
  return /\b(create|add|update|edit|delete|remove|move|rename|write|save|schedule|run|execute|install|open|read|inspect|check|search|find|browse|fix|change|modify)\b/i.test(goal);
}

function getLeadingProfileMention(goal = '', mentions = []) {
  if (!Array.isArray(mentions) || mentions.length !== 1) return null;
  const mention = mentions[0];
  const handle = String(mention?.handle || '').toLowerCase();
  if (!handle) return null;
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*#${escaped}(?:\\b|\\s|$)`, 'i').test(goal) ? mention : null;
}

function buildEventsFromMessages(messages = []) {
  const events = [];
  for (const msg of messages) {
    if (msg.type === 'user') {
      events.push({
        type: 'user_goal',
        data: {
          goal: msg.content,
          timestamp: msg.timestamp,
          messageId: msg.id,
          toolsEnabled: msg.toolsEnabled,
          agentMode: msg.agentMode,
          agentMentions: msg.agentMentions || [],
          fileAttachments: msg.fileAttachments || [],
          branchId: msg.branchId,
          parentBranchId: msg.parentBranchId,
          branchPointMessageId: msg.branchPointMessageId,
          editedFromMessageId: msg.editedFromMessageId,
          pinned: Boolean(msg.pinned),
          bookmarked: Boolean(msg.bookmarked),
        },
      });
    } else if (msg.type === 'assistant') {
      if (Array.isArray(msg.agentEvents) && msg.agentEvents.length > 0) {
        const agentEvents = msg.agentEvents.filter(ev => ev?.type && ev.type !== 'user_goal' && ev.type !== 'answer');
        events.push(...agentEvents.map((ev, index) => (
          ev.type === 'permission_request'
            ? asHistoricalPermissionEvent(ev, inferHistoricalPermissionDecision(agentEvents, index))
            : ev
        )));
      }
      events.push({
        type: msg.isError ? 'error' : 'answer',
        data: msg.isError
          ? { message: msg.content }
          : {
              answer: msg.content,
              messageId: msg.id,
              toolsEnabled: msg.toolsEnabled,
              agentMode: msg.agentMode,
              searchEvent: msg.searchEvent || null,
              variants: msg.variants || [],
              activeVariantIndex: msg.activeVariantIndex,
              pinned: Boolean(msg.pinned),
              bookmarked: Boolean(msg.bookmarked),
            },
      });
    }
  }
  return events;
}

function getPersistableAgentEvents(events = []) {
  return events
    .filter(ev => ev?.type && !['user_goal', 'answer', 'delta', 'done', 'session_start', 'tool_result', 'tool_progress'].includes(ev.type))
    .map((ev, index, filteredEvents) => {
      const event = ev.type === 'permission_request'
        ? asHistoricalPermissionEvent(ev, inferHistoricalPermissionDecision(filteredEvents, index))
        : ev;

      return {
        type: event.type,
        data: event.data,
        result: event.result,
        arrivedAt: event.arrivedAt,
        completedAt: event.completedAt,
      };
    });
}

function buildSearchEvent(events = []) {
  const sources = [];
  const images = [];
  const seenUrls = new Set();

  const lastGoalIndex = events.reduce((lastIndex, ev, index) => (
    ev?.type === 'user_goal' ? index : lastIndex
  ), -1);
  const scopedEvents = lastGoalIndex >= 0 ? events.slice(lastGoalIndex + 1) : events;

  for (const ev of scopedEvents) {
    if (ev.type !== 'tool_start' || !ev.result) continue;
    const tool = ev.data?.tool;
    const result = ev.result;

    if (tool === 'web_search' && result?.success) {
      for (const r of (result.results || [])) {
        if (r.url && !seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          sources.push({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            query: result.query,
            tool: 'web_search',
          });
        }
      }
      for (const img of (result.images || [])) {
        if (img.image && !seenUrls.has(img.image)) {
          seenUrls.add(img.image);
          images.push({
            title: img.title,
            url: img.url,
            image: img.image,
            thumbnail: img.thumbnail,
            source: img.source,
            width: img.width,
            height: img.height,
          });
        }
      }
    }

    if ((tool === 'fetch_url' || tool === 'http_get' || tool === 'browse_url') && result?.success) {
      const url = result.url || result.finalUrl || ev.data?.args?.url;
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        sources.push({
          title: result.title || url,
          url,
          snippet: result.content ? String(result.content).slice(0, 200) : '',
          query: null,
          tool,
        });
      }
    }

    if (tool === 'search_images' && result?.success) {
      for (const img of (result.images || [])) {
        if (img.image && !seenUrls.has(img.image)) {
          seenUrls.add(img.image);
          images.push({
            title: img.title,
            url: img.url,
            image: img.image,
            thumbnail: img.thumbnail,
            source: img.source,
            width: img.width,
            height: img.height,
          });
        }
      }
    }
  }

  if (sources.length === 0 && images.length === 0) return null;

  return {
    sources,
    images,
    sourceCount: sources.length,
    imageCount: images.length,
  };
}

export {
  normalizeAgentToolRows,
  buildAgentEventsFromSession,
  isLikelyToolActionRequest,
  getLeadingProfileMention,
  buildEventsFromMessages,
  getPersistableAgentEvents,
  buildSearchEvent,
};
