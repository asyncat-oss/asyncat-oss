const getRelativeConversationTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const diffH = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getRelativeTime = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffH = Math.floor((now - date) / 3_600_000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const cleanTaskAgentTitle = (task, run) => {
  const taskTitle = String(task?.title || '').trim();
  if (taskTitle) return taskTitle;

  const firstLine = String(run?.goal || '').split('\n').find(Boolean) || '';
  return firstLine
    .replace(/^Work on task card\s+/i, '')
    .replace(/\s+\([^)]+\)\.?$/, '')
    .replace(/^"|"$/g, '')
    .trim();
};

const getTaskRunDisplayStatus = (taskRun) => {
  const status = taskRun?.displayStatus || taskRun?.status || '';
  if (status === 'needs_input' || taskRun?.needsInput) {
    return {
      label: 'Needs input',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300',
    };
  }
  if (status === 'running') {
    return {
      label: 'Running',
      className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-300',
    };
  }
  if (status === 'completed') {
    return {
      label: 'Completed',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300',
    };
  }
  if (status === 'failed') {
    return {
      label: 'Failed',
      className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-300',
    };
  }
  return {
    label: status ? status[0].toUpperCase() + status.slice(1) : 'Task run',
    className: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };
};

const getSourceDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
};

function buildConversationSourceCatalog(messages = [], events = []) {
  const sources = [];
  const images = [];
  const seenSources = new Set();
  const seenImages = new Set();

  const addSearchEvent = (searchEvent, answerLabel) => {
    if (!searchEvent) return;

    for (const source of (searchEvent.sources || [])) {
      const url = source?.url;
      if (!url || seenSources.has(url)) continue;
      seenSources.add(url);
      sources.push({
        ...source,
        title: source.title || getSourceDomain(url),
        domain: getSourceDomain(url),
        answerLabel,
      });
    }

    for (const img of (searchEvent.images || [])) {
      const imageUrl = img?.image || img?.thumbnail || img?.url;
      if (!imageUrl || seenImages.has(imageUrl)) continue;
      seenImages.add(imageUrl);
      images.push({
        ...img,
        image: img.image || imageUrl,
        thumbnail: img.thumbnail || img.image || imageUrl,
        title: img.title || img.source || 'Image',
        answerLabel,
      });
    }
  };

  let answerNumber = 0;
  for (const msg of messages || []) {
    if (msg?.type !== 'assistant' && msg?.role !== 'assistant') continue;
    answerNumber += 1;
    addSearchEvent(msg.searchEvent, `Answer ${answerNumber}`);
  }

  for (const ev of events || []) {
    if (ev?.type !== 'answer') continue;
    addSearchEvent(ev.data?.searchEvent, 'Latest answer');
  }

  return {
    sources,
    images,
    sourceCount: sources.length,
    imageCount: images.length,
    totalCount: sources.length + images.length,
  };
}

export {
  getRelativeConversationTime,
  getRelativeTime,
  cleanTaskAgentTitle,
  getTaskRunDisplayStatus,
  getSourceDomain,
  buildConversationSourceCatalog,
};
