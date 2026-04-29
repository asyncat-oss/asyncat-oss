// kanban/services/storageService.js
// Local filesystem storage for kanban card attachments.
// Replaces Azure Blob Storage. Files are stored under STORAGE_PATH/kanban-attachments/.
// Served via den's /files/* static route.

import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../../logger.js';

const STORAGE_ROOT = process.env.STORAGE_PATH
  ? path.resolve(process.env.STORAGE_PATH)
  : path.resolve('data', 'uploads');

const CONTAINER = process.env.STORAGE_KANBAN_CONTAINER || 'kanban-attachments';
const CONTAINER_DIR = path.join(STORAGE_ROOT, CONTAINER);

const PUBLIC_URL_BASE = process.env.PUBLIC_URL || 'http://localhost:8716';

const fileUrl = (blobName) =>
  `${PUBLIC_URL_BASE}/files/${CONTAINER}/${blobName.replace(/\\/g, '/')}`;

// ─── Public API (same interface as the old Azure implementation) ──────────────

const initializeContainer = async () => {
  fs.mkdirSync(CONTAINER_DIR, { recursive: true });
  logger.info(`Storage: kanban attachments at ${CONTAINER_DIR}`);
};

const uploadFile = async (file, cardId) => {
  await fsp.mkdir(path.join(CONTAINER_DIR, cardId), { recursive: true });

  const ext = path.extname(file.originalname);
  const randomStr = crypto.randomBytes(16).toString('hex');
  const blobName = `${cardId}/${randomStr}${ext}`;
  const filePath = path.join(CONTAINER_DIR, blobName);

  await fsp.writeFile(filePath, file.buffer);

  return {
    fileName: file.originalname,
    fileType: file.mimetype,
    fileSize: file.size,
    blobName,
    fileUrl: fileUrl(blobName),
    uploadedAt: new Date().toISOString(),
  };
};

const deleteFile = async (blobName) => {
  try {
    await fsp.unlink(path.join(CONTAINER_DIR, blobName));
    return true;
  } catch (err) {
    console.error('storageService.deleteFile error:', err.message);
    throw err;
  }
};

// No SAS URLs in local mode — just return the direct /files/ URL.
const generateSasUrl = async (blobName, _expiryMinutes = 60) => fileUrl(blobName);

const refreshAttachmentUrls = async (attachments) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  return attachments.map((a) =>
    a.blobName ? { ...a, fileUrl: fileUrl(a.blobName) } : a
  );
};

export default { initializeContainer, uploadFile, deleteFile, generateSasUrl, refreshAttachmentUrls };
