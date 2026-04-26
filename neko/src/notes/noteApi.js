import authService from "../services/authService";
import { secureLogger, getConnectionStatusMessage } from "../utils/secureLogger";
import { sanitizeNoteContent, sanitizeToText } from "../utils/sanitizer";

const sanitizeChangeset = (changeset) => {
  if (!changeset?.operations) return changeset;
  return {
    ...changeset,
    operations: changeset.operations.map((op) => {
      if (op.content !== undefined) op.content = sanitizeNoteContent(op.content);
      if (op.newContent !== undefined) op.newContent = sanitizeNoteContent(op.newContent);
      if (op.title !== undefined) op.title = sanitizeToText(op.title);
      return op;
    }),
  };
};

const sanitizeResponseData = (data) => {
  if (!data) return data;
  if (data.content !== undefined) data.content = sanitizeNoteContent(data.content);
  if (data.title !== undefined) data.title = sanitizeToText(data.title);
  if (data.blocks && Array.isArray(data.blocks)) {
    data.blocks = data.blocks.map((block) => {
      if (block.content !== undefined) block.content = sanitizeNoteContent(block.content);
      return block;
    });
  }
  return data;
};

const API_URL = import.meta.env.VITE_NOTES_URL;
const MAIN_API_URL = import.meta.env.VITE_USER_URL;

export const apiRequest = async (url, options = {}) => {
  try {
    const response = await authService.authenticatedFetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    secureLogger.error("API request failed");
    throw error;
  }
};

export const projectsApi = {
  loadProjects: async () => {
    try {
      const { data } = await apiRequest(`${MAIN_API_URL}/api/projects`);
      if (Array.isArray(data)) {
        return data.reduce((acc, project) => {
          acc[project.id] = {
            id: project.id,
            name: project.name,
            teamId: project.team_id,
            type: project.type || "team",
            hasNotes: project.has_notes !== false,
          };
          return acc;
        }, {});
      }
      return {};
    } catch (err) {
      secureLogger.error("Error loading projects");
      return {};
    }
  },
};

export const notesApi = {
  loadNotes: async (projectId) => {
    let queryParams = projectId ? `?projectId=${projectId}` : "";
    queryParams += (queryParams ? "&" : "?") + "excludeContent=true";

    const response = await apiRequest(`${API_URL}/api/notes${queryParams}`);
    let data = response.data || response;

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const keys = Object.keys(data);
      if (keys.every((key) => /^\d+$/.test(key))) data = Object.values(data);
    }

    return (data || []).sort(
      (a, b) => new Date(b.updatedAt || b.updatedat) - new Date(a.updatedAt || a.updatedat)
    );
  },

  fetchNoteWithContent: async (noteId, forceFresh = true) => {
    const url = forceFresh
      ? `${API_URL}/api/notes/${noteId}?_t=${Date.now()}`
      : `${API_URL}/api/notes/${noteId}`;

    const response = await apiRequest(url);
    const data = response?.data;

    if (!data?.id) {
      secureLogger.warn("fetchNoteWithContent: Invalid response");
      return null;
    }

    let version = null;
    if (data.metadata) {
      try {
        const meta = typeof data.metadata === "string" ? JSON.parse(data.metadata) : data.metadata;
        version = meta.version;
      } catch {}
    }

    return sanitizeResponseData({ ...data, version });
  },

  createNote: async (title, content, projectId) => {
    const { data } = await apiRequest(`${API_URL}/api/notes`, {
      method: "POST",
      body: JSON.stringify({
        title: sanitizeToText(title || "Untitled Note"),
        content: sanitizeNoteContent(content || ""),
        projectId,
      }),
    });
    return data;
  },

  applyDeltaChanges: async (noteId, changeset, context = {}) => {
    try {
      const response = await apiRequest(`${API_URL}/api/notes/${noteId}/delta`, {
        method: "POST",
        body: JSON.stringify({
          changeset: sanitizeChangeset(changeset),
          timestamp: Date.now(),
          context: { source: "web-editor", ...context },
        }),
      });

      if (response && typeof response === "object" && "success" in response) {
        return {
          success: response.success,
          data: sanitizeResponseData(response.data),
          operationsApplied: response.operationsApplied,
          operationsRejected: response.operationsRejected,
          conflicts: response.conflicts,
        };
      }

      return { success: true, data: sanitizeResponseData(response) };
    } catch (error) {
      secureLogger.error("Delta changes failed");
      throw error;
    }
  },

  deleteNote: async (id) => {
    await apiRequest(`${API_URL}/api/notes/${id}`, { method: "DELETE" });
    return true;
  },

  exportAsDocx: async (noteId) => {
    try {
      const response = await authService.authenticatedFetch(
        `${API_URL}/api/notes/${noteId}/export/docx`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);
      return await response.blob();
    } catch (error) {
      secureLogger.error("DOCX export failed");
      throw error;
    }
  },

  exportAsPdf: async (noteId) => {
    try {
      const response = await authService.authenticatedFetch(
        `${API_URL}/api/notes/${noteId}/export/pdf`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);
      return await response.blob();
    } catch (error) {
      secureLogger.error("PDF export failed");
      throw error;
    }
  },
};

// Stub — version history is disabled in local mode
export const versionHistoryApi = {
  getVersionHistory: async () => ({ versions: [], totalCount: 0, hasMore: false }),
  getVersion: async () => null,
  createAutoVersion: async () => null,
  updateVersionName: async () => null,
  getGroupNames: async () => ({}),
  updateGroupName: async () => null,
  deleteGroupName: async () => null,
  getOperations: async () => [],
};

export const attachmentsApi = {
  uploadAttachment: async (noteId, file, onProgress = null) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.uploadAttachment(noteId, file, onProgress);
  },

  listAttachments: async (noteId) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.listAttachments(noteId);
  },

  getAttachmentUrl: (noteId, filename) => {
    const baseUrl = (API_URL || "").replace(/\/$/, "");
    const token = authService.getAccessToken();
    const url = `${baseUrl}/api/attachments/notes/${noteId}/${encodeURIComponent(filename)}`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  },

  deleteAttachment: async (noteId, filename) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.deleteAttachment(noteId, filename);
  },

  getAttachmentMetadata: async (noteId, filename) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.getAttachmentMetadata(noteId, filename);
  },

  updateAttachmentMetadata: async (noteId, filename, metadata) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.updateAttachmentMetadata(noteId, filename, metadata);
  },

  validateFile: async (file, options = {}) => {
    const { attachmentApi } = await import("./attachmentApi");
    return attachmentApi.validateFile(file, options);
  },

  validateImageFile: (file) => {
    const maxSize = 5 * 1024 * 1024;
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
    const errors = [];
    if (!file.type.startsWith("image/")) return { isValid: false, errors: ["File must be an image"] };
    if (!allowed.includes(file.type.toLowerCase())) errors.push(`Image type "${file.type}" is not allowed`);
    if (file.size > maxSize) errors.push(`Image exceeds 5MB limit`);
    return { isValid: errors.length === 0, errors };
  },

  validateVideoFile: (file) => {
    const maxSize = 5 * 1024 * 1024;
    const allowedMime = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-matroska", "application/x-matroska"];
    const allowedExt = ["mp4", "webm", "ogg", "mov", "qt", "mkv"];
    const errors = [];
    const mimeType = file.type?.toLowerCase() ?? "";
    const ext = (file.name?.toLowerCase() ?? "").split(".").pop();
    if (!mimeType.startsWith("video/") && !allowedExt.includes(ext)) {
      return { isValid: false, errors: ["File must be a video"] };
    }
    if (!allowedMime.includes(mimeType) && !allowedExt.includes(ext)) {
      errors.push(`Video format "${mimeType || ext}" is not allowed`);
    }
    if (file.size > maxSize) errors.push("Video exceeds 5MB limit");
    return { isValid: errors.length === 0, errors };
  },

  validateAudioFile: (file) => {
    const maxSize = 5 * 1024 * 1024;
    const allowedMime = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/aac", "audio/m4a", "audio/flac", "audio/x-m4a"];
    const allowedExt = ["mp3", "wav", "ogg", "webm", "aac", "m4a", "flac"];
    const errors = [];
    const mimeType = file.type?.toLowerCase() ?? "";
    const ext = (file.name?.toLowerCase() ?? "").split(".").pop();
    if (!mimeType.startsWith("audio/") && !allowedExt.includes(ext)) {
      return { isValid: false, errors: ["File must be an audio file"] };
    }
    if (!allowedMime.includes(mimeType) && !allowedExt.includes(ext)) {
      errors.push(`Audio format "${mimeType || ext}" is not allowed`);
    }
    if (file.size > maxSize) errors.push("Audio exceeds 5MB limit");
    return { isValid: errors.length === 0, errors };
  },

  getFileIcon: (filename, mimeType = "") => {
    const ext = filename?.split(".").pop()?.toLowerCase() || "";
    const iconMap = {
      pdf: "📄", doc: "📄", docx: "📄", txt: "📄",
      jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️", svg: "🖼️",
      mp4: "🎥", avi: "🎥", mov: "🎥",
      mp3: "🎵", wav: "🎵", flac: "🎵",
      zip: "🗜️", rar: "🗜️",
      js: "📜", ts: "📜", json: "📜", html: "📜", css: "📜",
    };
    return iconMap[ext] || "📁";
  },

  formatFileSize: (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },

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
