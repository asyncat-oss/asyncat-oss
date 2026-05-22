import { sendMailMessage, getMailStatus } from '../mail/mailService.js';
import db from '../../db/client.js';

function logNotification({ channel, title, message, severity, success, error }) {
  try {
    db.prepare(
      `INSERT INTO notification_log (channel, title, message, severity, success, error)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      String(channel || ''),
      String(title || '').slice(0, 500),
      String(message || '').slice(0, 2000),
      String(severity || 'info'),
      success ? 1 : 0,
      error ? String(error).slice(0, 500) : null,
    );
  } catch {
    // Logging failures must never crash the notification flow.
  }
}

const CHANNEL_LABELS = {
  email: 'Email',
  discord: 'Discord',
  slack: 'Slack',
  telegram: 'Telegram',
};

function splitList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function severityColor(severity = 'info') {
  switch (String(severity).toLowerCase()) {
    case 'success': return 0x22c55e;
    case 'warning': return 0xf59e0b;
    case 'error': return 0xef4444;
    default: return 0x6366f1;
  }
}

function configuredChannels() {
  const mail = getMailStatus();
  return {
    email: Boolean(process.env.NOTIFY_EMAIL_TO && mail.smtpConfigured),
    discord: Boolean(process.env.NOTIFY_DISCORD_WEBHOOK),
    slack: Boolean(process.env.NOTIFY_SLACK_WEBHOOK),
    telegram: Boolean(process.env.NOTIFY_TELEGRAM_BOT_TOKEN && process.env.NOTIFY_TELEGRAM_CHAT_ID),
  };
}

function resolveChannels(channels) {
  const configured = configuredChannels();
  const requested = Array.isArray(channels)
    ? channels
    : splitList(channels || process.env.NOTIFY_DEFAULT_CHANNELS || '');
  const normalized = requested.map(ch => String(ch || '').toLowerCase()).filter(Boolean);
  const selected = normalized.length ? normalized : Object.keys(configured).filter(ch => configured[ch]);
  return [...new Set(selected)].filter(ch => CHANNEL_LABELS[ch]);
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
  }
  return true;
}

async function notifyEmail({ title, message, severity, to }) {
  const recipient = to || process.env.NOTIFY_EMAIL_TO;
  if (!recipient) throw new Error('NOTIFY_EMAIL_TO is not configured.');
  return sendMailMessage({
    to: recipient,
    subject: `[Asyncat/${severity || 'info'}] ${title}`,
    text: message,
  });
}

async function notifyDiscord({ title, message, severity }) {
  const webhook = process.env.NOTIFY_DISCORD_WEBHOOK;
  if (!webhook) throw new Error('NOTIFY_DISCORD_WEBHOOK is not configured.');
  await postJson(webhook, {
    content: '',
    embeds: [{
      title,
      description: message,
      color: severityColor(severity),
      timestamp: new Date().toISOString(),
      footer: { text: 'Asyncat' },
    }],
  });
  return { success: true };
}

async function notifySlack({ title, message, severity }) {
  const webhook = process.env.NOTIFY_SLACK_WEBHOOK;
  if (!webhook) throw new Error('NOTIFY_SLACK_WEBHOOK is not configured.');
  await postJson(webhook, {
    text: `${title}\n${message}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title.slice(0, 150), emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: message.slice(0, 2800) } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Asyncat notification · ${severity || 'info'}` }] },
    ],
  });
  return { success: true };
}

async function notifyTelegram({ title, message, severity }) {
  const token = process.env.NOTIFY_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.NOTIFY_TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('NOTIFY_TELEGRAM_BOT_TOKEN and NOTIFY_TELEGRAM_CHAT_ID are required.');
  const text = `*${title.replace(/\*/g, '')}*\n${message}\n\n_${severity || 'info'} · Asyncat_`;
  await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });
  return { success: true };
}

export function getNotificationStatus() {
  const channels = configuredChannels();
  const configured = Object.values(channels).some(Boolean);
  return {
    connected: configured,
    configured,
    channels,
    defaultChannels: resolveChannels(process.env.NOTIFY_DEFAULT_CHANNELS),
    emailTo: process.env.NOTIFY_EMAIL_TO || '',
    telegramTokenSet: Boolean(process.env.NOTIFY_TELEGRAM_BOT_TOKEN),
  };
}

export async function notifyChannels({ channels, title, message, severity = 'info', email_to: emailTo, dry_run: dryRun = false } = {}) {
  if (!title) throw new Error('title is required.');
  if (!message) throw new Error('message is required.');

  const selected = resolveChannels(channels);
  if (!selected.length) throw new Error('No notification channels selected or configured.');

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      channels: selected,
      message: `Would notify ${selected.map(ch => CHANNEL_LABELS[ch]).join(', ')}.`,
    };
  }

  const results = [];
  for (const channel of selected) {
    try {
      if (channel === 'email') await notifyEmail({ title, message, severity, to: emailTo });
      else if (channel === 'discord') await notifyDiscord({ title, message, severity });
      else if (channel === 'slack') await notifySlack({ title, message, severity });
      else if (channel === 'telegram') await notifyTelegram({ title, message, severity });
      logNotification({ channel, title, message, severity, success: true });
      results.push({ channel, success: true });
    } catch (err) {
      logNotification({ channel, title, message, severity, success: false, error: err.message });
      results.push({ channel, success: false, error: err.message });
    }
  }

  const ok = results.filter(item => item.success);
  const failed = results.filter(item => !item.success);
  return {
    success: ok.length > 0,
    channels: selected,
    delivered: ok.map(item => item.channel),
    failed,
    results,
    message: ok.length
      ? `Delivered notification to ${ok.map(item => CHANNEL_LABELS[item.channel]).join(', ')}${failed.length ? `; ${failed.length} failed` : ''}.`
      : 'Notification delivery failed for all selected channels.',
  };
}
