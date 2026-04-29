// storage/localStorageService.js
// Unified local filesystem storage for all file attachments.
// Replaces Azure Blob Storage. Files are stored under STORAGE_PATH/{container}/.
// Served via den's /files/* static route.

import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../logger.js';

const STORAGE_ROOT = process.env.STORAGE_PATH
  ? path.resolve(process.env.STORAGE_PATH)
  : path.resolve('data', 'uploads');

const PUBLIC_URL_BASE = process.env.PUBLIC_URL || 'http://localhost:8716';

const initializedContainers = new Set();

const getContainerDir = (container) => {
  return path.join(STORAGE_ROOT, container);
};

const fileUrl = (container, blobName) =>
  `${PUBLIC_URL_BASE}/files/${container}/${blobName.replace(/\\/g, '/')}`;

const parseContainerFromUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/files\/([^\/]+)\//);
  return match ? match[1] : null;
};

const getLocalPathFromUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/files\/([^\/]+\/.+)$/);
  if (!match) return null;
  const containerAndBlob = match[1];
  const separatorIndex = containerAndBlob.indexOf('/');
  if (separatorIndex === -1) return null;
  const container = containerAndBlob.substring(0, separatorIndex);
  const blobName = containerAndBlob.substring(separatorIndex + 1);
  return path.join(getContainerDir(container), blobName);
};

// ─── Public API ────────────────────────────────────────────────────────────────

const initializeContainer = async (container) => {
  if (initializedContainers.has(container)) return;
  const containerDir = getContainerDir(container);
  await fsp.mkdir(containerDir, { recursive: true });
  logger.info(`Storage: initialized ${container} at ${containerDir}`);
  initializedContainers.add(container);
};

const initializeAllContainers = async () => {
  await Promise.all([
    initializeContainer('notes'),
    initializeContainer('kanban-attachments'),
  ]);
};

const uploadFile = async (file, container, subPath = '') => {
  const containerDir = getContainerDir(container);
  const targetDir = subPath ? path.join(containerDir, subPath) : containerDir;
  await fsp.mkdir(targetDir, { recursive: true });

  const ext = path.extname(file.originalname || file.filename || '');
  const randomStr = crypto.randomBytes(16).toString('hex');
  const blobName = subPath
    ? `${subPath}/${randomStr}${ext}`
    : `${randomStr}${ext}`;
  const filePath = path.join(containerDir, blobName);

  const buffer = file.buffer || file.content;
  if (!buffer) throw new Error('No file content provided');

  await fsp.writeFile(filePath, buffer);

  return {
    fileName: file.originalname || file.filename || 'unknown',
    fileType: file.mimetype || file.contentType || 'application/octet-stream',
    fileSize: file.size || buffer.length,
    blobName,
    fileUrl: fileUrl(container, blobName),
    uploadedAt: new Date().toISOString(),
  };
};

const uploadFileWithName = async (file, container, subPath, filename) => {
  const containerDir = getContainerDir(container);
  const targetDir = subPath ? path.join(containerDir, subPath) : containerDir;
  await fsp.mkdir(targetDir, { recursive: true });

  const ext = path.extname(filename);
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blobName = subPath
    ? `${subPath}/${Date.now()}_${sanitizedFilename}`
    : `${Date.now()}_${sanitizedFilename}`;
  const filePath = path.join(containerDir, blobName);

  const buffer = file.buffer || file.content;
  if (!buffer) throw new Error('No file content provided');

  await fsp.writeFile(filePath, buffer);

  return {
    fileName: filename,
    fileType: file.mimetype || file.contentType || 'application/octet-stream',
    fileSize: file.size || buffer.length,
    blobName,
    fileUrl: fileUrl(container, blobName),
    uploadedAt: new Date().toISOString(),
  };
};

const deleteFile = async (blobName, container) => {
  try {
    const filePath = path.join(getContainerDir(container), blobName);
    await fsp.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return true;
    console.error('localStorageService.deleteFile error:', err.message);
    throw err;
  }
};

const deleteFileByUrl = async (url) => {
  const container = parseContainerFromUrl(url);
  if (!container) return false;
  const localPath = getLocalPathFromUrl(url);
  if (!localPath) return false;
  try {
    await fsp.unlink(localPath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return true;
    console.error('localStorageService.deleteFileByUrl error:', err.message);
    throw err;
  }
};

const fileExists = async (blobName, container) => {
  const filePath = path.join(getContainerDir(container), blobName);
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const getFile = async (blobName, container) => {
  const filePath = path.join(getContainerDir(container), blobName);
  return fsp.readFile(filePath);
};

const getFileBuffer = async (blobName, container) => {
  return getFile(blobName, container);
};

const generateSasUrl = async (blobName, container, _expiryMinutes = 60) => fileUrl(container, blobName);

const refreshAttachmentUrls = (attachments, container) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  return attachments.map((a) =>
    a.blobName ? { ...a, fileUrl: fileUrl(container, a.blobName) } : a
  );
};

const getContainerDirPath = (container) => getContainerDir(container);

export {
  initializeContainer,
  initializeAllContainers,
  uploadFile,
  uploadFileWithName,
  deleteFile,
  deleteFileByUrl,
  fileExists,
  getFile,
  getFileBuffer,
  generateSasUrl,
  refreshAttachmentUrls,
  fileUrl,
  getContainerDirPath,
  getLocalPathFromUrl,
  parseContainerFromUrl,
};

export default {
  initializeContainer,
  initializeAllContainers,
  uploadFile,
  uploadFileWithName,
  deleteFile,
  deleteFileByUrl,
  fileExists,
  getFile,
  getFileBuffer,
  generateSasUrl,
  refreshAttachmentUrls,
  fileUrl,
  getContainerDirPath,
};