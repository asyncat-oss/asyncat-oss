import { createHash, randomUUID } from 'crypto';
import { JSDOM } from 'jsdom';
import db from '../../db/client.js';

const FEED_TIMEOUT_MS = 12000;
const PAGE_TIMEOUT_MS = 10000;
const MAX_ITEMS_PER_FEED = 80;

function nowIso() {
  return new Date().toISOString();
}

function normalizeUrl(value) {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  url.hash = '';
  return url.toString();
}

function hashText(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function truncate(value, max = 5000) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function firstText(node, names = []) {
  for (const name of names) {
    const found = node.getElementsByTagName(name)?.[0];
    const text = found?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function firstAttr(node, tagName, attrName, predicate = null) {
  const nodes = [...(node.getElementsByTagName(tagName) || [])];
  const found = predicate ? nodes.find(predicate) : nodes[0];
  return found?.getAttribute?.(attrName) || '';
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseFeedXml(xml, sourceUrl) {
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  const doc = dom.window.document;
  if (doc.querySelector('parsererror')) {
    throw new Error('Feed XML could not be parsed.');
  }

  const rssChannel = doc.getElementsByTagName('channel')?.[0] || null;
  const atomFeed = doc.getElementsByTagName('feed')?.[0] || null;
  const root = rssChannel || atomFeed || doc;
  const atomMode = Boolean(atomFeed && !rssChannel);

  const feed = {
    title: firstText(root, ['title']) || sourceUrl,
    siteUrl: atomMode
      ? firstAttr(root, 'link', 'href', n => !n.getAttribute('rel') || n.getAttribute('rel') === 'alternate')
      : firstText(root, ['link']),
    description: firstText(root, ['description', 'subtitle']),
  };

  const itemNodes = [
    ...doc.getElementsByTagName('item'),
    ...doc.getElementsByTagName('entry'),
  ].slice(0, MAX_ITEMS_PER_FEED);

  const items = itemNodes.map((item) => {
    const title = firstText(item, ['title']) || 'Untitled';
    const link = atomMode
      ? firstAttr(item, 'link', 'href', n => !n.getAttribute('rel') || n.getAttribute('rel') === 'alternate')
      : firstText(item, ['link']);
    const guid = firstText(item, ['guid', 'id']) || link || hashText(`${title}:${firstText(item, ['pubDate', 'published', 'updated'])}`);
    const content = firstText(item, ['content:encoded', 'content']) || '';
    const summary = firstText(item, ['description', 'summary']) || stripHtml(content);

    return {
      guid: truncate(guid, 1000),
      url: link || null,
      title: truncate(stripHtml(title), 500) || 'Untitled',
      author: truncate(firstText(item, ['dc:creator', 'creator', 'author', 'name']), 500) || null,
      summary: truncate(stripHtml(summary), 2000) || null,
      content: truncate(stripHtml(content), 8000) || null,
      publishedAt: parseDate(firstText(item, ['pubDate', 'published', 'updated', 'dc:date'])),
    };
  });

  return { feed, items };
}

async function fetchText(url, timeoutMs, accept) {
  const res = await fetch(url, {
    headers: {
      Accept: accept,
      'User-Agent': 'Asyncat/0.6 RSS Reader (+https://github.com/asyncat/asyncat)',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return { text: await res.text(), finalUrl: res.url, contentType: res.headers.get('content-type') || '' };
}

async function fetchAndParseFeed(url) {
  const normalized = normalizeUrl(url);
  const fetched = await fetchText(
    normalized,
    FEED_TIMEOUT_MS,
    'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.4'
  );
  return { ...parseFeedXml(fetched.text, fetched.finalUrl || normalized), finalUrl: fetched.finalUrl || normalized };
}

function normalizeFeedRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    title: row.title || row.url,
    siteUrl: row.site_url,
    description: row.description,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    feedId: row.feed_id,
    feedTitle: row.feed_title,
    url: row.url,
    title: row.title,
    author: row.author,
    summary: row.summary,
    content: row.content,
    publishedAt: row.published_at,
    readAt: row.read_at,
    saved: Boolean(row.saved),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeReadLaterRow(row) {
  if (!row) return null;
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch { tags = []; }
  return {
    id: row.id,
    url: row.url,
    title: row.title || row.url,
    excerpt: row.excerpt,
    notes: row.notes,
    tags,
    readAt: row.read_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function saveFeedItems(userId, feedId, items) {
  const stmt = db.prepare(`
    INSERT INTO rss_items (
      id, feed_id, user_id, guid, url, title, author, summary, content, published_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(feed_id, guid) DO UPDATE SET
      url          = COALESCE(excluded.url, rss_items.url),
      title        = excluded.title,
      author       = COALESCE(excluded.author, rss_items.author),
      summary      = COALESCE(excluded.summary, rss_items.summary),
      content      = COALESCE(excluded.content, rss_items.content),
      published_at = COALESCE(excluded.published_at, rss_items.published_at),
      updated_at   = datetime('now')
  `);

  const tx = db.transaction(() => {
    for (const item of items) {
      stmt.run(
        randomUUID(),
        feedId,
        userId,
        item.guid,
        item.url,
        item.title,
        item.author,
        item.summary,
        item.content,
        item.publishedAt
      );
    }
  });
  tx();
}

export async function addFeed(userId, url) {
  const parsed = await fetchAndParseFeed(url);
  const feedUrl = parsed.finalUrl || normalizeUrl(url);
  db.prepare(`
    INSERT INTO rss_feeds (
      id, user_id, url, title, site_url, description, last_checked_at, last_error, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))
    ON CONFLICT(user_id, url) DO UPDATE SET
      title           = excluded.title,
      site_url        = excluded.site_url,
      description     = excluded.description,
      last_checked_at = excluded.last_checked_at,
      last_error      = NULL,
      updated_at      = datetime('now')
  `).run(
    randomUUID(),
    userId,
    feedUrl,
    parsed.feed.title,
    parsed.feed.siteUrl || null,
    parsed.feed.description || null,
    nowIso()
  );

  const feed = db.prepare('SELECT * FROM rss_feeds WHERE user_id = ? AND url = ?').get(userId, feedUrl);
  saveFeedItems(userId, feed.id, parsed.items);
  return { feed: normalizeFeedRow(feed), imported: parsed.items.length };
}

export function listFeeds(userId) {
  return db.prepare(`
    SELECT f.*,
           COUNT(i.id) AS item_count,
           SUM(CASE WHEN i.read_at IS NULL THEN 1 ELSE 0 END) AS unread_count
    FROM rss_feeds f
    LEFT JOIN rss_items i ON i.feed_id = f.id
    WHERE f.user_id = ?
    GROUP BY f.id
    ORDER BY f.title COLLATE NOCASE
  `).all(userId).map(row => ({
    ...normalizeFeedRow(row),
    itemCount: Number(row.item_count || 0),
    unreadCount: Number(row.unread_count || 0),
  }));
}

export async function refreshFeed(userId, feedId) {
  const feed = db.prepare('SELECT * FROM rss_feeds WHERE id = ? AND user_id = ?').get(feedId, userId);
  if (!feed) throw new Error('Feed not found.');

  try {
    const parsed = await fetchAndParseFeed(feed.url);
    db.prepare(`
      UPDATE rss_feeds
      SET title = ?, site_url = ?, description = ?, last_checked_at = ?, last_error = NULL, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(parsed.feed.title, parsed.feed.siteUrl || null, parsed.feed.description || null, nowIso(), feedId, userId);
    saveFeedItems(userId, feedId, parsed.items);
    return { feed: normalizeFeedRow(db.prepare('SELECT * FROM rss_feeds WHERE id = ?').get(feedId)), imported: parsed.items.length };
  } catch (err) {
    db.prepare(`
      UPDATE rss_feeds
      SET last_checked_at = ?, last_error = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(nowIso(), err.message, feedId, userId);
    throw err;
  }
}

export async function refreshAllFeeds(userId) {
  const feeds = db.prepare('SELECT id FROM rss_feeds WHERE user_id = ? ORDER BY updated_at').all(userId);
  const results = [];
  for (const feed of feeds) {
    try {
      results.push({ feedId: feed.id, success: true, ...(await refreshFeed(userId, feed.id)) });
    } catch (err) {
      results.push({ feedId: feed.id, success: false, error: err.message });
    }
  }
  return results;
}

export function deleteFeed(userId, feedId) {
  const result = db.prepare('DELETE FROM rss_feeds WHERE id = ? AND user_id = ?').run(feedId, userId);
  return result.changes > 0;
}

export function listFeedItems(userId, { feedId = null, limit = 30, unread = false, saved = false } = {}) {
  const params = [userId];
  const clauses = ['i.user_id = ?'];
  if (feedId) {
    clauses.push('i.feed_id = ?');
    params.push(feedId);
  }
  if (unread) clauses.push('i.read_at IS NULL');
  if (saved) clauses.push('i.saved = 1');
  params.push(Math.max(1, Math.min(100, Number(limit || 30))));

  return db.prepare(`
    SELECT i.*, f.title AS feed_title
    FROM rss_items i
    JOIN rss_feeds f ON f.id = i.feed_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY COALESCE(i.published_at, i.created_at) DESC
    LIMIT ?
  `).all(...params).map(normalizeItemRow);
}

export function updateFeedItem(userId, itemId, fields = {}) {
  const sets = [];
  const values = [];
  if (fields.read !== undefined) {
    sets.push('read_at = ?');
    values.push(fields.read ? nowIso() : null);
  }
  if (fields.saved !== undefined) {
    sets.push('saved = ?');
    values.push(fields.saved ? 1 : 0);
  }
  if (!sets.length) return null;
  values.push(itemId, userId);
  db.prepare(`
    UPDATE rss_items
    SET ${sets.join(', ')}, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(...values);
  return normalizeItemRow(db.prepare(`
    SELECT i.*, f.title AS feed_title
    FROM rss_items i JOIN rss_feeds f ON f.id = i.feed_id
    WHERE i.id = ? AND i.user_id = ?
  `).get(itemId, userId));
}

async function fetchPageMetadata(url) {
  try {
    const fetched = await fetchText(url, PAGE_TIMEOUT_MS, 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.4');
    const html = fetched.text;
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
    return {
      title: title ? truncate(stripHtml(title), 500) : '',
      excerpt: description ? truncate(stripHtml(description), 1000) : '',
    };
  } catch {
    return { title: '', excerpt: '' };
  }
}

export async function addReadLaterItem(userId, { url, title = '', excerpt = '', notes = '', tags = [] } = {}) {
  const normalized = normalizeUrl(url);
  const metadata = title && excerpt ? {} : await fetchPageMetadata(normalized);
  const cleanTags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean).slice(0, 20) : [];

  db.prepare(`
    INSERT INTO read_later_items (
      id, user_id, url, title, excerpt, notes, tags, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, url) DO UPDATE SET
      title      = COALESCE(NULLIF(excluded.title, ''), read_later_items.title),
      excerpt    = COALESCE(NULLIF(excluded.excerpt, ''), read_later_items.excerpt),
      notes      = COALESCE(NULLIF(excluded.notes, ''), read_later_items.notes),
      tags       = excluded.tags,
      archived_at = NULL,
      updated_at = datetime('now')
  `).run(
    randomUUID(),
    userId,
    normalized,
    truncate(title || metadata.title || '', 500),
    truncate(excerpt || metadata.excerpt || '', 1000),
    truncate(notes || '', 2000),
    JSON.stringify(cleanTags)
  );

  return normalizeReadLaterRow(db.prepare('SELECT * FROM read_later_items WHERE user_id = ? AND url = ?').get(userId, normalized));
}

export function listReadLaterItems(userId, { limit = 30, includeArchived = false, unread = false } = {}) {
  const params = [userId];
  const clauses = ['user_id = ?'];
  if (!includeArchived) clauses.push('archived_at IS NULL');
  if (unread) clauses.push('read_at IS NULL');
  params.push(Math.max(1, Math.min(100, Number(limit || 30))));

  return db.prepare(`
    SELECT *
    FROM read_later_items
    WHERE ${clauses.join(' AND ')}
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(...params).map(normalizeReadLaterRow);
}

export function updateReadLaterItem(userId, itemId, fields = {}) {
  const sets = [];
  const values = [];
  if (fields.read !== undefined) {
    sets.push('read_at = ?');
    values.push(fields.read ? nowIso() : null);
  }
  if (fields.archived !== undefined) {
    sets.push('archived_at = ?');
    values.push(fields.archived ? nowIso() : null);
  }
  if (fields.notes !== undefined) {
    sets.push('notes = ?');
    values.push(truncate(fields.notes, 2000));
  }
  if (Array.isArray(fields.tags)) {
    sets.push('tags = ?');
    values.push(JSON.stringify(fields.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 20)));
  }
  if (!sets.length) return null;
  values.push(itemId, userId);
  db.prepare(`
    UPDATE read_later_items
    SET ${sets.join(', ')}, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(...values);
  return normalizeReadLaterRow(db.prepare('SELECT * FROM read_later_items WHERE id = ? AND user_id = ?').get(itemId, userId));
}

export function deleteReadLaterItem(userId, itemId) {
  const result = db.prepare('DELETE FROM read_later_items WHERE id = ? AND user_id = ?').run(itemId, userId);
  return result.changes > 0;
}

export function getRssStatus(userId) {
  const feeds = db.prepare('SELECT COUNT(*) AS count FROM rss_feeds WHERE user_id = ?').get(userId)?.count || 0;
  const unread = db.prepare('SELECT COUNT(*) AS count FROM rss_items WHERE user_id = ? AND read_at IS NULL').get(userId)?.count || 0;
  const saved = db.prepare('SELECT COUNT(*) AS count FROM rss_items WHERE user_id = ? AND saved = 1').get(userId)?.count || 0;
  const readLater = db.prepare('SELECT COUNT(*) AS count FROM read_later_items WHERE user_id = ? AND archived_at IS NULL').get(userId)?.count || 0;
  const readLaterUnread = db.prepare('SELECT COUNT(*) AS count FROM read_later_items WHERE user_id = ? AND archived_at IS NULL AND read_at IS NULL').get(userId)?.count || 0;
  return {
    connected: feeds > 0 || readLater > 0,
    configured: feeds > 0 || readLater > 0,
    feeds,
    unread,
    saved,
    readLater,
    readLaterUnread,
  };
}
