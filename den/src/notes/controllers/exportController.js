// exportController.js - HTTP handlers for note export functionality
import { exportNoteAsDocx, exportNoteAsPdf } from '../service/exportService.js';

/**
 * Export note as DOCX
 * POST /api/notes/:id/export/docx
 */
export async function exportDocx(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const db = req.db;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const docxBuffer = await exportNoteAsDocx(id, userId, db);

    // Get note title for filename
    const { data: note } = await db
      .from('notes')
      .select('title')
      .eq('id', id)
      .single();

    const filename = sanitizeFilename(note?.title || 'Untitled Note') + '.docx';

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', docxBuffer.length);

    res.send(docxBuffer);
  } catch (error) {
    console.error('[ExportController] DOCX export error:', error);

    if (error.message === 'Note not found or access denied') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to export note as DOCX',
      message: error.message
    });
  }
}

/**
 * Export note as PDF
 * POST /api/notes/:id/export/pdf
 */
export async function exportPdf(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const db = req.db;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const forwardedProtoHeader = req.headers["x-forwarded-proto"];
    const forwardedProto = Array.isArray(forwardedProtoHeader)
      ? forwardedProtoHeader[0]
      : forwardedProtoHeader;
    const host = req.get("host");
    const derivedBase = host
      ? `${forwardedProto || req.protocol}://${host}`
      : null;
    const attachmentBaseUrl = (
      process.env.PUBLIC_ATTACHMENT_BASE_URL ||
      derivedBase ||
      req.get("origin") ||
      ""
    ).replace(/\/$/, "");

    const pdfBuffer = await exportNoteAsPdf(
      id,
      userId,
      db,
      { attachmentBaseUrl }
    );

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }

    // Get note title for filename
    const { data: note } = await db
      .from('notes')
      .select('title')
      .eq('id', id)
      .single();

    const filename = sanitizeFilename(note?.title || 'Untitled Note') + '.pdf';

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    res.send(pdfBuffer);
  } catch (error) {
    console.error('[ExportController] PDF export error:', error);

    if (error.message === 'Note not found or access denied') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({
      error: 'Failed to export note as PDF',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Sanitize filename to remove invalid characters
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 100); // Limit length
}
