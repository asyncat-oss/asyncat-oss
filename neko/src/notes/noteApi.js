// noteApi.js - Enhanced with Delta Change Support and Attachments
import authService from "../services/authService";
import {
  secureLogger,
  getConnectionStatusMessage,
} from "../utils/secureLogger";
import { sanitizeNoteContent, sanitizeToText } from "../utils/sanitizer";

// Sanitization helpers
const sanitizeChangeset = (changeset) => {
  if (!changeset || !changeset.operations) return changeset;

  const sanitizedOperations = changeset.operations.map((operation) => {
    // Sanitize content in operations
    if (operation.content !== undefined) {
      operation.content = sanitizeNoteContent(operation.content);
    }
    if (operation.newContent !== undefined) {
      operation.newContent = sanitizeNoteContent(operation.newContent);
    }
    if (operation.title !== undefined) {
      operation.title = sanitizeToText(operation.title);
    }
    return operation;
  });

  return {
    ...changeset,
    operations: sanitizedOperations,
  };
};

const sanitizeResponseData = (data) => {
  if (!data) return data;

  // Sanitize note content in response
  if (data.content !== undefined) {
    data.content = sanitizeNoteContent(data.content);
  }
  if (data.title !== undefined) {
    data.title = sanitizeToText(data.title);
  }

  // Handle block-based content structure
  if (data.blocks && Array.isArray(data.blocks)) {
    data.blocks = data.blocks.map((block) => {
      if (block.content !== undefined) {
        block.content = sanitizeNoteContent(block.content);
      }
      return block;
    });
  }

  return data;
};

// Environment variables
const API_URL = import.meta.env.VITE_NOTES_URL;
const MAIN_API_URL = import.meta.env.VITE_USER_URL;

// Generic API request wrapper
export const apiRequest = async (url, options = {}) => {
  try {
    const response = await authService.authenticatedFetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      secureLogger.error("API Error Response:", response.status);
      throw new Error(
        errorData.error || `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    secureLogger.error("API request failed");
    throw error;
  }
};

// Projects API calls
export const projectsApi = {
  // Load all projects
  loadProjects: async () => {
    try {
      const { data } = await apiRequest(`${MAIN_API_URL}/api/projects`);

      if (Array.isArray(data)) {
        const projectsMapping = data.reduce((acc, project) => {
          acc[project.id] = {
            id: project.id,
            name: project.name,
            teamId: project.team_id,
            type: project.type || "team",
            hasNotes: project.has_notes !== false,
          };
          return acc;
        }, {});

        return projectsMapping;
      }
      return {};
    } catch (err) {
      secureLogger.error("Error loading projects");
      return {};
    }
  },
};

// Notes API calls - Enhanced with Delta Support
export const notesApi = {
  // Load notes (with optional project filter)
  loadNotes: async (projectId) => {
    let queryParams = projectId ? `?projectId=${projectId}` : "";
    queryParams += (queryParams ? "&" : "?") + "excludeContent=true";

    const response = await apiRequest(`${API_URL}/api/notes${queryParams}`);
    let data = response.data || response;

    // Convert object with numeric keys back to array
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const keys = Object.keys(data);
      if (keys.every((key) => /^\d+$/.test(key))) {
        data = Object.values(data);
      }
    }

    const sortedNotes = (data || []).sort(
      (a, b) =>
        new Date(b.updatedAt || b.updatedat) -
        new Date(a.updatedAt || a.updatedat)
    );

    return sortedNotes;
  },

  // Fetch note with full content
  fetchNoteWithContent: async (noteId, forceFresh = true) => {
    // Add cache-busting timestamp to ensure fresh data
    // Using only URL timestamp to avoid CORS preflight issues with custom headers
    const url = forceFresh
      ? `${API_URL}/api/notes/${noteId}?_t=${Date.now()}`
      : `${API_URL}/api/notes/${noteId}`;

    const response = await apiRequest(url);
    const data = response?.data;
    
    // Validate that we received note data
    if (!data || !data.id) {
      secureLogger.warn("fetchNoteWithContent: Invalid or empty response data");
      return null;
    }

    // Extract version info if available
    let version = null;
    if (data.metadata) {
      try {
        const metadata =
          typeof data.metadata === "string"
            ? JSON.parse(data.metadata)
            : data.metadata;
        version = metadata.version;
      } catch (e) {
        secureLogger.warn("Failed to parse metadata for version info");
      }
    }

    // Sanitize the response data before returning
    const sanitizedData = sanitizeResponseData({ ...data, version });
    return sanitizedData;
  },

  // Create new note
  createNote: async (title, content, projectId) => {
    // Sanitize inputs before sending to backend
    const sanitizedTitle = sanitizeToText(title || "Untitled Note");
    const sanitizedContent = sanitizeNoteContent(content || "");

    const { data } = await apiRequest(`${API_URL}/api/notes`, {
      method: "POST",
      body: JSON.stringify({
        title: sanitizedTitle,
        content: sanitizedContent,
        projectId: projectId,
      }),
    });

    return data;
  },

  // Apply delta changes (NEW) - NORMALIZED SHAPE with proper metadata
  applyDeltaChanges: async (noteId, changeset, context = {}) => {
    try {
      secureLogger.debug("API: Applying delta changes", {
        noteId: noteId?.slice(0, 8),
        operations: changeset.operations?.length,
        baselineVersion: changeset.baselineVersion,
      });

      // Sanitize changeset before sending to backend
      const sanitizedChangeset = sanitizeChangeset(changeset);

      // Prepare the request payload with required fields
      const payload = {
        changeset: sanitizedChangeset,
        timestamp: Date.now(),
        context: {
          userAgent: navigator.userAgent,
          source: "web-editor",
          ...context,
        },
      };

      // Don't include updated_by field - let backend handle it
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/delta`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      // Backend already returns { success, data, operationsApplied, ... }
      if (response && typeof response === "object" && "success" in response) {
        return {
          success: response.success,
          data: sanitizeResponseData(response.data), // Sanitize response data
          operationsApplied: response.operationsApplied,
          operationsRejected: response.operationsRejected,
          conflicts: response.conflicts,
          newVersion: response.newBaselineVersion,
          versionCreated: response.versionCreated,
        };
      }

      // Fallback unexpected shape - also sanitize
      return { success: true, data: sanitizeResponseData(response) };
    } catch (error) {
      secureLogger.error("Delta changes failed");
      throw error;
    }
  },

  // Sync note state (NEW)
  syncNoteState: async (noteId) => {
    try {
      const response = await apiRequest(`${API_URL}/api/notes/${noteId}/sync`, {
        method: "GET",
      });

      return {
        success: true,
        state: response.data,
      };
    } catch (error) {
      secureLogger.error("Sync state failed");
      throw error;
    }
  },

  // Check for conflicts (NEW)
  checkConflicts: async (noteId, baselineVersion) => {
    try {
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/conflicts`,
        {
          method: "POST",
          body: JSON.stringify({ baselineVersion }),
        }
      );

      return response.data;
    } catch (error) {
      secureLogger.error("Conflict check failed");
      throw error;
    }
  },

  // Merge conflicts (NEW)
  mergeConflicts: async (noteId, conflicts) => {
    try {
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/merge`,
        {
          method: "POST",
          body: JSON.stringify({ conflicts }),
        }
      );

      return {
        success: response.success,
        mergedNote: response.data,
        resolutionDetails: response.resolutionDetails,
      };
    } catch (error) {
      secureLogger.error("Conflict merge failed");
      throw error;
    }
  },

  // Batch delta operations (NEW)
  batchDeltaOperations: async (operations) => {
    try {
      const response = await apiRequest(`${API_URL}/api/notes/batch-delta`, {
        method: "POST",
        body: JSON.stringify({ operations }),
      });

      return response.data;
    } catch (error) {
      secureLogger.error("Batch delta operations failed");
      throw error;
    }
  },

  // Get note operations history (NEW)
  getOperationsHistory: async (noteId, options = {}) => {
    const { limit = 50, offset = 0, since } = options;
    let queryParams = `?limit=${limit}&offset=${offset}`;
    if (since) {
      queryParams += `&since=${since}`;
    }

    try {
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/operations${queryParams}`
      );
      return response.data || [];
    } catch (error) {
      secureLogger.error("Error fetching operations history");
      throw error;
    }
  },

  // Delete note
  deleteNote: async (id) => {
    await apiRequest(`${API_URL}/api/notes/${id}`, {
      method: "DELETE",
    });

    return true;
  },

  // Export note as DOCX
  exportAsDocx: async (noteId) => {
    try {
      const response = await authService.authenticatedFetch(
        `${API_URL}/api/notes/${noteId}/export/docx`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      secureLogger.error("DOCX export failed");
      throw error;
    }
  },

  // Export note as PDF
  exportAsPdf: async (noteId) => {
    try {
      const response = await authService.authenticatedFetch(
        `${API_URL}/api/notes/${noteId}/export/pdf`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      secureLogger.error("PDF export failed");
      throw error;
    }
  },

  // Restore note to specific version
  restoreVersion: async (noteId, versionId) => {
    // Version history temporarily disabled
    throw new Error("Version history temporarily disabled");
    /*
    try {
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/versions/${versionId}/restore`,
        {
          method: "POST",
        }
      );
      return response.data;
    } catch (error) {
      secureLogger.error("Error in restoreVersion");
      throw error;
    }
    */
  },

  // Delete old versions (cleanup)
  deleteOldVersions: async (noteId, keepVersions = 50) => {
    // Version history temporarily disabled
    throw new Error("Version history temporarily disabled");
    /*
    try {
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/versions/cleanup`,
        {
          method: "POST",
          body: JSON.stringify({ keepVersions }),
        }
      );
      return response.data;
    } catch (error) {
      secureLogger.error("Error in deleteOldVersions");
      throw error;
    }
    */
  },
};

// Version history specific API helpers (Google Docs style history)
/*
export const versionHistoryApi = {
  getVersionHistory: async (noteId, options = {}) => {
    const {
      limit = 50,
      offset = 0,
      majorOnly = false,
      includeOperations = false,
    } = options;

    try {
      const params = new URLSearchParams();
      params.append("limit", String(limit));
      params.append("offset", String(offset));
      if (majorOnly) params.append("majorOnly", "true");
      if (includeOperations) params.append("includeOperations", "true");

      const query = params.toString();
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/versions${query ? `?${query}` : ""}`
      );

      return response?.data || { versions: [], totalCount: 0, hasMore: false };
    } catch (error) {
      secureLogger.error("Error in versionHistoryApi.getVersionHistory");
      throw error;
    }
  },

  getVersion: async (noteId, versionId) => {
    try {
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/versions/${versionId}`
      );
      return response?.data || null;
    } catch (error) {
      secureLogger.error("Error in versionHistoryApi.getVersion");
      throw error;
    }
  },

  createAutoVersion: async (
    noteId,
    { triggerType = "auto", forceCreate = false, timestamp, restoredFrom } = {}
  ) => {
    try {
      const payload = {
        triggerType,
        forceCreate,
      };

      if (timestamp) {
        payload.timestamp = timestamp;
      }
      if (restoredFrom) {
        payload.restoredFrom = restoredFrom;
      }

      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/versions/auto`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      return response?.data || null;
    } catch (error) {
      secureLogger.error("Error in versionHistoryApi.createAutoVersion");
      throw error;
    }
  },

  updateVersionName: async (noteId, versionId, name) => {
    try {
      const cleanName = sanitizeToText(name || "").trim();
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/versions/${versionId}/name`,
        {
          method: "PUT",
          body: JSON.stringify({ name: cleanName }),
        }
      );

      return response?.data || null;
    } catch (error) {
      secureLogger.error("Error in versionHistoryApi.updateVersionName");
      throw error;
    }
  },

  // Version group management
  getGroupNames: async (noteId) => {
    try {
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/version-groups`
      );
      return response?.data || {};
    } catch (error) {
      secureLogger.error("Error in versionHistoryApi.getGroupNames");
      throw error;
    }
  },

  updateGroupName: async (noteId, groupKey, name) => {
    try {
      const cleanName = sanitizeToText(name || "").trim();
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/version-groups/${encodeURIComponent(
          groupKey
        )}/name`,
        {
          method: "PUT",
          body: JSON.stringify({ name: cleanName }),
        }
      );
      return response?.data || null;
    } catch (error) {
      secureLogger.error("Error in versionHistoryApi.updateGroupName");
      throw error;
    }
  },

  deleteGroupName: async (noteId, groupKey) => {
    try {
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/version-groups/${encodeURIComponent(
          groupKey
        )}`,
        {
          method: "DELETE",
        }
      );
      return response?.data || null;
    } catch (error) {
      secureLogger.error("Error in versionHistoryApi.deleteGroupName");
      throw error;
    }
  },

  // Get operations for a specific version
  getOperations: async (noteId, options = {}) => {
    const { limit = 100, offset = 0, versionId } = options;
    try {
      const params = new URLSearchParams();
      params.append("limit", String(limit));
      params.append("offset", String(offset));
      if (versionId) params.append("versionId", versionId);

      const query = params.toString();
      const response = await apiRequest(
        `${API_URL}/api/notes/${noteId}/operations${query ? `?${query}` : ""}`
      );
      return response?.data || [];
    } catch (error) {
      secureLogger.error("Error in versionHistoryApi.getOperations");
      throw error;
    }
  },
};
*/

export const versionHistoryApi = {
  getVersionHistory: async () => ({
    versions: [],
    totalCount: 0,
    hasMore: false,
  }),
  getVersion: async () => null,
  createAutoVersion: async () => null,
  updateVersionName: async () => null,
  getGroupNames: async () => ({}),
  updateGroupName: async () => null,
  deleteGroupName: async () => null,
  getOperations: async () => [],
};

// Attachment API calls (NEW) - Convenience functions that delegate to attachmentApi
export const attachmentsApi = {
  // Upload attachment to a note
  uploadAttachment: async (noteId, file, onProgress = null) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.uploadAttachment(noteId, file, onProgress);
  },

  // List attachments for a note
  listAttachments: async (noteId) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.listAttachments(noteId);
  },

  // Get attachment URL - Use the same API_URL as other note operations
  getAttachmentUrl: (noteId, filename) => {
    const baseUrl = API_URL || "";
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
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.deleteAttachment(noteId, filename);
  },

  // Get attachment metadata
  getAttachmentMetadata: async (noteId, filename) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.getAttachmentMetadata(noteId, filename);
  },

  // Update attachment metadata
  updateAttachmentMetadata: async (noteId, filename, metadata) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.updateAttachmentMetadata(noteId, filename, metadata);
  },

  // Utility functions - delegated to attachmentApi
  validateFile: async (file, options = {}) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.validateFile(file, options);
  },

  // Validate image files specifically with 5MB limit
  validateImageFile: (file) => {
    // Since this is a simple validation function, let's implement it directly here
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

  getFileIcon: (filename, mimeType = "") => {
    // For synchronous utility functions, we can't use dynamic import
    // We'll need to import attachmentApi statically at the top level
    // For now, let's provide a fallback implementation
    const extension = filename?.split(".").pop()?.toLowerCase() || "";
    const iconMap = {
      pdf: "📄",
      doc: "📄",
      docx: "📄",
      txt: "📄",
      jpg: "🖼️",
      jpeg: "🖼️",
      png: "🖼️",
      gif: "🖼️",
      svg: "🖼️",
      mp4: "🎥",
      avi: "🎥",
      mov: "🎥",
      mp3: "🎵",
      wav: "🎵",
      flac: "🎵",
      zip: "🗜️",
      rar: "🗜️",
      "7z": "🗜️",
      js: "📜",
      ts: "📜",
      json: "📜",
      html: "📜",
      css: "📜",
    };
    return iconMap[extension] || "📁";
  },

  formatFileSize: (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },

  // Banner management functions
  setBanner: async (noteId, bannerType, options = {}) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.setBanner(noteId, bannerType, options);
  },

  removeBanner: async (noteId) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.removeBanner(noteId);
  },

  uploadBannerImage: async (noteId, file, onProgress = null) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.uploadBannerImage(noteId, file, onProgress);
  },
};
