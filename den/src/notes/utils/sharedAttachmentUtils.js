const SHARE_ID_VERSION = "v1";

const base64UrlEncode = (inputBuffer) =>
  inputBuffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const base64UrlDecode = (input) => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
};

/**
 * Creates a deterministic share ID for an attachment.
 * We encode the payload as base64url; the ID is opaque but contains the data we need.
 */
export const createAttachmentShareId = ({ noteId, projectId, filename }) => {
  if (!noteId || !projectId || !filename) {
    throw new Error("Missing required parameters to create attachment share ID");
  }

  const payload = {
    v: SHARE_ID_VERSION,
    n: noteId,
    p: projectId,
    f: filename,
  };

  return base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
};

/**
 * Parses a share ID, returning the decoded data if valid.
 */
export const parseAttachmentShareId = (shareId) => {
  if (!shareId) {
    throw new Error("Invalid share ID");
  }

  let payload;

  try {
    const payloadBuffer = base64UrlDecode(shareId);
    payload = JSON.parse(payloadBuffer.toString("utf8"));
  } catch (error) {
    throw new Error("Malformed share ID payload");
  }

  if (payload.v !== SHARE_ID_VERSION) {
    throw new Error("Unsupported share ID version");
  }

  if (!payload.n || !payload.p || !payload.f) {
    throw new Error("Incomplete share ID payload");
  }

  return {
    noteId: payload.n,
    projectId: payload.p,
    filename: payload.f,
  };
};

/**
 * Convenience method to create the public URL path for a given attachment type.
 */
export const buildSharedAttachmentPath = ({ type, shareId }) => {
  if (!shareId) {
    throw new Error("Share ID is required to build shared attachment path");
  }

  if (type !== "video" && type !== "audio") {
    throw new Error("Unsupported shared attachment type");
  }

  const resourceSegment = type === "video" ? "videos" : "audios";
  return `/api/shared/attachments/${resourceSegment}/${shareId}`;
};

