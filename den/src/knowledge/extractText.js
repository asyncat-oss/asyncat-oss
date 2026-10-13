/**
 * Turn an uploaded knowledge file into text a model can read.
 *
 * Plain text, code, Markdown, CSV and JSON are read as UTF-8. PDFs go through
 * pdftotext (poppler) when it is installed. Word files (.docx) are unzipped
 * and their paragraphs read. Images keep no text: models that can see images
 * get them as pictures instead.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { runFile, hasBin } from '../agent/tools/shared.js';

export const MAX_TEXT_CHARS = 2_000_000;

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'mdx', 'rst', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'html', 'htm',
  'css', 'scss', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h',
  'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'sql', 'graphql', 'proto', 'ini', 'cfg', 'conf',
  'env', 'log', 'tex', 'bib', 'srt', 'vtt', 'svg', 'lua', 'r', 'dart', 'vue', 'svelte', 'astro', 'gradle', 'tf',
]);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

export function knowledgeKind(fileName, mimeType = '') {
  const ext = path.extname(String(fileName || '')).slice(1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext) || /^image\/(png|jpe?g|webp|gif)$/.test(mimeType)) return 'image';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith('text/') || mimeType === 'application/json') return 'text';
  return 'unsupported';
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  let zeros = 0;
  for (const byte of sample) if (byte === 0) zeros++;
  return zeros > 0;
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

async function docxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('This .docx file has no document body.');
  const xml = await doc.async('string');
  const paragraphs = xml.split(/<\/w:p>/).map((part) => {
    const runs = [...part.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
    const tabs = part.includes('<w:tab/>') ? ' ' : '';
    return decodeXmlEntities(runs.join(tabs));
  });
  return paragraphs.map((p) => p.trim()).filter(Boolean).join('\n\n');
}

function pdfText(buffer) {
  if (!hasBin('pdftotext')) {
    throw new Error('Reading PDFs needs pdftotext (part of poppler). Install poppler, then add the file again.');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-pdf-'));
  try {
    const input = path.join(dir, 'in.pdf');
    const output = path.join(dir, 'out.txt');
    fs.writeFileSync(input, buffer);
    const res = runFile('pdftotext', ['-layout', '-enc', 'UTF-8', input, output], { timeout: 60_000 });
    if (!fs.existsSync(output)) throw new Error(res.error || 'pdftotext produced no text.');
    const text = fs.readFileSync(output, 'utf8');
    if (!text.trim()) throw new Error('This PDF has no selectable text (it may be scanned images).');
    return text;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Extract text. Resolves to { kind, text } where text is null for images;
 * throws a plain-language error when a file can't be read.
 */
export async function extractKnowledgeText({ buffer, fileName, mimeType = '' }) {
  const kind = knowledgeKind(fileName, mimeType);
  if (kind === 'unsupported') {
    throw new Error('This kind of file can’t be read yet. Add text, code, Markdown, CSV, JSON, PDF, Word (.docx) or image files.');
  }
  if (kind === 'image') return { kind, text: null };

  let text;
  if (kind === 'pdf') text = pdfText(buffer);
  else if (kind === 'docx') text = await docxText(buffer);
  else {
    if (looksBinary(buffer)) throw new Error('This file looks binary rather than text.');
    text = buffer.toString('utf8').replace(/^﻿/, '');
  }
  text = text.replace(/\r\n/g, '\n');
  if (text.length > MAX_TEXT_CHARS) {
    throw new Error(`This file has ${Math.round(text.length / 1000)}k characters of text; the limit is ${MAX_TEXT_CHARS / 1_000_000}M per file.`);
  }
  return { kind: kind === 'docx' ? 'document' : kind, text };
}
