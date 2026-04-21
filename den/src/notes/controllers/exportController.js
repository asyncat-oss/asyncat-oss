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
    const blobServiceClient = req.blobServiceClient;
    const supabase = req.db;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[ExportController] Exporting note ${id} as DOCX for user ${userId}`);

    // Generate DOCX
    const docxBuffer = await exportNoteAsDocx(id, userId, blobServiceClient, supabase);

    // Get note title for filename
    const { data: note } = await supabase
      .from('notes')
      .select('title')
      .eq('id', id)
      .single();

    const filename = sanitizeFilename(note?.title || 'Untitled Note') + '.docx';

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', docxBuffer.length);

    // Send file
    res.send(docxBuffer);

    console.log(`[ExportController] Successfully exported DOCX: ${filename}`);
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
  console.log('\n\n========== PDF EXPORT STARTED ==========');
  console.log('[ExportController] PDF export route hit');

  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const blobServiceClient = req.blobServiceClient;
    const supabase = req.db;

    console.log('[ExportController] Request params:', { id, userId: userId ? 'present' : 'missing' });

    if (!userId) {
      console.error('[ExportController] No user ID found');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[ExportController] Exporting note ${id} as PDF for user ${userId}`);

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

    // Generate PDF
    const pdfBuffer = await exportNoteAsPdf(
      id,
      userId,
      blobServiceClient,
      supabase,
      { attachmentBaseUrl }
    );

    console.log('[ExportController] PDF buffer received, size:', pdfBuffer.length);

    // Verify the buffer has data
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }

    // Get note title for filename
    const { data: note } = await supabase
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

    // Send file as buffer
    res.send(pdfBuffer);

    console.log(`[ExportController] Successfully exported PDF: ${filename}`);
  } catch (error) {
    console.error('\n\n========== PDF EXPORT ERROR ==========');
    console.error('[ExportController] PDF export error - Full details:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error object:', error);
    console.error('========== END ERROR ==========\n\n');

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
