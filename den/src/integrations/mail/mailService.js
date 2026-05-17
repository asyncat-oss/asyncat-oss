import net from 'net';
import tls from 'tls';
import nodemailer from 'nodemailer';

const DEFAULT_TIMEOUT_MS = 15000;

function boolEnv(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function intEnv(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getMailConfig() {
  return {
    imap: {
      host: process.env.MAIL_IMAP_HOST || '',
      port: intEnv(process.env.MAIL_IMAP_PORT, 993),
      secure: boolEnv(process.env.MAIL_IMAP_SECURE, true),
      user: process.env.MAIL_IMAP_USER || '',
      password: process.env.MAIL_IMAP_PASSWORD || '',
    },
    smtp: {
      host: process.env.MAIL_SMTP_HOST || '',
      port: intEnv(process.env.MAIL_SMTP_PORT, 465),
      secure: boolEnv(process.env.MAIL_SMTP_SECURE, true),
      user: process.env.MAIL_SMTP_USER || '',
      password: process.env.MAIL_SMTP_PASSWORD || '',
      fromEmail: process.env.MAIL_FROM_EMAIL || process.env.MAIL_SMTP_USER || process.env.MAIL_IMAP_USER || '',
      fromName: process.env.MAIL_FROM_NAME || '',
    },
  };
}

export function isImapConfigured() {
  const { imap } = getMailConfig();
  return Boolean(imap.host && imap.user && imap.password);
}

export function isSmtpConfigured() {
  const { smtp } = getMailConfig();
  return Boolean(smtp.host && smtp.fromEmail);
}

export function getMailStatus() {
  const { imap, smtp } = getMailConfig();
  const imapConfigured = isImapConfigured();
  const smtpConfigured = isSmtpConfigured();
  return {
    connected: imapConfigured || smtpConfigured,
    configured: imapConfigured || smtpConfigured,
    imapConfigured,
    smtpConfigured,
    imapHost: imap.host,
    smtpHost: smtp.host,
    email: smtp.fromEmail || imap.user || '',
  };
}

function quoteImap(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function decodeMimeWords(value) {
  return String(value || '').replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_m, charset, encoding, data) => {
    try {
      const normalizedCharset = String(charset || '').toLowerCase();
      if (!['utf-8', 'us-ascii', 'ascii'].includes(normalizedCharset)) return data;
      if (String(encoding).toUpperCase() === 'B') {
        return Buffer.from(data, 'base64').toString('utf8');
      }
      return Buffer.from(
        data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
        'binary'
      ).toString('utf8');
    } catch {
      return data;
    }
  });
}

function parseHeaders(rawHeaders) {
  const headers = {};
  const unfolded = String(rawHeaders || '').replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = decodeMimeWords(line.slice(idx + 1).trim());
    if (key) headers[key] = value;
  }
  return headers;
}

function parseFetchResponse(response) {
  const messages = [];
  const re = /\* \d+ FETCH \(([\s\S]*?)(?=\r?\n\* \d+ FETCH \(|\r?\nA\d+ (?:OK|NO|BAD)|$)/g;
  let match;
  while ((match = re.exec(response)) !== null) {
    const block = match[1];
    const uid = block.match(/\bUID\s+(\d+)/i)?.[1] || null;
    const flagsText = block.match(/\bFLAGS\s+\(([^)]*)\)/i)?.[1] || '';
    const literal = block.match(/\{\d+\}\r?\n([\s\S]*?)\r?\n\)?\s*$/)?.[1] || '';
    const headers = parseHeaders(literal);
    messages.push({
      uid,
      messageId: headers['message-id'] || null,
      subject: headers.subject || '(no subject)',
      from: headers.from || '',
      to: headers.to || '',
      date: headers.date || '',
      seen: /\\Seen/i.test(flagsText),
      flags: flagsText.split(/\s+/).filter(Boolean),
    });
  }
  return messages;
}

class ImapClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.buffer = '';
    this.tagCounter = 1;
  }

  async connect() {
    const { host, port, secure } = this.config;
    this.socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });

    this.socket.setEncoding('utf8');
    this.socket.on('data', chunk => {
      this.buffer += chunk;
    });
    this.socket.on('error', () => {});

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('IMAP connection timed out')), DEFAULT_TIMEOUT_MS);
      this.socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once('error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const greeting = await this.waitFor(text => /\* (OK|PREAUTH)/i.test(text));
    if (!/\* (OK|PREAUTH)/i.test(greeting)) throw new Error('IMAP server did not send an OK greeting.');
  }

  waitFor(predicate, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (predicate(this.buffer)) {
          const out = this.buffer;
          this.buffer = '';
          resolve(out);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error('IMAP command timed out'));
          return;
        }
        setTimeout(check, 25);
      };
      check();
    });
  }

  async command(command) {
    const tag = `A${String(this.tagCounter++).padStart(3, '0')}`;
    this.socket.write(`${tag} ${command}\r\n`);
    const response = await this.waitFor(text => new RegExp(`\\r?\\n?${tag} (OK|NO|BAD)`, 'i').test(text));
    if (new RegExp(`${tag} (NO|BAD)`, 'i').test(response)) {
      const line = response.split(/\r?\n/).find(l => l.startsWith(`${tag} `)) || 'IMAP command failed';
      throw new Error(line.replace(`${tag} `, ''));
    }
    return response;
  }

  async login() {
    await this.command(`LOGIN ${quoteImap(this.config.user)} ${quoteImap(this.config.password)}`);
  }

  async examine(mailbox = 'INBOX') {
    await this.command(`EXAMINE ${quoteImap(mailbox)}`);
  }

  async search({ unread = false } = {}) {
    const response = await this.command(`UID SEARCH ${unread ? 'UNSEEN' : 'ALL'}`);
    const line = response.split(/\r?\n/).find(l => l.startsWith('* SEARCH')) || '';
    return line.replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean);
  }

  async fetchHeaders(uids) {
    if (!uids.length) return [];
    const response = await this.command(`UID FETCH ${uids.join(',')} (UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)])`);
    return parseFetchResponse(response);
  }

  close() {
    if (!this.socket) return;
    try { this.socket.write('A999 LOGOUT\r\n'); } catch { /* ignore */ }
    try { this.socket.end(); } catch { /* ignore */ }
  }
}

export async function listImapMessages({ limit = 10, unread = false, mailbox = 'INBOX' } = {}) {
  if (!isImapConfigured()) throw new Error('IMAP is not configured.');
  const { imap } = getMailConfig();
  const client = new ImapClient(imap);
  try {
    await client.connect();
    await client.login();
    await client.examine(mailbox);
    const uids = await client.search({ unread });
    const selected = uids.slice(-Math.max(1, Math.min(50, Number(limit || 10))));
    const messages = await client.fetchHeaders(selected);
    return messages.reverse();
  } finally {
    client.close();
  }
}

export async function testImapConnection() {
  await listImapMessages({ limit: 1 });
  return { success: true };
}

function createTransporter() {
  if (!isSmtpConfigured()) throw new Error('SMTP is not configured.');
  const { smtp } = getMailConfig();
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user && smtp.password ? { user: smtp.user, pass: smtp.password } : undefined,
  });
}

export async function testSmtpConnection() {
  const transporter = createTransporter();
  await transporter.verify();
  return { success: true };
}

export async function sendMailMessage({ to, cc = '', bcc = '', subject, text = '', html = '' } = {}) {
  if (!to) throw new Error('Recipient is required.');
  if (!subject) throw new Error('Subject is required.');
  if (!text && !html) throw new Error('Message text or HTML is required.');

  const { smtp } = getMailConfig();
  const transporter = createTransporter();
  const from = smtp.fromName ? `"${smtp.fromName.replace(/"/g, '\\"')}" <${smtp.fromEmail}>` : smtp.fromEmail;
  const info = await transporter.sendMail({
    from,
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject,
    text: text || undefined,
    html: html || undefined,
  });

  return {
    success: true,
    messageId: info.messageId,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
  };
}
