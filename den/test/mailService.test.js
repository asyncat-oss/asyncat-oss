import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

import { sendMailMessage, testSmtpConnection } from '../src/integrations/mail/mailService.js';

// A minimal plaintext SMTP server that records what it receives.
function startSmtpServer() {
  const received = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let message = { recipients: [] };
    socket.write('220 localhost ESMTP test\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            received.push(message);
            message = { recipients: [] };
            socket.write('250 2.0.0 queued as test\r\n');
          } else {
            message.data = `${message.data || ''}${line}\n`;
          }
        } else if (/^(EHLO|HELO)/i.test(line)) {
          socket.write('250-localhost\r\n250 8BITMIME\r\n');
        } else if (/^MAIL FROM:/i.test(line)) {
          message.from = line.slice(10);
          socket.write('250 2.1.0 OK\r\n');
        } else if (/^RCPT TO:/i.test(line)) {
          message.recipients.push(line.slice(8));
          socket.write('250 2.1.5 OK\r\n');
        } else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (/^QUIT/i.test(line)) {
          socket.end('221 2.0.0 Bye\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received }));
  });
}

test('sends mail through the configured SMTP server', async () => {
  const { server, port, received } = await startSmtpServer();
  Object.assign(process.env, {
    MAIL_SMTP_HOST: '127.0.0.1',
    MAIL_SMTP_PORT: String(port),
    MAIL_SMTP_SECURE: 'false',
    MAIL_FROM_EMAIL: 'agent@example.test',
    MAIL_FROM_NAME: 'Asyncat "Agent"',
  });
  try {
    assert.deepEqual(await testSmtpConnection(), { success: true });

    const result = await sendMailMessage({
      to: 'you@example.test',
      cc: 'cc@example.test',
      subject: 'Build finished',
      text: 'All checks passed.',
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.accepted, ['you@example.test', 'cc@example.test']);
    assert.equal(received.length, 1);
    assert.match(received[0].from, /agent@example\.test/);
    assert.match(received[0].data, /Subject: Build finished/);
    assert.match(received[0].data, /All checks passed\./);
  } finally {
    server.close();
    for (const key of ['MAIL_SMTP_HOST', 'MAIL_SMTP_PORT', 'MAIL_SMTP_SECURE', 'MAIL_FROM_EMAIL', 'MAIL_FROM_NAME']) {
      delete process.env[key];
    }
  }
});
