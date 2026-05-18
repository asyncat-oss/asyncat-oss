import authService from "../services/authService";
import { secureLogger } from "../utils/secureLogger";
import { sanitizeNoteContent, sanitizeToText } from "../utils/sanitizer";
import { attachmentApi } from "./attachmentApi";

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

export const notesApi = {
  loadNotes: async () => {
    const queryParams = "?excludeContent=true";

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
      } catch {
        version = null;
      }
    }

    return sanitizeResponseData({ ...data, version });
  },

  createNote: async (title, content) => {
    const { data } = await apiRequest(`${API_URL}/api/notes`, {
      method: "POST",
      body: JSON.stringify({
        title: sanitizeToText(title || "Untitled Note"),
        content: sanitizeNoteContent(content || ""),
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

export const attachmentsApi = {
  uploadAttachment: async (noteId, file, onProgress = null) => {
    return attachmentApi.uploadAttachment(noteId, file, onProgress);
  },

  listAttachments: async (noteId) => {
    return attachmentApi.listAttachments(noteId);
  },

  getAttachmentUrl: (noteId, filename) => {
    const baseUrl = (API_URL || "").replace(/\/$/, "");
    const token = authService.getAccessToken();
    const url = `${baseUrl}/api/attachments/notes/${noteId}/${encodeURIComponent(filename)}`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  },

  deleteAttachment: async (noteId, filename) => {
    return attachmentApi.deleteAttachment(noteId, filename);
  },

  getAttachmentMetadata: async (noteId, filename) => {
    return attachmentApi.getAttachmentMetadata(noteId, filename);
  },

  updateAttachmentMetadata: async (noteId, filename, metadata) => {
    return attachmentApi.updateAttachmentMetadata(noteId, filename, metadata);
  },

  validateFile: async (file, options = {}) => {
    return attachmentApi.validateFile(file, options);
  },

  validateImageFile: (file) => {
    return attachmentApi.validateImageFile(file);
  },

  validateVideoFile: (file) => {
    return attachmentApi.validateVideoFile(file);
  },

  validateAudioFile: (file) => {
    return attachmentApi.validateAudioFile(file);
  },

  getFileIcon: (filename, mimeType = "") => {
    return attachmentApi.getFileIcon(filename, mimeType);
  },

  formatFileSize: (bytes) => {
    return attachmentApi.formatFileSize(bytes);
  },

  setBanner: async (noteId, bannerType, options = {}) => {
    return attachmentApi.setBanner(noteId, bannerType, options);
  },

  removeBanner: async (noteId) => {
    return attachmentApi.removeBanner(noteId);
  },

  uploadBannerImage: async (noteId, file, onProgress = null) => {
    return attachmentApi.uploadBannerImage(noteId, file, onProgress);
  },
};
