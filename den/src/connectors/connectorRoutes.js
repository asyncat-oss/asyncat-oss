// den/src/connectors/connectorRoutes.js
// /api/connectors: the connectors (MCP servers) in Settings → Connections →
// Connectors. List them with their status and tools, add one from the
// catalog, by address or by command, turn them on and off, sign in and out,
// and give the OK (with the size) for ones that download before they run.

import express from 'express';
import { sendToHost } from '../lib/hostBridge.js';
import { CONNECTOR_CATALOG, catalogEntry } from './catalog.js';
import { readConnectorFile, serverFromInput, updateConnectorFile, validConnectorName } from './connectorConfig.js';
import { oauthRedirectUrl } from './connectorAuth.js';
import {
  beginSignIn, connectorFileError, finishSignIn, forgetConnectorAuth, getConnector, listConnectors,
  restartConnector, signOut, syncConnectors, waitForConnector,
} from './connectorManager.js';
import { detectLauncher, downloadSize, pinLauncherVersion } from './launchers.js';

const START_WAIT_MS = 8_000;

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[connectors]', err);
  res.status(status).json({ success: false, error: err?.message || 'Something went wrong.' });
}

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function nameFrom(text) {
  const base = String(text || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return base || 'connector';
}

function suggestedName(body, entry) {
  if (body.title) return nameFrom(body.title);
  if (entry.url) {
    try {
      const host = new URL(entry.url).hostname.replace(/^(www|mcp|api)\./, '');
      return nameFrom(host.split('.')[0]);
    } catch {
      return 'remote';
    }
  }
  const launcher = detectLauncher(entry.command, entry.args);
  const pkg = launcher?.name?.split('/').pop()?.replace(/^(mcp-server-|server-)/, '').replace(/-mcp$/, '');
  return nameFrom(pkg || entry.command.split(/[\\/]/).pop());
}

function uniqueName(base, taken) {
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base.slice(0, 36)}-${n}`;
  return name;
}

function tokenHeaders(catalog, token) {
  const value = String(token || '').trim();
  if (!value) {
    if (catalog.optionalToken) return {};
    throw badRequest(`Paste your ${catalog.token.label.toLowerCase()} to connect ${catalog.title}.`);
  }
  return { [catalog.token.header]: `${catalog.token.prefix || ''}${value}` };
}

/** The saved entry for an "add" request: from the catalog or as given. */
function entryForAdd(body) {
  const catalog = body.catalogId ? catalogEntry(body.catalogId) : null;
  if (body.catalogId && !catalog) throw badRequest("That isn't in the catalog.");
  if (!catalog) return { entry: serverFromInput(body, null), catalog: null };
  const input = catalog.kind === 'remote'
    ? {
      url: catalog.url,
      type: catalog.transport || 'http',
      headers: catalog.auth === 'token' ? tokenHeaders(catalog, body.token) : {},
      title: catalog.title,
      catalogId: catalog.id,
    }
    : {
      command: catalog.command,
      args: [...catalog.args, ...(Array.isArray(body.extraArgs) ? body.extraArgs.map(String) : [])],
      env: body.env,
      title: catalog.title,
      catalogId: catalog.id,
    };
  return { entry: serverFromInput(input, null), catalog };
}

/** Record the user's OK to download, pinned to the version they saw. */
function approve(entry, approval) {
  if (!entry.command || !approval) return entry;
  const version = typeof approval === 'object' && approval.version ? String(approval.version) : null;
  const args = version ? pinLauncherVersion(entry.command, entry.args || [], version) : entry.args || [];
  const launcher = detectLauncher(entry.command, args);
  if (!launcher) return entry;
  return { ...entry, args, approvedDownload: { spec: launcher.spec, approvedAt: new Date().toISOString() } };
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function resultPage({ ok, heading, detail }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Asyncat</title>
<style>
  :root { color-scheme: light dark; --bg: #faf9f7; --fg: #1f1e1d; --muted: #6b6862; --accent: ${ok ? '#2f7d4f' : '#b4442f'}; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1b1a; --fg: #ecebe8; --muted: #a29f98; --accent: ${ok ? '#6cc58f' : '#ef8a76'}; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 26rem; padding: 2rem 1.5rem; text-align: center; }
  .mark { width: 2.5rem; height: 2.5rem; margin: 0 auto 1rem; border-radius: 999px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); font-size: 1.25rem; }
  h1 { font-size: 1.125rem; margin: 0 0 .5rem; }
  p { margin: 0; color: var(--muted); }
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true">${ok ? '✓' : '!'}</div>
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(detail)}</p>
</main>
</body>
</html>`;
}

const router = express.Router();

router.get('/', (_req, res) => {
  try {
    res.json({
      success: true,
      connectors: listConnectors(),
      catalog: CONNECTOR_CATALOG,
      error: connectorFileError(),
      redirectUrl: oauthRedirectUrl(),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// The service's sign-in page sends the browser back here.
router.get('/oauth/callback', async (req, res) => {
  const { state, code, error, error_description: errorDescription } = req.query || {};
  try {
    const result = await finishSignIn({ state, code, error, errorDescription });
    sendToHost('app.focus', {});
    const connected = result.status === 'connected';
    res.type('html').send(resultPage({
      ok: true,
      heading: `Signed in to ${result.title}`,
      detail: connected
        ? 'You can close this tab and go back to Asyncat.'
        : "You're signed in, but it hasn't connected yet. Go back to Asyncat to see why.",
    }));
  } catch (err) {
    res.status(Number(err?.status) || 500).type('html').send(resultPage({
      ok: false,
      heading: err?.title ? `Couldn't sign in to ${err.title}` : "Couldn't finish signing in",
      detail: err?.message || 'Something went wrong.',
    }));
  }
});

// What a command would download before it first runs, and how big it is.
// { command, args } or { catalogId }.
router.post('/check-download', async (req, res) => {
  try {
    const body = req.body || {};
    const catalog = body.catalogId ? catalogEntry(body.catalogId) : null;
    const command = catalog?.command || String(body.command || '').trim();
    const args = catalog ? catalog.args : (Array.isArray(body.args) ? body.args.map(String) : []);
    if (!command) throw badRequest('Give the command to check.');
    res.json({ success: true, download: await downloadSize(command, args) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const { entry: added, catalog } = entryForAdd(body);
    const entry = approve(added, body.approveDownload);
    const file = readConnectorFile();
    if (file._error) throw badRequest(file._error, 409);
    const taken = new Set(Object.keys(file.mcpServers));
    let name;
    if (body.name) {
      name = String(body.name).trim();
      if (!validConnectorName(name)) throw badRequest('Use up to 40 letters, numbers, spaces, dots, dashes or underscores for its name.');
      if (taken.has(name)) throw badRequest(`There's already a connector called "${name}".`, 409);
    } else {
      name = uniqueName(catalog?.id || suggestedName(body, entry), taken);
    }
    updateConnectorFile((config) => {
      config.mcpServers[name] = entry;
    });
    await syncConnectors();
    await waitForConnector(name, START_WAIT_MS);
    res.status(201).json({ success: true, connector: getConnector(name) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:name', (req, res) => {
  const connector = getConnector(req.params.name);
  if (!connector) return res.status(404).json({ success: false, error: 'No connector by that name.' });
  res.json({ success: true, connector });
});

// { enabled } turns it on or off, { title } renames it; with a command or an
// address it is a full edit (values sent as ******** keep what is saved).
router.patch('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const body = req.body || {};
    const fullEdit = Object.hasOwn(body, 'command') || Object.hasOwn(body, 'url');
    updateConnectorFile((config) => {
      const saved = config.mcpServers[name];
      if (!saved) throw badRequest('No connector by that name.', 404);
      if (fullEdit) {
        const next = serverFromInput({
          ...body,
          title: body.title ?? saved.title,
          catalogId: saved.catalogId,
          disabled: body.enabled === undefined ? saved.disabled : !body.enabled,
        }, saved);
        config.mcpServers[name] = approve(next, body.approveDownload);
        return;
      }
      if (body.enabled !== undefined) {
        if (body.enabled) delete saved.disabled;
        else saved.disabled = true;
      }
      if (typeof body.title === 'string') {
        if (body.title.trim()) saved.title = body.title.trim().slice(0, 80);
        else delete saved.title;
      }
    });
    await syncConnectors();
    if (body.enabled !== false) await waitForConnector(name, START_WAIT_MS);
    res.json({ success: true, connector: getConnector(name) });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    updateConnectorFile((config) => {
      if (!config.mcpServers[name]) throw badRequest('No connector by that name.', 404);
      delete config.mcpServers[name];
    });
    forgetConnectorAuth(name);
    await syncConnectors();
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:name/restart', async (req, res) => {
  try {
    res.json({ success: true, connector: await restartConnector(req.params.name) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:name/download-size', async (req, res) => {
  try {
    const connector = getConnector(req.params.name);
    if (!connector) throw badRequest('No connector by that name.', 404);
    if (connector.kind !== 'local') throw badRequest('Remote connectors download nothing.');
    res.json({ success: true, download: await downloadSize(connector.command, connector.args) });
  } catch (err) {
    sendError(res, err);
  }
});

// The user's OK to download it, after seeing the size: { version }.
router.post('/:name/approve-download', async (req, res) => {
  try {
    const { name } = req.params;
    updateConnectorFile((config) => {
      const saved = config.mcpServers[name];
      if (!saved) throw badRequest('No connector by that name.', 404);
      if (!saved.command) throw badRequest('Remote connectors download nothing.');
      const next = approve({ ...saved, args: Array.isArray(saved.args) ? saved.args : [] }, { version: req.body?.version || null });
      config.mcpServers[name] = next;
    });
    await syncConnectors();
    await waitForConnector(name, START_WAIT_MS);
    res.json({ success: true, connector: getConnector(name) });
  } catch (err) {
    sendError(res, err);
  }
});

// Start signing in: { authorizationUrl } to open in the browser.
router.post('/:name/sign-in', async (req, res) => {
  try {
    const result = await beginSignIn(req.params.name);
    res.json({ success: true, ...result, connector: getConnector(req.params.name) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:name/sign-out', async (req, res) => {
  try {
    res.json({ success: true, connector: await signOut(req.params.name) });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
