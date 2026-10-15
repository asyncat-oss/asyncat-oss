const SQLITE_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

const parseConversationDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = SQLITE_UTC_TIMESTAMP_RE.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

// "Just now", "5 min ago", "3 h ago", "2 d ago", then a date: the same words
// on All chats, a project's chat list and the sidebar.
const relativeAgo = (dateString, dateOptions, now = Date.now()) => {
  const date = parseConversationDate(dateString);
  if (!date) return '';
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return date.toLocaleDateString('en-US', dateOptions);
};

const getRelativeConversationTime = (dateString, now) => relativeAgo(dateString, { month: 'short', day: 'numeric' }, now);

const getRelativeTime = (dateString, now) => relativeAgo(dateString, { month: 'short', day: 'numeric', year: 'numeric' }, now);

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
  parseConversationDate,
  getRelativeConversationTime,
  getRelativeTime,
  getSourceDomain,
  buildConversationSourceCatalog,
};
