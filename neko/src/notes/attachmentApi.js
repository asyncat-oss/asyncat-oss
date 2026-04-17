// attachmentApi.js - API functions for handling attachments
import authService from "../services/authService";

const API_URL = import.meta.env.VITE_NOTES_URL;

// Generic API request wrapper for attachments
export const attachmentRequest = async (url, options = {}) => {
  try {
    const response = await authService.authenticatedFetch(url, {
      ...options,
      headers: {
        // Don't set Content-Type for FormData, let browser set it with boundary
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Attachment API Error:", errorData);
      throw new Error(
        errorData.error || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Attachment API Request Failed:", error);
    throw error;
  }
};

// Attachment API functions
export const attachmentApi = {
  // Upload attachment to a note
  uploadAttachment: async (noteId, file, onProgress = null) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
        // Track upload progress
        if (onProgress) {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              onProgress(percentComplete);
            }
          });
        }

        xhr.addEventListener("load", async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              reject(new Error("Invalid response format"));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(
                new Error(
                  errorResponse.error ||
                    `Upload failed with status ${xhr.status}`
                )
              );
            } catch (e) {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed - network error"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload cancelled"));
        });

        xhr.open("POST", `${API_URL}/api/attachments/notes/${noteId}/upload`);
        // Set Authorization header with token
        const token = authService.getAccessToken();
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
        xhr.send(formData);
      });
    } catch (error) {
      console.error("Upload attachment error:", error);
      throw error;
    }
  },

  // List attachments for a note
  listAttachments: async (noteId) => {
    try {
      const response = await attachmentRequest(
        `${API_URL}/api/attachments/notes/${noteId}`
      );
      return response.data || { attachments: [] };
    } catch (error) {
      console.error("List attachments error:", error);
      throw error;
    }
  },

  // Get attachment URL for viewing/downloading
  getAttachmentUrl: (noteId, filename) => {
    // Ensure we have a proper base URL
    const baseUrl = API_URL || "";
    // Remove any trailing slash from base URL
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");

    // Get the current auth token
    const token = authService.getAccessToken();

    // Construct the full URL with authentication token
    const url = `${cleanBaseUrl}/api/attachments/notes/${noteId}/${encodeURIComponent(
      filename
    )}`;

    // Add token as query parameter for direct image access
    const urlWithAuth = token
      ? `${url}?token=${encodeURIComponent(token)}`
      : url;

    return urlWithAuth;
  },

  // Delete attachment
  deleteAttachment: async (noteId, filename) => {
    try {
      const response = await attachmentRequest(
        `${API_URL}/api/attachments/notes/${noteId}/${encodeURIComponent(
          filename
        )}`,
        { method: "DELETE" }
      );
      return response.data;
    } catch (error) {
      console.error("Delete attachment error:", error);
      throw error;
    }
  },

  // Get attachment metadata
  getAttachmentMetadata: async (noteId, filename) => {
    try {
      const response = await attachmentRequest(
        `${API_URL}/api/attachments/notes/${noteId}/${encodeURIComponent(
          filename
        )}/metadata`
      );
      return response.data;
    } catch (error) {
      console.error("Get attachment metadata error:", error);
      throw error;
    }
  },

  // Update attachment metadata
  updateAttachmentMetadata: async (noteId, filename, metadata) => {
    try {
      const response = await attachmentRequest(
        `${API_URL}/api/attachments/notes/${noteId}/${encodeURIComponent(
          filename
        )}/metadata`,
        {
          method: "PATCH",
          body: JSON.stringify({ metadata }),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Update attachment metadata error:", error);
      throw error;
    }
  },

  // Validate file before upload
  validateFile: (file, options = {}) => {
    const {
      maxSize = 100 * 1024 * 1024, // 100MB default
      allowedTypes = null, // null means all types allowed
    } = options;

    const errors = [];

    // Check file size
    if (file.size > maxSize) {
      errors.push(
        `File size (${(file.size / 1024 / 1024).toFixed(
          2
        )}MB) exceeds maximum allowed size (${(maxSize / 1024 / 1024).toFixed(
          2
        )}MB)`
      );
    }

    // Check file type
    if (allowedTypes && allowedTypes.length > 0) {
      const fileType = file.type.toLowerCase();
      const fileExtension = file.name.toLowerCase().split(".").pop();

      const isTypeAllowed = allowedTypes.some((allowedType) => {
        if (allowedType.startsWith(".")) {
          // Extension check
          return fileExtension === allowedType.substring(1);
        } else if (allowedType.includes("/")) {
          // MIME type check
          return (
            fileType === allowedType ||
            fileType.startsWith(allowedType.split("/")[0] + "/")
          );
        } else {
          // Category check (image, video, etc.)
          return fileType.startsWith(allowedType + "/");
        }
      });

      if (!isTypeAllowed) {
        errors.push(
          `File type "${
            file.type
          }" is not allowed. Allowed types: ${allowedTypes.join(", ")}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  // Validate image files specifically with 5MB limit
  validateImageFile: (file) => {
    const maxImageSize = 5 * 1024 * 1024; // 5MB limit for images
    const allowedImageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];

    const errors = [];

    // Check if it's an image file
    if (!file.type.startsWith("image/")) {
      errors.push("File must be an image");
      return { isValid: false, errors };
    }

    // Check file type
    if (!allowedImageTypes.includes(file.type.toLowerCase())) {
      errors.push(
        `Image type "${file.type}" is not allowed. Allowed types: JPEG, PNG, GIF, WebP, SVG`
      );
    }

    // Check file size (5MB limit for images)
    if (file.size > maxImageSize) {
      errors.push(
        `Image size (${(file.size / 1024 / 1024).toFixed(
          2
        )}MB) exceeds maximum allowed size for images (5MB)`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  // Validate video files specifically with 5MB limit
  validateVideoFile: (file) => {
    const maxVideoSize = 5 * 1024 * 1024; // 5MB limit for videos
    const allowedVideoMimeTypes = [
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
      "video/x-matroska",
      "application/x-matroska",
    ];
    const allowedVideoExtensions = [
      "mp4",
      "webm",
      "ogg",
      "mov",
      "qt",
      "mkv",
    ];
    const allowedVideoLabel = "MP4, WebM, OGG, MOV (QuickTime), MKV";

    const errors = [];

    const mimeType = file.type?.toLowerCase() ?? "";
    const fileName = file.name?.toLowerCase() ?? "";
    const fileExtension = fileName.includes(".")
      ? fileName.substring(fileName.lastIndexOf(".") + 1)
      : "";
    const isMimeAllowed =
      allowedVideoMimeTypes.includes(mimeType) || mimeType === "video/mkv";
    const isExtensionAllowed = allowedVideoExtensions.includes(fileExtension);
    const isVideoCategory =
      mimeType.startsWith("video/") || mimeType === "" || isExtensionAllowed;

    // Check if it's a video file
    if (!isVideoCategory) {
      errors.push("File must be a video");
      return { isValid: false, errors };
    }

    // Check file type
    if (!isMimeAllowed && !isExtensionAllowed) {
      const formatDescriptor =
        mimeType || (fileExtension ? `.${fileExtension}` : "Unknown");
      errors.push(
        `Video format "${formatDescriptor}" is not allowed. Allowed formats: ${allowedVideoLabel}`
      );
    }

    // Check file size (5MB limit for videos)
    if (file.size > maxVideoSize) {
      errors.push(
        `Video size (${(file.size / 1024 / 1024).toFixed(
          2
        )}MB) exceeds maximum allowed size for videos (5MB)`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  // Validate audio files specifically with 5MB limit
  validateAudioFile: (file) => {
    const maxAudioSize = 5 * 1024 * 1024; // 5MB limit for audio
    const allowedAudioMimeTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/webm",
      "audio/aac",
      "audio/m4a",
      "audio/flac",
      "audio/x-m4a",
    ];
    const allowedAudioExtensions = [
      "mp3",
      "wav",
      "ogg",
      "webm",
      "aac",
      "m4a",
      "flac",
    ];
    const allowedAudioLabel = "MP3, WAV, OGG, WebM, AAC, M4A, FLAC";

    const errors = [];

    const mimeType = file.type?.toLowerCase() ?? "";
    const fileName = file.name?.toLowerCase() ?? "";
    const fileExtension = fileName.includes(".")
      ? fileName.substring(fileName.lastIndexOf(".") + 1)
      : "";
    const isMimeAllowed = allowedAudioMimeTypes.includes(mimeType);
    const isExtensionAllowed = allowedAudioExtensions.includes(fileExtension);
    const isAudioCategory =
      mimeType.startsWith("audio/") || mimeType === "" || isExtensionAllowed;

    // Check if it's an audio file
    if (!isAudioCategory) {
      errors.push("File must be an audio file");
      return { isValid: false, errors };
    }

    // Check file type
    if (!isMimeAllowed && !isExtensionAllowed) {
      const formatDescriptor =
        mimeType || (fileExtension ? `.${fileExtension}` : "Unknown");
      errors.push(
        `Audio format "${formatDescriptor}" is not allowed. Allowed formats: ${allowedAudioLabel}`
      );
    }

    // Check file size (5MB limit for audio)
    if (file.size > maxAudioSize) {
      errors.push(
        `Audio size (${(file.size / 1024 / 1024).toFixed(
          2
        )}MB) exceeds maximum allowed size for audio (5MB)`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  // Get file icon based on type
  getFileIcon: (filename, mimeType = "") => {
    const extension = filename.toLowerCase().split(".").pop();
    const type = mimeType.toLowerCase();

    // Image files
    if (
      type.startsWith("image/") ||
      ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(extension)
    ) {
      return "🖼️";
    }

    // Video files
    if (
      type.startsWith("video/") ||
      ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv"].includes(extension)
    ) {
      return "🎥";
    }

    // Audio files
    if (
      type.startsWith("audio/") ||
      ["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(extension)
    ) {
      return "🎵";
    }

    // Document files
    if (["pdf"].includes(extension)) {
      return "📄";
    }

    if (["doc", "docx"].includes(extension)) {
      return "📝";
    }

    if (["xls", "xlsx"].includes(extension)) {
      return "📊";
    }

    if (["ppt", "pptx"].includes(extension)) {
      return "📽️";
    }

    // Archive files
    if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
      return "📦";
    }

    // Code files
    if (
      [
        "js",
        "ts",
        "jsx",
        "tsx",
        "py",
        "java",
        "cpp",
        "c",
        "html",
        "css",
        "php",
        "rb",
        "go",
        "rs",
      ].includes(extension)
    ) {
      return "💻";
    }

    // Text files
    if (type.startsWith("text/") || ["txt", "md", "rtf"].includes(extension)) {
      return "📋";
    }

    // Default file icon
    return "📎";
  },

  // Format file size
  formatFileSize: (bytes) => {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  },

  // NEW: Banner management functions
  setBanner: async (noteId, bannerType, options = {}) => {
    try {
      const response = await attachmentRequest(
        `${API_URL}/api/attachments/notes/${noteId}/banner`,
        {
          method: "POST",
          body: JSON.stringify({
            bannerType,
            bannerColor: options.color,
            bannerGradient: options.gradient,
          }),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Set banner error:", error);
      throw error;
    }
  },

  removeBanner: async (noteId) => {
    try {
      const response = await attachmentRequest(
        `${API_URL}/api/attachments/notes/${noteId}/banner`,
        {
          method: "DELETE",
        }
      );
      return response.data;
    } catch (error) {
      console.error("Remove banner error:", error);
      throw error;
    }
  },

  uploadBannerImage: async (noteId, file, onProgress = null) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("isBanner", "true"); // Mark as banner

      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable && onProgress) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response.data);
            } catch (e) {
              reject(new Error("Invalid response format"));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || "Upload failed"));
            } catch (e) {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error occurred"));
        });

        xhr.open("POST", `${API_URL}/api/attachments/notes/${noteId}/upload`);
        // Set Authorization header with token
        const token = authService.getAccessToken();
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
        xhr.send(formData);
      });
    } catch (error) {
      console.error("Upload banner image error:", error);
      throw error;
    }
  },
};
