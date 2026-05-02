// notes/controllers/attachmentController.js
// Local filesystem storage for note attachments.
import * as noteService from "../service/noteService.js";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import localStorageService from "../../storage/localStorageService.js";

const ATTACHMENTS_CONTAINER = "notes";

// Helper to get attachment path
const getAttachmentPath = (projectId, noteId, filename) => {
  return `project-${projectId}/note-${noteId}/${filename}`;
};

// Helper to get local file path for an attachment
const getLocalFilePath = (projectId, noteId, filename) => {
  return path.join(
    localStorageService.getContainerDirPath(ATTACHMENTS_CONTAINER),
    `project-${projectId}`,
    `note-${noteId}`,
    filename
  );
};

// Helper to get container dir
const getContainerDir = () => {
  return localStorageService.getContainerDirPath(ATTACHMENTS_CONTAINER);
};

// Helper to ensure attachment directory exists
const ensureAttachmentDir = async (projectId, noteId) => {
  const dir = path.join(getContainerDir(), `project-${projectId}`, `note-${noteId}`);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
};

// Helper to list attachments in a directory
const listLocalAttachments = async (projectId, noteId) => {
  const dir = path.join(getContainerDir(), `project-${projectId}`, `note-${noteId}`);
  try {
    const files = await fsp.readdir(dir);
    const attachments = [];

    for (const filename of files) {
      const filePath = path.join(dir, filename);
      const stats = await fsp.stat(filePath);
      if (stats.isFile()) {
        attachments.push({
          filename,
          path: filePath,
          size: stats.size,
          lastModified: stats.mtime,
        });
      }
    }
    return attachments;
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
};

// Helper to verify note access
const verifyNoteAccess = async (noteId, userId, db) => {
  try {
    const note = await noteService.getNoteById(noteId, userId, db);
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
    const { isBanner } = req.body;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const maxImageSize = 5 * 1024 * 1024;
    const maxVideoSize = 5 * 1024 * 1024;
    const maxAudioSize = 5 * 1024 * 1024;
    const maxBannerSize = 10 * 1024 * 1024;
    const maxFileSize = 100 * 1024 * 1024;
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
        error: `${fileType.charAt(0).toUpperCase() + fileType.slice(1)} size limit exceeded`,
        message: `Maximum ${fileType} size is ${(sizeLimit / (1024 * 1024)).toFixed(2)}MB`,
        actualSize: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`,
        fileType: fileType,
      });
    }

    const note = await verifyNoteAccess(noteId, userId, req.db);

    const filename = req.file.originalname;
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    const subPath = `project-${note.projectid}/note-${noteId}`;
    await ensureAttachmentDir(note.projectid, noteId);

    let resultFilename;
    let blobName;
    let uploadResult;

    if (isBanner === "true") {
      const bannerFilename = `banner_${Date.now()}_${sanitizedFilename}`;
      blobName = `${subPath}/${bannerFilename}`;

      uploadResult = await localStorageService.uploadFileWithName(
        req.file,
        ATTACHMENTS_CONTAINER,
        subPath,
        bannerFilename
      );
      resultFilename = bannerFilename;
      blobName = uploadResult.blobName;
    } else {
      blobName = `${subPath}/${sanitizedFilename}`;

      uploadResult = await localStorageService.uploadFileWithName(
        req.file,
        ATTACHMENTS_CONTAINER,
        subPath,
        sanitizedFilename
      );
      resultFilename = uploadResult.blobName.split("/").pop();
      blobName = uploadResult.blobName;
    }

    const attachmentUrl = uploadResult.fileUrl;

    if (isBanner === "true") {
      try {
        const existingMetadata = note.metadata || {};
        const updatedMetadata = {
          ...existingMetadata,
          banner: {
            type: "image",
            filename: resultFilename,
            blobName: blobName,
            originalName: filename,
            url: attachmentUrl,
            contentType: req.file.mimetype,
            uploadedAt: new Date().toISOString(),
          },
        };

        await req.db
          .from("notes")
          .update({ metadata: updatedMetadata })
          .eq("id", noteId);
      } catch (metadataError) {
        console.error("Error updating note metadata for banner:", metadataError);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        filename: resultFilename,
        blobName: blobName,
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

    const note = await verifyNoteAccess(noteId, userId, req.db);

    const attachments = await listLocalAttachments(note.projectid, noteId);

    const result = attachments.map((att) => ({
      filename: att.filename,
      blobName: `project-${note.projectid}/note-${noteId}/${att.filename}`,
      url: localStorageService.fileUrl(ATTACHMENTS_CONTAINER, `project-${note.projectid}/note-${noteId}/${att.filename}`),
      contentType: getMimeType(att.filename),
      size: att.size,
      lastModified: att.lastModified,
    }));

    res.json({
      success: true,
      data: {
        noteId,
        attachments: result,
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

    const note = await verifyNoteAccess(noteId, userId, req.db);

    const filePath = getLocalFilePath(note.projectid, noteId, filename);

    let stats;
    try {
      stats = await fsp.stat(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: "Attachment not found",
      });
    }

    const ext = path.extname(filename).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext);
    const isVideo = [".mp4", ".webm", ".mov", ".avi"].includes(ext);
    const isAudio = [".mp3", ".wav", ".ogg", ".m4a", ".flac"].includes(ext);
    const disposition = (isImage || isVideo || isAudio) ? "inline" : "attachment";

    const contentType = getMimeType(filename);
    const fileSize = stats.size;

    const rangeHeader = req.headers.range;
    const needsRangeSupport = isVideo || isAudio;

    if (needsRangeSupport && rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", chunkSize);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.on('error', (err) => {
        console.error('File stream error:', err.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: 'Stream error' });
      });
      fileStream.pipe(res);
    } else {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", fileSize);
      res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);

      if (isImage || isVideo || isAudio) {
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        if (needsRangeSupport) {
          res.setHeader("Accept-Ranges", "bytes");
        }
      }

      const fileStream = fs.createReadStream(filePath);
      fileStream.on('error', (err) => {
        console.error('File stream error:', err.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: 'Stream error' });
      });
      fileStream.pipe(res);
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

    const note = await verifyNoteAccess(noteId, userId, req.db);

    const blobName = `project-${note.projectid}/note-${noteId}/${filename}`;

    try {
      await localStorageService.deleteFile(blobName, ATTACHMENTS_CONTAINER);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

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

    const note = await verifyNoteAccess(noteId, userId, req.db);

    const filePath = getLocalFilePath(note.projectid, noteId, filename);

    let stats;
    try {
      stats = await fsp.stat(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: "Attachment not found",
      });
    }

    res.json({
      success: true,
      data: {
        filename,
        blobName: `project-${note.projectid}/note-${noteId}/${filename}`,
        url: localStorageService.fileUrl(ATTACHMENTS_CONTAINER, `project-${note.projectid}/note-${noteId}/${filename}`),
        contentType: getMimeType(filename),
        size: stats.size,
        lastModified: stats.mtime,
        noteId,
        projectId: note.projectid,
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
    const userId = req.user.id;

    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        success: false,
        error: "Valid metadata object is required",
      });
    }

    const note = await verifyNoteAccess(noteId, userId, req.db);

    const filePath = getLocalFilePath(note.projectid, noteId, filename);

    try {
      await fsp.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: "Attachment not found",
      });
    }

    res.json({
      success: true,
      data: {
        noteId,
        filename,
        message: "Metadata update not supported in local storage mode",
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

export const setBanner = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { bannerType, bannerColor, bannerGradient } = req.body;
    const userId = req.user.id;

    const note = await verifyNoteAccess(noteId, userId, req.db);

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

    const updatedMetadata = {
      ...existingMetadata,
      banner: bannerData,
    };

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

    const note = await verifyNoteAccess(noteId, userId, req.db);

    const existingMetadata = note.metadata || {};

    if (existingMetadata.banner && existingMetadata.banner.blobName) {
      try {
        await localStorageService.deleteFile(existingMetadata.banner.blobName, ATTACHMENTS_CONTAINER);
      } catch (deleteError) {
        console.error("Error deleting banner image:", deleteError);
      }
    }

    const { banner, ...metadataWithoutBanner } = existingMetadata;

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

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
