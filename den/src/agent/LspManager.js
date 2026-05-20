// den/src/agent/LspManager.js
// ─── Language Server Protocol Client Coordinator ───────────────────────────
// Spawns LSP processes (typescript-language-server, pyright-langserver)
// and handles JSON-RPC framing (Content-Length) over standard input/output.

import { spawn } from 'child_process';
import path from 'path';

class LspClient {
  constructor(language, workspaceRoot, executable, args) {
    this.language = language;
    this.workspaceRoot = workspaceRoot;
    this.executable = executable;
    this.args = args;
    this.process = null;
    this.buffer = '';
    this.contentLength = -1;
    this.messageId = 1;
    this.pendingRequests = new Map();
    this.initialized = false;
    this.documentVersions = new Map(); // fileUri -> version
    this.latestDiagnostics = new Map(); // fileUri -> diagnostics[]
  }

  async start() {
    console.log(`[LSP Client] Spawning ${this.executable} in ${this.workspaceRoot}`);
    try {
      this.process = spawn(this.executable, this.args, {
        cwd: this.workspaceRoot,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      });
    } catch (err) {
      throw new Error(`Failed to spawn LSP "${this.executable}": ${err.message}`);
    }

    this.process.stdout.on('data', (data) => {
      this.handleIncomingData(data.toString('utf8'));
    });

    this.process.stderr.on('data', (data) => {
      // Don't pollute stdout, log as debug if needed
      // console.error(`[LSP ${this.language} stderr]`, data.toString('utf8'));
    });

    this.process.on('close', (code) => {
      console.log(`[LSP Client] ${this.language} server exited with code ${code}`);
      for (const { reject } of this.pendingRequests.values()) {
        reject(new Error(`${this.language} LSP server exited before responding.`));
      }
      this.pendingRequests.clear();
      this.process = null;
    });

    // Send initialize request
    const initResult = await this.sendRequest('initialize', {
      processId: process.pid,
      rootPath: this.workspaceRoot,
      rootUri: `file://${this.workspaceRoot}`,
      capabilities: {
        textDocument: {
          definition: { dynamicRegistration: true },
          references: { dynamicRegistration: true },
          rename: { dynamicRegistration: true }
        }
      },
      initializationOptions: {}
    });

    // Send initialized notification
    this.sendNotification('initialized', {});
    this.initialized = true;
    return initResult;
  }

  sendRequest(method, params) {
    if (!this.process) return Promise.reject(new Error('LSP server is not running.'));
    const id = this.messageId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const message = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(message);
    });
  }

  sendNotification(method, params) {
    if (!this.process) return;
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
    const message = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
    this.process.stdin.write(message);
  }

  handleIncomingData(chunk) {
    this.buffer += chunk;
    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const headers = this.buffer.slice(0, headerEnd);
        const match = headers.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          // Reset buffer past header to avoid lockup
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }
        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }
      if (this.buffer.length < this.contentLength) break;
      const bodyStr = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;

      try {
        const body = JSON.parse(bodyStr);
        this.handleMessage(body);
      } catch (err) {
        console.warn(`[LSP Client] Failed to parse JSON body: ${err.message}`);
      }
    }
  }

  handleMessage(message) {
    if (message.id !== undefined && message.id !== null) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'LSP Request error'));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method === 'textDocument/publishDiagnostics') {
      const uri = message.params.uri;
      const diagnostics = message.params.diagnostics;
      this.latestDiagnostics.set(uri, diagnostics);
    }
  }

  getDiagnostics(filePath) {
    const fileUri = `file://${filePath}`;
    return this.latestDiagnostics.get(fileUri) || [];
  }

  notifyDidOpen(filePath, text) {
    const fileUri = `file://${filePath}`;
    let version = (this.documentVersions.get(fileUri) || 0) + 1;
    this.documentVersions.set(fileUri, version);

    let languageId = 'javascript';
    if (filePath.endsWith('.ts')) languageId = 'typescript';
    if (filePath.endsWith('.tsx')) languageId = 'typescriptreact';
    if (filePath.endsWith('.jsx')) languageId = 'javascriptreact';
    if (filePath.endsWith('.py')) languageId = 'python';
    if (filePath.endsWith('.go')) languageId = 'go';
    if (filePath.endsWith('.rs')) languageId = 'rust';
    if (filePath.endsWith('.html')) languageId = 'html';
    if (filePath.endsWith('.css')) languageId = 'css';

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: fileUri,
        languageId,
        version,
        text
      }
    });
  }

  notifyDidChange(filePath, text) {
    const fileUri = `file://${filePath}`;
    let version = (this.documentVersions.get(fileUri) || 0) + 1;
    this.documentVersions.set(fileUri, version);

    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri: fileUri,
        version
      },
      contentChanges: [{ text }]
    });
  }

  async stop() {
    if (!this.process) return;
    try {
      await this.sendRequest('shutdown', {});
      this.sendNotification('exit', {});
    } catch {
      // Force kill if graceful shutdown fails
      this.process?.kill('SIGKILL');
    }
    this.process = null;
    this.initialized = false;
  }
}

class LspManager {
  constructor() {
    this.clients = new Map(); // workspaceRoot -> Map(lang -> LspClient)
  }

  async getClient(language, workspaceRoot) {
    const rootPath = path.resolve(workspaceRoot);
    if (!this.clients.has(rootPath)) {
      this.clients.set(rootPath, new Map());
    }

    const rootClients = this.clients.get(rootPath);
    if (rootClients.has(language)) {
      const existing = rootClients.get(language);
      if (existing.process) return existing;
    }

    // Determine executable and arguments using npx wrapper to automatically resolve local or global installs
    let executable, args;
    if (language === 'typescript' || language === 'javascript') {
      executable = 'npx';
      args = ['--no-install', 'typescript-language-server', '--stdio'];
    } else if (language === 'python') {
      executable = 'npx';
      args = ['--no-install', 'pyright-langserver', '--stdio'];
    } else if (language === 'go') {
      executable = 'gopls';
      args = ['serve'];
    } else if (language === 'rust') {
      executable = 'rust-analyzer';
      args = [];
    } else if (language === 'html') {
      executable = 'npx';
      args = ['--no-install', 'vscode-html-language-server', '--stdio'];
    } else if (language === 'css') {
      executable = 'npx';
      args = ['--no-install', 'vscode-css-language-server', '--stdio'];
    } else {
      throw new Error(`Unsupported language for LSP: ${language}`);
    }

    const client = new LspClient(language, rootPath, executable, args);
    try {
      await client.start();
      rootClients.set(language, client);
      return client;
    } catch (err) {
      console.warn(`[LSP Manager] Could not start language server: ${err.message}`);
      throw err;
    }
  }

  async shutdownAll() {
    for (const rootClients of this.clients.values()) {
      for (const client of rootClients.values()) {
        await client.stop();
      }
    }
    this.clients.clear();
  }
}

// Export singleton instance
export const lspManager = new LspManager();
export default lspManager;
