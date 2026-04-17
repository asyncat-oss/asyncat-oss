import { parseAttachmentShareId } from "../utils/sharedAttachmentUtils.js";

const PRIMARY_CONTAINER =
  process.env.ATTACHMENTS_CONTAINER || "notes";
const ALT_CONTAINER = PRIMARY_CONTAINER === "notes" ? "note-attachments" : "notes";

const setPublicHeaders = (res, options = {}) => {
  res.setHeader("Cache-Control", options.cacheControl || "public, max-age=86400");
  res.setHeader("Access-Control-Allow-Origin", options.origin || "*");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Length, Content-Disposition, Accept-Ranges");
  res.setHeader("Accept-Ranges", "bytes");
};

const streamBlobRange = (blobClient, start, end) => {
  const count = end === undefined ? undefined : end - start + 1;
  return blobClient.download(start, count);
};

const createSharedStreamHandler = (mediaType) => {
  return async (req, res) => {
    try {
      if (!req.blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: "Storage service is unavailable",
        });
      }

      const { shareId } = req.params;

      const { noteId, projectId, filename } = parseAttachmentShareId(shareId);
      const blobPath = `project-${projectId}/note-${noteId}/${filename}`;

      const primaryContainer = req.blobServiceClient.getContainerClient(
        PRIMARY_CONTAINER
      );
      let blobClient = primaryContainer.getBlobClient(blobPath);

      let exists = await blobClient.exists();
      if (!exists && !process.env.ATTACHMENTS_CONTAINER) {
        const fallbackContainer = req.blobServiceClient.getContainerClient(
          ALT_CONTAINER
        );
        const fallbackBlobClient = fallbackContainer.getBlobClient(blobPath);
        if (await fallbackBlobClient.exists()) {
          blobClient = fallbackBlobClient;
          exists = true;
        }
      }

      if (!exists) {
        return res.status(404).json({
          success: false,
          error: "Attachment not found",
        });
      }

      const properties = await blobClient.getProperties();
      const contentType = properties.contentType || "application/octet-stream";
      const originalName = properties.metadata?.originalName || filename;
      const fileSize = properties.contentLength;

      if (mediaType === "video" && !contentType.startsWith("video/")) {
        return res.status(400).json({
          success: false,
          error: "Requested attachment is not a video",
        });
      }

      if (mediaType === "audio" && !contentType.startsWith("audio/")) {
        return res.status(400).json({
          success: false,
          error: "Requested attachment is not an audio file",
        });
      }

      const rangeHeader = req.headers.range;
      const wantsPartial = Boolean(rangeHeader);

      setPublicHeaders(res, {
        cacheControl: "public, max-age=86400, immutable",
      });

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(originalName)}"`
      );

      if (wantsPartial) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
          return res.status(416).set({
            "Content-Range": `bytes */${fileSize}`,
          }).end();
        }

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", end - start + 1);

        const downloadResponse = await streamBlobRange(blobClient, start, end);
        downloadResponse.readableStreamBody.pipe(res);
        return;
      }

      res.status(200);
      res.setHeader("Content-Length", fileSize);

      const downloadResponse = await blobClient.download();
      downloadResponse.readableStreamBody.pipe(res);
    } catch (error) {
      console.error("Shared attachment stream error:", error);
      const message = "Unable to stream shared attachment";
      const status =
        error.message && error.message.toLowerCase().includes("share id")
          ? 404
          : 500;
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  };
};

export const streamSharedVideo = createSharedStreamHandler("video");
export const streamSharedAudio = createSharedStreamHandler("audio");
