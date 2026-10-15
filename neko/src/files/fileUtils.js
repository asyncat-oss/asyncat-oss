import { createElement as h } from 'react';
import {
  Database,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  FolderOpen,
  Folder,
  HardDrive,
  Home,
  Download,
  Music,
  Image,
  Monitor,
  Network,
  Star,
  Terminal,
  Trash2,
  Clock,
  Table,
  Layout,
  Code
} from 'lucide-react';

// File icons are one neutral colour (the text colour they're given), like
// the rest of the app's icons: a short label on a faint tile for languages,
// a lucide glyph for everything else.
const TextBadgeIcon = ({ text, ...props }) =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', ...props },
    h('rect', { x: 2, y: 2, width: 20, height: 20, rx: 5, fill: 'currentColor', fillOpacity: 0.14 }),
    h('text', { x: 12, y: 16, fontSize: text.length > 2 ? 8 : 10, fontWeight: 600, fill: 'currentColor', textAnchor: 'middle', fontFamily: 'Inter Variable, system-ui, -apple-system, sans-serif' }, text)
  );

const ReactIcon = (props) =>
  h('svg', { viewBox: '-11.5 -10.23174 23 20.46348', xmlns: 'http://www.w3.org/2000/svg', ...props },
    h('circle', { cx: 0, cy: 0, r: 2.05, fill: 'currentColor' }),
    h('g', { stroke: 'currentColor', strokeWidth: 1, fill: 'none' },
      h('ellipse', { rx: 11, ry: 4.2 }),
      h('ellipse', { rx: 11, ry: 4.2, transform: 'rotate(60)' }),
      h('ellipse', { rx: 11, ry: 4.2, transform: 'rotate(120)' })
    )
  );

const VueIcon = (props) =>
  h('svg', { viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', ...props },
    h('path', { d: 'M14.66 4L12 8.61L9.34 4H2L12 21.33L22 4H14.66Z', fill: 'currentColor', fillOpacity: 0.55 }),
    h('path', { d: 'M14.66 4L12 8.61L9.34 4H6.33L12 13.81L17.67 4H14.66Z', fill: 'currentColor' })
  );

export const BINARY_EXTS = new Set([
  'png','jpg','jpeg','gif','bmp','ico','webp','svg',
  'woff','woff2','ttf','eot','otf',
  'pdf','zip','tar','gz','rar','7z',
  'exe','dll','so','dylib','bin',
  'mp3','mp4','wav','ogg','mov','avi','mkv',
]);

export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export function formatDate(mtime) {
  if (!mtime) return '';
  const d = new Date(mtime);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function dirname(filePath) {
  if (!filePath || filePath === '.') return '.';
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) return '.';
  return parts.slice(0, -1).join('/');
}

export function joinPath(parent, name) {
  if (!parent || parent === '.') return name;
  return `${parent.replace(/\/$/, '')}/${name}`;
}

export function basename(filePath) {
  if (!filePath || filePath === '.') return '';
  const parts = filePath.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

export function rootIcon(kind) {
  if (kind === 'home') return Home;
  if (kind === 'workspace') return HardDrive;
  if (kind === 'downloads') return Download;
  if (kind === 'music') return Music;
  if (kind === 'pictures') return Image;
  if (kind === 'videos') return FileVideo;
  if (kind === 'trash') return Trash2;
  if (kind === 'recent') return Clock;
  if (kind === 'starred') return Star;
  if (kind === 'network') return Network;
  if (kind === 'place') return Monitor;
  return FolderOpen;
}

const ICON_COLOR = 'text-fg-subtle';
// Made once, so a row's icon stays the same component between renders.
const badge = (text) => {
  const Badge = (props) => h(TextBadgeIcon, { text, ...props });
  Badge.displayName = `${text}Icon`;
  return Badge;
};
const BADGES = Object.fromEntries(['JS', 'TS', 'RS', 'GO', 'PY', 'J', 'PDF'].map((text) => [text, badge(text)]));

export function fileIconMeta(ext = '', type = 'file') {
  if (type === 'dir') return { Icon: Folder, color: ICON_COLOR };

  ext = ext.toLowerCase();

  // Languages get a short label; React and Vue keep their shapes.
  if (ext === 'js' || ext === 'javascript' || ext === 'cjs' || ext === 'mjs') return { Icon: BADGES.JS, color: ICON_COLOR };
  if (ext === 'ts' || ext === 'typescript') return { Icon: BADGES.TS, color: ICON_COLOR };
  if (ext === 'jsx' || ext === 'tsx' || ext === 'react') return { Icon: ReactIcon, color: ICON_COLOR };
  if (ext === 'vue') return { Icon: VueIcon, color: ICON_COLOR };
  if (ext === 'rs' || ext === 'rust') return { Icon: BADGES.RS, color: ICON_COLOR };
  if (ext === 'go' || ext === 'golang') return { Icon: BADGES.GO, color: ICON_COLOR };
  if (ext === 'py' || ext === 'python') return { Icon: BADGES.PY, color: ICON_COLOR };
  if (ext === 'java') return { Icon: BADGES.J, color: ICON_COLOR };
  if (ext === 'pdf') return { Icon: BADGES.PDF, color: ICON_COLOR };
  if (ext === 'csv') return { Icon: Table, color: ICON_COLOR };

  const docExts = ['md','mdx','txt','rst'];
  const dataExts = ['json','yaml','yml','toml','ini','env','xml'];
  const styleExts = ['css','scss','less','sass'];
  const shellExts = ['sh','bash','zsh','fish','ps1','bat','cmd'];
  const imageExts = ['png','jpg','jpeg','gif','bmp','ico','webp','svg'];
  const audioExts = ['mp3','wav','ogg','flac','m4a'];
  const videoExts = ['mp4','mov','avi','mkv','webm'];
  const archiveExts = ['zip','tar','gz','rar','7z'];
  const otherCodeExts = ['c','cpp','h','cs','php','swift','kt','astro'];

  if (imageExts.includes(ext)) return { Icon: FileImage, color: ICON_COLOR };
  if (audioExts.includes(ext)) return { Icon: FileAudio, color: ICON_COLOR };
  if (videoExts.includes(ext)) return { Icon: FileVideo, color: ICON_COLOR };
  if (archiveExts.includes(ext)) return { Icon: FileArchive, color: ICON_COLOR };
  if (otherCodeExts.includes(ext)) return { Icon: FileCode, color: ICON_COLOR };
  if (docExts.includes(ext)) return { Icon: FileText, color: ICON_COLOR };
  if (dataExts.includes(ext)) return { Icon: Database, color: ICON_COLOR };
  if (styleExts.includes(ext)) return { Icon: Layout, color: ICON_COLOR };
  if (shellExts.includes(ext)) return { Icon: Terminal, color: ICON_COLOR };
  if (ext === 'html' || ext === 'htm') return { Icon: Code, color: ICON_COLOR };

  return { Icon: FileText, color: ICON_COLOR };
}
