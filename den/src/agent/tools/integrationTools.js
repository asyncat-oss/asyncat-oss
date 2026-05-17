import { PermissionLevel } from './toolRegistry.js';
import {
  addFeed,
  addReadLaterItem,
  getRssStatus,
  listFeedItems,
  listFeeds,
  listReadLaterItems,
  refreshAllFeeds,
} from '../../integrations/rss/rssService.js';
import {
  getMailStatus,
  listImapMessages,
  sendMailMessage,
} from '../../integrations/mail/mailService.js';

export const integrationTools = [
  {
    name: 'rss_status',
    description: 'Get RSS and read-later integration status and item counts.',
    category: 'integrations',
    permission: PermissionLevel.SAFE,
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => ({ success: true, ...getRssStatus(context.userId) }),
  },
  {
    name: 'rss_list_feeds',
    description: 'List configured RSS/Atom feeds.',
    category: 'integrations',
    permission: PermissionLevel.SAFE,
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => ({ success: true, feeds: listFeeds(context.userId) }),
  },
  {
    name: 'rss_add_feed',
    description: 'Add an RSS or Atom feed URL to the user feed list and import its latest items.',
    category: 'integrations',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'RSS or Atom feed URL.' },
      },
      required: ['url'],
    },
    execute: async (args, context) => {
      try {
        return { success: true, ...(await addFeed(context.userId, args.url)) };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  },
  {
    name: 'rss_latest_items',
    description: 'List latest RSS items. Optionally refresh feeds first.',
    category: 'integrations',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum items to return. Default 20.' },
        unread: { type: 'boolean', description: 'Only include unread feed items.' },
        saved: { type: 'boolean', description: 'Only include saved feed items.' },
        refresh: { type: 'boolean', description: 'Refresh all feeds before listing.' },
      },
    },
    execute: async (args, context) => {
      try {
        const refreshResults = args.refresh ? await refreshAllFeeds(context.userId) : null;
        const items = listFeedItems(context.userId, {
          limit: args.limit || 20,
          unread: Boolean(args.unread),
          saved: Boolean(args.saved),
        });
        return { success: true, refreshed: refreshResults, count: items.length, items };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  },
  {
    name: 'read_later_add',
    description: 'Save a URL to the read-later list with optional notes and tags.',
    category: 'integrations',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to save.' },
        title: { type: 'string', description: 'Optional title.' },
        notes: { type: 'string', description: 'Optional notes.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
      },
      required: ['url'],
    },
    execute: async (args, context) => {
      try {
        return { success: true, item: await addReadLaterItem(context.userId, args) };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  },
  {
    name: 'read_later_list',
    description: 'List saved read-later links.',
    category: 'integrations',
    permission: PermissionLevel.SAFE,
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum items to return. Default 20.' },
        unread: { type: 'boolean', description: 'Only include unread links.' },
      },
    },
    execute: async (args, context) => {
      const items = listReadLaterItems(context.userId, {
        limit: args.limit || 20,
        unread: Boolean(args.unread),
      });
      return { success: true, count: items.length, items };
    },
  },
  {
    name: 'mail_status',
    description: 'Get generic IMAP/SMTP mail integration configuration status.',
    category: 'integrations',
    permission: PermissionLevel.SAFE,
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true, ...getMailStatus() }),
  },
  {
    name: 'mail_list_messages',
    description: 'List recent email headers from the configured IMAP inbox. Requires user approval because it reads private mail.',
    category: 'integrations',
    permission: PermissionLevel.MODERATE,
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum messages to return. Default 10.' },
        unread: { type: 'boolean', description: 'Only include unread messages.' },
        mailbox: { type: 'string', description: 'Mailbox name. Default INBOX.' },
      },
    },
    execute: async (args) => {
      try {
        const messages = await listImapMessages({
          limit: args.limit || 10,
          unread: Boolean(args.unread),
          mailbox: args.mailbox || 'INBOX',
        });
        return { success: true, count: messages.length, messages };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  },
  {
    name: 'mail_send_message',
    description: 'Send an email through the configured SMTP account. This is externally visible and should only be used after explicit user intent.',
    category: 'integrations',
    permission: PermissionLevel.DANGEROUS,
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address or comma-separated recipients.' },
        cc: { type: 'string', description: 'Optional CC recipients.' },
        bcc: { type: 'string', description: 'Optional BCC recipients.' },
        subject: { type: 'string', description: 'Email subject.' },
        text: { type: 'string', description: 'Plain text email body.' },
        html: { type: 'string', description: 'Optional HTML email body.' },
      },
      required: ['to', 'subject'],
    },
    execute: async (args) => {
      try {
        return await sendMailMessage(args);
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  },
];

export default integrationTools;
