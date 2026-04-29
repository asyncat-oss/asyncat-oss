import busboy from "busboy";

const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 100 * 1024 * 1024; // 100MB default
const MAX_IMAGE_SIZE = process.env.MAX_IMAGE_SIZE || 5 * 1024 * 1024; // 5MB for images
const MAX_AUDIO_SIZE = process.env.MAX_AUDIO_SIZE || 5 * 1024 * 1024; // 5MB for audio
const MAX_BANNER_SIZE = process.env.MAX_BANNER_SIZE || 10 * 1024 * 1024; // 10MB for banner images

// Helper function to check if file is an image
const isImageFile = (mimeType) => {
  return mimeType && mimeType.startsWith("image/");
};

// Helper function to check if file is audio
const isAudioFile = (mimeType) => {
  return mimeType && mimeType.startsWith("audio/");
};

// Helper function to get appropriate size limit based on file type and purpose
const getFileSizeLimit = (mimeType, isBanner = false) => {
  if (isImageFile(mimeType)) {
    return isBanner ? MAX_BANNER_SIZE : MAX_IMAGE_SIZE;
  }
  if (isAudioFile(mimeType)) {
    return MAX_AUDIO_SIZE;
  }
  return MAX_FILE_SIZE;
};

// Middleware to check if storage is available - always passes in local mode

// Helper function to process file uploads with busboy
export const handleFileUpload = (req, res, next) => {
  // Only process if this is a multipart request
  if (!req.is("multipart/form-data")) {
    return next();
  }

  // Start with the larger limit, we'll enforce specific limits per file type during processing
  const bb = busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE }, // Use the larger limit initially
  });

  const fields = {};
  let fileBuffer = null;
  let fileName = "";
  let fileMimetype = "";
  let fileSize = 0;
  let fileSizeExceeded = false;
  let isBannerUpload = false;

  // Handle non-file fields
  bb.on("field", (fieldname, val) => {
    fields[fieldname] = val;
    // Check if this is a banner upload
    if (fieldname === "isBanner" && val === "true") {
      isBannerUpload = true;
    }
  });

  // Handle file upload
  bb.on("file", (fieldname, file, info) => {
    const { filename, mimeType } = info;

    if (fieldname === "file") {
      fileName = filename;
      fileMimetype = mimeType;

      // Get appropriate size limit based on file type and banner status
      const fileSizeLimit = getFileSizeLimit(mimeType, isBannerUpload);

      const chunks = [];

      // Manual size check with dynamic limit
      file.on("data", (data) => {
        fileSize += data.length;

        // Hard limit check - terminate immediately if exceeded
        if (fileSize > fileSizeLimit && !fileSizeExceeded) {
          fileSizeExceeded = true;
          file.destroy();
          return;
        }

        // Only add chunk if we haven't exceeded the limit
        if (!fileSizeExceeded) {
          chunks.push(data);
        }
      });

      file.on("end", () => {
        if (!fileSizeExceeded) {
          fileBuffer = Buffer.concat(chunks);
        }
      });

      // Triggered by busboy when its internal limit is reached
      file.on("limit", () => {
        fileSizeExceeded = true;
      });
    } else {
      // Skip other file fields
      file.resume();
    }
  });

  // Handle completion
  bb.on("close", () => {
    // Check if file size was exceeded
    if (fileSizeExceeded) {
      const fileSizeLimit = getFileSizeLimit(fileMimetype, isBannerUpload);
      let fileType;

      if (isImageFile(fileMimetype) && isBannerUpload) {
        fileType = "banner image";
      } else if (isImageFile(fileMimetype)) {
        fileType = "image";
      } else if (isAudioFile(fileMimetype)) {
        fileType = "audio";
      } else {
        fileType = "file";
      }

      return res.status(413).json({
        success: false,
        error: `${
          fileType.charAt(0).toUpperCase() + fileType.slice(1)
        } size limit exceeded`,
        message: `Maximum ${fileType} size is ${(
          fileSizeLimit /
          (1024 * 1024)
        ).toFixed(2)}MB`,
        requestedSize: fileSize
          ? `${(fileSize / (1024 * 1024)).toFixed(2)}MB`
          : "Unknown",
        fileType: fileType,
      });
    }

    // Attach fields and file info to request object
    req.body = fields;

    if (fileBuffer) {
      req.file = {
        buffer: fileBuffer,
        originalname: fileName,
        mimetype: fileMimetype,
        size: fileSize,
      };
    }

    next();
  });

  // Handle parsing errors
  bb.on("error", (err) => {
    next(err);
  });

  // Pipe the request to busboy
  req.pipe(bb);
};
