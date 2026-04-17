import DOMPurify from "dompurify";

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
    "mark",
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
 * Use for untrusted user input
 */
export const sanitizeToText = (html) => {
  if (!html || typeof html !== "string") {
    return "";
  }

  return DOMPurify.sanitize(html, STRICT_SANITIZE_CONFIG);
};

/**
 * Enhanced sanitization for the existing sanitizeHtmlContent function
 * Maintains backward compatibility while adding security
 */
export const sanitizeHtmlContent = (html = "") => {
  if (!html) return "";

  // First apply DOMPurify sanitization
  const cleaned = sanitizeNoteContent(html);

  // Then apply the existing normalization logic
  const NBSP_ENTITY_REGEX = /&nbsp;/g;
  const ZERO_WIDTH_SPACE_REGEX = /\u200B/g;
  const NBSP_CHAR_REGEX = /\u00A0/g;

  let normalized = cleaned
    .replace(NBSP_ENTITY_REGEX, " ")
    .replace(ZERO_WIDTH_SPACE_REGEX, "")
    .replace(NBSP_CHAR_REGEX, " ")
    .trim();

  if (!normalized) return "";

  // Check for empty content patterns
  if (/^<br\s*\/?>(<br\s*\/?>(\s)*)*$/i.test(normalized)) return "";
  if (/^<div>(<br\s*\/?>(\s)*)?<\/div>$/i.test(normalized)) return "";

  // Remove empty formatting tags that have no content or only whitespace
  // This fixes the issue where empty <b></b>, <i></i>, etc. are left behind
  normalized = normalized.replace(
    /<(b|i|em|strong|u|s|strike|del|mark)>\s*<\/\1>/gi,
    ""
  );

  return normalized;
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
      "span",
      "a",
      "code",
      "mark",
    ],
    ALLOWED_ATTR: ["href", "title", "style"],
  };

  return DOMPurify.sanitize(html, tableConfig);
};

export default {
  sanitizeNoteContent,
  sanitizeToText,
  sanitizeHtmlContent,
  sanitizeTableCell,
};
