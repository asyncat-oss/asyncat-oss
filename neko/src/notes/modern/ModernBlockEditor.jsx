// ModernBlockEditor.jsx - Complete with Delta Tracking and Collaboration Features
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import ReactDOM from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  closestCorners,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import Block from "./components/Block";
import SlashCommandMenu from "./components/SlashCommandMenu";
import FloatingToolbar from "./components/FloatingToolbar";
import EditorStats from "./components/EditorStats";
import ConfirmationModal from "./ConfirmationModal";
import { debounce } from "../utils/autoSaveUtils";
import { DeltaTracker } from "../utils/deltaSystem";
import { sanitizeHtmlContent } from "../../utils/sanitizer";
// import { versionHistoryApi } from "../noteApi";

// Global persistent storage for block histories keyed by note ID
const globalBlockHistories = new Map();
const TWO_MINUTES = 2 * 60 * 1000;
const TITLE_HISTORY_LIMIT = 200;
const TITLE_HISTORY_MERGE_WINDOW = 600;

const BlockType = {
  TEXT: "text",
  HEADING1: "heading1",
  HEADING2: "heading2",
  HEADING3: "heading3",
  NUMBERED_LIST: "numberedList",
  BULLET_LIST: "bulletList",
  TODO: "todo",
  QUOTE: "quote",
  TABLE: "table",
  CODE: "code",
  DIVIDER: "divider",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  FILE: "file",
  CALLOUT: "callout",
  TOGGLE: "toggle",
  EMBED: "embed",
  MATH: "math",
  LINK_PREVIEW: "linkPreview",
  // Chart blocks
  LINE_CHART: "lineChart",
  BAR_CHART: "barChart",
  PIE_CHART: "pieChart",
  AREA_CHART: "areaChart",
  SCATTER_CHART: "scatterChart",
  DONUT_CHART: "donutChart",
  // Advanced blocks
  PROGRESS_BAR: "progressBar",
  BREADCRUMB: "breadcrumb",
  BUTTON: "button",
};

const TEXTUAL_BLOCK_TYPES = new Set([
  BlockType.TEXT,
  BlockType.HEADING1,
  BlockType.HEADING2,
  BlockType.HEADING3,
  BlockType.NUMBERED_LIST,
  BlockType.BULLET_LIST,
  BlockType.TODO,
  BlockType.QUOTE,
]);

const MULTI_BLOCK_FORMATTABLE_TYPES = new Set([
  BlockType.TEXT,
  BlockType.HEADING1,
  BlockType.HEADING2,
  BlockType.HEADING3,
  BlockType.NUMBERED_LIST,
  BlockType.BULLET_LIST,
  BlockType.TODO,
  BlockType.CALLOUT,
  BlockType.QUOTE,
  BlockType.TABLE,
]);

const LIST_BLOCK_TYPES = new Set([
  BlockType.NUMBERED_LIST,
  BlockType.BULLET_LIST,
  BlockType.TODO,
]);

const getBlockTypeLabel = (type) => {
  switch (type) {
    case BlockType.HEADING1:
      return "Heading 1";
    case BlockType.HEADING2:
      return "Heading 2";
    case BlockType.HEADING3:
      return "Heading 3";
    case BlockType.NUMBERED_LIST:
      return "Numbered List";
    case BlockType.BULLET_LIST:
      return "Bullet List";
    case BlockType.TODO:
      return "To-do";
    case BlockType.CALLOUT:
      return "Callout";
    case BlockType.QUOTE:
      return "Quote";
    case BlockType.TABLE:
      return "Table";
    default:
      if (!type || typeof type !== "string") {
        return "Text";
      }
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
};

const convertPlainTextToHtml = (text) => {
  if (!text) {
    return "";
  }

  const normalized = text.replace(/\r?\n/g, "<br>");
  return sanitizeHtmlContent(normalized);
};

const normalizeColorString = (value) =>
  typeof value === "string" ? value.toLowerCase().replace(/\s+/g, "") : "";

const hexToRgb = (hex) => {
  if (typeof hex !== "string") return null;

  let normalized = hex.trim().replace("#", "");
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (normalized.length !== 6) return null;

  const intValue = Number.parseInt(normalized, 16);
  if (Number.isNaN(intValue)) return null;

  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
};

const addColorVariantsFromHex = (variants, hex) => {
  if (!hex) return;

  const rgb = hexToRgb(hex);
  if (!rgb) return;

  const prefixed = hex.trim().startsWith("#") ? hex.trim() : `#${hex.trim()}`;
  const normalizedHex = normalizeColorString(prefixed);

  if (normalizedHex) {
    variants.add(normalizedHex);
    if (normalizedHex.startsWith("#")) {
      variants.add(normalizedHex.slice(1));
    }
  }

  const baseRgb = `${rgb.r},${rgb.g},${rgb.b}`;
  variants.add(normalizeColorString(baseRgb));
  variants.add(normalizeColorString(`rgb(${baseRgb})`));
  variants.add(normalizeColorString(`rgba(${baseRgb},1)`));
};

// Theme-specific highlight colors
const HIGHLIGHT_COLORS = {
  light: "#fff3b0",
  dark: "#facc15",
  midnight: "#daa520",
};

const HIGHLIGHT_COLOR_VARIANTS = (() => {
  const variants = new Set();
  Object.values(HIGHLIGHT_COLORS).forEach((hex) =>
    addColorVariantsFromHex(variants, hex)
  );
  addColorVariantsFromHex(variants, "#ffff00");
  variants.add(normalizeColorString("yellow"));
  return variants;
})();

const isHighlightColorValue = (value) => {
  const normalized = normalizeColorString(value);
  if (!normalized) return false;

  for (const variant of HIGHLIGHT_COLOR_VARIANTS) {
    if (normalized.includes(variant)) {
      return true;
    }
  }

  return false;
};

const getCurrentTheme = () => {
  if (typeof document === "undefined") return "light";

  const root = document.documentElement;
  if (root.classList.contains("midnight")) return "midnight";
  if (root.classList.contains("dark")) return "dark";
  return "light";
};

const getHighlightColor = () =>
  HIGHLIGHT_COLORS[getCurrentTheme()] || HIGHLIGHT_COLORS.light;

// Create unique IDs
const createId = () =>
  `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Default block structure
const createBlock = (type = BlockType.TEXT, content = "", properties = {}) => ({
  id: createId(),
  type,
  content,
  properties: { ...properties },
});

const BLOCK_CLIPBOARD_MIME = "application/x-asycat-blocks";
const BLOCK_CLIPBOARD_FORMAT_VERSION = 1;

// Clipboard utilities
const clipboardUtils = {
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        return true;
      } catch (fallbackErr) {
        console.error("Failed to copy to clipboard:", fallbackErr);
        return false;
      }
    }
  },
};

const sanitizeClipboardValue = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    const obj = {};
    value.forEach((mapValue, key) => {
      obj[key] = sanitizeClipboardValue(mapValue);
    });
    return obj;
  }

  if (value instanceof Set) {
    return Array.from(value).map(sanitizeClipboardValue);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeClipboardValue(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      if (
        key === "element" ||
        key === "listeners" ||
        key === "attributes" ||
        key === "dragAttributes" ||
        key === "dragListeners" ||
        key === "ref" ||
        key.startsWith("_")
      ) {
        return;
      }

      if (typeof val === "function") {
        return;
      }

      const sanitized = sanitizeClipboardValue(val);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    });
    return result;
  }

  if (typeof value === "function") {
    return undefined;
  }

  return value;
};

const cleanBlockForClipboard = (block) => {
  const sanitized = sanitizeClipboardValue(block);
  if (!sanitized || typeof sanitized !== "object") {
    return null;
  }

  const normalized = {
    id: sanitized.id,
    type: sanitized.type,
    content: sanitized.content || "",
    properties: sanitizeClipboardValue(sanitized.properties || {}),
  };

  if (sanitized.metadata) {
    normalized.metadata = sanitizeClipboardValue(sanitized.metadata);
  }

  if (sanitized.attributes) {
    normalized.attributes = sanitizeClipboardValue(sanitized.attributes);
  }

  if (Array.isArray(sanitized.children) && sanitized.children.length > 0) {
    normalized.children = sanitized.children
      .map((child) => cleanBlockForClipboard(child))
      .filter(Boolean);
  }

  Object.entries(sanitized).forEach(([key, value]) => {
    if (
      key === "id" ||
      key === "type" ||
      key === "content" ||
      key === "properties" ||
      key === "children" ||
      key === "metadata" ||
      key === "attributes"
    ) {
      return;
    }

    normalized[key] = sanitizeClipboardValue(value);
  });

  return normalized;
};

const normalizeBlocksForPaste = (templates) => {
  const assignNewIds = (block) => {
    const cloned = cloneBlockDeep(block) || {};
    const normalized = {
      ...cloned,
      id: createId(),
      type: cloned.type || BlockType.TEXT,
      content: cloned.content || "",
      properties: cloneBlockDeep(cloned.properties || {}),
    };

    if (Array.isArray(cloned.children) && cloned.children.length > 0) {
      normalized.children = cloned.children
        .map((child) => assignNewIds(child))
        .filter(Boolean);
    }

    return normalized;
  };

  return templates.map((template) => assignNewIds(template)).filter(Boolean);
};

const serializeBlocksForClipboard = (templates) =>
  JSON.stringify({
    version: BLOCK_CLIPBOARD_FORMAT_VERSION,
    timestamp: Date.now(),
    blocks: templates,
  });

const deserializeBlocksFromClipboard = (data) => {
  if (!data) return null;

  // Quick check: if it doesn't start with '{' or '[', it's not JSON
  const trimmed = typeof data === 'string' ? data.trim() : '';
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== BLOCK_CLIPBOARD_FORMAT_VERSION ||
      !Array.isArray(parsed.blocks)
    ) {
      return null;
    }
    return parsed.blocks;
  } catch (error) {
    // Only log warning if it looked like JSON but failed to parse
    if (trimmed[0] === '{' || trimmed[0] === '[') {
      console.warn("Failed to parse structured clipboard payload:", error);
    }
    return null;
  }
};

const writeBlocksToClipboard = async (templates, plainText = "") => {
  const serialized = serializeBlocksForClipboard(templates);

  if (
    typeof window !== "undefined" &&
    navigator?.clipboard &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      const clipboardItem = new ClipboardItem({
        [BLOCK_CLIPBOARD_MIME]: new Blob([serialized], {
          type: BLOCK_CLIPBOARD_MIME,
        }),
        "text/plain": new Blob([plainText], { type: "text/plain" }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return { success: true, structured: true };
    } catch (error) {
      console.warn("Structured clipboard write failed, falling back:", error);
    }
  }

  if (plainText) {
    const success = await clipboardUtils.copyToClipboard(plainText);
    return { success, structured: false };
  }

  const success = await clipboardUtils.copyToClipboard(serialized);
  return { success, structured: false };
};

// Draggable Block Wrapper Component
const DraggableBlockWrapper = ({ block, children, isDragging, onDragData }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: dragging,
  } = useDraggable({
    id: `block-${block.id}`,
    data: { type: "block", block },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: dragging ? 1000 : 1,
      }
    : { zIndex: 1 };

  const prevDragDataRef = React.useRef();

  // Pass drag data up to parent to use in child components
  React.useEffect(() => {
    if (onDragData) {
      const currentDragData = { listeners, attributes };
      const prevDragData = prevDragDataRef.current;

      // Only call onDragData if the drag data has actually changed
      if (
        !prevDragData ||
        JSON.stringify(currentDragData) !== JSON.stringify(prevDragData)
      ) {
        onDragData(block.id, currentDragData);
        prevDragDataRef.current = currentDragData;
      }
    }
  }, [listeners, attributes, block.id]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${dragging ? "opacity-0" : ""}`}
    >
      {children}
    </div>
  );
};

// Drop Zone Component
const DropZone = ({
  index,
  isActive,
  isOver,
  draggedBlock,
  draggedBlockHeight,
}) => {
  const { setNodeRef } = useDroppable({
    id: `dropzone-${index}`,
    data: { type: "dropzone", index },
  });

  // Use measured height or fallback to default
  const dropZoneStyle = draggedBlockHeight
    ? { height: `${draggedBlockHeight}px` }
    : {};

  return (
    <div
      ref={setNodeRef}
      data-dropzone-index={index}
      style={
        isActive
          ? dropZoneStyle
          : {
              height: "60px", // Large collision area for reliable detection
              marginTop: "-30px", // Negative margin to overlap and prevent visual gaps
              marginBottom: "-30px",
              zIndex: 1, // Ensure collision detection priority
            }
      }
      className={`transition-all duration-300 ease-out ${
        isActive
          ? `mx-4 ${
              isOver
                ? "bg-blue-500/20 dark:bg-blue-400/20 midnight:bg-blue-400/20 border-2 border-dashed border-blue-500 dark:border-blue-400 midnight:border-blue-400"
                : "bg-gray-200/50 dark:bg-gray-700/50 midnight:bg-gray-700/50 border-2 border-dashed border-gray-300 dark:border-gray-600 midnight:border-gray-600"
            } rounded-lg`
          : "opacity-0 pointer-events-auto" // Invisible but large collision area
      }`}
    >
      {isActive && (
        <div
          className={`flex items-center justify-center h-full text-sm font-medium transition-colors duration-200 ${
            isOver
              ? "text-blue-600 dark:text-blue-400 midnight:text-blue-400"
              : "text-gray-600 dark:text-gray-400 midnight:text-gray-400"
          }`}
        >
          Drop Block Here
        </div>
      )}
    </div>
  );
};

const ZERO_WIDTH_SPACE_REGEX = /\u200B/g;
const NBSP_ENTITY_REGEX = /&nbsp;/gi;
const NBSP_CHAR_REGEX = /\u00A0/g;

const MEDIA_CONTENT_SELECTOR =
  "img, video, audio, iframe, table, pre, code, svg, canvas, object, embed";

const elementHasVisibleContent = (element) => {
  if (!element) return false;

  const text = (element.textContent || "")
    .replace(ZERO_WIDTH_SPACE_REGEX, "")
    .replace(NBSP_CHAR_REGEX, " ")
    .trim();

  if (text.length > 0) return true;

  return Boolean(element.querySelector(MEDIA_CONTENT_SELECTOR));
};

const getElementHtmlContent = (element, fallback = "") => {
  if (!element) {
    return sanitizeHtmlContent(fallback);
  }

  if (!elementHasVisibleContent(element)) {
    return "";
  }

  return sanitizeHtmlContent(element.innerHTML);
};

const getPlainTextFromHtml = (html = "") => {
  if (!html) {
    return "";
  }

  if (typeof document === "undefined") {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || "";
};

const cloneBlockDeep = (block) => {
  if (!block || typeof block !== "object") {
    return null;
  }

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(block);
    } catch (error) {
      // Fall back to JSON clone if structuredClone fails
    }
  }

  try {
    return JSON.parse(JSON.stringify(block));
  } catch (error) {
    return { ...block };
  }
};

const getPlainTextForBlock = (block) => {
  if (!block) return "";

  const baseText = getPlainTextFromHtml(block.content || "").trim();

  if (block.type === BlockType.TODO) {
    const prefix = block.properties?.checked ? "[x] " : "[ ] ";
    return `${prefix}${baseText}`;
  }

  if (baseText) {
    return baseText;
  }

  switch (block.type) {
    case BlockType.IMAGE:
      return block.properties?.alt || "[Image]";
    case BlockType.VIDEO:
      return block.properties?.caption || "[Video]";
    case BlockType.FILE:
      return block.properties?.filename || "[File]";
    case BlockType.TABLE:
      return "[Table]";
    case BlockType.CODE:
      return block.properties?.language
        ? `[Code: ${block.properties.language}]`
        : "[Code]";
    default:
      return `[${block.type}]`;
  }
};

const removeTextRangeFromElement = (element, start = 0, length = 0) => {
  if (!element || typeof start !== "number" || typeof length !== "number") {
    return;
  }

  if (length <= 0) {
    return;
  }

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let remainingStart = start;
  let remainingLength = length;

  while (walker.nextNode() && remainingLength > 0) {
    const node = walker.currentNode;
    const textContent = node.textContent || "";
    const nodeLength = textContent.length;

    if (nodeLength === 0) {
      continue;
    }

    if (remainingStart >= nodeLength) {
      remainingStart -= nodeLength;
      continue;
    }

    const localStart = Math.max(remainingStart, 0);
    const removable = Math.min(nodeLength - localStart, remainingLength);

    const before = textContent.slice(0, localStart);
    const after = textContent.slice(localStart + removable);
    node.textContent = before + after;

    remainingLength -= removable;
    remainingStart = 0;
  }
};

// Main Block Editor Component with Delta Tracking and Collaboration
const ModernBlockEditor = forwardRef(
  (
    {
      initialBlocks = [createBlock()],
      onContentChange,
      onSave,
      onDeltaChange,
      placeholder = "Type '/' for commands...",
      title = "",
      onTitleChange,
      onOutlineChange,
      enableDeltaTracking = true,
      autoSaveDelay = 2000,
      collaborationTracking = null,
      collaborators = [],
      blockLocks = {},
      noteId, // Add noteId for persistent history storage
    },
    ref
  ) => {
    // Core state
    const [blocks, setBlocksOriginal] = useState(initialBlocks);

    // Wrapped setBlocks with logging to track all state changes
    const setBlocks = useCallback((newBlocks) => {
      // During command+delete, be very selective about what setBlocks calls we allow
      if (commandDeleteActiveRef.current) {
        // Allow function updates that result in the cleared state we want
        if (typeof newBlocks === "function") {
          setBlocksOriginal((prev) => {
            const result = newBlocks(prev);
            const clearingBlockId = commandDeleteActiveRef.current.blockId;
            const targetBlock = result.find((b) => b.id === clearingBlockId);

            // Only allow the update if the target block is actually cleared
            if (targetBlock && targetBlock.content === "") {
              return result;
            } else {
              return prev; // Keep previous state
            }
          });
          return;
        } else {
          return;
        }
      }

      if (typeof newBlocks === "function") {
        setBlocksOriginal((prev) => {
          const result = newBlocks(prev);
          return result;
        });
      } else {
        setBlocksOriginal(newBlocks);
      }
    }, []);
    const latestBlocksRef = useRef(blocks);
    const [activeBlockId, setActiveBlockId] = useState(null);
    const activeBlockIdRef = useRef(null);
    const updateActiveBlockId = useCallback(
      (blockId) => {
        activeBlockIdRef.current = blockId;
        setActiveBlockId(blockId);
      },
      [setActiveBlockId]
    );

    useEffect(() => {
      activeBlockIdRef.current = activeBlockId;
    }, [activeBlockId]);
    const [slashMenuState, setSlashMenuState] = useState({
      isOpen: false,
      position: null,
      blockId: null,
      searchTerm: "",
      triggerOffset: null,
    });
    const [toolbarState, setToolbarState] = useState({
      isOpen: false,
      position: null,
      selection: null,
    });
    const [isAllBlocksSelected, setIsAllBlocksSelected] = useState(false);
    const [selectedBlockIds, setSelectedBlockIdsState] = useState([]);
    const selectedBlockIdsRef = useRef(new Set());
    const blockSelectionStateRef = useRef({
      isSelecting: false,
      anchorId: null,
      latestId: null,
      pendingFromContent: false,
    });

    const resetBlockSelectionTracking = useCallback(() => {
      blockSelectionStateRef.current.isSelecting = false;
      blockSelectionStateRef.current.anchorId = null;
      blockSelectionStateRef.current.latestId = null;
      blockSelectionStateRef.current.pendingFromContent = false;
    }, []);

    // Auto-scroll refs for drag-selection
    const autoScrollAnimationRef = useRef(null);
    const autoScrollStateRef = useRef({
      active: false,
      direction: 0,
      speed: 0,
    });
    const lastSelectionMousePosRef = useRef({ x: 0, y: 0 });
    const extendBlockSelectionRef = useRef(null);
    const resolveBlockIdRef = useRef(null);
    const mouseDownTargetRef = useRef(null);
    const isSelectionDisabledTarget = useCallback((element) => {
      if (!element || typeof element.closest !== "function") {
        return false;
      }
      return element.closest("[data-block-selection-disabled='true']") !== null;
    }, []);

    const getScrollContainer = useCallback((startEl) => {
      try {
        let el = startEl;
        while (el && el !== document.body && el !== document.documentElement) {
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY;
          if (
            (overflowY === "auto" || overflowY === "scroll") &&
            el.scrollHeight > el.clientHeight
          ) {
            return el;
          }
          el = el.parentElement;
        }
      } catch (e) {
        // ignore
      }
      return window;
    }, []);

    const stopAutoScroll = useCallback(() => {
      autoScrollStateRef.current.active = false;
      autoScrollStateRef.current.direction = 0;
      autoScrollStateRef.current.speed = 0;
      if (autoScrollAnimationRef.current) {
        cancelAnimationFrame(autoScrollAnimationRef.current);
        autoScrollAnimationRef.current = null;
      }
    }, []);

    const autoScrollLoop = useCallback(() => {
      if (!autoScrollStateRef.current.active) return;

      const { direction, speed } = autoScrollStateRef.current;
      const editorEl = editorRef.current;
      const container = getScrollContainer(editorEl);
      const delta = direction * Math.max(1, Math.round(speed));

      try {
        if (container === window) {
          window.scrollBy({ top: delta, left: 0, behavior: "auto" });
        } else if (container && typeof container.scrollTop === "number") {
          container.scrollTop += delta;
        }
      } catch (e) {
        // ignore scrolling errors
      }

      // Update selection based on last known mouse position while scrolling
      const lastPos = lastSelectionMousePosRef.current;
      if (lastPos && typeof lastPos.x === "number") {
        const fakeEvent = {
          clientX: lastPos.x,
          clientY: lastPos.y,
          target: document.elementFromPoint(lastPos.x, lastPos.y),
        };

        const blockId = resolveBlockIdRef.current
          ? resolveBlockIdRef.current(fakeEvent)
          : null;
        if (blockId) {
          try {
            extendBlockSelectionRef.current?.(blockId);
          } catch (e) {
            // swallow errors if not ready
          }
        }
      }

      autoScrollAnimationRef.current = requestAnimationFrame(autoScrollLoop);
    }, [getScrollContainer]);

    const setSelectedBlocks = useCallback((ids) => {
      const normalizedIds = Array.isArray(ids) ? ids : [];
      selectedBlockIdsRef.current = new Set(normalizedIds);
      setSelectedBlockIdsState(normalizedIds);
    }, []);

    const clearBlockSelection = useCallback(() => {
      if (selectedBlockIdsRef.current.size === 0) {
        resetBlockSelectionTracking();
        return;
      }

      selectedBlockIdsRef.current.clear();
      setSelectedBlockIdsState([]);
      resetBlockSelectionTracking();
    }, [resetBlockSelectionTracking]);

    // UI state
    const [statsVisible, setStatsVisible] = useState(false);
    const [notification, setNotification] = useState(null);
    const [clipboard, setClipboard] = useState(null);
    const showNotification = useCallback(
      (message, type = "info", duration = 3000) => {
        setNotification({ message, type });
        if (duration > 0) {
          setTimeout(() => setNotification(null), duration);
        }
      },
      []
    );

    const [confirmationModal, setConfirmationModal] = useState({
      isOpen: false,
      onConfirm: null,
      title: "",
      message: "",
    });

    // Track whether to show deletion warning (resets per session/note)
    const [showDeletionWarning, setShowDeletionWarning] = useState(true);
    const [deletionWarningModal, setDeletionWarningModal] = useState({
      isOpen: false,
      onConfirm: null,
      blockCount: 0,
    });
    const rootRef = useRef(null);
    const blockRefs = useRef({});
    const lastClipboardWriteSuccessfulRef = useRef(true);
    const getCurrentlyFocusedBlockId = useCallback(() => {
      const focusedElement = document.activeElement;

      if (focusedElement && focusedElement.contentEditable === "true") {
        for (const [blockId, blockRef] of Object.entries(blockRefs.current)) {
          if (blockRef && blockRef.element === focusedElement) {
            return blockId;
          }
        }

        let currentElement = focusedElement;
        let depth = 0;
        while (
          currentElement &&
          currentElement !== document.body &&
          depth < 20
        ) {
          for (const [blockId, blockRef] of Object.entries(blockRefs.current)) {
            if (blockRef && blockRef.element === currentElement) {
              return blockId;
            }
          }

          if (
            currentElement.hasAttribute &&
            currentElement.hasAttribute("data-block-id")
          ) {
            const blockId = currentElement.getAttribute("data-block-id");
            return blockId;
          }

          currentElement = currentElement.parentElement;
          depth++;
        }
      }

      const blockElement = focusedElement?.closest?.("[data-block-id]");
      if (blockElement) {
        return blockElement.getAttribute("data-block-id");
      }

      return null;
    }, []);

    // Drag and drop state
    const [draggedBlock, setDraggedBlock] = useState(null);
    const [activeDropZone, setActiveDropZone] = useState(null);
    const [draggedBlockOriginalIndex, setDraggedBlockOriginalIndex] =
      useState(null);
    const [draggedBlockHeight, setDraggedBlockHeight] = useState(null);
    const [dropScrollPosition, setDropScrollPosition] = useState(null);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [blockDragData, setBlockDragData] = useState({});
    const lockedScrollPositionRef = useRef(null);

    const handleDragData = useCallback((blockId, dragData) => {
      setBlockDragData((prev) => ({
        ...prev,
        [blockId]: dragData,
      }));
    }, []);

    const startBlockSelection = useCallback(
      (blockId, options = {}) => {
        if (!blockId) {
          return;
        }

        const { fromContentEditable = false } = options;

        blockSelectionStateRef.current.anchorId = blockId;
        blockSelectionStateRef.current.latestId = blockId;
        blockSelectionStateRef.current.pendingFromContent = fromContentEditable;
        blockSelectionStateRef.current.isSelecting = !fromContentEditable;

        setIsAllBlocksSelected(false);

        if (fromContentEditable) {
          setSelectedBlocks([]);
        } else {
          setSelectedBlocks([blockId]);
        }
      },
      [setSelectedBlocks, setIsAllBlocksSelected]
    );

    const extendBlockSelection = useCallback(
      (blockId) => {
        const state = blockSelectionStateRef.current;

        if (!state.anchorId || !blockId) {
          return;
        }

        if (state.pendingFromContent) {
          if (state.anchorId === blockId) {
            return;
          }

          state.pendingFromContent = false;
          state.isSelecting = true;

          try {
            const selection = window.getSelection();
            if (selection && typeof selection.removeAllRanges === "function") {
              selection.removeAllRanges();
            }
          } catch (error) {
            // Ignore selection clearing errors (e.g., unsupported environments)
          }
        }

        if (!state.isSelecting) {
          return;
        }

        if (state.latestId === blockId) {
          return;
        }

        const anchorIndex = blocks.findIndex(
          (block) => block.id === state.anchorId
        );
        const currentIndex = blocks.findIndex((block) => block.id === blockId);

        if (anchorIndex === -1 || currentIndex === -1) {
          return;
        }

        const startIndex = Math.min(anchorIndex, currentIndex);
        const endIndex = Math.max(anchorIndex, currentIndex);

        const ids = blocks
          .slice(startIndex, endIndex + 1)
          .map((block) => block.id);

        state.latestId = blockId;
        setSelectedBlocks(ids);
      },
      [blocks, setSelectedBlocks]
    );

    // expose extendBlockSelection via ref so other handlers can call it safely
    useEffect(() => {
      extendBlockSelectionRef.current = extendBlockSelection;
      return () => {
        extendBlockSelectionRef.current = null;
      };
    }, [extendBlockSelection]);

    const finishBlockSelection = useCallback(() => {
      const state = blockSelectionStateRef.current;

      if (!state.isSelecting && !state.pendingFromContent) {
        state.anchorId = null;
        state.latestId = null;
        return;
      }

      state.isSelecting = false;
      state.pendingFromContent = false;
      state.anchorId = null;
      state.latestId = null;
      // Stop any auto-scrolling initiated during selection
      stopAutoScroll();
    }, []);

    const handleBlockWrapperMouseDown = useCallback(
      (event, blockId) => {
        if (event.button !== 0) {
          return;
        }

        if (!blockId) {
          return;
        }

        const target = event.target;
        if (isSelectionDisabledTarget(target)) {
          return;
        }
        const isInteractiveTarget = target.closest(
          "button, [role='button'], a, input, textarea, select"
        );

        if (isInteractiveTarget) {
          return;
        }

        const selectionState = blockSelectionStateRef.current;

        if (
          event.shiftKey &&
          (selectedBlockIds.length > 0 || selectionState.anchorId)
        ) {
          event.preventDefault();
          const anchorId = selectionState.anchorId || selectedBlockIds[0];

          if (anchorId) {
            const anchorIndex = blocks.findIndex(
              (block) => block.id === anchorId
            );
            const currentIndex = blocks.findIndex(
              (block) => block.id === blockId
            );

            if (anchorIndex !== -1 && currentIndex !== -1) {
              const startIndex = Math.min(anchorIndex, currentIndex);
              const endIndex = Math.max(anchorIndex, currentIndex);

              const ids = blocks
                .slice(startIndex, endIndex + 1)
                .map((block) => block.id);

              selectionState.anchorId = anchorId;
              selectionState.latestId = blockId;
              selectionState.isSelecting = false;
              selectionState.pendingFromContent = false;

              setSelectedBlocks(ids);
              setIsAllBlocksSelected(false);
              updateActiveBlockId(blockId);
            }
          }
          return;
        }

        const startedFromContent =
          Boolean(target.closest('[contenteditable="true"]')) &&
          !target.closest(".block-actions-container");

        if (!startedFromContent) {
          event.preventDefault();
        }

        updateActiveBlockId(blockId);
        startBlockSelection(blockId, {
          fromContentEditable: startedFromContent,
        });
      },
      [
        startBlockSelection,
        updateActiveBlockId,
        selectedBlockIds,
        blocks,
        setSelectedBlocks,
        setIsAllBlocksSelected,
        isSelectionDisabledTarget,
      ]
    );

    const handleBlockWrapperMouseEnter = useCallback((blockId) => {
      if (!blockId) {
        return;
      }

      const state = blockSelectionStateRef.current;
      if (!state.isSelecting && !state.pendingFromContent) {
        return;
      }

      extendBlockSelectionRef.current?.(blockId);
    }, []);

    const resolveBlockIdFromPoint = useCallback(
      (event) => {
        if (!blocks.length) {
          return null;
        }

        let target = event.target;
        const hasElementConstructor = typeof Element !== "undefined";

        if (!hasElementConstructor || !(target instanceof Element)) {
          target = document.elementFromPoint(event.clientX, event.clientY);
        }

        if (!target || typeof target.closest !== "function") {
          return null;
        }

        const wrapper = target.closest("[data-block-wrapper]");
        if (wrapper) {
          return wrapper.getAttribute("data-block-id");
        }

        const dropzone = target.closest("[data-dropzone-index]");
        if (dropzone) {
          const indexAttr = dropzone.getAttribute("data-dropzone-index");
          const indexValue = Number.parseInt(indexAttr || "", 10);
          if (!Number.isNaN(indexValue)) {
            const rect = dropzone.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const usePrevious = event.clientY < midpoint;

            let resolvedIndex = usePrevious ? indexValue - 1 : indexValue;
            resolvedIndex = Math.max(
              0,
              Math.min(blocks.length - 1, resolvedIndex)
            );

            return blocks[resolvedIndex]?.id ?? null;
          }
        }

        return null;
      },
      [blocks]
    );

    // expose resolveBlockIdFromPoint via ref so earlier code can call it without TDZ
    useEffect(() => {
      resolveBlockIdRef.current = resolveBlockIdFromPoint;
      return () => {
        resolveBlockIdRef.current = null;
      };
    }, [resolveBlockIdFromPoint]);

    const getSelectedBlocksInOrder = useCallback(() => {
      if (!selectedBlockIdsRef.current.size) {
        return [];
      }

      return blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => selectedBlockIdsRef.current.has(block.id));
    }, [blocks]);

    const copySelectedBlocks = useCallback(
      async ({ silent = false } = {}) => {
        const orderedSelection = getSelectedBlocksInOrder();
        if (orderedSelection.length === 0) {
          if (!silent) {
            showNotification("No blocks selected to copy", "warning", 2000);
          }
          return false;
        }

        const templates = orderedSelection
          .map(({ block }) => cleanBlockForClipboard(block))
          .filter(Boolean);

        if (!templates.length) {
          if (!silent) {
            showNotification("Unable to copy selected blocks", "error", 2000);
          }
          return false;
        }

        const plainText = orderedSelection
          .map(({ block }) => getPlainTextForBlock(block))
          .join("\n\n")
          .trim();

        const { structured } = await writeBlocksToClipboard(
          templates,
          plainText
        );
        lastClipboardWriteSuccessfulRef.current = structured;

        setClipboard({
          type: "blocks",
          formatVersion: BLOCK_CLIPBOARD_FORMAT_VERSION,
          blocks: templates,
        });

        if (!silent) {
          showNotification(
            templates.length === 1 ? "Block copied" : "Blocks copied",
            "success",
            2000
          );
        }

        return true;
      },
      [getSelectedBlocksInOrder, showNotification]
    );

    const handleBlockWrapperMouseUp = useCallback(() => {
      finishBlockSelection();
    }, [finishBlockSelection]);

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8, // Minimum distance before drag starts
        },
      })
    );

    useEffect(() => {
      latestBlocksRef.current = blocks;
    }, [blocks]);

    useEffect(() => {
      const handleMouseUp = () => {
        finishBlockSelection();
      };

      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }, [finishBlockSelection]);

    useEffect(() => {
      // Track mousedown target to prevent selection when starting from drag handle
      const handleMouseDown = (event) => {
        mouseDownTargetRef.current = event.target;
      };

      const handleMouseUp = () => {
        mouseDownTargetRef.current = null;
      };

      const handleMouseMove = (event) => {
        const buttons = typeof event.buttons === "number" ? event.buttons : 1;
        if ((buttons & 1) !== 1) {
          // mouse button released; stop auto-scroll
          stopAutoScroll();
          mouseDownTargetRef.current = null;
          return;
        }

        // Don't trigger block selection if a block is being dragged for reordering
        if (draggedBlock) {
          return;
        }

        // Don't trigger block selection if mouse started on drag handle
        const isDragHandle = (element) => {
          if (!element) return false;
          // Check if element or its parents have the drag handle attributes
          return element.closest('[title="Drag to reorder"]') !== null;
        };

        // Check both original mousedown target and current target
        if (isDragHandle(mouseDownTargetRef.current) || isDragHandle(event.target)) {
          return;
        }

        if (
          isSelectionDisabledTarget(mouseDownTargetRef.current) ||
          isSelectionDisabledTarget(event.target)
        ) {
          return;
        }

        const state = blockSelectionStateRef.current;

        // If mouse button is held and we're dragging, check if we should start selection
        if (!state.anchorId && !state.isSelecting) {
          // Try to find the block we're currently over
          const blockId = resolveBlockIdRef.current
            ? resolveBlockIdRef.current(event)
            : null;

          if (blockId) {
            // Clear any native browser text selection
            try {
              const selection = window.getSelection();
              if (selection && typeof selection.removeAllRanges === "function") {
                selection.removeAllRanges();
              }
            } catch (error) {
              // Ignore selection clearing errors
            }

            // Start selection from current block if mouse is held down
            blockSelectionStateRef.current.anchorId = blockId;
            blockSelectionStateRef.current.latestId = blockId;
            blockSelectionStateRef.current.isSelecting = true;
            blockSelectionStateRef.current.pendingFromContent = false;
            setSelectedBlocks([blockId]);
            setIsAllBlocksSelected(false);
          }
        }

        if (
          !state.anchorId ||
          (!state.pendingFromContent && !state.isSelecting)
        ) {
          return;
        }

        lastSelectionMousePosRef.current = {
          x: event.clientX,
          y: event.clientY,
        };

        // Use viewport-based detection with editor bounds awareness
        // This ensures auto-scroll works even when hovering over large blocks (tables, charts)
        const editorEl = editorRef.current;
        const viewportHeight = window.innerHeight;
        const bottomEdgeThreshold = 100; // Distance from viewport bottom to start scrolling down
        let direction = 0;
        let speed = 0;

        if (editorEl) {
          const editorRect = editorEl.getBoundingClientRect();
          const editorTop = editorRect.top;

          // Calculate the effective trigger zone for upward scroll
          // Use the maximum of 0 and editor top (in case editor is scrolled up past viewport)
          const topTriggerStart = Math.max(0, editorTop);
          const topTriggerZone = topTriggerStart + 50; // 50px zone from where editor becomes visible

          // For upward scroll: trigger when cursor is in the top zone
          // This works even when hovering over large blocks extending beyond viewport
          if (event.clientY < topTriggerZone) {
            // Near top of visible editor area - scroll up
            direction = -1;
            speed = Math.min(
              20,
              Math.max(2, (topTriggerZone - event.clientY) / 2)
            );
          } else if (event.clientY > viewportHeight - bottomEdgeThreshold) {
            // Near bottom of viewport - scroll down
            direction = 1;
            speed = Math.min(
              20,
              Math.max(1, (event.clientY - (viewportHeight - bottomEdgeThreshold)) / 3)
            );
          }
        }

        if (direction !== 0) {
          autoScrollStateRef.current.active = true;
          autoScrollStateRef.current.direction = direction;
          autoScrollStateRef.current.speed = speed;
          if (!autoScrollAnimationRef.current) {
            autoScrollAnimationRef.current =
              requestAnimationFrame(autoScrollLoop);
          }
        } else {
          stopAutoScroll();
        }

        const blockId = resolveBlockIdRef.current
          ? resolveBlockIdRef.current(event)
          : null;
        if (!blockId) {
          return;
        }

        if (state.pendingFromContent && blockId !== state.anchorId) {
          extendBlockSelectionRef.current?.(blockId);
          return;
        }

        if (state.isSelecting && state.latestId !== blockId) {
          extendBlockSelectionRef.current?.(blockId);
        }
      };

      document.addEventListener("mousedown", handleMouseDown, true);
      document.addEventListener("mousemove", handleMouseMove, true);
      document.addEventListener("mouseup", handleMouseUp, true);
      const handleMouseUpGlobal = () => {
        stopAutoScroll();
      };
      document.addEventListener("mouseup", handleMouseUpGlobal, true);

      return () => {
        document.removeEventListener("mousedown", handleMouseDown, true);
        document.removeEventListener("mousemove", handleMouseMove, true);
        document.removeEventListener("mouseup", handleMouseUp, true);
        document.removeEventListener("mouseup", handleMouseUpGlobal, true);
        stopAutoScroll();
      };
    }, [autoScrollLoop, stopAutoScroll, setSelectedBlocks, setIsAllBlocksSelected, draggedBlock, isSelectionDisabledTarget]);

    useEffect(() => {
      const handleDocumentClick = (event) => {
        const selectionSet = selectedBlockIdsRef.current;
        if (!selectionSet || selectionSet.size === 0) {
          return;
        }

        const rawTarget = event.target;
        let targetElement = null;

        if (rawTarget && typeof rawTarget.closest === "function") {
          targetElement = rawTarget;
        } else if (
          rawTarget &&
          rawTarget.parentElement &&
          typeof rawTarget.parentElement.closest === "function"
        ) {
          targetElement = rawTarget.parentElement;
        }

        if (
          targetElement &&
          targetElement.closest("[data-block-selection-modal]")
        ) {
          return;
        }

        const rootElement = rootRef.current;
        const editorElement = editorRef.current;

        if (rootElement && !rootElement.contains(event.target)) {
          clearBlockSelection();
          updateActiveBlockId(null);
          return;
        }

        if (editorElement) {
          if (editorElement.contains(event.target)) {
            return;
          }

          const rect = editorElement.getBoundingClientRect();
          const clientX =
            typeof event.clientX === "number" ? event.clientX : null;

          if (clientX !== null) {
            const withinHorizontal =
              clientX >= rect.left && clientX <= rect.right;
            if (withinHorizontal) {
              return;
            }
          }
        }

        clearBlockSelection();
        updateActiveBlockId(null);
      };

      document.addEventListener("click", handleDocumentClick, true);
      return () => {
        document.removeEventListener("click", handleDocumentClick, true);
      };
    }, [clearBlockSelection, updateActiveBlockId]);

    useEffect(() => {
      if (selectedBlockIds.length === 0) {
        return undefined;
      }

      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          clearBlockSelection();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [selectedBlockIds.length, clearBlockSelection]);

    useEffect(() => {
      if (selectedBlockIds.length === 0) {
        return;
      }

      const validIds = new Set(blocks.map((block) => block.id));
      if (selectedBlockIds.some((id) => !validIds.has(id))) {
        const filtered = selectedBlockIds.filter((id) => validIds.has(id));
        setSelectedBlocks(filtered);
      }
    }, [blocks, selectedBlockIds, setSelectedBlocks]);

    const isSelectionInsideCheckedTodo = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;

      const range = selection.getRangeAt(0);
      let node = range.startContainer;

      if (!node) return false;

      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
      }

      if (!node || typeof node.closest !== "function") return false;

      const blockElement = node.closest("[data-block-id]");
      if (!blockElement) return false;

      const blockId = blockElement.getAttribute("data-block-id");
      if (!blockId) return false;

      const currentBlocks = latestBlocksRef.current || [];
      const block = currentBlocks.find((item) => item.id === blockId);

      return Boolean(
        block && block.type === BlockType.TODO && block.properties?.checked
      );
    }, []);

    const checkHighlightState = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;

      const range = selection.getRangeAt(0);
      let element =
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
          ? range.commonAncestorContainer.parentElement
          : range.commonAncestorContainer;

      while (element && element !== document.body) {
        const style = window.getComputedStyle(element);

        if (isHighlightColorValue(style?.backgroundColor)) {
          return true;
        }

        if (isHighlightColorValue(element.style?.backgroundColor)) {
          return true;
        }

        element = element.parentElement;
      }

      return false;
    }, []);

    // Delta tracking
    const deltaTrackerRef = useRef(null);
    const lastSyncedVersionRef = useRef(null);

    // Auto-save state
    const [saveStatus, setSaveStatus] = useState(null);
    const autoSaveTimeoutRef = useRef(null);
    const lastSavedContentRef = useRef(null);
    const lastUserActivityRef = useRef(Date.now());
    const isUserTypingRef = useRef(false);
    const typingTimeoutRef = useRef(null);

    // Auto-versioning state (Google Docs style checkpoints)
    const lastVersionTimestampRef = useRef(Date.now());
    const changeCountRef = useRef(0);
    const shouldCreateVersionRef = useRef(false);
    const autoVersionTimeoutRef = useRef(null);

    // Helper function to check if content has any meaningful data
    const hasAnyContent = useCallback((blocks, noteTitle) => {
      // Check title
      if (noteTitle && noteTitle.trim().length > 0) {
        return true;
      }

      // Check if any block has content
      if (!blocks || blocks.length === 0) {
        return false;
      }

      return blocks.some((block) => {
        // Check if block has text content
        if (block.content && block.content.trim().length > 0) {
          return true;
        }

        // Check if block has properties (like checked for TODO)
        if (block.properties && Object.keys(block.properties).length > 0) {
          return true;
        }

        // Check if block has children with content
        if (block.children && block.children.length > 0) {
          return hasAnyContent(block.children, "");
        }

        return false;
      });
    }, []);

    const createAutoVersionIfNeeded = useCallback(async () => {
      // Version history temporarily disabled
      return;
      /*
      if (!noteId || !enableDeltaTracking) {
        return;
      }

      if (blockCreationInProgressRef.current) {
        setTimeout(() => createAutoVersionIfNeeded(), 100);
        return;
      }

      const now = Date.now();
      const timeSinceLastVersion = now - lastVersionTimestampRef.current;
      const changeCount = changeCountRef.current;

      // Check if enough time has passed (2 minutes) or enough changes accumulated
      if (timeSinceLastVersion < TWO_MINUTES && changeCount < 10) {
        return;
      }

      try {
        // Fetch the latest version to compare with current state
        const versionsResponse = await versionHistoryApi.getVersionHistory(
          noteId,
          { limit: 1 }
        );
        const latestVersion = versionsResponse?.versions?.[0];

        let hasChanges = false;

        if (!latestVersion) {
          // No versions exist yet, check if there's any actual content
          hasChanges = hasAnyContent(latestBlocksRef.current, title);
        } else {
          // Compare current state with the latest version
          const currentBlocks = latestBlocksRef.current;
          const currentTitle = title || "";
          const versionBlocks =
            latestVersion.blocks?.blocks || latestVersion.blocks || [];
          const versionTitle = latestVersion.title || "";

          // Check for title changes
          const titleChanged = currentTitle.trim() !== versionTitle.trim();

          // Check for block changes
          const blocksChanged =
            JSON.stringify(currentBlocks) !== JSON.stringify(versionBlocks);

          hasChanges = titleChanged || blocksChanged;
        }

        // Only create version if there are actual changes
        if (hasChanges) {
          const triggerType = changeCount >= 10 ? "changes" : "time";

          await versionHistoryApi.createAutoVersion(noteId, {
            triggerType,
          });

          console.log(
            `[Version] Created auto-version (${triggerType}): detected changes via comparison`
          );

          // Dispatch event to notify version history panel
          window.dispatchEvent(
            new CustomEvent("version-created", { detail: { noteId } })
          );

          lastVersionTimestampRef.current = now;
          changeCountRef.current = 0;
          shouldCreateVersionRef.current = false;

          if (autoVersionTimeoutRef.current) {
            clearTimeout(autoVersionTimeoutRef.current);
            autoVersionTimeoutRef.current = null;
          }
        } else {
          console.log(
            "[Version] No changes detected, skipping version creation"
          );
        }
      } catch (error) {
        console.error("[Version] Failed to create auto-version:", error);
      }
      */
    }, [noteId, enableDeltaTracking, title, hasAnyContent]);

    // Create version if there are ANY changes (for screen wake and navigation scenarios)
    const createVersionIfHasChanges = useCallback(
      async (forceCreate = false) => {
        // Version history temporarily disabled
        return false;
        /*
        if (!noteId || !enableDeltaTracking) {
          return false;
        }

        if (blockCreationInProgressRef.current) {
          // Wait for block creation to complete
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (blockCreationInProgressRef.current) {
            return false;
          }
        }

        try {
          // Fetch the latest version to compare with current state
          const versionsResponse = await versionHistoryApi.getVersionHistory(
            noteId,
            { limit: 1 }
          );
          const latestVersion = versionsResponse?.versions?.[0];

          let hasChanges = false;

          if (!latestVersion) {
            // No versions exist yet, check if there's any actual content
            hasChanges = hasAnyContent(latestBlocksRef.current, title);
          } else {
            // Compare current state with the latest version
            const currentBlocks = latestBlocksRef.current;
            const currentTitle = title || "";
            const versionBlocks =
              latestVersion.blocks?.blocks || latestVersion.blocks || [];
            const versionTitle = latestVersion.title || "";

            // Check for title changes
            const titleChanged = currentTitle.trim() !== versionTitle.trim();

            // Check for block changes (this includes formatting changes)
            const currentBlocksStr = JSON.stringify(currentBlocks);
            const versionBlocksStr = JSON.stringify(versionBlocks);
            const blocksChanged = currentBlocksStr !== versionBlocksStr;

            // Debug: Log if only formatting changed
            if (blocksChanged && !titleChanged) {
              const currentTexts = currentBlocks.map((b) =>
                (b.content || "").replace(/<[^>]*>/g, "")
              );
              const versionTexts = versionBlocks.map((b) =>
                (b.content || "").replace(/<[^>]*>/g, "")
              );
              const textsIdentical =
                JSON.stringify(currentTexts) === JSON.stringify(versionTexts);
              if (textsIdentical) {
                console.log("[Version] Formatting-only change detected");
              }
            }

            hasChanges = titleChanged || blocksChanged;
          }

          // Only create version if there are actual changes
          if (!hasChanges) {
            console.log(
              "[Version] No changes detected, skipping version creation"
            );
            return false;
          }

          // Log whether this is a forced creation (e.g., on navigation) or regular
          if (forceCreate) {
            console.log(
              "[Version] Force creating version on navigation (has changes)"
            );
          } else {
            console.log("[Version] Creating version on demand (has changes)");
          }

          await versionHistoryApi.createAutoVersion(noteId, {
            triggerType: "manual",
            forceCreate: forceCreate,
          });

          // Dispatch event to notify version history panel
          window.dispatchEvent(
            new CustomEvent("version-created", { detail: { noteId } })
          );

          lastVersionTimestampRef.current = Date.now();
          changeCountRef.current = 0;
          shouldCreateVersionRef.current = false;

          if (autoVersionTimeoutRef.current) {
            clearTimeout(autoVersionTimeoutRef.current);
            autoVersionTimeoutRef.current = null;
          }

          return true;
        } catch (error) {
          console.error("[Version] Failed to create version on demand:", error);
          return false;
        }
        */
      },
      [noteId, enableDeltaTracking, title, hasAnyContent]
    );

    const scheduleAutoVersionTimer = useCallback(() => {
      if (!noteId || !enableDeltaTracking) {
        return;
      }

      if (autoVersionTimeoutRef.current) {
        clearTimeout(autoVersionTimeoutRef.current);
      }

      autoVersionTimeoutRef.current = setTimeout(() => {
        createAutoVersionIfNeeded();
      }, TWO_MINUTES);
    }, [noteId, enableDeltaTracking, createAutoVersionIfNeeded]);

    const trackContentChange = useCallback(() => {
      if (!noteId || !enableDeltaTracking) {
        return;
      }

      lastUserActivityRef.current = Date.now();
      changeCountRef.current += 1;
      shouldCreateVersionRef.current = true;
      if (changeCountRef.current >= 10) {
        createAutoVersionIfNeeded();
      } else {
        scheduleAutoVersionTimer();
      }
    }, [
      noteId,
      enableDeltaTracking,
      scheduleAutoVersionTimer,
      createAutoVersionIfNeeded,
    ]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const deleteSelectedBlocks = useCallback(
      ({ skipNotification = false, skipWarning = false } = {}) => {
        if (!selectedBlockIdsRef.current.size) {
          return false;
        }

        const removalSet = new Set(selectedBlockIdsRef.current);
        const blockCount = removalSet.size;

        // Check if this is deleting all blocks - if so, skip warning (clearAll modal handles it)
        const isDeletingAllBlocks = blockCount === blocks.length;

        // Show warning modal if enabled and not skipped and not deleting all blocks
        if (showDeletionWarning && !skipWarning && !isDeletingAllBlocks) {
          setDeletionWarningModal({
            isOpen: true,
            blockCount,
            onConfirm: () => {
              // Close modal and proceed with deletion
              setDeletionWarningModal({
                isOpen: false,
                blockCount: 0,
                onConfirm: null,
              });
              // Recursively call with skipWarning to actually delete
              deleteSelectedBlocks({ skipNotification, skipWarning: true });
            },
          });
          return false;
        }
        const orderedSelection = getSelectedBlocksInOrder();
        const placeholderRef = { block: null, index: 0 };

        const remainingBlocksPreview = blocks.filter(
          (block) => !removalSet.has(block.id)
        );
        const firstSelectionIndex =
          orderedSelection.length > 0 ? orderedSelection[0].index : 0;

        let focusTargetId = null;
        let focusTargetPosition = "start";

        if (remainingBlocksPreview.length > 0) {
          const targetBlock =
            remainingBlocksPreview[firstSelectionIndex] ||
            remainingBlocksPreview[firstSelectionIndex - 1] ||
            remainingBlocksPreview[0];

          focusTargetId = targetBlock?.id ?? null;
          focusTargetPosition =
            firstSelectionIndex === 0 || !targetBlock ? "start" : "end";
        }

        setBlocks((prev) => {
          const filtered = prev.filter((block) => !removalSet.has(block.id));

          let nextBlocks;
          if (filtered.length === 0) {
            const newBlock = createBlock(BlockType.TEXT, "");
            placeholderRef.block = newBlock;
            placeholderRef.index = 0;
            nextBlocks = [newBlock];
          } else {
            nextBlocks = filtered;
          }

          // Track delta changes synchronously with state update
          if (enableDeltaTracking && deltaTrackerRef.current) {
            removalSet.forEach((blockId) =>
              deltaTrackerRef.current.deleteBlock(blockId)
            );

            if (placeholderRef.block) {
              deltaTrackerRef.current.insertBlock(placeholderRef.block, 0);
            }
          }

          return nextBlocks;
        });

        if (placeholderRef.block) {
          focusTargetId = placeholderRef.block.id;
          focusTargetPosition = "start";
        }

        clearBlockSelection();

        if (focusTargetId) {
          updateActiveBlockId(focusTargetId);
          setTimeout(() => {
            blockRefs.current[focusTargetId]?.focus(focusTargetPosition);
          }, 0);
        }

        if (!skipNotification) {
          showNotification(
            removalSet.size === 1
              ? "Block deleted"
              : `${removalSet.size} blocks deleted`,
            "success",
            2000
          );
        }

        trackContentChange();
        return true;
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        blocks,
        clearBlockSelection,
        enableDeltaTracking,
        getSelectedBlocksInOrder,
        showNotification,
        trackContentChange,
        updateActiveBlockId,
        showDeletionWarning,
        setDeletionWarningModal,
      ]
    );

    const cutSelectedBlocks = useCallback(async () => {
      const copied = await copySelectedBlocks({ silent: true });
      if (!copied) {
        showNotification("Nothing selected to cut", "warning", 2000);
        return false;
      }

      const deleted = deleteSelectedBlocks({ skipNotification: true });
      if (deleted) {
        showNotification("Blocks cut", "success", 2000);
      }
      return deleted;
    }, [copySelectedBlocks, deleteSelectedBlocks, showNotification]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const pasteClipboardBlocks = useCallback(
      ({ replaceSelection = true, templatesOverride = null } = {}) => {
        const sourceTemplates =
          (templatesOverride && templatesOverride.length
            ? templatesOverride
            : clipboard?.blocks) || [];

        if (!Array.isArray(sourceTemplates) || sourceTemplates.length === 0) {
          return false;
        }

        const normalizedTemplates = normalizeBlocksForPaste(sourceTemplates);
        if (!normalizedTemplates.length) {
          showNotification("Unable to paste blocks", "error", 2000);
          return false;
        }

        const orderedSelection = getSelectedBlocksInOrder();
        const removalSet =
          replaceSelection && orderedSelection.length > 0
            ? new Set(orderedSelection.map(({ block }) => block.id))
            : new Set();

        const originalInsertIndex =
          orderedSelection.length > 0 ? orderedSelection[0].index : null;

        const focusBlockId =
          normalizedTemplates[normalizedTemplates.length - 1]?.id ?? null;

        setBlocks((prev) => {
          let working = prev;

          if (removalSet.size > 0) {
            working = prev.filter((block) => !removalSet.has(block.id));
          } else {
            working = [...prev];
          }

          let insertIndex = originalInsertIndex;
          if (insertIndex === null || insertIndex === undefined) {
            const focusedBlockId = getCurrentlyFocusedBlockId();
            const fallbackId =
              focusedBlockId || activeBlockIdRef.current || null;
            const focusIndex = fallbackId
              ? prev.findIndex((block) => block.id === fallbackId)
              : -1;

            insertIndex =
              focusIndex >= 0
                ? Math.min(focusIndex + 1, working.length)
                : working.length;
          } else if (removalSet.size > 0) {
            const removedBeforeIndex = orderedSelection.filter(
              ({ index }) => index < insertIndex
            ).length;
            insertIndex = Math.max(insertIndex - removedBeforeIndex, 0);
          }

          insertIndex = Math.max(0, Math.min(insertIndex, working.length));

          working.splice(insertIndex, 0, ...normalizedTemplates);

          return working;
        });

        if (enableDeltaTracking && deltaTrackerRef.current) {
          removalSet.forEach((blockId) =>
            deltaTrackerRef.current.deleteBlock(blockId)
          );

          const targetInsertIndex =
            originalInsertIndex !== null && originalInsertIndex !== undefined
              ? originalInsertIndex
              : blocks.length;

          normalizedTemplates.forEach((block, offset) => {
            deltaTrackerRef.current.insertBlock(
              block,
              Math.min(targetInsertIndex + offset, blocks.length + offset)
            );
          });
        }

        setSelectedBlocks(normalizedTemplates.map((block) => block.id));
        updateActiveBlockId(focusBlockId);

        blockSelectionStateRef.current.isSelecting = false;
        blockSelectionStateRef.current.pendingFromContent = false;
        blockSelectionStateRef.current.anchorId =
          normalizedTemplates[0]?.id ?? null;
        blockSelectionStateRef.current.latestId = focusBlockId;

        if (templatesOverride && templatesOverride.length) {
          setClipboard({
            type: "blocks",
            formatVersion: BLOCK_CLIPBOARD_FORMAT_VERSION,
            blocks: templatesOverride
              .map((template) => cleanBlockForClipboard(template))
              .filter(Boolean),
          });
        }

        setTimeout(() => {
          if (focusBlockId) {
            blockRefs.current[focusBlockId]?.focus("end");
          }
        }, 0);

        trackContentChange();
        showNotification(
          normalizedTemplates.length === 1
            ? "Block pasted"
            : `${normalizedTemplates.length} blocks pasted`,
          "success",
          2000
        );

        return true;
      },
      [
        activeBlockIdRef,
        blocks,
        clipboard,
        enableDeltaTracking,
        getCurrentlyFocusedBlockId,
        getSelectedBlocksInOrder,
        setSelectedBlocks,
        showNotification,
        trackContentChange,
        updateActiveBlockId,
      ]
    );

    useEffect(() => {
      const handlePasteEvent = (event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          return;
        }

        let templates = null;
        const structuredPayload = clipboardData.getData(BLOCK_CLIPBOARD_MIME);
        if (structuredPayload) {
          const parsed = deserializeBlocksFromClipboard(structuredPayload);
          if (parsed && parsed.length) {
            templates = parsed;
          }
        } else {
          const plainTextPayload = clipboardData.getData("text/plain");
          const parsedFromPlain =
            deserializeBlocksFromClipboard(plainTextPayload);
          if (parsedFromPlain && parsedFromPlain.length) {
            templates = parsedFromPlain;
          }
        }

        if (
          (!templates || templates.length === 0) &&
          clipboard &&
          clipboard.type === "blocks" &&
          Array.isArray(clipboard.blocks) &&
          clipboard.blocks.length > 0 &&
          !lastClipboardWriteSuccessfulRef.current
        ) {
          templates = clipboard.blocks;
        }

        if (templates && templates.length) {
          event.preventDefault();
          const replace =
            selectedBlockIdsRef.current && selectedBlockIdsRef.current.size > 0;
          pasteClipboardBlocks({
            replaceSelection: replace,
            templatesOverride: templates,
          });
        }
      };

      document.addEventListener("paste", handlePasteEvent, true);
      return () => {
        document.removeEventListener("paste", handlePasteEvent, true);
      };
    }, [clipboard, pasteClipboardBlocks]);

    useEffect(() => {
      // Version history temporarily disabled
      return undefined;
      /*
      if (!noteId || !enableDeltaTracking) {
        return undefined;
      }

      let isMounted = true;

      if (autoVersionTimeoutRef.current) {
        clearTimeout(autoVersionTimeoutRef.current);
        autoVersionTimeoutRef.current = null;
      }

      versionHistoryApi
        .getVersionHistory(noteId, { limit: 1, includeOperations: false })
        .then(({ versions }) => {
          if (!isMounted) return;
          if (Array.isArray(versions) && versions.length > 0) {
            const timestamp = Date.parse(versions[0].created_at);
            lastVersionTimestampRef.current = Number.isNaN(timestamp)
              ? Date.now()
              : timestamp;
          } else {
            lastVersionTimestampRef.current = Date.now();
          }
        })
        .catch(() => {
          if (isMounted) {
            lastVersionTimestampRef.current = Date.now();
          }
        });

      changeCountRef.current = 0;
      shouldCreateVersionRef.current = false;

      return () => {
        isMounted = false;
      };
      */
    }, [noteId, enableDeltaTracking]);

    useEffect(() => {
      // Version history temporarily disabled
      return undefined;
      /*
      if (!noteId || !enableDeltaTracking) {
        return undefined;
      }

      const intervalId = setInterval(() => {
        createAutoVersionIfNeeded();
      }, TWO_MINUTES);

      return () => clearInterval(intervalId);
      */
    }, [noteId, enableDeltaTracking, createAutoVersionIfNeeded]);

    // Refs
    const editorRef = useRef(null);
    const titleRef = useRef(null);
    const listConversionRef = useRef({});
    const blockCreationInProgressRef = useRef(false);
    const lastEnterTimestampRef = useRef(0);
    const directEventLastEnterRef = useRef(0);
    const toolbarAnimationFrameRef = useRef(null);

    const updateExistingHighlights = useCallback((color) => {
      if (!editorRef.current || !color) return;

      const highlightedElements = editorRef.current.querySelectorAll(
        '[style*="background-color"]'
      );

      highlightedElements.forEach((element) => {
        const currentValue = element.style?.backgroundColor;
        if (isHighlightColorValue(currentValue)) {
          element.style.backgroundColor = color;
        }
      });
    }, []);

    useEffect(() => {
      const applyThemeHighlights = () => {
        const color = getHighlightColor();
        updateExistingHighlights(color);
      };

      applyThemeHighlights();

      if (typeof MutationObserver === "undefined") {
        return undefined;
      }

      const observer = new MutationObserver(applyThemeHighlights);

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      return () => observer.disconnect();
    }, [updateExistingHighlights]);

    // Global Enter key debounce - shared across all pathways
    const globalEnterDebounceRef = useRef(0);

    const isEntireEditorSelected = useCallback(() => {
      try {
        const selection = window.getSelection();
        const editorElement = editorRef.current;

        if (!selection || selection.rangeCount === 0 || !editorElement) {
          return false;
        }

        if (typeof Range === "undefined") {
          return false;
        }

        const blockWrappers = editorElement.querySelectorAll(
          "[data-block-wrapper]"
        );

        if (!blockWrappers.length) {
          return false;
        }

        const firstWrapper = blockWrappers[0];
        const lastWrapper = blockWrappers[blockWrappers.length - 1];

        const fullRange = document.createRange();
        fullRange.setStartBefore(firstWrapper);
        fullRange.setEndAfter(lastWrapper);

        const currentRange = selection.getRangeAt(0);

        const startsBeforeOrEqual =
          currentRange.compareBoundaryPoints(Range.START_TO_START, fullRange) <=
          0;
        const endsAfterOrEqual =
          currentRange.compareBoundaryPoints(Range.END_TO_END, fullRange) >= 0;

        return startsBeforeOrEqual && endsAfterOrEqual;
      } catch (error) {
        return false;
      }
    }, []);

    const updateToolbarPosition = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setIsAllBlocksSelected(false);
        setToolbarState((prev) =>
          prev.isOpen ? { ...prev, isOpen: false } : prev
        );
        return;
      }

      const trimmedText = selection.toString().trim();
      const entireSelectionActive = isEntireEditorSelected();
      setIsAllBlocksSelected(entireSelectionActive);

      // Check if selection is within a table block
      const range = selection.getRangeAt(0);
      let node = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
      }
      const isInTable = node && typeof node.closest === 'function' && node.closest('.table-block-container');

      if (!trimmedText || entireSelectionActive || isInTable) {
        setToolbarState((prev) =>
          prev.isOpen ? { ...prev, isOpen: false } : prev
        );
        return;
      }

      const rect = range.getBoundingClientRect();

      if (rect.width <= 0 && rect.height <= 0) {
        setToolbarState((prev) =>
          prev.isOpen ? { ...prev, isOpen: false } : prev
        );
        return;
      }

      const roundedTop = Math.round(rect.top * 100) / 100;
      const roundedLeft = Math.round((rect.left + rect.width / 2) * 100) / 100;

      const isCheckedTodo = isSelectionInsideCheckedTodo();
      const isStrikethroughActive = document.queryCommandState("strikeThrough");
      const nextSelectionState = {
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: isCheckedTodo ? false : isStrikethroughActive,
        highlight: checkHighlightState(),
        disabled: isCheckedTodo,
      };

      setToolbarState((prev) => {
        if (
          prev.isOpen &&
          prev.position &&
          Math.abs(prev.position.top - roundedTop) < 0.5 &&
          Math.abs(prev.position.left - roundedLeft) < 0.5 &&
          prev.selection &&
          prev.selection.bold === nextSelectionState.bold &&
          prev.selection.italic === nextSelectionState.italic &&
          prev.selection.underline === nextSelectionState.underline &&
          prev.selection.strikethrough === nextSelectionState.strikethrough &&
          prev.selection.highlight === nextSelectionState.highlight &&
          prev.selection.disabled === nextSelectionState.disabled
        ) {
          return prev;
        }

        return {
          isOpen: true,
          position: {
            top: roundedTop,
            left: roundedLeft,
          },
          selection: nextSelectionState,
        };
      });
    }, [
      checkHighlightState,
      isEntireEditorSelected,
      isSelectionInsideCheckedTodo,
    ]);

    // Subscribe to global race condition manager
    useEffect(() => {
      const editorId = Math.random().toString(36).substr(2, 9);
    }, []);

    // Sync blocks state with initialBlocks prop when note content changes
    // But don't override local changes during rapid delete operations
    const haveMeaningfulBlockChanges = useCallback((incoming, current) => {
      if (incoming === current) return false;
      if (!Array.isArray(incoming) || !Array.isArray(current)) {
        return true;
      }
      if (incoming.length !== current.length) {
        return true;
      }

      for (let i = 0; i < incoming.length; i += 1) {
        const nextBlock = incoming[i];
        const existingBlock = current[i];

        if (!existingBlock) {
          return true;
        }

        if (
          nextBlock.id !== existingBlock.id ||
          nextBlock.type !== existingBlock.type ||
          nextBlock.content !== existingBlock.content
        ) {
          return true;
        }

        const nextProps = nextBlock.properties || {};
        const existingProps = existingBlock.properties || {};

        if (JSON.stringify(nextProps) !== JSON.stringify(existingProps)) {
          return true;
        }
      }

      return false;
    }, []);

    useEffect(() => {
      if (
        !initialBlocks ||
        initialBlocks.length === 0 ||
        rapidDeleteModeRef.current
      ) {
        return;
      }

      const currentBlocks = latestBlocksRef.current || [];
      const shouldSync = haveMeaningfulBlockChanges(
        initialBlocks,
        currentBlocks
      );

      if (shouldSync) {
        setBlocks(initialBlocks);
      }
    }, [initialBlocks, haveMeaningfulBlockChanges]);

    // Initialize delta tracker when note content changes
    useEffect(() => {
      if (enableDeltaTracking) {
        deltaTrackerRef.current = new DeltaTracker(title, initialBlocks);
        lastSyncedVersionRef.current = deltaTrackerRef.current.documentVersion;
      }
    }, [title, initialBlocks, enableDeltaTracking]);

    // Enhanced debounced callback for delta changes with typing detection
    const stableDebouncedCallback = useMemo(() => {
      if (enableDeltaTracking && onDeltaChange) {
        return debounce(
          (changeset, isTyping = false) => {
            onDeltaChange(changeset, isTyping);
          },
          (isTyping) => (isTyping ? 1000 : 500)
        ); // Longer delay for typing
      } else if (onContentChange) {
        return debounce((newBlocks) => {
          onContentChange(newBlocks);
        }, 400);
      }
      return () => {};
    }, [onContentChange, onDeltaChange, enableDeltaTracking]);

    // Generate outline for sidebar
    const generateOutline = useCallback((blocksArray) => {
      const outline = [];

      blocksArray.forEach((block, index) => {
        if (
          [BlockType.HEADING1, BlockType.HEADING2, BlockType.HEADING3].includes(
            block.type
          )
        ) {
          const plainText =
            block.content?.replace(/<[^>]*>/g, "").trim() || "Untitled";
          outline.push({
            id: block.id,
            text: plainText,
            level:
              block.type === BlockType.HEADING1
                ? 1
                : block.type === BlockType.HEADING2
                ? 2
                : 3,
            index,
          });
        }
      });

      return outline;
    }, []);

    // Update content with delta tracking - reduce frequency during active editing
    useEffect(() => {
      // Skip immediate sync during active editing
      const timeoutId = setTimeout(() => {
        if (enableDeltaTracking && deltaTrackerRef.current) {
          const changeset = deltaTrackerRef.current.generateChangeset();

          if (changeset && onDeltaChange) {
            // Pass the current typing state to the callback
            stableDebouncedCallback(changeset, isUserTypingRef.current);
          }
        } else {
          stableDebouncedCallback(blocks);
        }

        if (onOutlineChange) {
          const outline = generateOutline(blocks);
          onOutlineChange(outline);
        }
      }, 100); // Small delay to batch rapid changes

      return () => clearTimeout(timeoutId);
    }, [
      blocks,
      title,
      stableDebouncedCallback,
      onOutlineChange,
      enableDeltaTracking,
    ]);

    const getTitleSelection = useCallback(() => {
      const element = titleRef.current;
      if (
        element &&
        typeof element.selectionStart === "number" &&
        typeof element.selectionEnd === "number"
      ) {
        return {
          selectionStart: element.selectionStart,
          selectionEnd: element.selectionEnd,
        };
      }
      return null;
    }, []);

    const createTitleHistoryState = useCallback(
      (value, selectionOverride = null) => {
        const normalizedValue =
          typeof value === "string"
            ? value
            : value === null || value === undefined
            ? ""
            : String(value);
        const selection = selectionOverride || getTitleSelection();
        let selectionStart = normalizedValue.length;
        let selectionEnd = normalizedValue.length;

        if (selection) {
          if (typeof selection.selectionStart === "number") {
            selectionStart = Math.min(
              Math.max(selection.selectionStart, 0),
              normalizedValue.length
            );
          }
          if (typeof selection.selectionEnd === "number") {
            selectionEnd = Math.min(
              Math.max(selection.selectionEnd, 0),
              normalizedValue.length
            );
          } else {
            selectionEnd = selectionStart;
          }

          if (selectionEnd < selectionStart) {
            const temp = selectionStart;
            selectionStart = selectionEnd;
            selectionEnd = temp;
          }
        }

        return {
          value: normalizedValue,
          selectionStart,
          selectionEnd,
          timestamp: Date.now(),
        };
      },
      [getTitleSelection]
    );

    const titleHistoryRef = useRef({
      states: [],
      currentIndex: -1,
    });
    const titleHistoryInitializedRef = useRef(false);
    const isTitleUndoRedoRef = useRef(false);
    const titleHistorySessionRef = useRef({
      lastUpdate: 0,
      forceNewEntry: false,
      lastKey: null,
      lastKeyTime: 0,
    });

    const resetTitleHistorySession = useCallback(() => {
      titleHistorySessionRef.current = {
        lastUpdate: 0,
        forceNewEntry: false,
        lastKey: null,
        lastKeyTime: 0,
      };
    }, []);

    const addTitleHistoryState = useCallback(
      (value) => {
        if (isTitleUndoRedoRef.current) {
          return;
        }

        const session = titleHistorySessionRef.current;
        const now = Date.now();
        const titleString = typeof title === "string" ? title : title ?? "";

        if (
          !titleHistoryInitializedRef.current ||
          !Array.isArray(titleHistoryRef.current.states) ||
          titleHistoryRef.current.states.length === 0
        ) {
          titleHistoryRef.current = {
            states: [
              createTitleHistoryState(titleString, {
                selectionStart: titleString.length,
                selectionEnd: titleString.length,
              }),
            ],
            currentIndex: 0,
          };
          titleHistoryInitializedRef.current = true;
          session.lastUpdate = now;
          session.forceNewEntry = false;
        }

        const history = titleHistoryRef.current;

        if (history.currentIndex < history.states.length - 1) {
          history.states = history.states.slice(0, history.currentIndex + 1);
        }

        const state = createTitleHistoryState(value);
        const newState = { ...state, timestamp: now };
        const lastIndex = history.states.length - 1;
        const lastState = lastIndex >= 0 ? history.states[lastIndex] : null;
        const isDuplicate = lastState && lastState.value === newState.value;

        const canMerge =
          history.states.length > 1 &&
          lastIndex > 0 &&
          history.currentIndex === lastIndex &&
          !session.forceNewEntry &&
          now - session.lastUpdate <= TITLE_HISTORY_MERGE_WINDOW;

        if (isDuplicate) {
          history.states[lastIndex] = newState;
        } else if (canMerge) {
          history.states[lastIndex] = newState;
        } else {
          history.states.push(newState);

          if (history.states.length > TITLE_HISTORY_LIMIT) {
            const excess = history.states.length - TITLE_HISTORY_LIMIT;
            history.states = history.states.slice(excess);
            history.currentIndex = Math.max(0, history.currentIndex - excess);
          }
        }

        history.currentIndex = history.states.length - 1;
        session.lastUpdate = now;
        session.forceNewEntry = false;
      },
      [createTitleHistoryState, title]
    );

    useEffect(() => {
      const normalizedTitle =
        typeof title === "string" ? title : title === null ? "" : String(title);

      if (!titleHistoryInitializedRef.current) {
        titleHistoryRef.current = {
          states: [
            createTitleHistoryState(normalizedTitle, {
              selectionStart: normalizedTitle.length,
              selectionEnd: normalizedTitle.length,
            }),
          ],
          currentIndex: 0,
        };
        titleHistoryInitializedRef.current = true;
        resetTitleHistorySession();
        return;
      }

      const history = titleHistoryRef.current;
      const currentState =
        history.states.length > 0 ? history.states[history.currentIndex] : null;

      if (isTitleUndoRedoRef.current) {
        if (currentState) {
          currentState.value = normalizedTitle;
        }
        isTitleUndoRedoRef.current = false;
        return;
      }

      if (!currentState) {
        titleHistoryRef.current = {
          states: [
            createTitleHistoryState(normalizedTitle, {
              selectionStart: normalizedTitle.length,
              selectionEnd: normalizedTitle.length,
            }),
          ],
          currentIndex: 0,
        };
        titleHistoryInitializedRef.current = true;
        resetTitleHistorySession();
        return;
      }

      const shouldResetForExternalUpdate =
        currentState.value !== normalizedTitle && !isUserTypingRef.current;

      if (shouldResetForExternalUpdate) {
        titleHistoryRef.current = {
          states: [
            createTitleHistoryState(normalizedTitle, {
              selectionStart: normalizedTitle.length,
              selectionEnd: normalizedTitle.length,
            }),
          ],
          currentIndex: 0,
        };
        titleHistoryInitializedRef.current = true;
        resetTitleHistorySession();
      }
    }, [title, createTitleHistoryState, resetTitleHistorySession]);

    // Handle title changes with delta tracking
    const handleTitleChange = useCallback(
      (newTitle) => {
        // Mark typing activity for title edits so external updates don't reset history mid-typing
        isUserTypingRef.current = true;
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          isUserTypingRef.current = false;
        }, 500);

        if (!isTitleUndoRedoRef.current) {
          addTitleHistoryState(newTitle);
        }

        if (enableDeltaTracking && deltaTrackerRef.current) {
          const operation = deltaTrackerRef.current.updateTitle(newTitle);
          if (operation && onDeltaChange) {
            const changeset = deltaTrackerRef.current.generateChangeset();
            if (changeset) {
              // Pass the current typing state to the callback
              stableDebouncedCallback(changeset, isUserTypingRef.current);
            }
          }
        }

        if (newTitle !== title) {
          trackContentChange();
        }

        if (onTitleChange) {
          onTitleChange(newTitle);
        }
      },
      [
        onTitleChange,
        enableDeltaTracking,
        onDeltaChange,
        stableDebouncedCallback,
        trackContentChange,
        title,
        addTitleHistoryState,
      ]
    );

    // Auto-save functionality
    const scheduleAutoSave = useCallback(() => {
      if (!onSave) return;

      // Clear any existing timeout first
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      // Don't start autosave if block creation is in progress
      if (blockCreationInProgressRef.current) {
        console.log(
          "[AutoSave] Blocked: Block creation in progress, rescheduling..."
        );
        // Reschedule after block creation completes
        autoSaveTimeoutRef.current = setTimeout(() => scheduleAutoSave(), 50);
        return;
      }

      // Don't start autosave if user is actively typing
      if (isUserTypingRef.current) {
        // Reschedule after user finishes typing
        autoSaveTimeoutRef.current = setTimeout(() => scheduleAutoSave(), 100);
        return;
      }

      const currentContent = { blocks, title };
      const currentContentString = JSON.stringify(currentContent);

      if (lastSavedContentRef.current === currentContentString) {
        return;
      }

      // Use shorter check intervals to continuously monitor for typing
      const checkInterval = 100; // Check every 100ms
      let elapsedTime = 0;

      const checkAndSave = async () => {
        // Check if block creation started
        if (blockCreationInProgressRef.current) {
          console.log(
            "[AutoSave] Check failed: Block creation detected, rescheduling..."
          );
          scheduleAutoSave();
          return;
        }

        // Check if user started typing
        if (isUserTypingRef.current) {
          console.log(
            "[AutoSave] Check failed: User typing detected, rescheduling..."
          );
          scheduleAutoSave();
          return;
        }

        // If we haven't waited long enough yet, schedule another check
        if (elapsedTime < autoSaveDelay) {
          elapsedTime += checkInterval;
          console.log(
            `[AutoSave] Checking... (${elapsedTime}ms / ${autoSaveDelay}ms)`
          );
          autoSaveTimeoutRef.current = setTimeout(checkAndSave, checkInterval);
          return;
        }

        // All checks passed and enough time elapsed, perform save
        try {
          setSaveStatus("saving");

          await onSave({ blocks, title });
          await createAutoVersionIfNeeded();
          lastSavedContentRef.current = currentContentString;
          setSaveStatus("saved");

          setTimeout(() => setSaveStatus(null), 2000);
        } catch (error) {
          console.error("Auto-save failed:", error);
          setSaveStatus("error");

          setTimeout(() => setSaveStatus(null), 3000);
        }
      };

      // Start the checking process
      autoSaveTimeoutRef.current = setTimeout(checkAndSave, checkInterval);
    }, [blocks, title, onSave, autoSaveDelay, createAutoVersionIfNeeded]);

    // Trigger auto-save when content changes
    useEffect(() => {
      if (
        onSave &&
        !isBlockUndoRedoRef.current &&
        !rapidDeleteModeRef.current
      ) {
        scheduleAutoSave();
      }
    }, [blocks, title, scheduleAutoSave, onSave]);

    const applyTitleHistoryState = useCallback(
      (state) => {
        if (!state) {
          return;
        }

        resetTitleHistorySession();
        const targetValue =
          typeof state.value === "string" ? state.value : state.value ?? "";
        isTitleUndoRedoRef.current = true;
        handleTitleChange(targetValue);

        const restoreCaret = () => {
          const element = titleRef.current;
          if (!element) {
            return;
          }

          const maxLength = targetValue.length;
          const start =
            typeof state.selectionStart === "number"
              ? Math.min(Math.max(state.selectionStart, 0), maxLength)
              : maxLength;
          const end =
            typeof state.selectionEnd === "number"
              ? Math.min(Math.max(state.selectionEnd, 0), maxLength)
              : start;

          try {
            element.focus();
            element.setSelectionRange(start, end);
          } catch (err) {
            // Ignore selection errors (e.g., unsupported browsers)
          }
        };

        if (typeof window !== "undefined") {
          if (typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(restoreCaret);
          } else {
            setTimeout(restoreCaret, 0);
          }
        } else {
          setTimeout(restoreCaret, 0);
        }

        scheduleAutoSave();
      },
      [handleTitleChange, scheduleAutoSave, resetTitleHistorySession]
    );

    const handleTitleUndo = useCallback(() => {
      resetTitleHistorySession();
      const history = titleHistoryRef.current;
      if (
        !history ||
        history.currentIndex <= 0 ||
        history.states.length === 0
      ) {
        return;
      }

      history.currentIndex -= 1;
      const targetState = history.states[history.currentIndex];
      applyTitleHistoryState(targetState);
    }, [applyTitleHistoryState, resetTitleHistorySession]);

    const handleTitleRedo = useCallback(() => {
      resetTitleHistorySession();
      const history = titleHistoryRef.current;
      if (
        !history ||
        history.states.length === 0 ||
        history.currentIndex >= history.states.length - 1
      ) {
        return;
      }

      history.currentIndex += 1;
      const targetState = history.states[history.currentIndex];
      applyTitleHistoryState(targetState);
    }, [applyTitleHistoryState, resetTitleHistorySession]);

    // Clean up auto-save timeout on unmount
    useEffect(() => {
      return () => {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        if (autoVersionTimeoutRef.current) {
          clearTimeout(autoVersionTimeoutRef.current);
        }
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      };
    }, []);

    // Block-level history management using persistent storage
    const blockTimeoutRef = useRef({});
    const isBlockUndoRedoRef = useRef(false);
    const hasInitializedRef = useRef(false);

    const createBaselineHistoryState = useCallback((block) => {
      if (!block) {
        return null;
      }

      if (block.type === "table") {
        return {
          content: "",
          properties: block.properties
            ? JSON.parse(JSON.stringify(block.properties))
            : undefined,
          selection: null,
          timestamp: Date.now(),
        };
      }

      return {
        content: block.content || "",
        properties: block.properties
          ? JSON.parse(JSON.stringify(block.properties))
          : undefined,
        selection: null,
        timestamp: Date.now(),
      };
    }, []);

    // Get persistent block history for this note
    const getBlockHistory = useCallback(() => {
      if (!noteId) return {};
      if (!globalBlockHistories.has(noteId)) {
        globalBlockHistories.set(noteId, {});
      }
      return globalBlockHistories.get(noteId);
    }, [noteId]);

    // Create persistent block history ref that survives remounts
    const blockHistoryRef = useMemo(() => {
      const persistentStorage = getBlockHistory();
      return { current: persistentStorage };
    }, [getBlockHistory]);

    useEffect(() => {
      titleHistoryInitializedRef.current = false;
      titleHistoryRef.current = {
        states: [],
        currentIndex: -1,
      };
      isTitleUndoRedoRef.current = false;
      resetTitleHistorySession();
    }, [noteId, resetTitleHistorySession]);

    const tableChangeMetadataRef = useRef({});

    const getFocusedTableCellPosition = useCallback(() => {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        activeElement.contentEditable === "true" &&
        activeElement.hasAttribute("data-table-row") &&
        activeElement.hasAttribute("data-table-col")
      ) {
        const row = Number(activeElement.getAttribute("data-table-row"));
        const col = Number(activeElement.getAttribute("data-table-col"));
        if (!Number.isNaN(row) && !Number.isNaN(col)) {
          return { row, col };
        }
      }
      return null;
    }, []);

    const computeTableChangeMetadata = useCallback(
      (previousProps, nextProps) => {
        if (!previousProps || !nextProps) {
          return { type: "structure", reason: "missing-properties" };
        }

        const prevData = Array.isArray(previousProps.tableData)
          ? previousProps.tableData
          : [];
        const nextData = Array.isArray(nextProps.tableData)
          ? nextProps.tableData
          : [];

        const prevHasHeader = Boolean(previousProps.hasHeader);
        const nextHasHeader = Boolean(nextProps.hasHeader);

        if (prevHasHeader !== nextHasHeader) {
          return { type: "structure", reason: "header-toggle" };
        }

        const prevHeaders = Array.isArray(previousProps.columnHeaders)
          ? previousProps.columnHeaders
          : [];
        const nextHeaders = Array.isArray(nextProps.columnHeaders)
          ? nextProps.columnHeaders
          : [];

        if (
          prevHeaders.length !== nextHeaders.length ||
          prevHeaders.some((value, index) => value !== nextHeaders[index])
        ) {
          return { type: "structure", reason: "column-headers" };
        }

        if (prevData.length !== nextData.length) {
          return { type: "structure", reason: "row-count" };
        }

        const diffCells = [];

        for (let row = 0; row < nextData.length; row++) {
          const prevRow = Array.isArray(prevData[row]) ? prevData[row] : [];
          const nextRow = Array.isArray(nextData[row]) ? nextData[row] : [];

          if (prevRow.length !== nextRow.length) {
            return { type: "structure", reason: "column-count", row };
          }

          for (let col = 0; col < nextRow.length; col++) {
            const prevValue = prevRow[col] ?? "";
            const nextValue = nextRow[col] ?? "";

            if (prevValue !== nextValue) {
              diffCells.push({
                row,
                col,
                previousContent: prevValue,
                newContent: nextValue,
              });

              if (diffCells.length > 1) {
                return { type: "multi-cell", cells: diffCells };
              }
            }
          }
        }

        if (diffCells.length === 1) {
          const cell = diffCells[0];
          return {
            type: "cell",
            row: cell.row,
            col: cell.col,
            previousContent: cell.previousContent,
            newContent: cell.newContent,
            isHeader: nextHasHeader && cell.row === 0,
          };
        }

        return null;
      },
      []
    );

    // Initialize block history for existing blocks when they are loaded
    useEffect(() => {
      if (isBlockUndoRedoRef.current) {
        return;
      }

      blocks.forEach((block) => {
        const history = blockHistoryRef.current[block.id];

        if (!history || history.needsInitialization) {
          const baselineState = createBaselineHistoryState(block);
          if (baselineState) {
            blockHistoryRef.current[block.id] = {
              states: [baselineState],
              currentIndex: 0,
            };
          }
          return;
        }

        if (!Array.isArray(history.states) || history.states.length === 0) {
          const baselineState = createBaselineHistoryState(block);
          if (baselineState) {
            history.states = [baselineState];
            history.currentIndex = 0;
          }
          return;
        }

        history.currentIndex =
          typeof history.currentIndex === "number"
            ? Math.max(
                0,
                Math.min(history.currentIndex, history.states.length - 1)
              )
            : history.states.length - 1;
      });
    }, [blocks, createBaselineHistoryState]);

    // Reset initialization flag when switching notes or blocks change significantly
    useEffect(() => {
      // Reset initialization flag when switching notes
      const currentBlockIds = new Set(blocks.map((b) => b.id));
      const existingBlockIds = new Set(Object.keys(blockHistoryRef.current));

      // If we have a completely different set of blocks, allow re-initialization
      const hasNewBlocks = blocks.some((b) => !existingBlockIds.has(b.id));
      const hasRemovedBlocks = Array.from(existingBlockIds).some(
        (id) => !currentBlockIds.has(id)
      );

      if (hasNewBlocks || hasRemovedBlocks) {
        hasInitializedRef.current = false;
      }
    }, [blocks]);

    // Helper to get selection info
    const getSelectionInfo = useCallback((element) => {
      if (!element) return { start: 0, end: 0 };

      const selection = window.getSelection();
      if (!selection.rangeCount) return { start: 0, end: 0 };

      const range = selection.getRangeAt(0);

      // Check if selection is within our element
      if (!element.contains(range.commonAncestorContainer)) {
        return { start: 0, end: 0 };
      }

      try {
        // Create range from start of element to start of selection
        const preSelectionRange = document.createRange();
        preSelectionRange.selectNodeContents(element);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const start = preSelectionRange.toString().length;

        // Create range from start of element to end of selection
        const fullRange = document.createRange();
        fullRange.selectNodeContents(element);
        fullRange.setEnd(range.endContainer, range.endOffset);
        const end = fullRange.toString().length;

        return { start, end };
      } catch (error) {
        console.warn("Failed to get selection info:", error);
        return { start: 0, end: 0 };
      }
    }, []);

    // Helper to restore selection
    const restoreSelection = useCallback((element, selectionInfo) => {
      if (!element) {
        return;
      }

      const focusAtEnd = () => {
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      };

      const hasValidSelection =
        selectionInfo &&
        typeof selectionInfo.start === "number" &&
        typeof selectionInfo.end === "number";

      if (!hasValidSelection) {
        focusAtEnd();
        return;
      }

      try {
        const { start, end } = selectionInfo;
        const range = document.createRange();
        const selection = window.getSelection();
        if (!selection) {
          focusAtEnd();
          return;
        }

        let charCount = 0;
        let startNode = null;
        let endNode = null;
        let startOffset = 0;
        let endOffset = 0;

        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let node;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent.length;

          if (startNode === null && charCount + nodeLength >= start) {
            startNode = node;
            startOffset = Math.max(0, start - charCount);
          }

          if (endNode === null && charCount + nodeLength >= end) {
            endNode = node;
            endOffset = Math.max(0, end - charCount);
            break;
          }

          charCount += nodeLength;
        }

        if (!startNode || !endNode) {
          focusAtEnd();
          return;
        }

        range.setStart(
          startNode,
          Math.min(startOffset, startNode.textContent.length)
        );
        range.setEnd(endNode, Math.min(endOffset, endNode.textContent.length));

        selection.removeAllRanges();
        selection.addRange(range);
      } catch (error) {
        console.warn("Failed to restore selection:", error);
        focusAtEnd();
      }
    }, []);

    // Helper functions for table cursor position during undo/redo
    const saveTableCursorPosition = useCallback(() => {
      const activeElement = document.activeElement;
      if (activeElement && activeElement.contentEditable === "true") {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(activeElement);
          preCaretRange.setEnd(range.endContainer, range.endOffset);
          const caretOffset = preCaretRange.toString().length;

          return {
            element: activeElement,
            caretOffset,
            // Also store table cell coordinates for better reliability
            cellElement: activeElement,
          };
        }
      }
      return null;
    }, []);

    const restoreTableCursorPosition = useCallback((savedPosition) => {
      if (!savedPosition) return;

      const { cellElement, caretOffset } = savedPosition;

      // Use requestAnimationFrame to ensure DOM is fully updated
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (cellElement && cellElement.contentEditable === "true") {
            try {
              // Focus the cell first
              cellElement.focus();

              // Restore cursor position
              const selection = window.getSelection();
              const range = document.createRange();

              let currentOffset = 0;
              let walker = document.createTreeWalker(
                cellElement,
                NodeFilter.SHOW_TEXT,
                null,
                false
              );

              let node;
              while ((node = walker.nextNode())) {
                const nodeLength = node.textContent.length;
                if (currentOffset + nodeLength >= caretOffset) {
                  range.setStart(node, caretOffset - currentOffset);
                  range.setEnd(node, caretOffset - currentOffset);
                  break;
                }
                currentOffset += nodeLength;
              }

              // If we couldn't find the exact position, set cursor at the end
              if (!range.collapsed || currentOffset < caretOffset) {
                range.selectNodeContents(cellElement);
                range.collapse(false); // Set cursor at end
              }

              selection.removeAllRanges();
              selection.addRange(range);
            } catch (error) {
              console.warn("Failed to restore table cursor position:", error);
              // Fallback: focus and set cursor at end
              cellElement.focus();
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(cellElement);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        }, 50); // Small delay to ensure table re-render is complete
      });
    }, []);

    // Capture state for history
    const captureBlockState = useCallback(
      (blockId) => {
        // Find the block data to capture properties for certain block types
        const block = blocks.find((b) => b.id === blockId);
        const blockType = block?.type;

        // Handle table blocks specially - they store state in properties, not innerHTML
        if (blockType === "table") {
          if (!block?.properties) {
            return null;
          }

          const capturedState = {
            content: "", // Table content is stored in properties, not innerHTML
            properties: JSON.parse(JSON.stringify(block.properties)),
            selection: null, // Table blocks don't have selection in the same way
            timestamp: Date.now(),
          };

          return capturedState;
        }

        // For non-table blocks, use the traditional approach
        const blockElement = blockRefs.current[blockId]?.element;
        if (!blockElement) return null;

        let capturedState = {
          content: blockElement.innerHTML,
          selection: getSelectionInfo(blockElement),
          timestamp: Date.now(),
        };

        return capturedState;
      },
      [getSelectionInfo, blocks]
    );

    // Initialize block history with current content as baseline
    const initializeBlockHistory = useCallback(
      (blockId, withCurrentContent = false) => {
        // Prevent double initialization
        if (blockHistoryRef.current[blockId]) {
          return;
        }

        const doInitialization = () => {
          const initialState = captureBlockState(blockId);
          if (initialState) {
            blockHistoryRef.current[blockId] = {
              states: [initialState],
              currentIndex: 0,
            };
          }
        };

        if (withCurrentContent) {
          // Initialize immediately with current content
          doInitialization();
        } else {
          // Mark as initializing to prevent race conditions, but don't capture yet
          blockHistoryRef.current[blockId] = { needsInitialization: true };
        }
      },
      [captureBlockState]
    );

    // Add state to block history
    const addBlockState = useCallback(
      (blockId, immediate = false) => {
        if (isBlockUndoRedoRef.current) {
          return;
        }

        // Check if this block needs initialization (first time setup)
        const history = blockHistoryRef.current[blockId];
        const needsInitialization = !history || history.needsInitialization;

        if (rapidDeleteModeRef.current && !needsInitialization && !immediate) {
          return;
        }

        const addState = () => {
          const history = blockHistoryRef.current[blockId];

          // Handle lazy initialization
          if (!history) {
            initializeBlockHistory(blockId);
            return;
          }

          if (history.needsInitialization) {
            // This is the first content change - capture it as the initial state
            const initialState = captureBlockState(blockId);
            if (initialState) {
              blockHistoryRef.current[blockId] = {
                states: [initialState],
                currentIndex: 0,
              };
            }
            return;
          }

          const newState = captureBlockState(blockId);
          if (!newState) return;

          const block = blocks.find((b) => b.id === blockId);
          if (block?.type === "table") {
            newState.tableChange =
              tableChangeMetadataRef.current[blockId] || null;
          }

          // Don't add if content hasn't changed meaningfully
          const currentState = history.states[history.currentIndex];
          if (currentState) {
            if (block?.type === "table") {
              const contentSame = currentState.content === newState.content;
              // Only compare meaningful table properties for undo purposes
              // tableData is the main content, hasHeader affects display/behavior
              const tableDataSame =
                JSON.stringify(currentState.properties?.tableData) ===
                JSON.stringify(newState.properties?.tableData);
              const hasHeaderSame =
                currentState.properties?.hasHeader ===
                newState.properties?.hasHeader;
              const meaningfulPropertiesSame = tableDataSame && hasHeaderSame;
              if (contentSame && meaningfulPropertiesSame) {
                return;
              }
            } else {
              // For non-table blocks, just check content
              if (currentState.content === newState.content) {
                return;
              }
            }
          }

          // Allow all meaningful changes - the timeout will handle granularity

          // Remove future states if we're not at the end
          if (history.currentIndex < history.states.length - 1) {
            history.states = history.states.slice(0, history.currentIndex + 1);
          }

          // Add new state
          history.states.push(newState);
          history.currentIndex = history.states.length - 1;

          // Limit history size
          if (history.states.length > 200) {
            history.states.shift();
            history.currentIndex--;
          }

          if (block?.type === "table") {
            tableChangeMetadataRef.current[blockId] = null;
          }
        };

        if (immediate) {
          addState();
        } else {
          // Clear any pending timeout
          if (blockTimeoutRef.current[blockId]) {
            clearTimeout(blockTimeoutRef.current[blockId]);
          }

          // Debounce state additions - shorter timeout for better granularity
          blockTimeoutRef.current[blockId] = setTimeout(() => {
            addState();
          }, 250);
        }
      },
      [captureBlockState, initializeBlockHistory, blocks]
    );

    // Block-level undo/redo functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleBlockUndo = useCallback(() => {
      // Clear command delete and rapid delete flags to allow undo to restore content
      commandDeleteActiveRef.current = false;
      rapidDeleteModeRef.current = false;
      if (rapidDeleteTimeoutRef.current) {
        clearTimeout(rapidDeleteTimeoutRef.current);
        rapidDeleteTimeoutRef.current = null;
      }

      // Get the currently focused block, not just the stored activeBlockId
      const focusedBlockId = getCurrentlyFocusedBlockId();

      if (!focusedBlockId) {
        return;
      }

      // Verify the block element exists and is focused
      const blockElement = blockRefs.current[focusedBlockId]?.element;

      // Check if this is a table block
      const block = blocks.find((b) => b.id === focusedBlockId);
      const isTableBlock = block?.type === "table";

      const isStateEquivalentToCurrent = (state) => {
        if (!state || !block) return false;

        if (block.type === "table") {
          const currentProps = block.properties || {};
          const stateProps = state.properties || {};

          const currentTable = Array.isArray(currentProps.tableData)
            ? currentProps.tableData
            : [];
          const stateTable = Array.isArray(stateProps.tableData)
            ? stateProps.tableData
            : [];

          const tableMatches =
            JSON.stringify(stateTable) === JSON.stringify(currentTable);
          const headerMatches =
            Boolean(stateProps.hasHeader) === Boolean(currentProps.hasHeader);
          const headersMatch =
            JSON.stringify(stateProps.columnHeaders || []) ===
            JSON.stringify(currentProps.columnHeaders || []);
          const counterMatch =
            (stateProps.columnCounter ?? currentProps.columnCounter ?? 0) ===
            (currentProps.columnCounter ?? 0);

          return tableMatches && headerMatches && headersMatch && counterMatch;
        }

        const stateContent = state.content ?? "";
        const currentContent = block.content ?? "";
        const stateProps = state.properties
          ? JSON.stringify(state.properties)
          : "";
        const currentProps = block.properties
          ? JSON.stringify(block.properties)
          : "";

        return stateContent === currentContent && stateProps === currentProps;
      };

      const focusedCellPosition = isTableBlock
        ? getFocusedTableCellPosition()
        : null;

      const shouldSkipUndoState = (stateBefore, stateAfter) => {
        if (!stateBefore) return true;

        if (!isTableBlock) {
          return isStateEquivalentToCurrent(stateBefore);
        }

        const changeMeta = stateAfter?.tableChange;

        if (!changeMeta) {
          // Without metadata we don't know which cell changed, so skip this state
          return true;
        }

        if (
          changeMeta.type === "structure" ||
          changeMeta.type === "multi-cell"
        ) {
          return false;
        }

        if (!focusedCellPosition) {
          return true;
        }

        return (
          changeMeta.row !== focusedCellPosition.row ||
          changeMeta.col !== focusedCellPosition.col
        );
      };

      // For table blocks, allow undo but handle differently
      if (isTableBlock) {
        // Check if we're focused inside a table cell
        const activeElement = document.activeElement;
        const isInsideTableCell =
          activeElement &&
          activeElement.contentEditable === "true" &&
          activeElement.closest(".table-block-container");

        if (!isInsideTableCell) {
          return;
        }
        // Continue with undo for table blocks when focused inside a cell
      }

      // For non-table blocks, check if block element is focused
      // For table blocks, we already verified above that we're focused inside a table cell
      if (
        !isTableBlock &&
        (!blockElement || document.activeElement !== blockElement)
      ) {
        return;
      }

      const history = blockHistoryRef.current[focusedBlockId];

      if (
        !history ||
        history.needsInitialization ||
        history.currentIndex <= 0
      ) {
        return;
      }

      // Capture any pending state before undo
      if (blockTimeoutRef.current[focusedBlockId]) {
        clearTimeout(blockTimeoutRef.current[focusedBlockId]);
        // Immediately capture current state if there was a pending timeout
        addBlockState(focusedBlockId, true);

        // Re-check history after potential state addition
        const updatedHistory = blockHistoryRef.current[focusedBlockId];
        if (
          !updatedHistory ||
          updatedHistory.needsInitialization ||
          updatedHistory.currentIndex <= 0
        ) {
          return;
        }
      }

      isBlockUndoRedoRef.current = true;

      try {
        // Move to previous state
        history.currentIndex--;
        let targetState = history.states[history.currentIndex];

        while (
          targetState &&
          shouldSkipUndoState(
            targetState,
            history.states[history.currentIndex + 1]
          ) &&
          history.currentIndex > 0
        ) {
          history.currentIndex--;
          targetState = history.states[history.currentIndex];
        }

        if (
          !targetState ||
          shouldSkipUndoState(
            targetState,
            history.states[history.currentIndex + 1]
          )
        ) {
          isBlockUndoRedoRef.current = false;
          return;
        }

        // Only update THIS specific block
        if (targetState) {
          const tableChangeMeta = isTableBlock
            ? history.states[history.currentIndex + 1]?.tableChange || null
            : null;
          // For table blocks, save cursor position before state change
          let savedTableCursorPosition = null;
          if (isTableBlock) {
            savedTableCursorPosition = saveTableCursorPosition();

            // Force table to accept undo state by clearing user modification flags
            // This ensures the table useEffect will process the undo operation
            const tableContainer = document.querySelector(
              `[data-block-id="${focusedBlockId}"] .table-block-container`
            );
            if (tableContainer) {
              // Temporarily blur focused elements to allow cell updates during undo
              const focusedCell = document.activeElement;
              if (
                focusedCell &&
                focusedCell.contentEditable === "true" &&
                focusedCell.closest(".table-block-container")
              ) {
                focusedCell.blur();
              }

              // Dispatch a custom event to tell the table to clear its modification flags
              const clearModificationEvent = new CustomEvent(
                "clearTableModification"
              );
              tableContainer.dispatchEvent(clearModificationEvent);

              // Restore focus after a short delay to let updates complete
              setTimeout(() => {
                if (focusedCell && focusedCell.isConnected) {
                  focusedCell.focus();
                  // Place cursor at the end of the content
                  const selection = window.getSelection();
                  if (selection) {
                    const range = document.createRange();
                    range.selectNodeContents(focusedCell);
                    range.collapse(false); // Collapse to end
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                }
              }, 100);
            }
          }

          // For table blocks, don't update innerHTML since they store state in properties
          if (!isTableBlock && blockElement) {
            blockElement.innerHTML = targetState.content;
          }

          let appliedProperties = null;
          let appliedContent = targetState.content;

          // Update React state - only for this specific block
          setBlocks((prev) =>
            prev.map((block) => {
              if (block.id === focusedBlockId) {
                let updatedBlock = { ...block };

                if (isTableBlock) {
                  if (targetState.properties) {
                    if (
                      tableChangeMeta?.type === "cell" &&
                      Array.isArray(targetState.properties.tableData)
                    ) {
                      const currentProps = block.properties || {};
                      const currentTable = Array.isArray(currentProps.tableData)
                        ? currentProps.tableData.map((row) =>
                            Array.isArray(row) ? [...row] : []
                          )
                        : [];
                      const targetTable =
                        targetState.properties.tableData || [];
                      const { row, col } = tableChangeMeta;

                      if (
                        typeof row === "number" &&
                        typeof col === "number" &&
                        currentTable[row]
                      ) {
                        const nextRow = [...currentTable[row]];
                        nextRow[col] = targetTable[row]?.[col] ?? "";
                        currentTable[row] = nextRow;
                      }

                      const propertiesClone = {
                        ...currentProps,
                        tableData: currentTable,
                      };

                      if (targetState.properties.hasHeader !== undefined) {
                        propertiesClone.hasHeader =
                          targetState.properties.hasHeader;
                      }

                      if (Array.isArray(targetState.properties.columnHeaders)) {
                        propertiesClone.columnHeaders = [
                          ...targetState.properties.columnHeaders,
                        ];
                      }

                      if (targetState.properties.columnCounter !== undefined) {
                        propertiesClone.columnCounter =
                          targetState.properties.columnCounter;
                      }

                      appliedProperties = propertiesClone;
                      updatedBlock.properties = propertiesClone;
                    } else {
                      const propertiesClone = JSON.parse(
                        JSON.stringify(targetState.properties)
                      );
                      appliedProperties = propertiesClone;
                      updatedBlock.properties = propertiesClone;
                    }
                  }
                } else {
                  // For non-table blocks, update content and optionally properties
                  updatedBlock.content = targetState.content;
                  if (targetState.properties) {
                    const propertiesClone = JSON.parse(
                      JSON.stringify(targetState.properties)
                    );
                    appliedProperties = propertiesClone;
                    updatedBlock.properties = propertiesClone;
                  } else {
                    appliedProperties = null;
                  }
                }

                return updatedBlock;
              }
              return block;
            })
          );

          if (enableDeltaTracking && deltaTrackerRef.current) {
            const clonedProperties = appliedProperties
              ? JSON.parse(JSON.stringify(appliedProperties))
              : targetState.properties
              ? JSON.parse(JSON.stringify(targetState.properties))
              : undefined;
            if (isTableBlock) {
              deltaTrackerRef.current.updateBlockProperties(
                focusedBlockId,
                clonedProperties || {}
              );
            } else {
              deltaTrackerRef.current.updateBlockContent(
                focusedBlockId,
                appliedContent || ""
              );
              if (clonedProperties) {
                deltaTrackerRef.current.updateBlockProperties(
                  focusedBlockId,
                  clonedProperties
                );
              }
            }
          }

          // For table blocks, restore cursor position after state update
          if (isTableBlock && savedTableCursorPosition) {
            restoreTableCursorPosition(savedTableCursorPosition);
          }

          // Restore selection after DOM updates
          setTimeout(() => {
            if (blockElement) {
              blockElement.focus();
              restoreSelection(blockElement, targetState.selection);
            } else if (isTableBlock) {
              // For table blocks, maintain focus on the currently active table cell
              const activeElement = document.activeElement;
              if (
                activeElement &&
                activeElement.contentEditable === "true" &&
                activeElement.closest(".table-block-container")
              ) {
                activeElement.focus();
              }
            }
          }, 0);

          // Reset the flag after React state updates complete
          // Auto-save will trigger naturally via useEffect when flag is cleared
          // Extended timeout to ensure save process completes before clearing flag
          setTimeout(() => {
            isBlockUndoRedoRef.current = false;
            scheduleAutoSave();
          }, 1500);

          showNotification(`Undone in block`, "success", 1000);
        }
      } catch (error) {
        console.error("Block undo failed:", error);
        isBlockUndoRedoRef.current = false;
      }
    }, [
      blocks,
      enableDeltaTracking,
      getCurrentlyFocusedBlockId,
      getFocusedTableCellPosition,
      restoreSelection,
      restoreTableCursorPosition,
      saveTableCursorPosition,
      scheduleAutoSave,
      showNotification,
      onSave,
      title,
    ]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleBlockRedo = useCallback(() => {
      // Clear command delete and rapid delete flags to allow redo to restore content
      commandDeleteActiveRef.current = false;
      rapidDeleteModeRef.current = false;
      if (rapidDeleteTimeoutRef.current) {
        clearTimeout(rapidDeleteTimeoutRef.current);
        rapidDeleteTimeoutRef.current = null;
      }

      // Get the currently focused block, not just the stored activeBlockId
      const focusedBlockId = getCurrentlyFocusedBlockId();

      if (!focusedBlockId) {
        return;
      }

      // Check if this is a table block
      const block = blocks.find((b) => b.id === focusedBlockId);
      const isTableBlock = block?.type === "table";

      // For table blocks, allow redo but handle differently
      if (isTableBlock) {
        // Check if we're focused inside a table cell
        const activeElement = document.activeElement;
        const isInsideTableCell =
          activeElement &&
          activeElement.contentEditable === "true" &&
          activeElement.closest(".table-block-container");

        if (!isInsideTableCell) {
          return;
        }
        // Continue with redo for table blocks when focused inside a cell
      }

      // Verify the block element exists and is focused
      const blockElement = blockRefs.current[focusedBlockId]?.element;

      // For non-table blocks, check if block element is focused
      // For table blocks, we already verified above that we're focused inside a table cell
      if (
        !isTableBlock &&
        (!blockElement || document.activeElement !== blockElement)
      ) {
        return;
      }

      const history = blockHistoryRef.current[focusedBlockId];

      if (
        !history ||
        history.needsInitialization ||
        history.currentIndex >= history.states.length - 1
      ) {
        return;
      }

      // Clear any pending timeouts that might interfere
      if (blockTimeoutRef.current[focusedBlockId]) {
        clearTimeout(blockTimeoutRef.current[focusedBlockId]);
      }

      isBlockUndoRedoRef.current = true;

      try {
        // Move to next state
        history.currentIndex++;
        let targetState = history.states[history.currentIndex];
        const focusedCellPosition = isTableBlock
          ? getFocusedTableCellPosition()
          : null;

        const isStateEquivalentToCurrent = (state) => {
          if (!state || !block) return false;

          if (block.type === "table") {
            const currentProps = block.properties || {};
            const stateProps = state.properties || {};

            const currentTable = Array.isArray(currentProps.tableData)
              ? currentProps.tableData
              : [];
            const stateTable = Array.isArray(stateProps.tableData)
              ? stateProps.tableData
              : [];

            const tableMatches =
              JSON.stringify(stateTable) === JSON.stringify(currentTable);
            const headerMatches =
              Boolean(stateProps.hasHeader) === Boolean(currentProps.hasHeader);
            const headersMatch =
              JSON.stringify(stateProps.columnHeaders || []) ===
              JSON.stringify(currentProps.columnHeaders || []);
            const counterMatch =
              (stateProps.columnCounter ?? currentProps.columnCounter ?? 0) ===
              (currentProps.columnCounter ?? 0);

            return (
              tableMatches && headerMatches && headersMatch && counterMatch
            );
          }

          const stateContent = state.content ?? "";
          const currentContent = block.content ?? "";
          const stateProps = state.properties
            ? JSON.stringify(state.properties)
            : "";
          const currentProps = block.properties
            ? JSON.stringify(block.properties)
            : "";

          return stateContent === currentContent && stateProps === currentProps;
        };

        const shouldSkipRedoState = (state) => {
          if (!state) return true;

          if (!isTableBlock) {
            return isStateEquivalentToCurrent(state);
          }

          const meta = state.tableChange;

          if (!meta) {
            return true;
          }

          if (meta.type === "structure" || meta.type === "multi-cell") {
            return false;
          }

          if (!focusedCellPosition) {
            return true;
          }

          return (
            meta.row !== focusedCellPosition.row ||
            meta.col !== focusedCellPosition.col
          );
        };

        while (
          targetState &&
          shouldSkipRedoState(targetState) &&
          history.currentIndex < history.states.length - 1
        ) {
          history.currentIndex++;
          targetState = history.states[history.currentIndex];
        }

        if (!targetState || shouldSkipRedoState(targetState)) {
          isBlockUndoRedoRef.current = false;
          return;
        }

        // Only update THIS specific block
        if (targetState) {
          // For table blocks, save cursor position before state change
          let savedTableCursorPosition = null;
          if (isTableBlock) {
            savedTableCursorPosition = saveTableCursorPosition();
            // Force table to accept redo state by clearing user modification flags
            // This ensures the table useEffect will process the redo operation
            const tableContainer = document.querySelector(
              `[data-block-id="${focusedBlockId}"] .table-block-container`
            );
            if (tableContainer) {
              // Temporarily blur focused elements to allow cell updates during redo
              const focusedCell = document.activeElement;
              if (
                focusedCell &&
                focusedCell.contentEditable === "true" &&
                focusedCell.closest(".table-block-container")
              ) {
                focusedCell.blur();
              }
              // Dispatch a custom event to tell the table to clear its modification flags
              const clearModificationEvent = new CustomEvent(
                "clearTableModification"
              );
              tableContainer.dispatchEvent(clearModificationEvent);
              // Restore focus after a short delay to let updates complete
              setTimeout(() => {
                if (focusedCell && document.body.contains(focusedCell)) {
                  focusedCell.focus();
                }
              }, 100);
            }
          }

          // For table blocks, don't update innerHTML since they store state in properties
          if (!isTableBlock && blockElement) {
            blockElement.innerHTML = targetState.content;
          }

          const tableChangeMeta = isTableBlock
            ? targetState?.tableChange
            : null;
          let appliedProperties = null;
          let appliedContent = targetState.content;

          // Update React state - only for this specific block
          setBlocks((prev) =>
            prev.map((block) => {
              if (block.id === focusedBlockId) {
                let updatedBlock = { ...block };

                if (isTableBlock) {
                  if (targetState.properties) {
                    if (
                      tableChangeMeta?.type === "cell" &&
                      Array.isArray(targetState.properties.tableData)
                    ) {
                      const currentProps = block.properties || {};
                      const currentTable = Array.isArray(currentProps.tableData)
                        ? currentProps.tableData.map((row) =>
                            Array.isArray(row) ? [...row] : []
                          )
                        : [];
                      const targetTable =
                        targetState.properties.tableData || [];
                      const { row, col } = tableChangeMeta;

                      if (
                        typeof row === "number" &&
                        typeof col === "number" &&
                        currentTable[row]
                      ) {
                        const nextRow = [...currentTable[row]];
                        nextRow[col] = targetTable[row]?.[col] ?? "";
                        currentTable[row] = nextRow;
                      }

                      const propertiesClone = {
                        ...currentProps,
                        tableData: currentTable,
                      };

                      if (targetState.properties.hasHeader !== undefined) {
                        propertiesClone.hasHeader =
                          targetState.properties.hasHeader;
                      }

                      if (Array.isArray(targetState.properties.columnHeaders)) {
                        propertiesClone.columnHeaders = [
                          ...targetState.properties.columnHeaders,
                        ];
                      }

                      if (targetState.properties.columnCounter !== undefined) {
                        propertiesClone.columnCounter =
                          targetState.properties.columnCounter;
                      }

                      appliedProperties = propertiesClone;
                      updatedBlock.properties = propertiesClone;
                    } else {
                      const propertiesClone = JSON.parse(
                        JSON.stringify(targetState.properties)
                      );
                      appliedProperties = propertiesClone;
                      updatedBlock.properties = propertiesClone;
                    }
                  }
                } else {
                  // For non-table blocks, update content and optionally properties
                  updatedBlock.content = targetState.content;
                  if (targetState.properties) {
                    const propertiesClone = JSON.parse(
                      JSON.stringify(targetState.properties)
                    );
                    appliedProperties = propertiesClone;
                    updatedBlock.properties = propertiesClone;
                  } else {
                    appliedProperties = null;
                  }
                }

                return updatedBlock;
              }
              return block;
            })
          );

          if (enableDeltaTracking && deltaTrackerRef.current) {
            const clonedProperties = appliedProperties
              ? JSON.parse(JSON.stringify(appliedProperties))
              : targetState.properties
              ? JSON.parse(JSON.stringify(targetState.properties))
              : undefined;
            if (isTableBlock) {
              deltaTrackerRef.current.updateBlockProperties(
                focusedBlockId,
                clonedProperties || {}
              );
            } else {
              deltaTrackerRef.current.updateBlockContent(
                focusedBlockId,
                appliedContent || ""
              );
              if (clonedProperties) {
                deltaTrackerRef.current.updateBlockProperties(
                  focusedBlockId,
                  clonedProperties
                );
              }
            }
          }

          // For table blocks, restore cursor position after state update
          if (isTableBlock && savedTableCursorPosition) {
            restoreTableCursorPosition(savedTableCursorPosition);
          }

          // Restore selection after DOM updates
          setTimeout(() => {
            if (blockElement) {
              blockElement.focus();
              restoreSelection(blockElement, targetState.selection);
            } else if (isTableBlock) {
              // For table blocks, maintain focus on the currently active table cell
              const activeElement = document.activeElement;
              if (
                activeElement &&
                activeElement.contentEditable === "true" &&
                activeElement.closest(".table-block-container")
              ) {
                activeElement.focus();
              }
            }
          }, 0);

          // Reset the flag after React state updates complete
          // Auto-save will trigger naturally via useEffect when flag is cleared
          // Extended timeout to ensure save process completes before clearing flag
          setTimeout(() => {
            isBlockUndoRedoRef.current = false;
            scheduleAutoSave();
          }, 1500);

          showNotification("Redone in block", "success", 1000);
        }
      } catch (error) {
        console.error("Block redo failed:", error);
        isBlockUndoRedoRef.current = false;
      }
    }, [
      blocks,
      enableDeltaTracking,
      getCurrentlyFocusedBlockId,
      getFocusedTableCellPosition,
      restoreSelection,
      restoreTableCursorPosition,
      saveTableCursorPosition,
      scheduleAutoSave,
      showNotification,
      onSave,
      title,
    ]);

    // Scroll to block
    const scrollToBlock = useCallback(
      (blockId) => {
        const blockRef = blockRefs.current[blockId];
        if (blockRef?.element) {
          blockRef.element.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          setTimeout(() => {
            blockRef.focus("start");
            updateActiveBlockId(blockId);
          }, 300);
        }
      },
      [updateActiveBlockId]
    );

    // Enhanced block change handler with delta tracking and typing detection
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleBlockChange = useCallback(
      (blockId, updates, isTyping = false) => {
        let didChange = false;

        setBlocks((prev) => {
          const blockIndex = prev.findIndex((b) => b.id === blockId);
          if (blockIndex === -1) return prev;

          const oldBlock = prev[blockIndex];

          if (oldBlock?.type !== "table") {
            delete tableChangeMetadataRef.current[blockId];
          }

          // During command+delete operations, prevent restoration of content that was intentionally cleared
          if (
            commandDeleteActiveRef.current &&
            updates.content !== undefined &&
            updates.content !== "" &&
            oldBlock.content === ""
          ) {
            return prev;
          }

          let tableChangeMeta = null;
          if (oldBlock?.type === "table" && updates.properties) {
            const previousProps = oldBlock.properties || {};
            const mergedProps = {
              ...previousProps,
              ...updates.properties,
            };

            tableChangeMeta = computeTableChangeMetadata(
              previousProps,
              mergedProps
            );

            if (tableChangeMeta) {
              tableChangeMetadataRef.current[blockId] = tableChangeMeta;
            } else {
              delete tableChangeMetadataRef.current[blockId];
            }
          }

          const newBlock = { ...oldBlock, ...updates };

          const contentChanged =
            updates.content !== undefined &&
            updates.content !== oldBlock.content;
          const typeChanged =
            updates.type !== undefined && updates.type !== oldBlock.type;
          const propertiesChanged =
            updates.properties !== undefined &&
            JSON.stringify(updates.properties) !==
              JSON.stringify(oldBlock.properties);

          if (contentChanged || typeChanged || propertiesChanged) {
            didChange = true;
          }

          if (updates.content !== undefined) {
            const sanitized = sanitizeHtmlContent(
              typeof updates.content === "string" ? updates.content : ""
            );
            if (sanitized) {
              delete listConversionRef.current[blockId];
            }
          }

          // Add to block history when content changes
          if (contentChanged) {
            const oldLength = oldBlock.content ? oldBlock.content.length : 0;
            const newLength = updates.content ? updates.content.length : 0;
            const deletedChars = oldLength - newLength;

            if (deletedChars > 0) {
              addBlockState(blockId, true);
            } else {
              addBlockState(blockId);
            }
          }

          // Also track properties changes for table blocks (table cell content is stored in properties)
          if (propertiesChanged && oldBlock.type === "table") {
            addBlockState(blockId);
          }

          // Also track properties changes for TODO blocks (checkbox state is stored in properties)
          if (propertiesChanged && oldBlock.type === BlockType.TODO) {
            addBlockState(blockId);
          }

          if (
            enableDeltaTracking &&
            deltaTrackerRef.current &&
            !isBlockUndoRedoRef.current
          ) {
            let hasChanges = false;

            if (contentChanged) {
              deltaTrackerRef.current.updateBlockContent(
                blockId,
                updates.content
              );
              hasChanges = true;
            }
            if (typeChanged) {
              deltaTrackerRef.current.updateBlockType(blockId, updates.type);
              hasChanges = true;
            }
            if (propertiesChanged) {
              deltaTrackerRef.current.updateBlockProperties(
                blockId,
                updates.properties
              );
              hasChanges = true;
            }

            if (hasChanges) {
              setTimeout(
                () => {
                  const changeset = deltaTrackerRef.current.generateChangeset();
                  if (changeset) {
                    stableDebouncedCallback(changeset, isTyping);
                  }
                },
                isTyping ? 200 : 50
              );
            }
          }

          return prev.map((block) => (block.id === blockId ? newBlock : block));
        });

        if (didChange) {
          trackContentChange();
        }
      },
      [
        enableDeltaTracking,
        stableDebouncedCallback,
        addBlockState,
        computeTableChangeMetadata,
        getCurrentlyFocusedBlockId,
        trackContentChange,
      ]
    );

    // Copy block
    const handleCopyBlock = useCallback(
      async (blockId) => {
        const block = blocks.find((b) => b.id === blockId);
        if (!block) return;

        const template = cleanBlockForClipboard(block);
        if (!template) {
          showNotification("Unable to copy block", "error", 2000);
          return;
        }

        const plainText = getPlainTextForBlock(block);
        const { structured } = await writeBlocksToClipboard(
          [template],
          plainText
        );
        lastClipboardWriteSuccessfulRef.current = structured;

        if (template) {
          setClipboard({
            type: "blocks",
            formatVersion: BLOCK_CLIPBOARD_FORMAT_VERSION,
            blocks: [template],
          });
        }

        showNotification("Block copied", "success", 2000);
      },
      [blocks, showNotification]
    );

    // Handle block type changes with delta tracking
    const handleBlockTypeChange = useCallback(
      (blockId, requestedType) => {
        if (!blockId || !requestedType) {
          return;
        }

        const selectionSet = selectedBlockIdsRef.current;
        const selectionSize = selectionSet ? selectionSet.size : 0;
        const selectionIds =
          selectionSize > 0 ? Array.from(selectionSet) : [];
        const applyToSelection =
          selectionSize > 0 &&
          MULTI_BLOCK_FORMATTABLE_TYPES.has(requestedType);

        const targetIds = applyToSelection
          ? selectionIds
          : blockId
          ? [blockId]
          : [];
        const targetIdSet = new Set(targetIds.filter(Boolean));

        if (targetIdSet.size === 0) {
          return;
        }

        const createDefaultTableProperties = () => ({
          tableData: [
            ["Header 1", "Header 2", "Header 3"],
            ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"],
            ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"],
          ],
          hasHeader: true,
        });

        const tableToPlainText = (properties) => {
          const rows = properties?.tableData;
          if (!Array.isArray(rows) || rows.length === 0) {
            return "";
          }

          return rows
            .map((row) => {
              if (!Array.isArray(row)) {
                return "";
              }

              return row
                .map((cell) => {
                  if (typeof cell !== "string") {
                    return getPlainTextFromHtml(String(cell || ""));
                  }
                  return getPlainTextFromHtml(cell || "");
                })
                .join(" | ");
            })
            .join("\n");
        };

        const transformBlock = (block, targetType) => {
          const originalContent = block.content || "";
          const originalProperties = block.properties || {};

          let nextContent = originalContent;
          let nextProperties = {};

          if (targetType === BlockType.TEXT) {
            let plainText =
              block.type === BlockType.TABLE
                ? tableToPlainText(originalProperties)
                : getPlainTextFromHtml(originalContent);

            plainText = plainText ? plainText.trim() : "";
            nextContent = convertPlainTextToHtml(plainText);
            nextProperties = {};
          } else if (targetType === BlockType.TABLE) {
            nextContent = "";
            nextProperties =
              block.type === BlockType.TABLE && originalProperties
                ? { ...originalProperties }
                : createDefaultTableProperties();
          } else if (LIST_BLOCK_TYPES.has(targetType)) {
            let listText = getPlainTextFromHtml(originalContent);

            listText = listText
              .replace(/^\s*\d+[\.\)]\s+/gm, "")
              .replace(/^\s*[*\-•·‣⁃]\s+/gm, "")
              .replace(/^\s*\[\s*[x✓✗☐☑☒]?\s*\]\s*/gm, "")
              .replace(/^\s*[☐☑✓✗]\s+/gm, "")
              .replace(/^\s+/gm, "")
              .trim();

            nextContent = convertPlainTextToHtml(listText);
            nextProperties =
              targetType === BlockType.TODO
                ? {
                    checked:
                      block.type === BlockType.TODO
                        ? Boolean(originalProperties.checked)
                        : false,
                  }
                : {};
          } else if (targetType === BlockType.CALLOUT) {
            nextContent = sanitizeHtmlContent(originalContent);
            nextProperties =
              block.type === BlockType.CALLOUT && originalProperties
                ? { ...originalProperties }
                : {
                    type: "info",
                    title: "Info",
                    icon: null,
                    collapsible: false,
                    collapsed: false,
                  };
          } else if (targetType === BlockType.IMAGE) {
            nextContent = "";
            nextProperties = {
              url: "",
              filename: "",
              originalName: "",
              alt: "Image",
              width: "800px",
              height: "auto",
              alignment: "left",
              caption: "",
            };
          } else {
            nextContent = sanitizeHtmlContent(originalContent);
            nextProperties = {};
          }

          const typeChanged = block.type !== targetType;
          const contentChanged = nextContent !== originalContent;
          const propertiesChanged =
            JSON.stringify(block.properties || {}) !==
            JSON.stringify(nextProperties || {});

          if (!typeChanged && !contentChanged && !propertiesChanged) {
            return {
              updatedBlock: block,
              changed: false,
              typeChanged: false,
              contentChanged: false,
              propertiesChanged: false,
            };
          }

          return {
            updatedBlock: {
              ...block,
              type: targetType,
              content: nextContent,
              properties: nextProperties,
            },
            changed: true,
            typeChanged,
            contentChanged,
            propertiesChanged,
          };
        };

        let changeSummary = null;

        setBlocks((prev) => {
          const currentTargets = prev.filter((block) =>
            targetIdSet.has(block.id)
          );

          if (!currentTargets.length) {
            return prev;
          }

          const toggledOff =
            currentTargets.length > 0 &&
            currentTargets.every(
              (block) => block.type === requestedType
            ) &&
            MULTI_BLOCK_FORMATTABLE_TYPES.has(requestedType);

          const effectiveType = toggledOff ? BlockType.TEXT : requestedType;

          let changes = 0;

          const nextBlocks = prev.map((block) => {
            if (!targetIdSet.has(block.id)) {
              return block;
            }

            const {
              updatedBlock,
              changed,
              typeChanged,
              contentChanged,
              propertiesChanged,
            } = transformBlock(block, effectiveType);

            if (!changed) {
              return block;
            }

            changes += 1;

            if (enableDeltaTracking && deltaTrackerRef.current) {
              if (typeChanged) {
                deltaTrackerRef.current.updateBlockType(
                  block.id,
                  updatedBlock.type
                );
              }
              if (contentChanged) {
                deltaTrackerRef.current.updateBlockContent(
                  block.id,
                  updatedBlock.content
                );
              }
              if (propertiesChanged) {
                deltaTrackerRef.current.updateBlockProperties(
                  block.id,
                  updatedBlock.properties
                );
              }
            }

            return updatedBlock;
          });

          if (!changes) {
            return prev;
          }

          changeSummary = {
            count: changes,
            toggledOff,
            effectiveType,
            requestedType,
          };

          return nextBlocks;
        });

        if (changeSummary) {
          trackContentChange();

          if (changeSummary.toggledOff) {
            const label = getBlockTypeLabel(changeSummary.requestedType);
            showNotification(
              changeSummary.count === 1
                ? `Removed ${label} formatting`
                : `Removed ${label} formatting from ${changeSummary.count} blocks`,
              "success",
              2000
            );
          } else {
            const label = getBlockTypeLabel(changeSummary.effectiveType);
            showNotification(
              changeSummary.count === 1
                ? `Applied ${label} formatting`
                : `Applied ${label} formatting to ${changeSummary.count} blocks`,
              "success",
              2000
            );
          }
        }
      },
      [
        enableDeltaTracking,
        trackContentChange,
        showNotification,
      ]
    );

    // Enhanced block actions with delta tracking
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleBlockAction = useCallback(
      (action, blockId) => {
        switch (action) {
          case "delete": {
            if (!blockId) {
              break;
            }

            // Show warning modal if enabled
            if (showDeletionWarning) {
              setDeletionWarningModal({
                isOpen: true,
                blockCount: 1,
                onConfirm: () => {
                  // Close modal
                  setDeletionWarningModal({
                    isOpen: false,
                    blockCount: 0,
                    onConfirm: null,
                  });

                  // Store focus target info
                  const focusInfo = { id: null, position: "end" };

                  // Perform the actual deletion logic
                  setBlocks((prev) => {
                    const currentIndex = prev.findIndex((b) => b.id === blockId);
                    if (currentIndex === -1) {
                      return prev;
                    }

                    let nextBlocks;
                    if (prev.length > 1) {
                      nextBlocks = [
                        ...prev.slice(0, currentIndex),
                        ...prev.slice(currentIndex + 1),
                      ];

                      if (currentIndex > 0) {
                        const targetIndex = Math.min(
                          currentIndex - 1,
                          nextBlocks.length - 1
                        );
                        focusInfo.id =
                          nextBlocks[targetIndex]?.id ?? nextBlocks[0]?.id ?? null;
                        focusInfo.position = "end";
                      } else {
                        focusInfo.id = nextBlocks[0]?.id ?? null;
                        focusInfo.position = "start";
                      }
                    } else {
                      const newBlock = createBlock(BlockType.TEXT, "");
                      focusInfo.id = newBlock.id;
                      focusInfo.position = "start";
                      nextBlocks = [newBlock];

                      // Insert the new block in delta tracker
                      if (enableDeltaTracking && deltaTrackerRef.current) {
                        deltaTrackerRef.current.insertBlock(newBlock, 0);
                      }
                    }

                    // Delete block in delta tracker
                    if (enableDeltaTracking && deltaTrackerRef.current) {
                      deltaTrackerRef.current.deleteBlock(blockId);
                    }

                    return nextBlocks;
                  });

                  // Handle side effects after state update
                  setTimeout(() => {
                    if (focusInfo.id) {
                      updateActiveBlockId(focusInfo.id);
                      blockRefs.current[focusInfo.id]?.focus(focusInfo.position);
                    } else {
                      updateActiveBlockId(null);
                    }
                  }, 0);

                  showNotification("Block deleted", "success");
                  trackContentChange();
                },
              });
              break;
            }

            let focusTargetId = null;
            let focusPosition = "end";
            let replacementBlock = null;
            let didDelete = false;

            setBlocks((prev) => {
              const currentIndex = prev.findIndex((b) => b.id === blockId);
              if (currentIndex === -1) {
                return prev;
              }

              didDelete = true;

              if (prev.length > 1) {
                const nextBlocks = [
                  ...prev.slice(0, currentIndex),
                  ...prev.slice(currentIndex + 1),
                ];

                if (currentIndex > 0) {
                  const targetIndex = Math.min(
                    currentIndex - 1,
                    nextBlocks.length - 1
                  );
                  focusTargetId =
                    nextBlocks[targetIndex]?.id ?? nextBlocks[0]?.id ?? null;
                  focusPosition = "end";
                } else {
                  focusTargetId = nextBlocks[0]?.id ?? null;
                  focusPosition = "start";
                }

                return nextBlocks;
              }

              const newBlock = createBlock(BlockType.TEXT, "");
              replacementBlock = newBlock;
              focusTargetId = newBlock.id;
              focusPosition = "start";
              return [newBlock];
            });

            if (!didDelete) {
              break;
            }

            if (enableDeltaTracking && deltaTrackerRef.current) {
              deltaTrackerRef.current.deleteBlock(blockId);
              if (replacementBlock) {
                deltaTrackerRef.current.insertBlock(replacementBlock, 0);
              }
            }

            if (focusTargetId) {
              updateActiveBlockId(focusTargetId);
              setTimeout(
                () => blockRefs.current[focusTargetId]?.focus(focusPosition),
                0
              );
            } else {
              updateActiveBlockId(null);
            }

            showNotification("Block deleted", "success");
            trackContentChange();
            break;
          }

          case "clearAll":
            setConfirmationModal({
              isOpen: true,
              title: "Clear All Content",
              message:
                "Are you sure you want to delete all content? This action cannot be undone.",
              onConfirm: () => {
                // Clear all blocks and create a single empty text block
                const newBlock = createBlock(BlockType.TEXT, "");

                // Force immediate state update
                setBlocks([newBlock]);

                // Note: Not clearing title - only clearing content

                // Force delta tracking to save the changes
                if (
                  enableDeltaTracking &&
                  deltaTrackerRef.current &&
                  onDeltaChange
                ) {
                  // Process each block deletion through delta tracker
                  blocks.forEach((block) => {
                    deltaTrackerRef.current.deleteBlock(block.id);
                  });

                  // Insert the new empty block
                  deltaTrackerRef.current.insertBlock(newBlock, 0);

                  // Generate and send changeset
                  const changeset = deltaTrackerRef.current.generateChangeset();
                  if (changeset && onDeltaChange) {
                    onDeltaChange(changeset, false);
                  }
                }

                // 3. Force window/browser storage update
                if (typeof window !== "undefined" && window.localStorage) {
                  try {
                    // Clear any cached note data
                    const noteId = window.location.pathname.split("/").pop();
                    if (noteId) {
                      window.localStorage.removeItem(`note_${noteId}`);
                      window.localStorage.removeItem(`note_cache_${noteId}`);
                    }
                  } catch (e) {
                    console.warn("Could not clear localStorage:", e);
                  }
                }

                // Focus the new block after clearing
                setTimeout(() => {
                  if (blockRefs.current[newBlock.id]) {
                    blockRefs.current[newBlock.id].focus("start");
                  }
                }, 0);

                showNotification(
                  "All content cleared and saved",
                  "success",
                  3000
                );
                trackContentChange();
                setConfirmationModal({
                  isOpen: false,
                  onConfirm: null,
                  title: "",
                  message: "",
                });
              },
            });
            break;

          case "duplicate":
            const blockToDuplicate = blocks.find((b) => b.id === blockId);
            if (blockToDuplicate) {
              const newBlock = createBlock(
                blockToDuplicate.type,
                blockToDuplicate.content,
                blockToDuplicate.properties
              );
              const index = blocks.findIndex((b) => b.id === blockId) + 1;

              if (enableDeltaTracking && deltaTrackerRef.current) {
                deltaTrackerRef.current.insertBlock(newBlock, index);
              }

              setBlocks((prev) => [
                ...prev.slice(0, index),
                newBlock,
                ...prev.slice(index),
              ]);
              showNotification("Block duplicated", "success");
              trackContentChange();
            }
            break;

          case "moveUp":
            const upIndex = blocks.findIndex((b) => b.id === blockId);
            if (upIndex > 0) {
              // Store cursor position before movement
              const currentElement = document.activeElement;
              let cursorPosition = 0;
              let wasFocused = false;

              if (currentElement && currentElement.isContentEditable) {
                const blockElement = currentElement.closest(
                  `[data-block-id="${blockId}"]`
                );
                if (blockElement) {
                  wasFocused = true;
                  const selection = window.getSelection();
                  if (selection.rangeCount > 0) {
                    cursorPosition = selection.getRangeAt(0).startOffset;
                  }
                }
              }

              if (enableDeltaTracking && deltaTrackerRef.current) {
                deltaTrackerRef.current.moveBlock(
                  blockId,
                  upIndex,
                  upIndex - 1
                );

                // Generate and send changeset immediately for block moves
                const changeset = deltaTrackerRef.current.generateChangeset();
                if (changeset && onDeltaChange) {
                  onDeltaChange(changeset, false);
                }
              }

              setBlocks((prev) => {
                const newBlocks = [...prev];
                [newBlocks[upIndex - 1], newBlocks[upIndex]] = [
                  newBlocks[upIndex],
                  newBlocks[upIndex - 1],
                ];
                return newBlocks;
              });

              // Set active block immediately
              updateActiveBlockId(blockId);
              trackContentChange();

              // Scroll the block into view after it moves
              setTimeout(() => {
                const blockRef = blockRefs.current[blockId];
                if (blockRef?.element) {
                  blockRef.element.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }
              }, 0);
            }
            break;

          case "moveDown":
            const downIndex = blocks.findIndex((b) => b.id === blockId);
            if (downIndex < blocks.length - 1) {
              // Store cursor position before movement
              const currentElement = document.activeElement;
              let cursorPosition = 0;
              let wasFocused = false;

              if (currentElement && currentElement.isContentEditable) {
                const blockElement = currentElement.closest(
                  `[data-block-id="${blockId}"]`
                );
                if (blockElement) {
                  wasFocused = true;
                  const selection = window.getSelection();
                  if (selection.rangeCount > 0) {
                    cursorPosition = selection.getRangeAt(0).startOffset;
                  }
                }
              }

              if (enableDeltaTracking && deltaTrackerRef.current) {
                deltaTrackerRef.current.moveBlock(
                  blockId,
                  downIndex,
                  downIndex + 1
                );

                // Generate and send changeset immediately for block moves
                const changeset = deltaTrackerRef.current.generateChangeset();
                if (changeset && onDeltaChange) {
                  onDeltaChange(changeset, false);
                }
              }

              setBlocks((prev) => {
                const newBlocks = [...prev];
                [newBlocks[downIndex], newBlocks[downIndex + 1]] = [
                  newBlocks[downIndex + 1],
                  newBlocks[downIndex],
                ];
                return newBlocks;
              });

              // Set active block immediately
              updateActiveBlockId(blockId);
              trackContentChange();

              // Scroll the block into view after it moves
              setTimeout(() => {
                const blockRef = blockRefs.current[blockId];
                if (blockRef?.element) {
                  blockRef.element.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }
              }, 0);
            }
            break;
        }
      },
      [
        blocks,
        showNotification,
        enableDeltaTracking,
        onDeltaChange,
        trackContentChange,
        updateActiveBlockId,
        showDeletionWarning,
        setDeletionWarningModal,
        setShowDeletionWarning,
      ]
    );

    // Navigate between blocks and title
    const navigateToBlock = useCallback(
      (direction, fromBlockId, cursorPosition = "end") => {
        const currentIndex = blocks.findIndex((b) => b.id === fromBlockId);

        if (direction === "up") {
          if (currentIndex > 0) {
            const prevBlock = blocks[currentIndex - 1];
            setTimeout(
              () => blockRefs.current[prevBlock.id]?.focus(cursorPosition),
              0
            );
          } else if (titleRef.current) {
            titleRef.current.focus();
          }
        } else if (direction === "down") {
          if (currentIndex < blocks.length - 1) {
            const nextBlock = blocks[currentIndex + 1];
            setTimeout(
              () => blockRefs.current[nextBlock.id]?.focus(cursorPosition),
              0
            );
          }
        }
      },
      [blocks]
    );

    // Auto-resize title textarea
    const resizeTitleTextarea = useCallback(() => {
      if (titleRef.current) {
        titleRef.current.style.height = "auto";
        titleRef.current.style.height = titleRef.current.scrollHeight + "px";
      }
    }, []);

    // Handle title key down
    const handleTitleKeyDown = useCallback(
      (e) => {
        const session = titleHistorySessionRef.current;
        const now = Date.now();
        const isCutOrPaste =
          (e.metaKey || e.ctrlKey) &&
          (e.key === "V" || e.key === "v" || e.key === "X" || e.key === "x");

        if (
          (e.metaKey || e.ctrlKey) &&
          (e.key === "Backspace" || e.key === "Delete")
        ) {
          e.preventDefault();
          e.stopPropagation();
          session.forceNewEntry = true;
          session.lastKey = null;
          session.lastKeyTime = now;

          const currentValue =
            typeof title === "string"
              ? title
              : title === null || title === undefined
              ? ""
              : String(title);

          if (currentValue.length > 0) {
            handleTitleChange("");
          }

          setTimeout(() => {
            if (titleRef.current) {
              titleRef.current.focus();
              try {
                titleRef.current.setSelectionRange(0, 0);
              } catch (err) {
                // ignore selection errors (e.g., non-text inputs)
              }
            }
          }, 0);

          return;
        }

        if (e.key === "Backspace" || e.key === "Delete") {
          if (
            session.lastKey !== e.key ||
            now - session.lastKeyTime > TITLE_HISTORY_MERGE_WINDOW
          ) {
            session.forceNewEntry = true;
          }
          session.lastKey = e.key;
          session.lastKeyTime = now;
        } else if (e.key === "Enter" || isCutOrPaste) {
          session.forceNewEntry = true;
          session.lastKey = e.key;
          session.lastKeyTime = now;
        } else {
          session.lastKey = null;
        }

        updateActiveBlockId(null);

        if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          if (blocks.length > 0) {
            // Focus immediately if possible, otherwise use timeout as fallback
            if (blockRefs.current[blocks[0].id]?.focus) {
              blockRefs.current[blocks[0].id].focus("start");
            } else {
              setTimeout(
                () => blockRefs.current[blocks[0].id]?.focus("start"),
                0
              );
            }
          }
        }
      },
      [blocks, handleTitleChange, title, updateActiveBlockId]
    );

    // Handle title focus
    const handleTitleFocus = useCallback(() => {
      updateActiveBlockId(null);
    }, [updateActiveBlockId]);

    // Handle block focus to update active block immediately
    const handleBlockFocus = useCallback(
      (blockId) => {
        const selectionSize = selectedBlockIdsRef.current.size;
        const blockIsSelected = selectedBlockIdsRef.current.has(blockId);
        if (selectionSize === 0 || !blockIsSelected) {
          clearBlockSelection();
        }
        updateActiveBlockId(blockId);

        // Initialize block history for this block
        initializeBlockHistory(blockId);

        // Set up event listeners for content tracking
        const blockElement = blockRefs.current[blockId]?.element;
        if (blockElement) {
          // Remove any existing listeners first
          const existingInputHandler = blockElement._inputHandler;
          const existingKeyHandler = blockElement._keyHandler;
          const existingPasteHandler = blockElement._pasteHandler;

          if (existingInputHandler) {
            blockElement.removeEventListener("input", existingInputHandler);
            blockElement.removeEventListener("cut", existingInputHandler);
          }
          if (existingPasteHandler) {
            blockElement.removeEventListener("paste", existingPasteHandler);
          }
          if (existingKeyHandler) {
            blockElement.removeEventListener("keydown", existingKeyHandler);
          }

          // Create input handler
          const handleInput = () => {
            // Mark user as typing
            isUserTypingRef.current = true;

            // Clear existing typing timeout
            if (typingTimeoutRef.current) {
              clearTimeout(typingTimeoutRef.current);
            }

            // Set a timeout to mark user as done typing after 500ms of inactivity
            typingTimeoutRef.current = setTimeout(() => {
              isUserTypingRef.current = false;
            }, 500);

            if (!isBlockUndoRedoRef.current) {
              addBlockState(blockId);
            }
          };

          // Create paste handler for immediate state capture before paste
          const handlePaste = (e) => {
            // Capture state before paste operation
            if (!isBlockUndoRedoRef.current) {
              addBlockState(blockId, true); // Immediate capture
            }
          };

          // Create keydown handler for immediate state capture on certain keys
          const handleKeyDown = (e) => {
            // Mark user as typing for any key press that modifies content
            const isContentModifyingKey =
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey &&
              (e.key.length === 1 ||
                ["Backspace", "Delete", "Enter", "Space"].includes(e.key));

            if (isContentModifyingKey) {
              isUserTypingRef.current = true;

              // Clear existing typing timeout
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
              }

              // Set a timeout to mark user as done typing after 500ms of inactivity
              typingTimeoutRef.current = setTimeout(() => {
                isUserTypingRef.current = false;
              }, 500);
            }

            const isDestructiveKey = ["Backspace", "Delete", "Enter"].includes(
              e.key
            );

            if (isDestructiveKey && !isBlockUndoRedoRef.current) {
              if (!rapidDeleteModeRef.current) {
                addBlockState(blockId, true);
              }

              if (["Backspace", "Delete"].includes(e.key)) {
                rapidDeleteModeRef.current = true;

                if (rapidDeleteTimeoutRef.current) {
                  clearTimeout(rapidDeleteTimeoutRef.current);
                }

                rapidDeleteTimeoutRef.current = setTimeout(() => {
                  rapidDeleteModeRef.current = false;
                }, 500);
              }
            }
          };

          // Store references so we can remove them later
          blockElement._inputHandler = handleInput;
          blockElement._keyHandler = handleKeyDown;
          blockElement._pasteHandler = handlePaste;

          // Add multiple event listeners
          blockElement.addEventListener("input", handleInput);
          blockElement.addEventListener("paste", handlePaste);
          blockElement.addEventListener("cut", handleInput);
          blockElement.addEventListener("keydown", handleKeyDown);
        }

        if (collaborationTracking?.trackActiveBlock) {
          collaborationTracking.trackActiveBlock(blockId);
        }
      },
      [
        collaborationTracking,
        initializeBlockHistory,
        addBlockState,
        updateActiveBlockId,
        clearBlockSelection,
      ]
    );

    // Handle click on specific position in block
    const handleBlockClick = useCallback(
      (blockId, event) => {
        updateActiveBlockId(blockId);
      },
      [updateActiveBlockId]
    );

    // Clear active block when clicking outside
    const handleEditorClick = useCallback(
      (e) => {
        if (selectedBlockIdsRef.current.size > 0) {
          return;
        }

        if (
          e.target === editorRef.current ||
          e.target.classList.contains("editor-container")
        ) {
          clearBlockSelection();
          updateActiveBlockId(null);
        }
      },
      [updateActiveBlockId, clearBlockSelection]
    );

    // Handle clicking the new block zone at the end
    const handleNewBlockZoneClick = useCallback(
      (e) => {
        e.stopPropagation();
        clearBlockSelection();

        const newBlock = createBlock(BlockType.TEXT, "");

        if (enableDeltaTracking && deltaTrackerRef.current) {
          deltaTrackerRef.current.insertBlock(newBlock, blocks.length);
        }

        setBlocks((prev) => [...prev, newBlock]);
        updateActiveBlockId(newBlock.id);

        setTimeout(() => {
          const blockRef = blockRefs.current[newBlock.id];
          if (blockRef) {
            if (blockRef.focus) blockRef.focus("start");
            if (typeof blockRef.setCursorPosition === "function") {
              try {
                blockRef.setCursorPosition(0);
              } catch (err) {
                // ignore
              }
            }
            return;
          }

          // Fallback to DOM-based focus/placement
          const newBlockElement = document.querySelector(
            `[data-block-id="${newBlock.id}"]`
          );
          if (newBlockElement) {
            const contentEditable = newBlockElement.querySelector(
              '[contenteditable="true"]'
            );
            if (contentEditable) {
              contentEditable.focus();
              try {
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(contentEditable, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              } catch (err) {
                // ignore
              }
            }
          }
        }, 0);
      },
      [blocks, enableDeltaTracking, updateActiveBlockId, clearBlockSelection]
    );

    // Enhanced keyboard handling for new block creation with delta tracking
    const handleKeyDown = useCallback(
      (e, blockId, options = {}) => {
        updateActiveBlockId(blockId);

        if (options.navigateBlocks) {
          const direction = e.key === "ArrowUp" ? "up" : "down";
          const cursorPosition = direction === "up" ? "end" : "start";
          navigateToBlock(direction, blockId, cursorPosition);
          return;
        }

        if (options.handlePaste && options.pastedLines) {
          const blockIndex = blocks.findIndex((b) => b.id === blockId);
          const newBlocks = [];

          options.pastedLines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (trimmedLine || index === options.pastedLines.length - 1) {
              const newBlock = createBlock(BlockType.TEXT, trimmedLine);
              newBlocks.push(newBlock);

              if (enableDeltaTracking && deltaTrackerRef.current) {
                deltaTrackerRef.current.insertBlock(
                  newBlock,
                  blockIndex + index + 1
                );
              }
            }
          });

          setBlocks((prev) => [
            ...prev.slice(0, blockIndex + 1),
            ...newBlocks,
            ...prev.slice(blockIndex + 1),
          ]);

          if (newBlocks.length > 0) {
            setTimeout(() => {
              const lastBlock = newBlocks[newBlocks.length - 1];
              blockRefs.current[lastBlock.id]?.focus("end");
            }, 50);
          }

          showNotification(
            `Created ${newBlocks.length} new blocks from paste`,
            "success",
            2000
          );
          return;
        }

        if (options.closeSlash && slashMenuState.isOpen) {
          setSlashMenuState((prev) => ({ ...prev, isOpen: false }));
          return;
        }

        if (options.triggerSlash) {
          const blockElement = blockRefs.current[blockId]?.element;
          if (blockElement) {
            const textContent = blockElement.textContent || "";
            const selection = window.getSelection();

            if (selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);

              // Get absolute cursor position in contentEditable element
              const preCaretRange = range.cloneRange();
              preCaretRange.selectNodeContents(blockElement);
              preCaretRange.setEnd(range.startContainer, range.startOffset);
              const cursorPos = preCaretRange.toString().length;

              let shouldShow = false;
              if (cursorPos === 1 && textContent === "/") {
                shouldShow = true;
              } else if (
                cursorPos >= 2 &&
                textContent[cursorPos - 1] === "/" &&
                textContent[cursorPos - 2] === " "
              ) {
                shouldShow = true;
              }

              if (shouldShow) {
                const rect = blockElement.getBoundingClientRect();
                setSlashMenuState({
                  isOpen: true,
                  position: { top: rect.bottom, left: rect.left },
                  blockId,
                  searchTerm: "",
                  triggerOffset: Math.max(0, cursorPos - 1),
                });

                const hasSeenTip = localStorage.getItem("slashMenuTipSeen");
                if (!hasSeenTip) {
                  showNotification(
                    "💡 Tip: You can search blocks or click to select!",
                    "info",
                    5000
                  );
                  localStorage.setItem("slashMenuTipSeen", "true");
                }
              }
            }
          }
          return;
        }

        if (options.handleDelete) {
          const blockIndex = blocks.findIndex((b) => b.id === blockId);
          if (blockIndex < blocks.length - 1) {
            const currentBlock = blocks[blockIndex];
            const nextBlock = blocks[blockIndex + 1];
            const currentElement = blockRefs.current[blockId]?.element;
            const nextElement = blockRefs.current[nextBlock.id]?.element;

            const currentContent = getElementHtmlContent(
              currentElement,
              currentBlock.content || ""
            );
            const nextContent = getElementHtmlContent(
              nextElement,
              nextBlock.content || ""
            );

            // Skip block merging during rapid delete mode ONLY if both blocks have content
            if (
              rapidDeleteModeRef.current &&
              currentContent !== "" &&
              nextContent !== ""
            ) {
              return;
            }

            const mergedContent = `${currentContent}${nextContent}`;

            if (enableDeltaTracking && deltaTrackerRef.current) {
              deltaTrackerRef.current.updateBlockContent(
                blockId,
                mergedContent
              );
              deltaTrackerRef.current.deleteBlock(nextBlock.id);
            }

            handleBlockChange(blockId, { content: mergedContent });
            setBlocks((prev) => prev.filter((b) => b.id !== nextBlock.id));

            if (nextElement) {
              nextElement.innerHTML = "";
            }

            delete listConversionRef.current[nextBlock.id];

            // Focus immediately if possible, otherwise use timeout as fallback
            if (blockRefs.current[blockId]?.focus) {
              blockRefs.current[blockId].focus("end");
            } else {
              setTimeout(() => blockRefs.current[blockId]?.focus("end"), 0);
            }
          }
          return;
        }

        if (options.handleBackspace) {
          const blockIndex = blocks.findIndex((b) => b.id === blockId);
          if (blockIndex === -1) {
            return;
          }
          const currentBlock = blocks[blockIndex];
          const currentElement = blockRefs.current[blockId]?.element;
          const currentContent = getElementHtmlContent(
            currentElement,
            currentBlock?.content || ""
          );
          const isCurrentBlockEmpty = currentContent === "";

          // Skip block merging during rapid delete mode ONLY if the current block has content
          if (rapidDeleteModeRef.current && !isCurrentBlockEmpty) {
            return;
          }
          const shouldDowngradeToText =
            currentBlock &&
            [
              BlockType.HEADING1,
              BlockType.HEADING2,
              BlockType.HEADING3,
              BlockType.BULLET_LIST,
              BlockType.NUMBERED_LIST,
              BlockType.TODO,
              BlockType.QUOTE,
            ].includes(currentBlock.type);
          const now = Date.now();
          const lastConversion = listConversionRef.current[blockId] || 0;
          const convertedRecently = now - lastConversion < 400;

          if (
            currentBlock &&
            isCurrentBlockEmpty &&
            shouldDowngradeToText &&
            !convertedRecently
          ) {
            listConversionRef.current[blockId] = now;
            handleBlockChange(blockId, { type: BlockType.TEXT, content: "" });
            // Focus immediately if possible, otherwise use timeout as fallback
            if (blockRefs.current[blockId]?.focus) {
              blockRefs.current[blockId].focus("end");
            } else {
              setTimeout(() => blockRefs.current[blockId]?.focus("end"), 0);
            }
            return;
          }

          if (blocks.length > 1 && blockIndex > 0) {
            const prevBlock = blocks[blockIndex - 1];
            const prevElement = blockRefs.current[prevBlock.id]?.element;
            const prevContent = getElementHtmlContent(
              prevElement,
              prevBlock.content || ""
            );
            const mergeContent = currentContent;
            const combinedContent = `${prevContent}${mergeContent}`;

            if (enableDeltaTracking && deltaTrackerRef.current) {
              deltaTrackerRef.current.updateBlockContent(
                prevBlock.id,
                combinedContent
              );
              deltaTrackerRef.current.deleteBlock(blockId);
            }

            handleBlockChange(prevBlock.id, {
              content: combinedContent,
            });
            setBlocks((prev) => prev.filter((b) => b.id !== blockId));

            if (currentElement) {
              currentElement.innerHTML = "";
            }

            delete listConversionRef.current[blockId];

            // Focus immediately if possible, otherwise use timeout as fallback
            if (blockRefs.current[prevBlock.id]?.focus) {
              blockRefs.current[prevBlock.id].focus("end");
            } else {
              setTimeout(
                () => blockRefs.current[prevBlock.id]?.focus("end"),
                0
              );
            }
          }
          return;
        }

        // Arrow key navigation removed - let browser handle naturally within blocks
        // Block navigation should be handled by other means (like keyboard shortcuts)

        // Handle Enter with different behavior for lists
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();

          // Get element early for validation and list exit detection
          const currentElement = blockRefs.current[blockId]?.element;
          if (!currentElement || currentElement !== e.target) {
            return;
          }

          // Check if this is a list exit case (empty list item) - bypass debouncing for better UX
          const currentBlock = blocks.find((b) => b.id === blockId);
          const isListBlock =
            currentBlock &&
            (currentBlock.type === BlockType.NUMBERED_LIST ||
              currentBlock.type === BlockType.BULLET_LIST);

          let isEmptyListExit = false;
          if (isListBlock) {
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const textContent = currentElement.textContent || "";
            const cursorPosition = range.startOffset;
            const beforeCursor = textContent.substring(0, cursorPosition);
            const afterCursor = textContent.substring(cursorPosition);
            const currentContent = beforeCursor + afterCursor;
            isEmptyListExit = !currentContent.trim();
          }

          // Apply debouncing for non-list-exit cases
          const now = Date.now();
          if (!isEmptyListExit && now - globalEnterDebounceRef.current < 50) {
            return;
          }

          // Prevent race conditions from rapid Enter key presses
          if (blockCreationInProgressRef.current) {
            return;
          }

          // Helper to reset the flag
          const resetBlockCreationFlag = () => {
            blockCreationInProgressRef.current = false;
          };

          // Set debounce and flag BEFORE any async operations
          globalEnterDebounceRef.current = now;
          blockCreationInProgressRef.current = true;

          const blockIndex = blocks.findIndex((b) => b.id === blockId);

          // Double-check that we still have valid block data
          if (!currentBlock || blockIndex === -1) {
            resetBlockCreationFlag();
            return;
          }

          const selection = window.getSelection();
          const range = selection.getRangeAt(0);

          // Get the current block element (contentEditable div)
          const blockElement =
            e.target.closest('[contenteditable="true"]') || e.target;

          // Calculate cursor position in terms of HTML content
          let beforeCursor = "";
          let afterCursor = "";

          try {
            // Create a range from start of block to cursor position
            const beforeRange = document.createRange();
            beforeRange.setStart(blockElement, 0);
            beforeRange.setEnd(range.startContainer, range.startOffset);

            // Extract HTML content before cursor
            const tempDiv = document.createElement("div");
            tempDiv.appendChild(beforeRange.cloneContents());
            beforeCursor = tempDiv.innerHTML;

            // Create a range from cursor position to end of block
            const afterRange = document.createRange();
            afterRange.setStart(range.startContainer, range.startOffset);
            afterRange.setEnd(blockElement, blockElement.childNodes.length);

            // Extract HTML content after cursor
            const tempDiv2 = document.createElement("div");
            tempDiv2.appendChild(afterRange.cloneContents());
            afterCursor = tempDiv2.innerHTML;
          } catch (error) {
            // Fallback to original method if range operations fail
            console.warn("Range operations failed, using fallback:", error);
            const textContent = blockElement.textContent || "";
            const cursorPosition = range.startOffset;
            beforeCursor = textContent.substring(0, cursorPosition);
            afterCursor = textContent.substring(cursorPosition);
          }

          // For lists: Enter exits list if empty, creates new list item if has content
          if (
            currentBlock.type === BlockType.NUMBERED_LIST ||
            currentBlock.type === BlockType.BULLET_LIST
          ) {
            // Check if there's any content before cursor (what will stay in current block)
            const hasContentBeforeCursor = beforeCursor.trim().length > 0;

            // If there's no content before cursor, handle indentation decrease or exit
            if (!hasContentBeforeCursor) {
              e.preventDefault();
              e.stopPropagation();

              // For bullet and numbered lists with indentation, decrease indent level
              if (
                currentBlock.type === BlockType.BULLET_LIST ||
                currentBlock.type === BlockType.NUMBERED_LIST
              ) {
                const currentIndent = currentBlock.properties?.indentLevel || 0;

                if (currentIndent > 0) {
                  // Decrease indentation level
                  const newIndent = currentIndent - 1;
                  handleBlockChange(blockId, {
                    properties: {
                      ...currentBlock.properties,
                      indentLevel: newIndent,
                    },
                    content: afterCursor,
                  });

                  // Reset flag and focus
                  requestAnimationFrame(() => {
                    blockRefs.current[blockId]?.focus("start");
                    resetBlockCreationFlag();
                  });

                  return;
                }
              }

              // If at indent level 0, convert to text block
              const newTextBlock = createBlock(BlockType.TEXT, afterCursor);

              if (enableDeltaTracking && deltaTrackerRef.current) {
                deltaTrackerRef.current.deleteBlock(blockId);
                deltaTrackerRef.current.insertBlock(newTextBlock, blockIndex);
              }

              setBlocks((prev) =>
                prev.map((block, index) =>
                  index === blockIndex ? newTextBlock : block
                )
              );

              // Focus the new text block - use RAF for fast focus
              updateActiveBlockId(newTextBlock.id);
              requestAnimationFrame(() => {
                const ref = blockRefs.current[newTextBlock.id];
                if (ref) {
                  if (ref.focus) ref.focus("start");
                  if (typeof ref.setCursorPosition === "function") {
                    try {
                      ref.setCursorPosition(0);
                    } catch (err) {}
                  }
                }
                // Reset flag after focus to prevent nested blocks
                resetBlockCreationFlag();
              });
              // Enforce caret at start after a short delay to override late DOM/restore handlers
              setTimeout(() => {
                const ref = blockRefs.current[newTextBlock.id];
                if (ref) {
                  try {
                    if (typeof ref.setCursorPosition === "function") {
                      ref.setCursorPosition(0);
                    } else if (ref.focus) {
                      ref.focus("start");
                    }
                  } catch (e) {}
                  return;
                }

                const el = document.querySelector(
                  `[data-block-id="${newTextBlock.id}"] [contenteditable="true"]`
                );
                if (el) {
                  try {
                    el.focus();
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.setStart(el, 0);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                  } catch (err) {}
                }
              }, 50);

              return;
            }

            // If has content before cursor, create a new list block with the after-cursor content
            handleBlockChange(blockId, { content: beforeCursor });

            // Create new block with same type and preserve indentation for both bullet and numbered lists
            const newBlockProps =
              (currentBlock.type === BlockType.BULLET_LIST ||
                currentBlock.type === BlockType.NUMBERED_LIST) &&
              currentBlock.properties?.indentLevel
                ? { indentLevel: currentBlock.properties.indentLevel }
                : {};

            const newBlock = {
              ...createBlock(currentBlock.type, afterCursor),
              properties: newBlockProps,
            };

            if (enableDeltaTracking && deltaTrackerRef.current) {
              deltaTrackerRef.current.updateBlockContent(blockId, beforeCursor);
              deltaTrackerRef.current.insertBlock(newBlock, blockIndex + 1);
            }

            setBlocks((prev) => [
              ...prev.slice(0, blockIndex + 1),
              newBlock,
              ...prev.slice(blockIndex + 1),
            ]);

            // Focus immediately
            updateActiveBlockId(newBlock.id);

            // Use single RAF for fast focus
            requestAnimationFrame(() => {
              const blockRef = blockRefs.current[newBlock.id];
              if (blockRef) {
                if (blockRef.focus) blockRef.focus("start");
                if (typeof blockRef.setCursorPosition === "function") {
                  try {
                    blockRef.setCursorPosition(0);
                  } catch (err) {}
                }
              }
              // Reset flag after focus to prevent nested blocks
              resetBlockCreationFlag();
            });
            // Enforce caret at start after a short delay to override late DOM/restore handlers
            setTimeout(() => {
              const ref = blockRefs.current[newBlock.id];
              if (ref) {
                try {
                  if (typeof ref.setCursorPosition === "function") {
                    ref.setCursorPosition(0);
                  } else if (ref.focus) {
                    ref.focus("start");
                  }
                } catch (e) {}
                return;
              }

              const el = document.querySelector(
                `[data-block-id="${newBlock.id}"] [contenteditable="true"]`
              );
              if (el) {
                try {
                  el.focus();
                  const range = document.createRange();
                  const sel = window.getSelection();
                  range.setStart(el, 0);
                  range.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(range);
                } catch (err) {}
              }
            }, 50);
            return;
          }

          // For TODO blocks: Enter creates a new TODO block
          if (currentBlock.type === BlockType.TODO) {
            if (!beforeCursor.trim() && !afterCursor.trim()) {
              // If the TODO block is empty, create a new text block and remove the TODO block
              e.preventDefault();
              e.stopPropagation();

              const newTextBlock = createBlock(BlockType.TEXT, "");

              if (enableDeltaTracking && deltaTrackerRef.current) {
                deltaTrackerRef.current.deleteBlock(blockId);
                deltaTrackerRef.current.insertBlock(newTextBlock, blockIndex);
              }

              setBlocks((prev) =>
                prev.map((block, index) =>
                  index === blockIndex ? newTextBlock : block
                )
              );

              // Focus immediately
              updateActiveBlockId(newTextBlock.id);

              // Use single RAF for fast focus
              requestAnimationFrame(() => {
                const blockRef = blockRefs.current[newTextBlock.id];
                if (blockRef && blockRef.focus) {
                  blockRef.focus("start");
                }
                // Reset flag after focus to prevent nested blocks
                resetBlockCreationFlag();
              });
              return;
            }

            handleBlockChange(blockId, { content: beforeCursor });

            // Create a new TODO block with unchecked state
            const newBlock = createBlock(BlockType.TODO, afterCursor, {
              checked: false,
            });

            if (enableDeltaTracking && deltaTrackerRef.current) {
              deltaTrackerRef.current.updateBlockContent(blockId, beforeCursor);
              deltaTrackerRef.current.insertBlock(newBlock, blockIndex + 1);
            }

            setBlocks((prev) => [
              ...prev.slice(0, blockIndex + 1),
              newBlock,
              ...prev.slice(blockIndex + 1),
            ]);

            // Focus immediately
            updateActiveBlockId(newBlock.id);

            // Use single RAF for fast focus
            requestAnimationFrame(() => {
              const blockRef = blockRefs.current[newBlock.id];
              if (blockRef) {
                if (blockRef.focus) blockRef.focus("start");
                if (typeof blockRef.setCursorPosition === "function") {
                  try {
                    blockRef.setCursorPosition(0);
                  } catch (err) {}
                }
              }
              // Reset flag after focus to prevent nested blocks
              resetBlockCreationFlag();
            });
            // Enforce caret at start after a short delay to override late DOM/restore handlers
            setTimeout(() => {
              const ref = blockRefs.current[newBlock.id];
              if (ref) {
                try {
                  if (typeof ref.setCursorPosition === "function") {
                    ref.setCursorPosition(0);
                  } else if (ref.focus) {
                    ref.focus("start");
                  }
                } catch (e) {}
                return;
              }

              const el = document.querySelector(
                `[data-block-id="${newBlock.id}"] [contenteditable="true"]`
              );
              if (el) {
                try {
                  el.focus();
                  const range = document.createRange();
                  const sel = window.getSelection();
                  range.setStart(el, 0);
                  range.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(range);
                } catch (err) {}
              }
            }, 50);
            return;
          }

          // For other block types: regular Enter behavior
          handleBlockChange(blockId, { content: beforeCursor });

          const newBlock = createBlock(BlockType.TEXT, afterCursor);

          if (enableDeltaTracking && deltaTrackerRef.current) {
            deltaTrackerRef.current.updateBlockContent(blockId, beforeCursor);
            deltaTrackerRef.current.insertBlock(newBlock, blockIndex + 1);
          }

          setBlocks((prev) => [
            ...prev.slice(0, blockIndex + 1),
            newBlock,
            ...prev.slice(blockIndex + 1),
          ]);

          // Focus immediately
          updateActiveBlockId(newBlock.id);

          // Use single RAF for fast focus
          requestAnimationFrame(() => {
            const blockRef = blockRefs.current[newBlock.id];
            if (blockRef) {
              if (blockRef.focus) blockRef.focus("start");
              if (typeof blockRef.setCursorPosition === "function") {
                try {
                  blockRef.setCursorPosition(0);
                } catch (err) {}
              }
            }
            // Reset flag after focus to prevent nested blocks
            resetBlockCreationFlag();
          });
          // Enforce caret at start after a short delay to override late DOM/restore handlers
          setTimeout(() => {
            const ref = blockRefs.current[newBlock.id];
            if (ref) {
              try {
                if (typeof ref.setCursorPosition === "function") {
                  ref.setCursorPosition(0);
                } else if (ref.focus) {
                  ref.focus("start");
                }
              } catch (e) {}
              return;
            }

            const el = document.querySelector(
              `[data-block-id="${newBlock.id}"] [contenteditable="true"]`
            );
            if (el) {
              try {
                el.focus();
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(el, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              } catch (err) {}
            }
          }, 50);
          return;
        }

        if (
          slashMenuState.isOpen &&
          e.key !== "ArrowUp" &&
          e.key !== "ArrowDown" &&
          e.key !== "Enter" &&
          e.key !== "Escape"
        ) {
          // Update search term based on block content after a short delay to let the DOM update
          setTimeout(() => {
            const blockElement = blockRefs.current[slashMenuState.blockId]?.element;
            if (blockElement) {
              const textContent = blockElement.textContent || "";
              const slashIndex = slashMenuState.triggerOffset;

              if (slashIndex !== null && slashIndex >= 0) {
                // Extract everything after the slash
                const afterSlash = textContent.substring(slashIndex + 1);

                // If there's a space after the slash, close the menu
                if (afterSlash.includes(" ")) {
                  setSlashMenuState((prev) => ({ ...prev, isOpen: false }));
                  return;
                }

                // Update the search term with what's typed after the slash
                setSlashMenuState((prev) => ({
                  ...prev,
                  searchTerm: afterSlash,
                }));

                // If backspace removed everything including the slash, close menu
                if (textContent.length <= slashIndex) {
                  setSlashMenuState((prev) => ({ ...prev, isOpen: false }));
                }
              }
            }
          }, 0);
        }
      },
      [
        blocks,
        slashMenuState,
        navigateToBlock,
        handleBlockChange,
        enableDeltaTracking,
        showNotification,
        updateActiveBlockId,
      ]
    );

    // Handle slash command selection
    const handleSlashCommandSelect = useCallback(
      (type) => {
        if (slashMenuState.blockId) {
          const block = blocks.find((b) => b.id === slashMenuState.blockId);
          if (block) {
            let content = block.content || "";

            const blockRef = blockRefs.current[slashMenuState.blockId];
            const blockElement = blockRef?.element;
            const elementTextContent = blockElement?.textContent || content;

            const hasStoredOffset =
              typeof slashMenuState.triggerOffset === "number" &&
              slashMenuState.triggerOffset >= 0;

            let removalStart = hasStoredOffset
              ? slashMenuState.triggerOffset
              : elementTextContent.lastIndexOf("/");

            let contentFromElement = content;

            if (removalStart >= 0) {
              const searchLength = slashMenuState.searchTerm?.length || 0;
              let removalLength = 1 + searchLength;

              if (removalStart > 0) {
                const precedingChar = elementTextContent[removalStart - 1];
                if (precedingChar && precedingChar.trim() === "") {
                  removalStart = Math.max(0, removalStart - 1);
                  removalLength += 1;
                }
              }

              if (blockElement) {
                removeTextRangeFromElement(
                  blockElement,
                  removalStart,
                  removalLength
                );
                contentFromElement = getElementHtmlContent(
                  blockElement,
                  content
                );
              } else if (elementTextContent) {
                const beforeSlash = elementTextContent.substring(
                  0,
                  removalStart
                );
                const afterSlash = elementTextContent.substring(
                  removalStart + removalLength
                );
                contentFromElement = sanitizeHtmlContent(
                  beforeSlash + afterSlash
                );
              }

              const plainAfterRemoval = (
                blockElement
                  ? blockElement.textContent || ""
                  : getPlainTextFromHtml(
                      contentFromElement || elementTextContent
                    )
              )
                .replace(ZERO_WIDTH_SPACE_REGEX, "")
                .replace(NBSP_CHAR_REGEX, " ")
                .trim();

              if (!plainAfterRemoval) {
                if (blockElement) {
                  blockElement.textContent = "";
                }
                contentFromElement = "";
              }
            }

            let properties = {};
            if (type === BlockType.TODO) {
              properties = { checked: false };
            } else if (type === BlockType.TABLE) {
              properties = {
                tableData: [
                  ["Header 1", "Header 2", "Header 3"],
                  ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"],
                  ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"],
                ],
                hasHeader: true,
              };
            } else if (type === BlockType.IMAGE) {
              // Clear content and set default image properties
              content = "";
              properties = {
                url: "",
                filename: "",
                originalName: "",
                alt: "Image",
                width: "800px",
                height: "auto",
                alignment: "left",
                caption: "",
              };
            }

            const isListType = [
              BlockType.BULLET_LIST,
              BlockType.NUMBERED_LIST,
              BlockType.TODO,
            ].includes(type);

            if (isListType) {
              const listTextSource = blockElement
                ? blockElement.textContent || ""
                : getPlainTextFromHtml(contentFromElement || "");

              const trimmedListContent = listTextSource
                .replace(ZERO_WIDTH_SPACE_REGEX, "")
                .replace(NBSP_CHAR_REGEX, " ")
                .replace(/^\s+/, "")
                .trimEnd();

              if (blockElement) {
                blockElement.textContent = trimmedListContent;
              }

              content = trimmedListContent;
            } else {
              content = contentFromElement;
            }

            // For list types, clear DOM immediately before state update to prevent flash
            const targetElement = blockElement;

            if (
              targetElement &&
              (type === BlockType.TABLE || type === BlockType.IMAGE)
            ) {
              // Ensure non-text blocks don't briefly show the slash
              targetElement.textContent = "";
            }

            handleBlockChange(slashMenuState.blockId, {
              type,
              content,
              properties,
            });

            setTimeout(() => {
              const blockRef = blockRefs.current[slashMenuState.blockId];

              if (blockRef && blockRef.element) {
                // Double-check DOM is still clean
                if (isListType) {
                  const currentText = blockRef.element.textContent || "";
                  if (currentText.includes("/")) {
                    blockRef.element.innerHTML = content || "";
                  }
                }

                try {
                  blockRef.focus("end");

                  const range = document.createRange();
                  const sel = window.getSelection();

                  if (
                    blockRef.element &&
                    blockRef.element.nodeType === Node.ELEMENT_NODE
                  ) {
                    if (!blockRef.element.childNodes.length) {
                      blockRef.element.appendChild(document.createTextNode(""));
                    }

                    range.selectNodeContents(blockRef.element);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                  }
                } catch (error) {
                  console.warn("Failed to set cursor position:", error);
                  if (blockRef.element) {
                    blockRef.element.focus();
                  }
                }
              }
            }, 50);
          }
        }

        setSlashMenuState({
          isOpen: false,
          position: null,
          blockId: null,
          searchTerm: "",
          triggerOffset: null,
        });
      },
      [slashMenuState, blocks, handleBlockChange]
    );

    // Close slash menu on outside click
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (slashMenuState.isOpen) {
          // Check if click is outside the slash menu
          const slashMenu = document.querySelector('[data-slash-menu="true"]');
          if (slashMenu && !slashMenu.contains(event.target)) {
            setSlashMenuState((prev) => ({ ...prev, isOpen: false }));
          }
        }
      };

      if (slashMenuState.isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
          document.removeEventListener("mousedown", handleClickOutside);
      }
    }, [slashMenuState.isOpen]);

    // Handle formatting
    const handleFormat = useCallback(
      (command) => {
        if (isSelectionInsideCheckedTodo()) {
          return false;
        }

        const highlightColor =
          command === "highlight" ? getHighlightColor() : null;
        const selection = window.getSelection();
        const blockSelectionIds =
          selectedBlockIdsRef.current && selectedBlockIdsRef.current.size > 0
            ? Array.from(selectedBlockIdsRef.current)
            : [];
        const hasTextSelection =
          selection &&
          selection.rangeCount > 0 &&
          selection.toString().trim().length > 0;

        if (blockSelectionIds.length > 0 && !hasTextSelection) {
          const formatCandidates = blockSelectionIds
            .map((id) => {
              const block = blocks.find((b) => b.id === id);
              if (
                !block ||
                !TEXTUAL_BLOCK_TYPES.has(block.type) ||
                (block.type === BlockType.TODO && block.properties?.checked)
              ) {
                return null;
              }

              const blockRef = blockRefs.current[id];
              const element = blockRef?.element;
              if (!element || !element.isContentEditable) {
                return null;
              }

              return { id, element, blockRef };
            })
            .filter(Boolean);

          if (formatCandidates.length === 0) {
            return false;
          }

          let removeHighlight = false;
          if (command === "highlight" && selection) {
            removeHighlight = formatCandidates.every(({ element, blockRef }) => {
              if (typeof blockRef?.focus === "function") {
                blockRef.focus("end");
              } else if (typeof element.focus === "function") {
                element.focus({ preventScroll: true });
              }

              const tempRange = document.createRange();
              tempRange.selectNodeContents(element);
              selection.removeAllRanges();
              selection.addRange(tempRange);
              const currentValue = document.queryCommandValue("backColor");
              return isHighlightColorValue(currentValue);
            });
            selection.removeAllRanges();
          }

          let appliedMulti = false;
          formatCandidates.forEach(({ id, element, blockRef }) => {
            if (!selection) {
              return;
            }

            if (typeof blockRef?.focus === "function") {
              blockRef.focus("end");
            } else if (typeof element.focus === "function") {
              element.focus({ preventScroll: true });
            }

            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);

            try {
              if (command === "highlight") {
                document.execCommand(
                  "backColor",
                  false,
                  removeHighlight
                    ? "transparent"
                    : highlightColor || HIGHLIGHT_COLORS.light
                );
              } else {
                document.execCommand(command);
              }
              appliedMulti = true;
            } catch (error) {
              console.warn("Failed to apply multi-block format:", error);
            }

            const html = element.innerHTML;
            setTimeout(() => {
              handleBlockChange(id, { content: html });
            }, 0);
          });

          if (selection) {
            selection.removeAllRanges();
          }
          setSelectedBlocks(blockSelectionIds);

          if (appliedMulti) {
            if (typeof requestAnimationFrame === "function") {
              requestAnimationFrame(() => updateToolbarPosition());
            } else {
              setTimeout(() => updateToolbarPosition(), 0);
            }
            return true;
          }

          return false;
        }

        if (!selection || selection.rangeCount === 0) {
          return false;
        }

        let range = null;
        let blockElement = null;
        let applied = false;

        const findSelectedTableContainer = () => {
          if (!selection || selection.rangeCount === 0) return null;

          let node = selection.getRangeAt(0).commonAncestorContainer;
          if (node.nodeType === Node.TEXT_NODE) {
            node = node.parentElement;
          }

          while (node && node !== document.body) {
            if (node.classList && node.classList.contains("table-container")) {
              return node;
            }
            node = node.parentElement;
          }

          return null;
        };

        const applyCommandAcrossTable = (tableContainer) => {
          if (!tableContainer?.classList?.contains("table-selected-overlay")) {
            return false;
          }

          const editableCells = Array.from(
            tableContainer.querySelectorAll('[contenteditable="true"]')
          );

          if (!selection || editableCells.length === 0) {
            return false;
          }

          const tableElement = tableContainer.querySelector("table");
          if (!tableElement) return false;

          let removeHighlight = false;

          if (command === "highlight") {
            const firstCell = editableCells[0];
            if (firstCell) {
              const tempRange = document.createRange();
              tempRange.selectNodeContents(firstCell);
              selection.removeAllRanges();
              selection.addRange(tempRange);

              const currentValue = document.queryCommandValue("backColor");
              removeHighlight = isHighlightColorValue(currentValue);
            }
          }

          editableCells.forEach((cell) => {
            const cellRange = document.createRange();
            cellRange.selectNodeContents(cell);
            selection.removeAllRanges();
            selection.addRange(cellRange);

            if (command === "highlight") {
              document.execCommand(
                "backColor",
                false,
                removeHighlight
                  ? "transparent"
                  : highlightColor || HIGHLIGHT_COLORS.light
              );
            } else {
              document.execCommand(command);
            }
          });

          const fullRange = document.createRange();
          fullRange.selectNodeContents(tableElement);
          selection.removeAllRanges();
          selection.addRange(fullRange);

          const focusTarget =
            tableContainer.closest(".table-scroll-container") || tableContainer;
          focusTarget?.focus({ preventScroll: true });

          return true;
        };

        const selectedTableContainer = findSelectedTableContainer();
        if (selectedTableContainer) {
          const handled = applyCommandAcrossTable(selectedTableContainer);
          if (handled) {
            applied = true;
          }
        }

        // Helper function to check if text is highlighted
        const isTextHighlighted = () => {
          if (selection.rangeCount === 0) return false;

          const range = selection.getRangeAt(0);
          const container = range.commonAncestorContainer;

          // Get the element that contains the selection
          let element =
            container.nodeType === Node.TEXT_NODE
              ? container.parentElement
              : container;

          // Check if the element or any parent has highlight applied
          while (element && element !== document.body) {
            const style = window.getComputedStyle(element);

            if (isHighlightColorValue(style?.backgroundColor)) {
              return true;
            }

            if (isHighlightColorValue(element.style?.backgroundColor)) {
              return true;
            }

            element = element.parentElement;
          }

          return false;
        };

        if (!applied) {
          // Handle highlight toggle
          if (command === "highlight") {
            if (selection.toString().trim()) {
              if (isTextHighlighted()) {
                // Remove highlighting
                document.execCommand("backColor", false, "transparent");
                applied = true;
              } else {
                // Apply highlighting
                document.execCommand(
                  "backColor",
                  false,
                  highlightColor || HIGHLIGHT_COLORS.light
                );
                applied = true;
              }
            } else {
              // No selection, apply highlighting
              document.execCommand(
                "backColor",
                false,
                highlightColor || HIGHLIGHT_COLORS.light
              );
              applied = true;
            }
          } else {
            // Handle other formatting commands (bold, italic, etc.)
            if (!selection.toString().trim() && selection.rangeCount > 0) {
              range = selection.getRangeAt(0);

              let container = range.commonAncestorContainer;
              if (container.nodeType === Node.TEXT_NODE) {
                container = container.parentElement;
              }

              blockElement = container.closest('[contenteditable="true"]');

              if (blockElement && activeBlockId) {
                const formatElement = document.createElement(
                  command === "bold"
                    ? "strong"
                    : command === "italic"
                    ? "em"
                    : command === "underline"
                    ? "u"
                    : "span"
                );
                formatElement.textContent = "\u00A0";

                try {
                  range.insertNode(formatElement);

                  const newRange = document.createRange();
                  newRange.setStart(formatElement.firstChild, 1);
                  newRange.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(newRange);

                  blockElement.focus();
                  applied = true;
                } catch (e) {
                  console.warn(
                    "Direct formatting failed, trying execCommand:",
                    e
                  );
                  document.execCommand(command);
                  applied = true;
                }
              }
            } else if (selection.toString().trim()) {
              document.execCommand(command);
              applied = true;
            } else {
              document.execCommand(command);
              applied = true;
            }
          }
        }

        if (!applied) {
          return false;
        }

        if (selection.rangeCount > 0) {
          const currentRange = selection.getRangeAt(0);
          const currentBlockElement =
            currentRange.commonAncestorContainer.nodeType === Node.TEXT_NODE
              ? currentRange.commonAncestorContainer.parentElement
              : currentRange.commonAncestorContainer;

          const blockId = Object.keys(blockRefs.current).find(
            (id) =>
              blockRefs.current[id]?.element === currentBlockElement ||
              blockRefs.current[id]?.element?.contains(currentBlockElement)
          );

          if (blockId && blockRefs.current[blockId]?.element) {
            setTimeout(() => {
              handleBlockChange(blockId, {
                content: blockRefs.current[blockId].element.innerHTML,
              });
            }, 10);
          }

          const rescheduleUpdate = () => updateToolbarPosition();
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(rescheduleUpdate);
          } else {
            setTimeout(rescheduleUpdate, 0);
          }
        }
        return true;
      },
      [
        handleBlockChange,
        activeBlockId,
        isSelectionInsideCheckedTodo,
        checkHighlightState,
        updateToolbarPosition,
        blocks,
        setSelectedBlocks,
      ]
    );

    // Drag and drop event handlers
    // Helper function to determine which drop zones should be active
    const getActiveDropZones = useCallback(
      (draggedBlockIndex, currentY, direction) => {
        const adjacentZones = [];

        // Always include immediate adjacent zones
        adjacentZones.push(draggedBlockIndex); // Drop zone before the block
        adjacentZones.push(draggedBlockIndex + 1); // Drop zone after the block

        // Add directional zones based on drag direction
        if (direction === "up") {
          // Prioritize zones above
          if (draggedBlockIndex > 0) adjacentZones.push(draggedBlockIndex - 1);
          if (draggedBlockIndex > 1) adjacentZones.push(draggedBlockIndex - 2);
        } else if (direction === "down") {
          // Prioritize zones below
          if (draggedBlockIndex < blocks.length)
            adjacentZones.push(draggedBlockIndex + 2);
          if (draggedBlockIndex < blocks.length - 1)
            adjacentZones.push(draggedBlockIndex + 3);
        }

        return [...new Set(adjacentZones)].filter(
          (index) => index >= 0 && index <= blocks.length
        );
      },
      [blocks.length]
    );

    const handleDragStart = useCallback(
      (event) => {
        const { active } = event;
        const blockData = active.data.current;

        if (blockData?.type === "block") {
          const originalIndex = blocks.findIndex(
            (b) => b.id === blockData.block.id
          );

          const blockElement = document.querySelector(
            `[data-block-id="${blockData.block.id}"]`
          );
          let measuredHeight = 48; // Default fallback height in pixels

          if (blockElement) {
            measuredHeight = blockElement.offsetHeight;
          }

          // Calculate how much the page will expand
          // Each drop zone above this block will add measuredHeight
          const numDropZonesAbove = originalIndex + 1; // +1 for the first drop zone
          const totalExpansion = numDropZonesAbove * measuredHeight;

          // Lock the current scroll position BEFORE state changes
          const currentScroll = window.scrollY;
          lockedScrollPositionRef.current = {
            x: window.scrollX,
            y: currentScroll
          };

          setDraggedBlock(blockData.block);
          setDraggedBlockOriginalIndex(originalIndex);
          setDraggedBlockHeight(measuredHeight);
          setActiveDropZone(null); // No initial highlighting

          // Immediately scroll to compensate for expansion
          // This needs to happen in the next frame after React renders
          requestAnimationFrame(() => {
            window.scrollTo({
              left: window.scrollX,
              top: currentScroll + totalExpansion,
              behavior: 'instant'
            });
            // Update the locked position to the new scrolled position
            lockedScrollPositionRef.current = {
              x: window.scrollX,
              y: currentScroll + totalExpansion
            };
          });
        }
      },
      [blocks]
    );

    // Continuous mouse tracking during drag for perfect zone highlighting
    const updateActiveDropZoneFromMouse = useCallback(
      (clientY) => {
        if (draggedBlockOriginalIndex !== null) {
          const editorElement = editorRef.current;
          if (editorElement) {
            const rect = editorElement.getBoundingClientRect();
            const relativeY = clientY - rect.top - window.scrollY;

            // Calculate which drop zone the cursor is closest to
            const totalZones = blocks.length + 1;
            let closestZone = draggedBlockOriginalIndex + 1; // default
            let minDistance = Infinity;

            for (let i = 0; i < totalZones; i++) {
              const dropZoneElement = document.querySelector(
                `[data-dropzone-index="${i}"]`
              );

              if (dropZoneElement) {
                const zoneRect = dropZoneElement.getBoundingClientRect();
                const zoneY = zoneRect.top - rect.top + zoneRect.height / 2;
                const distance = Math.abs(relativeY - zoneY);

                if (distance < minDistance) {
                  minDistance = distance;
                  closestZone = i;
                }
              } else {
                // Fallback calculation based on estimated positions
                const estimatedY = i * 80; // Approximate block height
                const distance = Math.abs(relativeY - estimatedY);

                if (distance < minDistance) {
                  minDistance = distance;
                  closestZone = i;
                }
              }
            }

            setActiveDropZone(closestZone);
          }
        }
      },
      [draggedBlockOriginalIndex, blocks.length]
    );

    // Mouse move handler for continuous tracking during drag
    const handleMouseMove = useCallback(
      (event) => {
        if (draggedBlock) {
          setMousePosition({ x: event.clientX, y: event.clientY });
          updateActiveDropZoneFromMouse(event.clientY);
          // Capture current scroll position for maintaining view on drop
          setDropScrollPosition({
            x: window.scrollX,
            y: window.scrollY,
          });
        }
      },
      [draggedBlock, updateActiveDropZoneFromMouse]
    );

    // Add/remove mouse move listener during drag and set global cursor
    useEffect(() => {
      if (draggedBlock) {
        document.addEventListener("mousemove", handleMouseMove);
        document.body.style.cursor = "grabbing";
        // Prevent text selection during drag
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
        return () => {
          document.removeEventListener("mousemove", handleMouseMove);
          document.body.style.cursor = "";
          // Re-enable text selection
          document.body.style.userSelect = "";
          document.body.style.webkitUserSelect = "";
        };
      }
    }, [draggedBlock, handleMouseMove]);

    // Lock scroll position when drag is active to prevent viewport shift
    useEffect(() => {
      if (lockedScrollPositionRef.current !== null) {
        const handleScroll = () => {
          // Force scroll back to locked position
          if (lockedScrollPositionRef.current) {
            window.scrollTo({
              left: lockedScrollPositionRef.current.x,
              top: lockedScrollPositionRef.current.y,
              behavior: 'instant'
            });
          }
        };

        // Listen to scroll events and prevent them
        window.addEventListener('scroll', handleScroll, { passive: false });

        return () => {
          window.removeEventListener('scroll', handleScroll);
        };
      }
    }, [draggedBlock]);

    const handleDragOver = useCallback(
      (event) => {
        const { active, over } = event;
        const blockData = active.data.current;

        if (blockData?.type === "block" && draggedBlockOriginalIndex !== null) {
          // Prioritize collision detection if available
          if (over && over.id && over.id.toString().startsWith("dropzone-")) {
            const dropzoneIndex = parseInt(
              over.id.toString().replace("dropzone-", "")
            );
            if (!isNaN(dropzoneIndex)) {
              setActiveDropZone(dropzoneIndex);
              return;
            }
          }

          // Mouse tracking will handle the rest through the mousemove handler
        }
      },
      [draggedBlockOriginalIndex]
    );

    const handleDragEnd = useCallback(
      (event) => {
        const { active } = event;
        const activeData = active.data.current;

        // Reset all drag state
        const finalDropZone = activeDropZone;
        const savedScrollPosition = dropScrollPosition;

        // Unlock scroll position
        lockedScrollPositionRef.current = null;

        setDraggedBlock(null);
        setActiveDropZone(null);
        setDraggedBlockOriginalIndex(null);
        setDraggedBlockHeight(null);
        setDropScrollPosition(null);

        if (activeData?.type === "block" && finalDropZone !== null) {
          const draggedBlockId = activeData.block.id;
          const dropIndex = finalDropZone;

          setBlocks((prevBlocks) => {
            const draggedBlockIndex = prevBlocks.findIndex(
              (b) => b.id === draggedBlockId
            );

            if (draggedBlockIndex === -1) return prevBlocks;

            const newBlocks = [...prevBlocks];
            const [draggedBlock] = newBlocks.splice(draggedBlockIndex, 1);

            // Adjust drop index if dragging from above the drop zone
            const adjustedDropIndex =
              draggedBlockIndex < dropIndex ? dropIndex - 1 : dropIndex;

            newBlocks.splice(adjustedDropIndex, 0, draggedBlock);

            // Track the move in delta system
            if (enableDeltaTracking && deltaTrackerRef.current) {
              deltaTrackerRef.current.moveBlock(
                draggedBlockId,
                draggedBlockIndex,
                adjustedDropIndex
              );
            }

            return newBlocks;
          });

          // Restore scroll position to maintain view at drop point
          if (savedScrollPosition) {
            setTimeout(() => {
              window.scrollTo({
                left: savedScrollPosition.x,
                top: savedScrollPosition.y,
                behavior: "auto", // Instant scroll, no animation
              });
            }, 0); // Ensure DOM updates are complete
          }

          showNotification("Block moved", "success", 1000);
        }
      },
      [
        activeDropZone,
        dropScrollPosition,
        enableDeltaTracking,
        showNotification,
      ]
    );

    // Handle text selection for toolbar
    useEffect(() => {
      const handleSelectionChange = () => {
        updateToolbarPosition();
      };

      document.addEventListener("selectionchange", handleSelectionChange);
      return () =>
        document.removeEventListener("selectionchange", handleSelectionChange);
    }, [updateToolbarPosition]);

    useEffect(() => {
      if (!toolbarState.isOpen) {
        return;
      }

      const scheduleUpdate = () => {
        if (typeof requestAnimationFrame === "function") {
          if (toolbarAnimationFrameRef.current) {
            cancelAnimationFrame(toolbarAnimationFrameRef.current);
          }
          toolbarAnimationFrameRef.current = requestAnimationFrame(() => {
            toolbarAnimationFrameRef.current = null;
            updateToolbarPosition();
          });
        } else {
          updateToolbarPosition();
        }
      };

      const editorElement = editorRef.current;

      window.addEventListener("scroll", scheduleUpdate, true);
      window.addEventListener("resize", scheduleUpdate);
      editorElement?.addEventListener("scroll", scheduleUpdate);

      return () => {
        if (toolbarAnimationFrameRef.current) {
          cancelAnimationFrame(toolbarAnimationFrameRef.current);
          toolbarAnimationFrameRef.current = null;
        }
        window.removeEventListener("scroll", scheduleUpdate, true);
        window.removeEventListener("resize", scheduleUpdate);
        editorElement?.removeEventListener("scroll", scheduleUpdate);
      };
    }, [toolbarState.isOpen, updateToolbarPosition]);

    // Track Ctrl+A press count for selection
    const ctrlAPressCountRef = useRef(0);
    const ctrlATimeoutRef = useRef(null);

    // Track Ctrl+A state for Ctrl+A+Delete combination
    const ctrlAActiveRef = useRef(false);
    const ctrlADeleteTimeoutRef = useRef(null);

    // Flag to completely disable history during clear operations

    // Flag to prevent history capture during rapid delete operations
    const rapidDeleteModeRef = useRef(false);
    const rapidDeleteTimeoutRef = useRef(null);

    // Flag to prevent content restoration during command+delete operations
    const commandDeleteActiveRef = useRef(false);

    // Keyboard handler with multiple layers of interception
    useEffect(() => {
      const handleKeyboardShortcuts = (e) => {
        const focusedBlockId = getCurrentlyFocusedBlockId();
        const titleElement = titleRef.current;
        const isEventInTitle =
          !!titleElement &&
          !!e.target &&
          (e.target === titleElement ||
            (typeof titleElement.contains === "function" &&
              titleElement.contains(e.target)));
        const resolvedBlockId =
          focusedBlockId || activeBlockIdRef.current || activeBlockId;
        const hasBlockSelection =
          selectedBlockIdsRef.current && selectedBlockIdsRef.current.size > 0;
        const normalizedKey =
          typeof e.key === "string" ? e.key.toLowerCase() : e.key;

        if (hasBlockSelection) {
          const isModifier = e.metaKey || e.ctrlKey;

          if (isModifier && !e.shiftKey && !e.altKey) {
            if (normalizedKey === "c") {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              copySelectedBlocks();
              return false;
            }

            if (normalizedKey === "x") {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              cutSelectedBlocks();
              return false;
            }

            if (
              normalizedKey === "v" &&
              !lastClipboardWriteSuccessfulRef.current &&
              clipboard &&
              clipboard.type === "blocks" &&
              Array.isArray(clipboard.blocks)
            ) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              pasteClipboardBlocks({ replaceSelection: true });
              return false;
            }
          }

          if (
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            (e.key === "Delete" || e.key === "Backspace")
          ) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Check if all blocks are selected - if so, show confirmation modal
            if (selectedBlockIdsRef.current.size === blocks.length) {
              // Show confirmation modal for deleting all content
              setConfirmationModal({
                isOpen: true,
                title: "Clear All Content",
                message:
                  "Are you sure you want to delete all content? This action cannot be undone.",
                onConfirm: () => {
                  // Clear all blocks and create a single empty text block
                  const newBlock = createBlock(BlockType.TEXT, "");

                  // Force immediate state update
                  setBlocks([newBlock]);

                  // Force delta tracking to save the changes
                  if (
                    enableDeltaTracking &&
                    deltaTrackerRef.current &&
                    onDeltaChange
                  ) {
                    // Process each block deletion through delta tracker
                    blocks.forEach((block) => {
                      deltaTrackerRef.current.deleteBlock(block.id);
                    });

                    // Insert the new empty block
                    deltaTrackerRef.current.insertBlock(newBlock, 0);

                    // Generate and send changeset
                    const changeset = deltaTrackerRef.current.generateChangeset();
                    if (changeset && onDeltaChange) {
                      onDeltaChange(changeset, false);
                    }
                  }

                  // Focus the new block after clearing
                  setTimeout(() => {
                    if (blockRefs.current[newBlock.id]) {
                      blockRefs.current[newBlock.id].focus("start");
                    }
                  }, 0);

                  // Clear the block selection
                  clearBlockSelection();

                  showNotification(
                    "All content cleared and saved",
                    "success",
                    3000
                  );
                  trackContentChange();
                  setConfirmationModal({
                    isOpen: false,
                    onConfirm: null,
                    title: "",
                    message: "",
                  });
                },
              });
            } else {
              deleteSelectedBlocks();
            }
            return false;
          }
        } else if (
          (e.metaKey || e.ctrlKey) &&
          !e.shiftKey &&
          !e.altKey &&
          normalizedKey === "v" &&
          !lastClipboardWriteSuccessfulRef.current &&
          clipboard &&
          clipboard.type === "blocks" &&
          Array.isArray(clipboard.blocks)
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          pasteClipboardBlocks({ replaceSelection: false });
          return false;
        }

        // Let version history shortcut pass through (Cmd+Option+Shift+H)
        // Use e.code instead of e.key because Option key transforms 'h' to 'Ó'
        if (
          (e.metaKey || e.ctrlKey) &&
          e.altKey &&
          e.shiftKey &&
          e.code === "KeyH"
        ) {
          e.preventDefault();
          e.stopPropagation();
          // Dispatch a custom event that ModernNoteEditor will listen for
          // window.dispatchEvent(new CustomEvent("toggle-version-history"));
          return;
        }

        // Delete block (Ctrl+Shift+D or Cmd+Shift+D)
        if (
          (e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          (e.key === "D" || e.key === "d") &&
          resolvedBlockId
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleBlockAction("delete", resolvedBlockId);
          return false;
        }

        // Clear block content (Ctrl+Delete or Cmd+Backspace on Mac) - but only if NOT in Ctrl+A+Delete sequence
        if (
          (e.metaKey || e.ctrlKey) &&
          (e.key === "Delete" || e.key === "Backspace") &&
          resolvedBlockId &&
          !ctrlAActiveRef.current
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          // Ensure block history is properly initialized with current content
          const history = blockHistoryRef.current[resolvedBlockId];

          // Force capture the current state before clearing - ALWAYS add it for Cmd+Delete
          if (!isBlockUndoRedoRef.current) {
            const currentState = captureBlockState(resolvedBlockId);

            if (currentState) {
              if (!history || history.needsInitialization) {
                // Initialize with current content
                blockHistoryRef.current[resolvedBlockId] = {
                  states: [currentState],
                  currentIndex: 0,
                };
              } else {
                // ALWAYS add state before Cmd+Delete, even if it seems like a "duplicate"
                // This ensures we have the pre-deletion state to restore
                // Remove future states if we're not at the end
                if (history.currentIndex < history.states.length - 1) {
                  history.states = history.states.slice(
                    0,
                    history.currentIndex + 1
                  );
                }

                // Add the state unconditionally
                history.states.push(currentState);
                history.currentIndex = history.states.length - 1;
              }
            }
          }

          // Enable command delete mode to prevent content restoration
          commandDeleteActiveRef.current = true;

          // Store the block ID we're clearing to allow its clearing operation
          commandDeleteActiveRef.current = { blockId: resolvedBlockId };

          // Clear any existing command delete timeout
          if (rapidDeleteTimeoutRef.current) {
            clearTimeout(rapidDeleteTimeoutRef.current);
          }

          // Set timeout to exit command delete mode
          rapidDeleteTimeoutRef.current = setTimeout(() => {
            commandDeleteActiveRef.current = false;
          }, 500); // Shorter timeout for faster recovery

          // Get the block element and active block details
          const blockInstance = blockRefs.current[resolvedBlockId];
          const blockElement = blockInstance?.element ?? null;
          const activeBlock = blocks.find(
            (block) => block.id === resolvedBlockId
          );

          // Special handling for table blocks – clear all cell content even if the
          // wrapper element isn't focusable/contentEditable like standard blocks.
          if (activeBlock?.type === BlockType.TABLE) {
            const currentTableData =
              activeBlock.properties?.tableData &&
              Array.isArray(activeBlock.properties.tableData)
                ? activeBlock.properties.tableData
                : null;

            const clearedTableData = currentTableData
              ? currentTableData.map((row) =>
                  Array.isArray(row) && row.length > 0
                    ? row.map(() => "")
                    : [""]
                )
              : [[""]];

            const updatedProperties = {
              ...activeBlock.properties,
              tableData:
                clearedTableData.length > 0 ? clearedTableData : [[""]],
            };

            const tableUpdates = {
              content: "",
              properties: updatedProperties,
            };

            // Calculate updated blocks for save
            const updatedBlocks = blocks.map((block) =>
              block.id === resolvedBlockId
                ? { ...block, ...tableUpdates }
                : block
            );

            handleBlockChange(resolvedBlockId, tableUpdates);

            // Keep focus on the current cell when possible so the user can
            // continue typing immediately after clearing.
            setTimeout(() => {
              const activeCell = document.activeElement;
              if (activeCell && activeCell.contentEditable === "true") {
                return;
              }

              const blockRoot = document.querySelector(
                `[data-block-id="${resolvedBlockId}"]`
              );
              const fallbackCell = blockRoot?.querySelector(
                '[contenteditable="true"]'
              );
              fallbackCell?.focus();
            }, 0);

            // Cancel any pending auto-save and trigger immediate save with updated blocks state
            if (onSave) {
              if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
                autoSaveTimeoutRef.current = null;
              }
              setTimeout(() => {
                onSave({ blocks: updatedBlocks, title });
                // Update the last saved content to prevent auto-save conflicts
                lastSavedContentRef.current = JSON.stringify({
                  blocks: updatedBlocks,
                  title,
                });
              }, 100);
            }

            // Clear the command delete flag immediately after table clear operation
            setTimeout(() => {
              commandDeleteActiveRef.current = false;
              if (rapidDeleteTimeoutRef.current) {
                clearTimeout(rapidDeleteTimeoutRef.current);
                rapidDeleteTimeoutRef.current = null;
              }
            }, 50);

            return false;
          }

          if (blockElement) {
            // Use consistent state management - don't manipulate DOM directly
            const updates = { content: "" };

            if (
              activeBlock?.type === BlockType.TODO &&
              activeBlock.properties?.checked
            ) {
              updates.properties = {
                ...activeBlock.properties,
                checked: false,
              };
            }

            // Update block content and calculate updated blocks for save
            const updatedBlocks = blocks.map((block) =>
              block.id === resolvedBlockId ? { ...block, ...updates } : block
            );

            handleBlockChange(resolvedBlockId, updates);

            // Explicitly add the cleared state to history for redo functionality
            setTimeout(() => {
              const history = blockHistoryRef.current[resolvedBlockId];
              if (history && !isBlockUndoRedoRef.current) {
                const clearedState = {
                  content: "",
                  properties: updates.properties || {},
                  selection: null,
                  timestamp: Date.now(),
                };

                // Remove future states if we're not at the end
                if (history.currentIndex < history.states.length - 1) {
                  history.states = history.states.slice(
                    0,
                    history.currentIndex + 1
                  );
                }

                history.states.push(clearedState);
                history.currentIndex = history.states.length - 1;
              }

              // Clear the command delete flag immediately after the operation completes
              // to prevent blocking normal typing/editing
              commandDeleteActiveRef.current = false;
              if (rapidDeleteTimeoutRef.current) {
                clearTimeout(rapidDeleteTimeoutRef.current);
                rapidDeleteTimeoutRef.current = null;
              }
            }, 50);

            // Focus the block after clearing content
            setTimeout(() => {
              blockElement.focus();
              // Set cursor at the beginning
              const range = document.createRange();
              const selection = window.getSelection();
              range.selectNodeContents(blockElement);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
            }, 0);

            // Trigger delta change to save the cleared content
            if (
              onDeltaChange &&
              enableDeltaTracking &&
              deltaTrackerRef.current
            ) {
              // Process the content change through delta tracker
              const oldBlock = blocks.find((b) => b.id === resolvedBlockId);
              if (oldBlock) {
                // First, ensure delta tracker knows the current content by setting it explicitly
                if (oldBlock.content !== "") {
                  deltaTrackerRef.current.updateBlockContent(
                    resolvedBlockId,
                    oldBlock.content
                  );
                }

                // Then update to the new (cleared) content
                if (updates.content !== undefined) {
                  deltaTrackerRef.current.updateBlockContent(
                    resolvedBlockId,
                    updates.content
                  );
                }

                // Update properties if they changed (e.g., unchecking TODO)
                if (updates.properties !== undefined) {
                  deltaTrackerRef.current.updateBlockProperties(
                    resolvedBlockId,
                    updates.properties
                  );
                }

                // Generate and send changeset
                const changeset = deltaTrackerRef.current.generateChangeset();
                if (changeset && changeset.operations.length > 0) {
                  onDeltaChange(changeset, false);
                } else {
                  // Fallback: Force a save even without delta operations
                  onDeltaChange(
                    {
                      operations: [
                        {
                          type: "update_content",
                          blockId: resolvedBlockId,
                          content: updates.content,
                        },
                      ],
                      baselineVersion: null,
                    },
                    false
                  );
                }
              }
            } else {
            }
          }
          return false;
        }

        // Clear all content (Ctrl+A followed by Delete or Cmd+A followed by Backspace)
        if (
          (e.metaKey || e.ctrlKey) &&
          (e.key === "Delete" || e.key === "Backspace")
        ) {
          if (ctrlAActiveRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Use the existing handleBlockAction mechanism for proper save handling
            handleBlockAction("clearAll", null);

            // Reset the Ctrl+A state
            ctrlAActiveRef.current = false;
            if (ctrlADeleteTimeoutRef.current) {
              clearTimeout(ctrlADeleteTimeoutRef.current);
            }

            return false;
          }
        }
      };

      // Add multiple event listeners to catch the event at different phases
      document.addEventListener("keydown", handleKeyboardShortcuts, {
        capture: true,
        passive: false,
      });
      window.addEventListener("keydown", handleKeyboardShortcuts, {
        capture: true,
        passive: false,
      });

      // Also add to document.body for extra coverage
      document.body.addEventListener("keydown", handleKeyboardShortcuts, {
        capture: true,
        passive: false,
      });

      return () => {
        document.removeEventListener("keydown", handleKeyboardShortcuts, {
          capture: true,
          passive: false,
        });
        window.removeEventListener("keydown", handleKeyboardShortcuts, {
          capture: true,
          passive: false,
        });
        document.body.removeEventListener("keydown", handleKeyboardShortcuts, {
          capture: true,
          passive: false,
        });
      };
    }, [
      handleBlockAction,
      handleBlockChange,
      activeBlockId,
      blocks,
      enableDeltaTracking,
      onTitleChange,
      onSave,
      title,
      handleTitleUndo,
      handleTitleRedo,
      getCurrentlyFocusedBlockId,
      clipboard,
      copySelectedBlocks,
      cutSelectedBlocks,
      deleteSelectedBlocks,
      pasteClipboardBlocks,
      setConfirmationModal,
      clearBlockSelection,
      showNotification,
      trackContentChange,
      onDeltaChange,
    ]);

    // Enhanced keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e) => {
        // Track typing for any content-modifying key in the editor
        const activeElement = document.activeElement;
        const isInEditor =
          activeElement &&
          (activeElement.contentEditable === "true" ||
            activeElement.closest('[contenteditable="true"]') ||
            editorRef.current?.contains(activeElement));

        if (isInEditor) {
          const isContentModifyingKey =
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey &&
            (e.key.length === 1 ||
              ["Backspace", "Delete", "Enter", "Space"].includes(e.key));

          if (isContentModifyingKey) {
            isUserTypingRef.current = true;

            // Clear existing typing timeout
            if (typingTimeoutRef.current) {
              clearTimeout(typingTimeoutRef.current);
            }

            // Set a timeout to mark user as done typing after 500ms of inactivity
            typingTimeoutRef.current = setTimeout(() => {
              isUserTypingRef.current = false;
            }, 500);
          }
        }

        const focusedBlockId = getCurrentlyFocusedBlockId();
        const titleElement = titleRef.current;
        const isEventInTitle =
          !!titleElement &&
          !!e.target &&
          (e.target === titleElement ||
            (typeof titleElement.contains === "function" &&
              titleElement.contains(e.target)));
        const resolvedBlockId =
          focusedBlockId || activeBlockIdRef.current || activeBlockId;

        // Let version history shortcut pass through (Cmd+Option+Shift+H)
        // Use e.code instead of e.key because Option key transforms 'h' to 'Ó'
        if (
          (e.metaKey || e.ctrlKey) &&
          e.altKey &&
          e.shiftKey &&
          e.code === "KeyH"
        ) {
          e.preventDefault();
          e.stopPropagation();
          // Dispatch a custom event that ModernNoteEditor will listen for
          // window.dispatchEvent(new CustomEvent("toggle-version-history"));
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key === "a") {
          const activeElement = document.activeElement;
          const isInEditor =
            activeElement &&
            (activeElement.contentEditable === "true" ||
              activeElement.closest('[contenteditable="true"]'));

          if (isInEditor) {
            if (ctrlATimeoutRef.current) {
              clearTimeout(ctrlATimeoutRef.current);
            }

            ctrlAPressCountRef.current++;

            if (ctrlAPressCountRef.current === 1) {
              // Set flag for potential Ctrl+A+Delete combination
              ctrlAActiveRef.current = true;
              if (ctrlADeleteTimeoutRef.current) {
                clearTimeout(ctrlADeleteTimeoutRef.current);
              }
              ctrlADeleteTimeoutRef.current = setTimeout(() => {
                ctrlAActiveRef.current = false;
              }, 2000); // 2 second window for Delete key

              ctrlATimeoutRef.current = setTimeout(() => {
                ctrlAPressCountRef.current = 0;
              }, 500);
            } else if (ctrlAPressCountRef.current === 2) {
              e.preventDefault();

              // Clear any native browser selection from the first Ctrl+A
              const selection = window.getSelection();
              if (selection) {
                selection.removeAllRanges();
              }

              // Select all blocks using the same system as drag selection
              const allBlockIds = blocks.map((block) => block.id);
              setSelectedBlocks(allBlockIds);
              setIsAllBlocksSelected(false); // Use drag selection visual instead

              showNotification("All blocks selected", "info", 1500);

              ctrlAPressCountRef.current = 0;
              clearTimeout(ctrlATimeoutRef.current);
            }
          }
        }

        if ((e.metaKey || e.ctrlKey) && e.key === "d" && resolvedBlockId) {
          e.preventDefault();
          handleBlockAction("duplicate", resolvedBlockId);
          showNotification("Block duplicated", "success", 1500);
        }

        if (
          (e.metaKey || e.ctrlKey) &&
          e.shiftKey &&
          (e.key === "D" || e.key === "d") &&
          resolvedBlockId
        ) {
          e.preventDefault();
          handleBlockAction("delete", resolvedBlockId);
        }

        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "S") {
          e.preventDefault();
          setStatsVisible((prev) => !prev);
        }

        // Block-level undo/redo (Ctrl+Z, Ctrl+Y)
        if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
          if (isEventInTitle) {
            e.preventDefault();
            handleTitleUndo();
            return;
          }
          if (!focusedBlockId) {
            return;
          }
          e.preventDefault();
          handleBlockUndo();
          return;
        }

        if (
          (e.metaKey || e.ctrlKey) &&
          ((e.key === "y" && !e.shiftKey) ||
            (e.shiftKey && (e.key === "Z" || e.key === "z")))
        ) {
          if (isEventInTitle) {
            e.preventDefault();
            handleTitleRedo();
            return;
          }
          if (!focusedBlockId) {
            return;
          }
          e.preventDefault();
          handleBlockRedo();
          return;
        }

        if (e.altKey && e.key === "/") {
          e.preventDefault();
          if (resolvedBlockId && blockRefs.current[resolvedBlockId]) {
            const blockElement = blockRefs.current[resolvedBlockId].element;
            if (blockElement) {
              const rect = blockElement.getBoundingClientRect();
              setSlashMenuState({
                isOpen: true,
                position: { top: rect.bottom, left: rect.left },
                blockId: resolvedBlockId,
                searchTerm: "",
                triggerOffset: null,
              });
            }
          }
        }

        if (e.altKey && resolvedBlockId) {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();

            // Store current focus and selection immediately
            const currentElement = document.activeElement;
            let selectionData = null;

            if (currentElement && currentElement.isContentEditable) {
              const selection = window.getSelection();
              if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                selectionData = {
                  startOffset: range.startOffset,
                  endOffset: range.endOffset,
                };
              }
            }

            // Perform the movement
            handleBlockAction("moveUp", resolvedBlockId);
            showNotification("Block moved up", "success", 1000);

            // Restore focus immediately after the action
            setTimeout(() => {
              if (currentElement && selectionData) {
                currentElement.focus();
                try {
                  const selection = window.getSelection();
                  const range = document.createRange();
                  const textNode = currentElement.firstChild;
                  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    const startOffset = Math.min(
                      selectionData.startOffset,
                      textNode.textContent.length
                    );
                    const endOffset = Math.min(
                      selectionData.endOffset,
                      textNode.textContent.length
                    );
                    range.setStart(textNode, startOffset);
                    range.setEnd(textNode, endOffset);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                } catch (e) {
                  // Silent fail
                }
              }
            }, 0);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();

            // Store current focus and selection immediately
            const currentElement = document.activeElement;
            let selectionData = null;

            if (currentElement && currentElement.isContentEditable) {
              const selection = window.getSelection();
              if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                selectionData = {
                  startOffset: range.startOffset,
                  endOffset: range.endOffset,
                };
              }
            }

            // Perform the movement
            handleBlockAction("moveDown", resolvedBlockId);
            showNotification("Block moved down", "success", 1000);

            // Restore focus immediately after the action
            setTimeout(() => {
              if (currentElement && selectionData) {
                currentElement.focus();
                try {
                  const selection = window.getSelection();
                  const range = document.createRange();
                  const textNode = currentElement.firstChild;
                  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    const startOffset = Math.min(
                      selectionData.startOffset,
                      textNode.textContent.length
                    );
                    const endOffset = Math.min(
                      selectionData.endOffset,
                      textNode.textContent.length
                    );
                    range.setStart(textNode, startOffset);
                    range.setEnd(textNode, endOffset);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                } catch (e) {
                  // Silent fail
                }
              }
            }, 0);
          }
        }

        if (e.metaKey || e.ctrlKey) {
          if (e.key === "b" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            if (handleFormat("bold")) {
              showNotification("Bold formatting applied", "success", 1000);
            }
          } else if (e.key === "i" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            if (handleFormat("italic")) {
              showNotification("Italic formatting applied", "success", 1000);
            }
          } else if (e.key === "u" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            if (handleFormat("underline")) {
              showNotification("Underline formatting applied", "success", 1000);
            }
          } else if (e.key === "s" && e.shiftKey && !e.altKey) {
            e.preventDefault();
            if (handleFormat("strikeThrough")) {
              showNotification(
                "Strikethrough formatting applied",
                "success",
                1000
              );
            }
          } else if (
            (e.key === "h" || e.key === "H") &&
            e.shiftKey &&
            !e.altKey
          ) {
            // This is for text highlighting (Cmd+Shift+H)
            // Don't trigger if Alt is pressed (that's for version history: Cmd+Alt+Shift+H)
            e.preventDefault();
            if (handleFormat("highlight")) {
              showNotification("Highlight formatting applied", "success", 1000);
            }
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown, true); // Use capture mode
      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
        if (ctrlATimeoutRef.current) {
          clearTimeout(ctrlATimeoutRef.current);
        }
        if (ctrlADeleteTimeoutRef.current) {
          clearTimeout(ctrlADeleteTimeoutRef.current);
        }
      };
    }, [
      activeBlockId,
      handleBlockAction,
      handleBlockUndo,
      handleBlockRedo,
      handleTitleUndo,
      handleTitleRedo,
      getCurrentlyFocusedBlockId,
      showNotification,
      handleFormat,
      blocks,
      setSelectedBlocks,
      setIsAllBlocksSelected,
    ]);

    // Track input events globally to catch typing in newly created blocks
    useEffect(() => {
      const handleInput = (e) => {
        const target = e.target;
        const isInEditor =
          target &&
          (target.contentEditable === "true" ||
            target.closest('[contenteditable="true"]') ||
            editorRef.current?.contains(target));

        if (isInEditor) {
          isUserTypingRef.current = true;

          // Clear existing typing timeout
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }

          // Set a timeout to mark user as done typing after 500ms of inactivity
          typingTimeoutRef.current = setTimeout(() => {
            isUserTypingRef.current = false;
          }, 500);
        }
      };

      document.addEventListener("input", handleInput, true);
      return () => {
        document.removeEventListener("input", handleInput, true);
      };
    }, []);

    // Expose editor methods via ref
    useImperativeHandle(ref, () => ({
      getContent: () => blocks,
      setContent: (newBlocks, options = {}) => {
        setBlocks(newBlocks);
        if (enableDeltaTracking && deltaTrackerRef.current) {
          deltaTrackerRef.current = new DeltaTracker(title, newBlocks);
        }
        if (!options.skipTracking) {
          trackContentChange();
        }
      },
      focus: () => {
        if (titleRef.current) {
          titleRef.current.focus();
        } else if (blocks.length > 0) {
          blockRefs.current[blocks[0].id]?.focus();
        }
      },
      scrollToBlock,
      getDeltaStats: () => {
        if (enableDeltaTracking && deltaTrackerRef.current) {
          return deltaTrackerRef.current.getStatistics();
        }
        return null;
      },
      generateChangeset: () => {
        if (enableDeltaTracking && deltaTrackerRef.current) {
          return deltaTrackerRef.current.generateChangeset();
        }
        return null;
      },
      resetDeltaBaseline: () => {
        if (enableDeltaTracking && deltaTrackerRef.current) {
          deltaTrackerRef.current.updateBaseline(title, blocks);
          lastSyncedVersionRef.current =
            deltaTrackerRef.current.documentVersion;
        }
      },
      applyRemoteChanges: (changeset) => {
        if (enableDeltaTracking && deltaTrackerRef.current) {
          const result = deltaTrackerRef.current.mergeRemoteOperations(
            changeset.operations
          );
          if (result.merged.length > 0) {
            const currentState = deltaTrackerRef.current.getCurrentState();
            setBlocks(currentState.blocks);
          }
          return result;
        }
        return null;
      },
      // Expose method to create version if there are any changes (for wake/navigation)
      createVersionIfHasChanges,
      getCurrentState: () => {
        if (enableDeltaTracking && deltaTrackerRef.current) {
          return deltaTrackerRef.current.getCurrentState();
        }
        return { title, blocks };
      },
      blockRefs,
      getSelectedBlockIds: () => Array.from(selectedBlockIdsRef.current),
      clearBlockSelection,
      // Expose method to check if user is currently typing
      getIsTyping: () => isUserTypingRef.current,
    }));

    // Auto-resize title when content changes
    useEffect(() => {
      resizeTitleTextarea();
    }, [title, resizeTitleTextarea]);

    // Resize title on window resize
    useEffect(() => {
      const handleResize = () => {
        resizeTitleTextarea();
      };

      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [resizeTitleTextarea]);

    // Cleanup
    useEffect(() => {
      return () => {
        if (rapidDeleteTimeoutRef.current) {
          clearTimeout(rapidDeleteTimeoutRef.current);
        }
      };
    }, []);

    const selectedBlockIdsSet = useMemo(
      () => new Set(selectedBlockIds),
      [selectedBlockIds]
    );
    const hasDragSelection = selectedBlockIdsSet.size > 1;
    return (
      <div
        ref={rootRef}
        className="bg-white dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200"
      >
        <div className="max-w-5xl mx-auto px-8 py-16 pb-24">
          {/* Title */}
          <div className="mb-8">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => {
                handleTitleChange(e.target.value);
                setTimeout(() => resizeTitleTextarea(), 0);
              }}
              onKeyDown={handleTitleKeyDown}
              onFocus={handleTitleFocus}
              rows={1}
              className="w-full text-2xl md:text-3xl lg:text-4xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 midnight:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none overflow-hidden leading-tight"
              placeholder="What is my name?"
              style={{
                minHeight: "1.5em",
                lineHeight: "1.1",
              }}
            />
          </div>

          {/* Editor */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <div
              ref={editorRef}
              className="space-y-1 editor-container pb-64"
              onClick={handleEditorClick}
            >
              {/* Drop zone at the start */}
              <DropZone
                index={0}
                isActive={draggedBlock !== null}
                isOver={activeDropZone === 0}
                draggedBlock={draggedBlock}
                draggedBlockHeight={draggedBlockHeight}
              />

              {blocks.map((block, index) => {
                const isTextualBlock = TEXTUAL_BLOCK_TYPES.has(block.type);
                const isDragSelected =
                  hasDragSelection && selectedBlockIdsSet.has(block.id);
                const showSelectionOverlay =
                  isDragSelected || (isAllBlocksSelected && !isTextualBlock);

                return (
                  <React.Fragment key={block.id}>
                    <DraggableBlockWrapper
                      block={block}
                      isDragging={draggedBlock?.id === block.id}
                      onDragData={handleDragData}
                    >
                      <div
                        data-block-wrapper
                        data-block-id={block.id}
                        className="group relative"
                        onMouseDown={(event) =>
                          handleBlockWrapperMouseDown(event, block.id)
                        }
                        onMouseEnter={() =>
                          handleBlockWrapperMouseEnter(block.id)
                        }
                        onMouseUp={handleBlockWrapperMouseUp}
                      >
                        {showSelectionOverlay && (
                          <div className="pointer-events-none absolute inset-0 rounded-lg bg-blue-500/15 dark:bg-blue-400/10 midnight:bg-indigo-500/15 ring-1 ring-blue-500/40 dark:ring-blue-400/40 midnight:ring-indigo-400/40 z-10" />
                        )}
                        <div
                          className={
                            showSelectionOverlay ? "relative z-20" : "relative"
                          }
                        >
                          {collaborationTracking ? (
                            <Block
                              ref={(el) => (blockRefs.current[block.id] = el)}
                              block={block}
                              collaborationTracking={collaborationTracking}
                              onChange={handleBlockChange}
                              onKeyDown={handleKeyDown}
                              onFocus={handleBlockFocus}
                              onAction={handleBlockAction}
                              onCopy={handleCopyBlock}
                              onTypeChange={handleBlockTypeChange}
                              isActive={activeBlockId === block.id}
                              allBlocks={blocks}
                              rapidDeleteMode={rapidDeleteModeRef.current}
                              isAllBlocksSelected={isAllBlocksSelected}
                              isSelected={isDragSelected}
                              dragListeners={blockDragData[block.id]?.listeners}
                              dragAttributes={
                                blockDragData[block.id]?.attributes
                              }
                            />
                          ) : (
                            <Block
                              ref={(el) => (blockRefs.current[block.id] = el)}
                              block={block}
                              onChange={handleBlockChange}
                              onKeyDown={handleKeyDown}
                              onFocus={handleBlockFocus}
                              onAction={handleBlockAction}
                              onCopy={handleCopyBlock}
                              onTypeChange={handleBlockTypeChange}
                              isActive={activeBlockId === block.id}
                              allBlocks={blocks}
                              rapidDeleteMode={rapidDeleteModeRef.current}
                              isAllBlocksSelected={isAllBlocksSelected}
                              isSelected={isDragSelected}
                              dragListeners={blockDragData[block.id]?.listeners}
                              dragAttributes={
                                blockDragData[block.id]?.attributes
                              }
                            />
                          )}
                        </div>
                      </div>
                    </DraggableBlockWrapper>

                    {/* Drop zone after each block */}
                    <DropZone
                      index={index + 1}
                      isActive={draggedBlock !== null}
                      isOver={activeDropZone === index + 1}
                      draggedBlock={draggedBlock}
                      draggedBlockHeight={draggedBlockHeight}
                    />
                  </React.Fragment>
                );
              })}

              {/* Enhanced New Block Zone */}
              <div
                className="group/new-block relative min-h-[80px] cursor-text transition-all duration-200 hover:bg-gray-50/30 dark:hover:bg-gray-800/20 midnight:hover:bg-gray-800/20 rounded-lg"
                onClick={handleNewBlockZoneClick}
              >
                <div className="h-full w-full min-h-[80px]" />

                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/new-block:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-blue-500 dark:bg-blue-600 midnight:bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Click to add a new block
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                      or press{" "}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 rounded text-xs">
                        Enter
                      </kbd>{" "}
                      in the last block
                    </div>
                    {collaborators.length > 1 && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 midnight:text-blue-300">
                        {collaborators.length}{" "}
                        {collaborators.length === 1 ? "person" : "people"}{" "}
                        collaborating
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
              {draggedBlock && (
                <div
                  className="shadow-2xl pointer-events-none bg-gray-200 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border-2 border-blue-500 dark:border-blue-400 midnight:border-blue-400"
                  style={{ opacity: 1 }}
                >
                  <div
                    data-block-wrapper
                    data-block-id={draggedBlock.id}
                    className="group relative"
                  >
                    {collaborationTracking ? (
                      <Block
                        block={draggedBlock}
                        collaborationTracking={collaborationTracking}
                        onChange={() => {}}
                        onKeyDown={() => {}}
                        onFocus={() => {}}
                        onAction={() => {}}
                        onCopy={() => {}}
                        onTypeChange={() => {}}
                        isActive={false}
                        allBlocks={blocks}
                        rapidDeleteMode={false}
                        isAllBlocksSelected={false}
                      />
                    ) : (
                      <Block
                        block={draggedBlock}
                        onChange={() => {}}
                        onKeyDown={() => {}}
                        onFocus={() => {}}
                        onAction={() => {}}
                        onCopy={() => {}}
                        onTypeChange={() => {}}
                        isActive={false}
                        allBlocks={blocks}
                        rapidDeleteMode={false}
                        isAllBlocksSelected={false}
                      />
                    )}
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Slash Command Menu */}
          {slashMenuState.isOpen && (
            <SlashCommandMenu
              position={slashMenuState.position}
              onSelect={handleSlashCommandSelect}
              onClose={() =>
                setSlashMenuState((prev) => ({ ...prev, isOpen: false }))
              }
              searchTerm={slashMenuState.searchTerm}
              blockId={slashMenuState.blockId}
            />
          )}

          {/* Floating Toolbar */}
          {toolbarState.isOpen && (
            <FloatingToolbar
              position={toolbarState.position}
              onFormat={handleFormat}
              selection={toolbarState.selection}
            />
          )}

          {/* Editor Stats */}
          <EditorStats blocks={blocks} isVisible={statsVisible} />

          {/* Save Status Indicator */}
          {saveStatus && (
            <div
              className={`fixed top-4 left-4 px-3 py-1.5 rounded-full text-sm shadow-lg z-50 flex items-center gap-2 ${
                saveStatus === "saving"
                  ? "bg-yellow-100 text-yellow-800"
                  : saveStatus === "saved"
                  ? "bg-green-100 text-green-800"
                  : saveStatus === "error"
                  ? "bg-red-100 text-red-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {saveStatus === "saving" && (
                <>
                  <div className="w-3 h-3 border border-yellow-600 dark:border-yellow-500 midnight:border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <div className="w-3 h-3 bg-green-600 dark:bg-green-500 midnight:bg-green-400 rounded-full"></div>
                  Saved
                </>
              )}
              {saveStatus === "error" && (
                <>
                  <div className="w-3 h-3 bg-red-600 dark:bg-red-500 midnight:bg-red-400 rounded-full"></div>
                  Save failed
                </>
              )}
            </div>
          )}

          {/* Enhanced Notification */}
          {notification && (
            <div
              className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 transition-all duration-300 ${
                notification.type === "success"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/80 dark:text-green-200 midnight:bg-green-950/90 midnight:text-green-300"
                  : notification.type === "error"
                  ? "bg-red-100 text-red-800 dark:bg-red-900/80 dark:text-red-200 midnight:bg-red-950/90 midnight:text-red-300"
                  : notification.type === "warning"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/80 dark:text-yellow-200 midnight:bg-yellow-950/90 midnight:text-yellow-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-200 midnight:bg-blue-950/90 midnight:text-blue-300"
              }`}
              style={{
                animation: "slideInRight 0.3s ease-out",
              }}
            >
              {notification.type === "success" && (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {notification.type === "error" && (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {notification.type === "warning" && (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {notification.type === "info" && (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <span className="text-sm font-medium">
                {notification.message}
              </span>
            </div>
          )}

          <style>{`
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>

          {/* Confirmation Modal */}
          <ConfirmationModal
            isOpen={confirmationModal.isOpen}
            onConfirm={confirmationModal.onConfirm}
            onCancel={() => {
              // Clear all selections when modal is cancelled
              clearBlockSelection();
              setIsAllBlocksSelected(false);
              const selection = window.getSelection();
              if (selection) {
                selection.removeAllRanges();
              }
              setConfirmationModal({
                isOpen: false,
                onConfirm: null,
                title: "",
                message: "",
              });
            }}
            title={confirmationModal.title}
            message={confirmationModal.message}
            confirmText="Delete All"
            cancelText="Cancel"
            isDangerous={true}
          />

          {/* Deletion Warning Modal with "Don't show again" checkbox */}
          {deletionWarningModal.isOpen &&
            ReactDOM.createPortal(
              <div
                className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2147483647]"
                style={{ zIndex: 2147483647 }}
                onClick={() => {
                  // Clear selection and close on backdrop click
                  clearBlockSelection();
                  setDeletionWarningModal({
                    isOpen: false,
                    blockCount: 0,
                    onConfirm: null,
                  });
                }}
              >
                <div
                  data-block-selection-modal
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Delete {deletionWarningModal.blockCount}{" "}
                    {deletionWarningModal.blockCount === 1 ? "Block" : "Blocks"}?
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    This action cannot be undone.{" "}
                    {deletionWarningModal.blockCount === 1
                      ? "This block"
                      : "These blocks"}{" "}
                    will be permanently deleted.
                  </p>

                  {/* Checkbox for "Don't show again" */}
                  <label className="flex items-center space-x-2 mb-6 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer"
                      onChange={(e) => {
                        setShowDeletionWarning(!e.target.checked);
                      }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Don't show this warning again during this session
                    </span>
                  </label>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        // Clear selection and close
                        clearBlockSelection();
                        setDeletionWarningModal({
                          isOpen: false,
                          blockCount: 0,
                          onConfirm: null,
                        });
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (deletionWarningModal.onConfirm) {
                          deletionWarningModal.onConfirm();
                        }
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
        </div>
      </div>
    );
  }
);

ModernBlockEditor.displayName = "ModernBlockEditor";

export default ModernBlockEditor;
