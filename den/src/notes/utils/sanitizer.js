import { JSDOM } from "jsdom";
import createDOMPurify from "isomorphic-dompurify";
import Joi from "joi";

// Create a DOM environment for DOMPurify
const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

// Configuration for note content - allows safe HTML formatting
const NOTE_SANITIZE_CONFIG = {
  // Allow common formatting tags
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "del",
    "mark",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "span",
    "div",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "code",
    "pre",
  ],

  // Allow safe attributes
  ALLOWED_ATTR: [
    "href",
    "title",
    "class",
    "style",
    "colspan",
    "rowspan",
    "data-*", // Allow data attributes for block functionality
  ],

  // Forbid dangerous attributes
  FORBID_ATTR: [
    "onerror",
    "onload",
    "onclick",
    "onmouseover",
    "onfocus",
    "onblur",
    "javascript",
    "vbscript",
    "data-bind",
  ],

  // Remove script tags completely
  FORBID_TAGS: ["script", "object", "embed", "applet", "form"],

  // Keep whitespace
  KEEP_CONTENT: true,

  // Remove dangerous URLs
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

// Strict configuration for user input - text only
const STRICT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
};

/**
 * Sanitize HTML content for note blocks
 * Allows safe formatting while removing dangerous elements
 */
export const sanitizeNoteContent = (html) => {
  if (!html || typeof html !== "string") {
    return "";
  }

  return DOMPurify.sanitize(html, NOTE_SANITIZE_CONFIG);
};

/**
 * Strict sanitization - converts to plain text
 * Use for untrusted user input like titles
 */
export const sanitizeToText = (html) => {
  if (!html || typeof html !== "string") {
    return "";
  }

  return DOMPurify.sanitize(html, STRICT_SANITIZE_CONFIG);
};

/**
 * Sanitize table cell content specifically
 * Less restrictive than note content but still secure
 */
export const sanitizeTableCell = (html) => {
  if (!html || typeof html !== "string") {
    return "";
  }

  const tableConfig = {
    ...NOTE_SANITIZE_CONFIG,
    ALLOWED_TAGS: [
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "del",
      "mark",
      "span",
      "a",
      "code",
    ],
    ALLOWED_ATTR: ["href", "title", "style"],
  };

  return DOMPurify.sanitize(html, tableConfig);
};

/**
 * Sanitize a changeset object recursively
 */
const sanitizeOperationData = (data, operationType) => {
  if (!data || typeof data !== "object") {
    return data;
  }

  const sanitized = { ...data };

  const sanitizeContentField = (key) => {
    if (sanitized[key] !== undefined && typeof sanitized[key] === "string") {
      sanitized[key] = sanitizeNoteContent(sanitized[key]);
    }
  };

  const sanitizeTextField = (key) => {
    if (sanitized[key] !== undefined && typeof sanitized[key] === "string") {
      sanitized[key] = sanitizeToText(sanitized[key]);
    }
  };

  if (sanitized.block && typeof sanitized.block === "object") {
    const block = { ...sanitized.block };
    if (block.content !== undefined && typeof block.content === "string") {
      block.content = sanitizeNoteContent(block.content);
    }
    if (block.properties && typeof block.properties === "object") {
      block.properties = { ...block.properties };
    }
    sanitized.block = block;
  }

  switch (operationType) {
    case "update_title":
      sanitizeTextField("from");
      sanitizeTextField("to");
      break;
    case "insert_block":
    case "delete_block":
    case "update_block_content":
    case "update_block_type":
    case "update_block_properties":
    case "move_block":
    case "batch":
    case "update_metadata":
      sanitizeContentField("content");
      sanitizeContentField("newContent");
      if (sanitized.from !== undefined && typeof sanitized.from === "string") {
        sanitized.from = sanitizeNoteContent(sanitized.from);
      }
      if (sanitized.to !== undefined && typeof sanitized.to === "string") {
        sanitized.to = sanitizeNoteContent(sanitized.to);
      }
      break;
    default:
      sanitizeContentField("content");
      sanitizeContentField("newContent");
      if (
        sanitized.title !== undefined &&
        typeof sanitized.title === "string"
      ) {
        sanitized.title = sanitizeToText(sanitized.title);
      }
  }

  return sanitized;
};

const sanitizeOperation = (operation) => {
  const sanitizedOperation = { ...operation };

  if (sanitizedOperation.content !== undefined) {
    sanitizedOperation.content = sanitizeNoteContent(
      sanitizedOperation.content
    );
  }
  if (sanitizedOperation.newContent !== undefined) {
    sanitizedOperation.newContent = sanitizeNoteContent(
      sanitizedOperation.newContent
    );
  }
  if (sanitizedOperation.title !== undefined) {
    sanitizedOperation.title = sanitizeToText(sanitizedOperation.title);
  }

  if (sanitizedOperation.data) {
    sanitizedOperation.data = sanitizeOperationData(
      sanitizedOperation.data,
      sanitizedOperation.type
    );
  }

  return sanitizedOperation;
};

export const sanitizeChangeset = (changeset) => {
  if (!changeset || typeof changeset !== "object") {
    return changeset;
  }

  const sanitizedChangeset = { ...changeset };

  if (Array.isArray(changeset.operations)) {
    sanitizedChangeset.operations = changeset.operations.map((operation) =>
      sanitizeOperation(operation)
    );
  }

  return sanitizedChangeset;
};

/**
 * Sanitize note data object
 */
export const sanitizeNoteData = (noteData) => {
  if (!noteData || typeof noteData !== "object") {
    return noteData;
  }

  const sanitized = { ...noteData };

  // Sanitize basic fields
  if (noteData.title !== undefined) {
    sanitized.title = sanitizeToText(noteData.title);
  }

  if (noteData.content !== undefined) {
    sanitized.content = sanitizeNoteContent(noteData.content);
  }

  // Handle block-based content structure
  if (noteData.blocks && Array.isArray(noteData.blocks)) {
    sanitized.blocks = noteData.blocks.map((block) => {
      const sanitizedBlock = { ...block };
      if (block.content !== undefined) {
        sanitizedBlock.content = sanitizeNoteContent(block.content);
      }
      return sanitizedBlock;
    });
  }

  return sanitized;
};

// Joi validation schemas
export const noteValidationSchema = Joi.object({
  title: Joi.string().max(500).optional(),
  content: Joi.alternatives()
    .try(Joi.string(), Joi.object(), Joi.array())
    .optional(),
  projectId: Joi.string().uuid().optional(),
  blocks: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        type: Joi.string().required(),
        content: Joi.string().allow("").optional(),
        properties: Joi.object().optional(),
      })
    )
    .optional(),
});

const LEGACY_OPERATION_TYPES = ["insert", "delete", "update", "move"];
const MODERN_OPERATION_TYPES = [
  "insert_block",
  "delete_block",
  "update_block_content",
  "update_block_type",
  "update_block_properties",
  "move_block",
  "update_title",
  "update_metadata",
  "batch",
];

const legacyOperationSchema = Joi.object({
  id: Joi.string().optional(),
  type: Joi.string()
    .valid(...LEGACY_OPERATION_TYPES)
    .required(),
  blockId: Joi.string().optional(),
  content: Joi.string().allow("").optional(),
  newContent: Joi.string().allow("").optional(),
  title: Joi.string().allow("").optional(),
  position: Joi.number().integer().min(0).optional(),
  timestamp: Joi.number().optional(),
});

const modernOperationDataSchema = Joi.object({
  blockId: Joi.string().optional(),
  block: Joi.object({
    id: Joi.string().optional(),
    type: Joi.string().optional(),
    content: Joi.string().allow("").optional(),
    properties: Joi.object().unknown(true).optional(),
  }).optional(),
  from: Joi.alternatives()
    .try(Joi.string().allow(""), Joi.object(), Joi.array())
    .optional(),
  to: Joi.alternatives()
    .try(Joi.string().allow(""), Joi.object(), Joi.array())
    .optional(),
  version: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  position: Joi.number().integer().min(0).optional(),
  fromPosition: Joi.number().integer().min(0).optional(),
  toPosition: Joi.number().integer().min(0).optional(),
  metadata: Joi.object().unknown(true).optional(),
  properties: Joi.object().unknown(true).optional(),
}).unknown(true);

const modernOperationSchema = Joi.object({
  id: Joi.string().optional(),
  type: Joi.string()
    .valid(...MODERN_OPERATION_TYPES)
    .required(),
  data: modernOperationDataSchema.required(),
  timestamp: Joi.number().optional(),
}).unknown(true);

export const changesetValidationSchema = Joi.object({
  id: Joi.string().optional(),
  baselineVersion: Joi.alternatives()
    .try(Joi.string(), Joi.number())
    .allow(null)
    .optional(),
  operations: Joi.array()
    .min(1)
    .items(Joi.alternatives().try(modernOperationSchema, legacyOperationSchema))
    .required(),
  timestamp: Joi.number().optional(),
  stats: Joi.object().unknown(true).optional(),
}).unknown(true);

/**
 * Validate and sanitize note input
 */
export const validateAndSanitizeNote = (noteData) => {
  const { error, value } = noteValidationSchema.validate(noteData, {
    stripUnknown: true,
    abortEarly: false,
  });

  if (error) {
    throw new Error(
      `Validation error: ${error.details.map((d) => d.message).join(", ")}`
    );
  }

  return sanitizeNoteData(value);
};

/**
 * Validate and sanitize changeset
 */
export const validateAndSanitizeChangeset = (changeset) => {
  const { error, value } = changesetValidationSchema.validate(changeset, {
    stripUnknown: true,
    abortEarly: false,
  });

  if (error) {
    throw new Error(
      `Changeset validation error: ${error.details
        .map((d) => d.message)
        .join(", ")}`
    );
  }

  return sanitizeChangeset(value);
};

export default {
  sanitizeNoteContent,
  sanitizeToText,
  sanitizeTableCell,
  sanitizeChangeset,
  sanitizeNoteData,
  validateAndSanitizeNote,
  validateAndSanitizeChangeset,
};
