import {
  Database,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  FolderOpen,
  HardDrive,
  Home,
  Monitor,
  Terminal,
} from 'lucide-react';

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
  if (kind === 'place') return Monitor;
  return FolderOpen;
}

export function fileIconMeta(ext = '', type = 'file') {
  if (type === 'dir') return { Icon: FolderOpen, color: 'text-amber-400' };
  const codeExts = ['js','jsx','ts','tsx','py','go','rs','rb','java','c','cpp','h','cs','php','swift','kt','vue','astro'];
  const docExts = ['md','mdx','txt','rst','csv'];
  const dataExts = ['json','yaml','yml','toml','ini','env','xml'];
  const styleExts = ['css','scss','less','sass'];
  const shellExts = ['sh','bash','zsh','fish','ps1','bat','cmd'];
  const imageExts = ['png','jpg','jpeg','gif','bmp','ico','webp','svg'];
  const audioExts = ['mp3','wav','ogg','flac','m4a'];
  const videoExts = ['mp4','mov','avi','mkv','webm'];
  const archiveExts = ['zip','tar','gz','rar','7z'];
  if (imageExts.includes(ext)) return { Icon: FileImage, color: 'text-emerald-400' };
  if (audioExts.includes(ext)) return { Icon: FileAudio, color: 'text-purple-400' };
  if (videoExts.includes(ext)) return { Icon: FileVideo, color: 'text-rose-400' };
  if (archiveExts.includes(ext)) return { Icon: FileArchive, color: 'text-yellow-500' };
  if (codeExts.includes(ext)) return { Icon: FileCode, color: 'text-blue-400' };
  if (docExts.includes(ext)) return { Icon: FileText, color: 'text-gray-400' };
  if (dataExts.includes(ext)) return { Icon: Database, color: 'text-orange-400' };
  if (styleExts.includes(ext)) return { Icon: FileCode, color: 'text-pink-400' };
  if (shellExts.includes(ext)) return { Icon: Terminal, color: 'text-green-400' };
  if (ext === 'html' || ext === 'htm') return { Icon: FileCode, color: 'text-orange-500' };
  return { Icon: File, color: 'text-gray-400' };
}
