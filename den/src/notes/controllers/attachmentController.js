import * as noteService from "../service/noteService.js";
import path from "path";

const ATTACHMENTS_CONTAINER = "notes";

// Helper to get attachment path
const getAttachmentPath = (projectId, noteId, filename) => {
  return `project-${projectId}/note-${noteId}/${filename}`;
};

// Helper to verify note access - UPDATED to use authenticated client
const verifyNoteAccess = async (
  noteId,
  userId,
  requiredPermission = "read",
  supabase
) => {
  try {
    const note = await noteService.getNoteById(noteId, userId, supabase);
    if (!note) {
      throw new Error("Note not found");
    }
    return note;
  } catch (error) {
    throw error;
  }
};

export const uploadAttachment = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { isBanner } = req.body; // Check if this is a banner upload
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    // Validate file size based on type and purpose
    const maxImageSize = 5 * 1024 * 1024; // 5MB for regular images
    const maxVideoSize = 5 * 1024 * 1024; // 5MB for videos
    const maxAudioSize = 5 * 1024 * 1024; // 5MB for audio files
    const maxBannerSize = 10 * 1024 * 1024; // 10MB for banner images
    const maxFileSize = 100 * 1024 * 1024; // 100MB for other files
    const isImage = req.file.mimetype && req.file.mimetype.startsWith("image/");
    const isVideo = req.file.mimetype && req.file.mimetype.startsWith("video/");
    const isAudio = req.file.mimetype && req.file.mimetype.startsWith("audio/");
    const isBannerUpload = isBanner === "true";

    let sizeLimit;
    let fileType;

    if (isImage && isBannerUpload) {
      sizeLimit = maxBannerSize;
      fileType = "banner image";
    } else if (isImage) {
      sizeLimit = maxImageSize;
      fileType = "image";
    } else if (isVideo) {
      sizeLimit = maxVideoSize;
      fileType = "video";
    } else if (isAudio) {
      sizeLimit = maxAudioSize;
      fileType = "audio";
    } else {
      sizeLimit = maxFileSize;
      fileType = "file";
    }

    if (req.file.size > sizeLimit) {
      return res.status(413).json({
        success: false,
        error: `${
          fileType.charAt(0).toUpperCase() + fileType.slice(1)
        } size limit exceeded`,
        message: `Maximum ${fileType} size is ${(
          sizeLimit /
          (1024 * 1024)
        ).toFixed(2)}MB`,
        actualSize: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`,
        fileType: fileType,
      });
    }

    // Verify note access - UPDATED to pass authenticated client
    const note = await verifyNoteAccess(noteId, userId, "write", req.db);

    const filename = req.file.originalname;
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Special handling for banner images
    let attachmentPath;
    if (isBanner === "true") {
      // Store banners in a special location with a predictable name
      const bannerFilename = `banner_${Date.now()}_${sanitizedFilename}`;
      attachmentPath = getAttachmentPath(
        note.projectid,
        noteId,
        bannerFilename
      );
    } else {
      attachmentPath = getAttachmentPath(
        note.projectid,
        noteId,
        sanitizedFilename
      );
    }

    const containerClient = req.blobServiceClient.getContainerClient(
      ATTACHMENTS_CONTAINER
    );
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(attachmentPath);

    const uploadOptions = {
      blobHTTPHeaders: {
        blobContentType: req.file.mimetype,
      },
      metadata: {
        originalName: filename,
        uploadedBy: userId,
        noteId: noteId,
        projectId: note.projectid,
        uploadedAt: new Date().toISOString(),
        isBanner: isBanner === "true" ? "true" : "false", // Mark as banner if applicable
      },
    };

    await blockBlobClient.upload(
      req.file.buffer,
      req.file.buffer.length,
      uploadOptions
    );

    const resultFilename =
      isBanner === "true" ? attachmentPath.split("/").pop() : sanitizedFilename;
    const attachmentUrl = `/api/attachments/notes/${noteId}/${resultFilename}`;

    // If this is a banner, update the note's metadata to include banner info
    if (isBanner === "true") {
      try {
        const existingMetadata = note.metadata || {};
        const updatedMetadata = {
          ...existingMetadata,
          banner: {
            type: "image", // Important: specify this is an image banner
            filename: resultFilename,
            originalName: filename,
            url: attachmentUrl,
            contentType: req.file.mimetype,
            uploadedAt: new Date().toISOString(),
          },
        };

        // UPDATED: Use authenticated client instead of getSupabase()
        await req.db
          .from("notes")
          .update({ metadata: updatedMetadata })
          .eq("id", noteId);
      } catch (metadataError) {
        console.error(
          "Error updating note metadata for banner:",
          metadataError
        );
        // Continue even if metadata update fails
      }
    }

    res.status(201).json({
      success: true,
      data: {
        filename: resultFilename,
        originalName: filename,
        url: attachmentUrl,
        contentType: req.file.mimetype,
        size: req.file.size,
        noteId,
        projectId: note.projectid,
        isBanner: isBanner === "true",
      },
    });
  } catch (error) {
    console.error("Upload attachment error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to upload attachment",
    });
  }
};

export const listAttachments = async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;

    // Verify note access - UPDATED to pass authenticated client
    const note = await verifyNoteAccess(noteId, userId, "read", req.db);

    const attachmentPrefix = getAttachmentPath(note.projectid, noteId, "");
    const containerClient = req.blobServiceClient.getContainerClient(
      ATTACHMENTS_CONTAINER
    );

    await containerClient.createIfNotExists();

    const blobIterable = containerClient.listBlobsFlat({
      prefix: attachmentPrefix,
    });

    const attachments = [];
    for await (const blob of blobIterable) {
      const filename = path.basename(blob.name);
      const attachmentUrl = `/api/attachments/notes/${noteId}/${filename}`;

      attachments.push({
        filename,
        originalName: blob.metadata?.originalName || filename,
        url: attachmentUrl,
        contentType: blob.properties.contentType,
        size: blob.properties.contentLength,
        lastModified: blob.properties.lastModified,
        uploadedBy: blob.metadata?.uploadedBy,
        uploadedAt: blob.metadata?.uploadedAt,
      });
    }

    res.json({
      success: true,
      data: {
        noteId,
        attachments,
      },
    });
  } catch (error) {
    console.error("List attachments error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to list attachments",
    });
  }
};

export const downloadAttachment = async (req, res) => {
  try {
    const { noteId, filename } = req.params;
    const userId = req.user.id;

    // Verify note access - UPDATED to pass authenticated client
    const note = await verifyNoteAccess(noteId, userId, "read", req.db);

    const attachmentPath = getAttachmentPath(note.projectid, noteId, filename);
    const containerClient = req.blobServiceClient.getContainerClient(
      ATTACHMENTS_CONTAINER
    );
    const blobClient = containerClient.getBlobClient(attachmentPath);

    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Attachment not found",
      });
    }

    const properties = await blobClient.getProperties();
    const originalName = properties.metadata?.originalName || filename;
    const fileSize = properties.contentLength;

    // For images, videos, and audio, use inline; for others, use attachment
    const isImage =
      properties.contentType && properties.contentType.startsWith("image/");
    const isVideo =
      properties.contentType && properties.contentType.startsWith("video/");
    const isAudio =
      properties.contentType && properties.contentType.startsWith("audio/");
    const disposition = (isImage || isVideo || isAudio) ? "inline" : "attachment";

    // Handle range requests for video and audio
    const rangeHeader = req.headers.range;
    const needsRangeSupport = isVideo || isAudio;

    if (needsRangeSupport && rangeHeader) {
      // Parse range header
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      // Set partial content headers
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", chunkSize);
      res.setHeader(
        "Content-Type",
        properties.contentType || "application/octet-stream"
      );
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${originalName}"`
      );

      // Add caching headers
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader(
        "Access-Control-Allow-Origin",
        process.env.FRONTEND_URL || "*"
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");

      // Download the specific range
      const downloadResponse = await blobClient.download(start, chunkSize);
      const blobStream = downloadResponse.readableStreamBody;

      // Handle stream errors and aborts
      blobStream.on('error', (error) => {
        console.error('Blob stream error:', error.name, error.message);
        if (error.name === 'AbortError') {
          console.log('Client disconnected during blob download');
          return;
        }
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Stream error occurred'
          });
        }
      });

      res.on('close', () => {
        if (blobStream && !blobStream.destroyed) {
          blobStream.destroy();
        }
      });

      res.on('error', (error) => {
        console.error('Response stream error:', error.message);
        if (blobStream && !blobStream.destroyed) {
          blobStream.destroy();
        }
      });

      blobStream.pipe(res);
    } else {
      // Regular download without range support
      res.setHeader(
        "Content-Type",
        properties.contentType || "application/octet-stream"
      );
      res.setHeader("Content-Length", fileSize);
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${originalName}"`
      );

      // Add caching headers for images, videos, and audio
      if (isImage || isVideo || isAudio) {
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setHeader(
          "Access-Control-Allow-Origin",
          process.env.FRONTEND_URL || "*"
        );
        res.setHeader("Access-Control-Allow-Credentials", "true");
        if (needsRangeSupport) {
          res.setHeader("Accept-Ranges", "bytes");
        }
      }

      // Stream the blob to response with proper error handling
      const downloadResponse = await blobClient.download();
      const blobStream = downloadResponse.readableStreamBody;

      // Handle stream errors and aborts
      blobStream.on('error', (error) => {
        console.error('Blob stream error:', error.name, error.message);
        if (error.name === 'AbortError') {
          // Client disconnected - this is normal, don't crash
          console.log('Client disconnected during blob download');
          return;
        }
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Stream error occurred'
          });
        }
      });

      // Handle response errors (client disconnect)
      res.on('close', () => {
        if (blobStream && !blobStream.destroyed) {
          blobStream.destroy();
        }
      });

      res.on('error', (error) => {
        console.error('Response stream error:', error.message);
        if (blobStream && !blobStream.destroyed) {
          blobStream.destroy();
        }
      });

      // Pipe the stream
      blobStream.pipe(res);
    }
  } catch (error) {
    console.error("Download attachment error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to download attachment",
    });
  }
};

export const deleteAttachment = async (req, res) => {
  try {
    const { noteId, filename } = req.params;
    const userId = req.user.id;

    // Verify note access (write permission required) - UPDATED to pass authenticated client
    const note = await verifyNoteAccess(noteId, userId, "write", req.db);

    const attachmentPath = getAttachmentPath(note.projectid, noteId, filename);
    const containerClient = req.blobServiceClient.getContainerClient(
      ATTACHMENTS_CONTAINER
    );
    const blobClient = containerClient.getBlobClient(attachmentPath);

    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Attachment not found",
      });
    }

    await blobClient.delete();

    res.json({
      success: true,
      data: {
        noteId,
        filename,
        message: "Attachment deleted successfully",
      },
    });
  } catch (error) {
    console.error("Delete attachment error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to delete attachment",
    });
  }
};

export const getAttachmentMetadata = async (req, res) => {
  try {
    const { noteId, filename } = req.params;
    const userId = req.user.id;

    // Verify note access - UPDATED to pass authenticated client
    const note = await verifyNoteAccess(noteId, userId, "read", req.db);

    const attachmentPath = getAttachmentPath(note.projectid, noteId, filename);
    const containerClient = req.blobServiceClient.getContainerClient(
      ATTACHMENTS_CONTAINER
    );
    const blobClient = containerClient.getBlobClient(attachmentPath);

    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Attachment not found",
      });
    }

    const properties = await blobClient.getProperties();
    const metadata = properties.metadata || {};

    res.json({
      success: true,
      data: {
        filename,
        originalName: metadata.originalName || filename,
        contentType: properties.contentType,
        size: properties.contentLength,
        lastModified: properties.lastModified,
        uploadedBy: metadata.uploadedBy,
        uploadedAt: metadata.uploadedAt,
        noteId,
        projectId: note.projectid,
        metadata,
      },
    });
  } catch (error) {
    console.error("Get attachment metadata error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to get attachment metadata",
    });
  }
};

export const updateAttachmentMetadata = async (req, res) => {
  try {
    const { noteId, filename } = req.params;
    const { metadata } = req.body;
    const userId = req.user.id;

    if (!metadata || typeof metadata !== "object") {
      return res.status(400).json({
        success: false,
        error: "Valid metadata object is required",
      });
    }

    // Verify note access (write permission required) - UPDATED to pass authenticated client
    const note = await verifyNoteAccess(noteId, userId, "write", req.db);

    const attachmentPath = getAttachmentPath(note.projectid, noteId, filename);
    const containerClient = req.blobServiceClient.getContainerClient(
      ATTACHMENTS_CONTAINER
    );
    const blobClient = containerClient.getBlobClient(attachmentPath);

    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: "Attachment not found",
      });
    }

    // Get current metadata and merge with new
    const properties = await blobClient.getProperties();
    const currentMetadata = properties.metadata || {};
    const updatedMetadata = { ...currentMetadata, ...metadata };

    await blobClient.setMetadata(updatedMetadata);

    res.json({
      success: true,
      data: {
        noteId,
        filename,
        metadata: updatedMetadata,
        message: "Attachment metadata updated successfully",
      },
    });
  } catch (error) {
    console.error("Update attachment metadata error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to update attachment metadata",
    });
  }
};

// NEW: Banner-specific functions
export const setBanner = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { bannerType, bannerColor, bannerGradient } = req.body;
    const userId = req.user.id;

    // Verify note access - UPDATED to pass authenticated client
    const note = await verifyNoteAccess(noteId, userId, "write", req.db);

    // Get current metadata
    const existingMetadata = note.metadata || {};

    let bannerData = {};

    if (bannerType === "color") {
      bannerData = {
        type: "color",
        color: bannerColor,
        setAt: new Date().toISOString(),
      };
    } else if (bannerType === "gradient") {
      bannerData = {
        type: "gradient",
        gradient: bannerGradient,
        setAt: new Date().toISOString(),
      };
    }

    // Update note metadata
    const updatedMetadata = {
      ...existingMetadata,
      banner: bannerData,
    };

    // UPDATED: Use authenticated client instead of getSupabase()
    const { error } = await req.db
      .from("notes")
      .update({ metadata: updatedMetadata })
      .eq("id", noteId);

    if (error) {
      throw new Error(`Failed to update note banner: ${error.message}`);
    }

    res.json({
      success: true,
      data: {
        noteId,
        banner: bannerData,
      },
    });
  } catch (error) {
    console.error("Set banner error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to set banner",
    });
  }
};

export const removeBanner = async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;

    // Verify note access - UPDATED to pass authenticated client
    const note = await verifyNoteAccess(noteId, userId, "write", req.db);

    // Get current metadata
    const existingMetadata = note.metadata || {};

    // If there's a banner image, delete it from blob storage
    if (existingMetadata.banner && existingMetadata.banner.filename) {
      try {
        const attachmentPath = getAttachmentPath(
          note.projectid,
          noteId,
          existingMetadata.banner.filename
        );
        const containerClient = req.blobServiceClient.getContainerClient(
          ATTACHMENTS_CONTAINER
        );
        const blobClient = containerClient.getBlobClient(attachmentPath);

        const exists = await blobClient.exists();
        if (exists) {
          await blobClient.delete();
        }
      } catch (deleteError) {
        console.error("Error deleting banner image:", deleteError);
        // Continue even if deletion fails
      }
    }

    // Remove banner from metadata
    const { banner, ...metadataWithoutBanner } = existingMetadata;

    // UPDATED: Use authenticated client instead of getSupabase()
    const { error } = await req.db
      .from("notes")
      .update({ metadata: metadataWithoutBanner })
      .eq("id", noteId);

    if (error) {
      throw new Error(`Failed to remove note banner: ${error.message}`);
    }

    res.json({
      success: true,
      data: {
        noteId,
        message: "Banner removed successfully",
      },
    });
  } catch (error) {
    console.error("Remove banner error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to remove banner",
    });
  }
};
