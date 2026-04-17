// exportService.js - Core export service for note document generation
import { convertBlocksToDocx } from '../utils/docxConverter.js';
import { convertBlocksToPdf } from '../utils/pdfConverter.js';
import * as noteService from './noteService.js';

/**
 * Export a note as DOCX format
 * @param {string} noteId - Note ID to export
 * @param {string} userId - User ID making the request
 * @param {object} blobServiceClient - Azure blob service client
 * @param {object} supabase - Supabase client
 * @returns {Promise<Buffer>} DOCX file buffer
 */
async function exportNoteAsDocx(noteId, userId, blobServiceClient, supabase) {
  try {
    // Fetch note with full content
    const note = await noteService.getNoteById(noteId, userId, supabase);

    if (!note) {
      throw new Error('Note not found or access denied');
    }

    // Parse metadata to get blocks
    let blocks = [];
    const title = note.title || 'Untitled Note';

    if (note.metadata) {
      const metadata = typeof note.metadata === 'string'
        ? JSON.parse(note.metadata)
        : note.metadata;

      if (metadata.blocks && metadata.version === 2) {
        blocks = metadata.blocks;
      }
    }

    // If no blocks in metadata, try to parse from content
    if (blocks.length === 0 && note.content) {
      // Fallback: create a simple text block from HTML content
      blocks = [{
        id: 'content-block',
        type: 'text',
        content: note.content,
        properties: {}
      }];
    }

    // Convert blocks to DOCX
    const docxBuffer = await convertBlocksToDocx({
      title,
      blocks,
      noteId,
      blobServiceClient
    });

    return docxBuffer;
  } catch (error) {
    console.error('[ExportService] DOCX export error:', error);
    throw error;
  }
}

/**
 * Export a note as PDF format
 * @param {string} noteId - Note ID to export
 * @param {string} userId - User ID making the request
 * @param {object} blobServiceClient - Azure blob service client
 * @param {object} supabase - Supabase client
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function exportNoteAsPdf(
  noteId,
  userId,
  blobServiceClient,
  supabase,
  options = {}
) {
  try {
    // Fetch note with full content
    const note = await noteService.getNoteById(noteId, userId, supabase);

    if (!note) {
      throw new Error('Note not found or access denied');
    }

    // Parse metadata to get blocks
    let blocks = [];
    const title = note.title || 'Untitled Note';

    if (note.metadata) {
      const metadata = typeof note.metadata === 'string'
        ? JSON.parse(note.metadata)
        : note.metadata;

      if (metadata.blocks && metadata.version === 2) {
        blocks = metadata.blocks;
      }
    }

    // If no blocks in metadata, try to parse from content
    if (blocks.length === 0 && note.content) {
      blocks = [{
        id: 'content-block',
        type: 'text',
        content: note.content,
        properties: {}
      }];
    }

    // Convert blocks to PDF
    const pdfBuffer = await convertBlocksToPdf({
      title,
      blocks,
      noteId,
      projectId: note.projectid,
      blobServiceClient,
      attachmentBaseUrl: options.attachmentBaseUrl
    });

    return pdfBuffer;
  } catch (error) {
    console.error('[ExportService] PDF export error:', error);
    throw error;
  }
}

export {
  exportNoteAsDocx,
  exportNoteAsPdf
};
