// electron/menu.js — Native application menu
import { Menu, shell } from 'electron';
import { IS_MAC, APP_NAME } from './constants.js';

/**
 * Build and set the native application menu.
 * @param {object} opts
 * @param {Function} opts.onNewChat — Trigger new chat
 * @param {Function} opts.onSettings — Open settings
 * @param {Function} opts.onRestartBackend — Restart the backend
 */
export function buildAppMenu({ onNewChat, onSettings, onRestartBackend } = {}) {
  const macAppMenu = IS_MAC
    ? [{
        label: APP_NAME,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          {
            label: 'Settings…',
            accelerator: 'Cmd+,',
            click: () => onSettings?.(),
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }]
    : [];

  const template = [
    ...macAppMenu,

    // ─── File ──────────────────────────────────────────────────────────
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: () => onNewChat?.(),
        },
        { type: 'separator' },
        ...(IS_MAC
          ? [{ role: 'close' }]
          : [
              {
                label: 'Settings',
                accelerator: 'Ctrl+,',
                click: () => onSettings?.(),
              },
              { type: 'separator' },
              { role: 'quit' },
            ]
        ),
      ],
    },

    // ─── Edit ──────────────────────────────────────────────────────────
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    // ─── View ──────────────────────────────────────────────────────────
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    // ─── Backend ───────────────────────────────────────────────────────
    {
      label: 'Backend',
      submenu: [
        {
          label: 'Restart Backend',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => onRestartBackend?.(),
        },
      ],
    },

    // ─── Window ────────────────────────────────────────────────────────
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(IS_MAC
          ? [
              { type: 'separator' },
              { role: 'front' },
            ]
          : [
              { role: 'close' },
            ]
        ),
      ],
    },

    // ─── Help ──────────────────────────────────────────────────────────
    {
      label: 'Help',
      submenu: [
        {
          label: 'Asyncat on GitHub',
          click: () => shell.openExternal('https://github.com/asyncat-oss/asyncat-oss'),
        },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/asyncat/asyncat-oss/issues'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
