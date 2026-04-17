import React, {
  useState,
  useRef,
  useImperativeHandle,
  useEffect,
  forwardRef,
  useCallback,
  memo,
  useMemo,
} from "react";

// Dynamic style injection for block selection overlay (similar to table block)
const BLOCK_SELECTION_STYLE_ID = "block-selection-overlay-style";

const ensureBlockSelectionStyle = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(BLOCK_SELECTION_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = BLOCK_SELECTION_STYLE_ID;
  style.textContent = `
    .block-selected-overlay ::selection,
    .block-selected-overlay *::selection {
      background: transparent !important;
      color: inherit !important;
    }
    .block-selected-overlay ::-moz-selection,
    .block-selected-overlay *::-moz-selection {
      background: transparent !important;
      color: inherit !important;
    }
  `;
  document.head.appendChild(style);
};
import BlockActions from "./BlockActions";
import TableBlock from "./TableBlock";
import CodeBlock from "./CodeBlock";
import DividerBlock from "./DividerBlock";
import ImageBlock from "./ImageBlock";
import VideoBlock from "./VideoBlock";
import AudioBlock from "./AudioBlock";
import FileBlock from "./FileBlock";
import CalloutBlock from "./CalloutBlock";
import ToggleBlock from "./ToggleBlock";
import EmbedBlock from "./EmbedBlock";
import MathBlock from "./MathBlock";
import LinkPreviewBlock from "./LinkPreviewBlock";
// Chart components
import LineChartBlock from "./charts/LineChartBlock";
import BarChartBlock from "./charts/BarChartBlock";
import PieChartBlock from "./charts/PieChartBlock";
import AreaChartBlock from "./charts/AreaChartBlock";
import ScatterChartBlock from "./charts/ScatterChartBlock";
import DonutChartBlock from "./charts/DonutChartBlock";
// Advanced components
import ProgressBarBlock from "./advanced/ProgressBarBlock";
import BreadcrumbBlock from "./advanced/BreadcrumbBlock";
import ButtonBlock from "./advanced/ButtonBlock";

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

// Memoized Todo component with read-only support
const TodoCheckbox = memo(
  ({
    checked,
    onChange,
    blockId,
    onBlockFocus,
    readOnly,
    canToggle = true,
    tooltip,
  }) => (
    <input
      type="checkbox"
      checked={checked || false}
      onChange={
        readOnly
          ? undefined
          : (e) => {
              if (!canToggle && !checked) {
                e.preventDefault();
                e.target.checked = false;
                return;
              }
              onChange(e.target.checked);
            }
      }
      onClick={
        readOnly
          ? undefined
          : (e) => {
              e.stopPropagation();

              if (!canToggle && !checked) {
                e.preventDefault();
                e.target.checked = false;
              }

              if (onBlockFocus) {
                onBlockFocus(blockId);
              }
            }
      }
      className={`mt-1 w-4 h-4 text-teal-500 accent-teal-500 dark:accent-teal-400 midnight:accent-teal-300 rounded border-gray-300 dark:border-gray-600 focus:ring-teal-400 focus:ring-2 focus:ring-offset-1 focus:outline-none transition ${
        readOnly
          ? "cursor-not-allowed opacity-50"
          : canToggle
          ? "cursor-pointer"
          : "cursor-not-allowed opacity-60"
      }`}
      aria-disabled={readOnly || (!canToggle && !checked)}
      disabled={readOnly}
      title={tooltip}
    />
  )
);

// Memoized list number component with indentation level support
const ListNumber = memo(({ blockIndex, indentLevel = 0 }) => {
  const formatNumber = (index, level) => {
    const num = index + 1;
    switch (level) {
      case 0:
        return `${num}.`; // 1. 2. 3.
      case 1:
        return `${String.fromCharCode(96 + num)}.`; // a. b. c.
      case 2:
        return `${toRomanNumeral(num)}.`; // i. ii. iii.
      case 3:
        return `${String.fromCharCode(64 + num)}.`; // A. B. C.
      default:
        return `${num}.`;
    }
  };

  // Convert number to lowercase roman numeral
  const toRomanNumeral = (num) => {
    const romanNumerals = [
      '', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
      'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'
    ];
    return romanNumerals[num] || `${num}`;
  };

  return (
    <span className="text-gray-500 dark:text-gray-400 font-medium select-none min-w-[1.5rem]">
      {formatNumber(blockIndex, indentLevel)}
    </span>
  );
});

// Enhanced Block Component with Collaboration Support
const Block = forwardRef(
  (
    {
      block,
      onChange,
      onKeyDown,
      onFocus,
      onBlur, // NEW: Blur handler
      onMouseDown, // NEW: Mouse down handler
      onAction,
      isActive,
      allBlocks,
      onCopy,
      onTypeChange,
      readOnly = false, // NEW: Read-only mode
      rapidDeleteMode = false, // NEW: Rapid delete mode
      isAllBlocksSelected = false, // NEW: All blocks selected state
      isSelected = false,
      dragListeners,
      dragAttributes,
      ...otherProps
    },
    ref
  ) => {
    const contentRef = useRef(null);
    const updateTimeoutRef = useRef(null);
    const lastContentRef = useRef(block.content);
    const manualTypeChangeRef = useRef(false);
    const prevBlockTypeRef = useRef(block.type);
    const lastEnterTimeRef = useRef(0);
    const lastPasteTimeRef = useRef(0);

    // Helper function to determine if a block type doesn't have editable content
    const isNonEditableBlock = useCallback(() => {
      const nonEditableTypes = [
        BlockType.DIVIDER,
        BlockType.IMAGE,
        BlockType.VIDEO,
        BlockType.AUDIO,
        BlockType.FILE,
        BlockType.LINE_CHART,
        BlockType.BAR_CHART,
        BlockType.PIE_CHART,
        BlockType.AREA_CHART,
        BlockType.SCATTER_CHART,
        BlockType.DONUT_CHART,
        BlockType.PROGRESS_BAR,
        BlockType.BREADCRUMB,
        BlockType.BUTTON,
      ];
      return nonEditableTypes.includes(block.type);
    }, [block.type]);

    // Helper function to determine if buttons should be hidden during select all
    const shouldHideButtonsOnSelectAll = useCallback(() => {
      const hideButtonTypes = [
        BlockType.DIVIDER,
        BlockType.CALLOUT,
        BlockType.IMAGE,
        BlockType.VIDEO,
        BlockType.LINK_PREVIEW,
      ];
      return hideButtonTypes.includes(block.type);
    }, [block.type]);

    // Ensure block selection style is injected
    useEffect(() => {
      if (isAllBlocksSelected && shouldHideButtonsOnSelectAll()) {
        ensureBlockSelectionStyle();
      }
    }, [isAllBlocksSelected, shouldHideButtonsOnSelectAll]);

    const getTodoPlainText = useCallback(() => {
      if (block.type !== BlockType.TODO) return "";

      const rawContent = block.content || "";
      if (!rawContent) return "";

      if (typeof window !== "undefined" && typeof document !== "undefined") {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = rawContent;
        const text = tempDiv.textContent || tempDiv.innerText || "";
        return text.replace(/\u00A0/g, " ").trim();
      }

      return rawContent
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }, [block.content, block.type]);

    const hasTodoContent = useMemo(() => {
      if (block.type !== BlockType.TODO) return true;
      return getTodoPlainText().length > 0;
    }, [block.type, getTodoPlainText]);

    useImperativeHandle(ref, () => ({
      focus: (position = "end") => {
        // Don't focus if read-only (but allow focusing checked TODOs)
        if (readOnly) return;

        // Allow focusing for checked TODOs but don't set cursor position
        const isTodoChecked =
          block.type === BlockType.TODO && block.properties?.checked;

        if (isNonEditableBlock()) {
          if (onFocus) {
            onFocus(block.id);
          }
          return;
        }

        if (contentRef.current) {
          contentRef.current.focus();

          // Don't set cursor position for checked TODOs
          if (isTodoChecked) return;

          setTimeout(() => {
            try {
              const range = document.createRange();
              const sel = window.getSelection();

              if (
                contentRef.current &&
                contentRef.current.nodeType === Node.ELEMENT_NODE
              ) {
                if (position === "start") {
                  range.setStart(contentRef.current, 0);
                } else {
                  range.selectNodeContents(contentRef.current);
                  range.collapse(false);
                }

                sel.removeAllRanges();
                sel.addRange(range);
              }
            } catch (error) {
              console.warn("Failed to set cursor position in block:", error);
              contentRef.current?.focus();
            }
          }, 0);
        }
      },
      blur: () => contentRef.current?.blur(),
      element: contentRef.current,
      getCursorPosition: () => {
        if (isNonEditableBlock()) return 0;
        const sel = window.getSelection();
        return sel.rangeCount > 0 ? sel.getRangeAt(0).startOffset : 0;
      },
      setCursorPosition: (offset) => {
        // Check if TODO is checked - prevent cursor positioning
        const isTodoChecked =
          block.type === BlockType.TODO && block.properties?.checked;

        if (isNonEditableBlock() || readOnly || isTodoChecked) return;

        if (contentRef.current) {
          setTimeout(() => {
            const range = document.createRange();
            const sel = window.getSelection();

            let targetNode = contentRef.current.firstChild;
            if (!targetNode || targetNode.nodeType !== Node.TEXT_NODE) {
              contentRef.current.textContent =
                contentRef.current.textContent || "";
              targetNode = contentRef.current.firstChild;
            }

            if (targetNode && targetNode.nodeType === Node.TEXT_NODE) {
              const maxOffset = targetNode.textContent.length;
              range.setStart(targetNode, Math.min(offset, maxOffset));
            } else {
              range.setStart(contentRef.current, 0);
            }

            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }, 0);
        }
      },
      isNonEditable: () => isNonEditableBlock(),
      isReadOnly: () => {
        const isTodoChecked =
          block.type === BlockType.TODO && block.properties?.checked;
        return readOnly || isTodoChecked;
      }, // Updated to account for checked TODOs
    }));

    // Enhanced content change handler - disabled in read-only mode with typing detection
    const handleInput = useCallback(
      (e) => {
        // Check if TODO is checked and should be treated as read-only
        const isTodoChecked =
          block.type === BlockType.TODO && block.properties?.checked;
        const effectiveReadOnly = readOnly || isTodoChecked;

        if (effectiveReadOnly) return;

        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }

        const newTextContent = e.target.textContent || "";
        const htmlContent = e.target.innerHTML;

        // CRITICAL: Immediately update lastContentRef to prevent race conditions
        // This prevents the useEffect from overwriting edits with stale content
        lastContentRef.current = htmlContent;

        // Debounce content updates to reduce save frequency
        updateTimeoutRef.current = setTimeout(() => {
          const trimmedContent = newTextContent.trim();

          // Skip auto-detection if a manual type change just occurred
          if (manualTypeChangeRef.current) {
            // Just update content without type detection
            onChange(block.id, { content: htmlContent });
            return;
          }

          // Enhanced markdown shortcut detection
          // NOTE: Preserve HTML formatting when converting types
          if (
            trimmedContent.startsWith("#") &&
            (trimmedContent.startsWith("# ") ||
              trimmedContent.startsWith("#\u00A0"))
          ) {
            const level = trimmedContent.match(/^#+/)[0].length;
            // Remove markdown prefix from HTML while preserving formatting
            const cleanedHTML = htmlContent.replace(/^#+\s*/, "");

            if (level === 1) {
              onChange(block.id, {
                type: BlockType.HEADING1,
                content: cleanedHTML,
              });
              return;
            } else if (level === 2) {
              onChange(block.id, {
                type: BlockType.HEADING2,
                content: cleanedHTML,
              });
              return;
            } else if (level === 3) {
              onChange(block.id, {
                type: BlockType.HEADING3,
                content: cleanedHTML,
              });
              return;
            }
          }

          // List detection
          if (
            (trimmedContent.startsWith("- ") ||
              trimmedContent.startsWith("* ")) &&
            trimmedContent.length > 2
          ) {
            const cleanedHTML = htmlContent.replace(/^[*-]\s+/, "");
            onChange(block.id, {
              type: BlockType.BULLET_LIST,
              content: cleanedHTML,
            });
            return;
          }

          // Numbered list detection
          if (trimmedContent.match(/^\d+\.\s+/) && trimmedContent.length > 3) {
            const cleanedHTML = htmlContent.replace(/^\d+\.\s+/, "");
            onChange(block.id, {
              type: BlockType.NUMBERED_LIST,
              content: cleanedHTML,
            });
            return;
          }

          // Todo detection
          if (
            (trimmedContent.startsWith("[ ] ") ||
              trimmedContent.startsWith("[]")) &&
            trimmedContent.length > 3
          ) {
            const cleanedHTML = htmlContent.replace(/^\[\s*\]\s*/, "");
            onChange(block.id, {
              type: BlockType.TODO,
              content: cleanedHTML,
              properties: { checked: false },
            });
            return;
          }

          if (
            (trimmedContent.startsWith("[x] ") ||
              trimmedContent.startsWith("[X] ")) &&
            trimmedContent.length > 4
          ) {
            const cleanedHTML = htmlContent.replace(/^\[[xX]\]\s*/, "");
            onChange(block.id, {
              type: BlockType.TODO,
              content: cleanedHTML,
              properties: { checked: true },
            });
            return;
          }

          // Quote detection
          if (trimmedContent.startsWith("> ") && trimmedContent.length > 2) {
            const cleanedHTML = htmlContent.replace(/^>\s+/, "");
            onChange(block.id, {
              type: BlockType.QUOTE,
              content: cleanedHTML,
            });
            return;
          }

          // Default content update with typing indicator
          onChange(block.id, { content: htmlContent }, true); // true indicates typing
        }, 250); // Balanced debounce for smooth typing without cursor issues
      },
      [block.id, onChange, readOnly, block.type, block.properties]
    );

    // Handle paste events - disabled in read-only mode
    const handlePaste = useCallback(
      (e) => {
        // Check if TODO is checked and should be treated as read-only
        const isTodoChecked =
          block.type === BlockType.TODO && block.properties?.checked;
        const effectiveReadOnly = readOnly || isTodoChecked;

        if (effectiveReadOnly) {
          e.preventDefault();
          return;
        }

        e.preventDefault();

        // Try to get HTML content first to preserve formatting
        let pasteContent = (e.clipboardData || window.clipboardData).getData(
          "text/html"
        );

        // If no HTML content, fall back to plain text
        if (!pasteContent) {
          pasteContent = (e.clipboardData || window.clipboardData).getData(
            "text/plain"
          );
        }

        if (pasteContent) {
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();

            // Check if we have HTML content
            const hasHtml = (e.clipboardData || window.clipboardData).getData(
              "text/html"
            );

            if (hasHtml) {
              // Create a temporary div to parse HTML and sanitize it
              const tempDiv = document.createElement("div");
              tempDiv.innerHTML = pasteContent;

              // Remove any script tags and dangerous attributes for security
              const scripts = tempDiv.querySelectorAll("script");
              scripts.forEach((script) => script.remove());

              // Remove dangerous attributes and unwanted styling
              const allElements = tempDiv.querySelectorAll("*");
              allElements.forEach((el) => {
                // Remove dangerous attributes
                el.removeAttribute("onclick");
                el.removeAttribute("onload");
                el.removeAttribute("onerror");

                // Handle style attribute selectively - preserve only background-color for highlights
                if (el.hasAttribute("style")) {
                  const style = el.style;
                  const backgroundColor = style.backgroundColor;

                  // Normalize color for comparison
                  const normalizeColor = (color) => {
                    return color ? color.toLowerCase().replace(/\s+/g, "") : "";
                  };

                  const normalizedBg = normalizeColor(backgroundColor);

                  // Check if this is a legitimate highlight color
                  // Includes: #fff3b0 (light), #facc15 (dark), #daa520 (midnight), #ffff00 (pure yellow)
                  const isLikelyHighlight =
                    normalizedBg &&
                    // Hex formats
                    (normalizedBg.includes("fff3b0") || // light theme
                      normalizedBg.includes("facc15") || // dark theme
                      normalizedBg.includes("daa520") || // midnight theme
                      normalizedBg.includes("ffff00") || // pure yellow
                      normalizedBg.includes("yellow") ||
                      // RGB formats for light theme #fff3b0 = rgb(255, 243, 176)
                      normalizedBg.includes("rgb(255,243,176)") ||
                      normalizedBg.includes("rgba(255,243,176") ||
                      // RGB formats for dark theme #facc15 = rgb(250, 204, 21)
                      normalizedBg.includes("rgb(250,204,21)") ||
                      normalizedBg.includes("rgba(250,204,21") ||
                      // RGB formats for midnight theme #daa520 = rgb(218, 165, 32)
                      normalizedBg.includes("rgb(218,165,32)") ||
                      normalizedBg.includes("rgba(218,165,32") ||
                      // RGB formats for pure yellow #ffff00 = rgb(255, 255, 0)
                      normalizedBg.includes("rgb(255,255,0)") ||
                      normalizedBg.includes("rgba(255,255,0"));

                  if (isLikelyHighlight) {
                    // Keep only background-color, remove everything else
                    const bg = style.backgroundColor;
                    el.removeAttribute("style");
                    el.style.backgroundColor = bg;
                  } else {
                    // Remove all styles for non-highlight elements
                    el.removeAttribute("style");
                  }
                }

                // Remove class attributes that might contain styling
                el.removeAttribute("class");

                // Remove other styling-related attributes
                el.removeAttribute("bgcolor");
                el.removeAttribute("background");
                el.removeAttribute("color");
              });

              // Insert the HTML content as a document fragment
              const fragment = document.createDocumentFragment();
              while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
              }

              range.insertNode(fragment);

              // Move cursor to end of pasted content
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            } else {
              // Plain text - preserve line breaks
              const textNode = document.createTextNode(pasteContent);
              range.insertNode(textNode);

              range.setStartAfter(textNode);
              range.setEndAfter(textNode);
              selection.removeAllRanges();
              selection.addRange(range);
            }

            // CRITICAL FIX: Immediately update the block content to prevent it from disappearing
            // Record the paste time to prevent useEffect interference
            lastPasteTimeRef.current = Date.now();

            // Update lastContentRef SYNCHRONOUSLY with the current DOM content
            // This prevents the useEffect from thinking content has changed
            const updatedContent = e.target.innerHTML;
            lastContentRef.current = updatedContent;

            // Now call onChange - this will trigger a re-render
            // The useEffect will skip updates for 1000ms after paste (increased from 500ms)
            onChange(block.id, { content: updatedContent }, false);
          }
        }
      },
      [block.type, block.id, onKeyDown, readOnly, block.properties]
    );

    // Handle focus - conditional based on read-only
    const handleFocus = useCallback(
      (e) => {
        e.stopPropagation();
        if (onFocus) {
          onFocus(block.id);
        }
      },
      [block.id, onFocus]
    );

    // NEW: Handle blur event
    const handleBlur = useCallback(
      (e) => {
        if (onBlur) {
          onBlur(e);
        }
      },
      [onBlur]
    );

    // NEW: Handle mouse down event
    const handleMouseDown = useCallback(
      (e) => {
        if (onMouseDown) {
          onMouseDown(e);
        }
      },
      [onMouseDown]
    );

    // Handle click with read-only awareness
    const handleClick = useCallback(
      (e) => {
        e.stopPropagation();

        if (onFocus) {
          onFocus(block.id);
        }

        // Check if TODO is checked - allow clicking but not editing
        const isTodoChecked =
          block.type === BlockType.TODO && block.properties?.checked;

        // For checked TODOs, allow focus but not editing
        if (isTodoChecked) {
          if (contentRef.current && !isNonEditableBlock()) {
            contentRef.current.focus();
          }
          return;
        }

        // For regular blocks and unchecked TODOs, normal behavior
        if (!readOnly && document.activeElement !== e.target) {
          if (contentRef.current && !isNonEditableBlock()) {
            contentRef.current.focus();
          }
        }
      },
      [
        block.id,
        onFocus,
        isNonEditableBlock,
        readOnly,
        block.type,
        block.properties,
      ]
    );

    // Enhanced TODO change handler - disabled in read-only mode
    const handleTodoChange = useCallback(
      (checked) => {
        if (readOnly) return;

        if (checked && !hasTodoContent) {
          contentRef.current?.focus();
          return;
        }

        onChange(block.id, {
          properties: { ...block.properties, checked },
        });
      },
      [block.id, block.properties, hasTodoContent, onChange, readOnly]
    );

    // Helper function to get absolute cursor position in contentEditable element
    const getAbsoluteCursorPosition = useCallback(() => {
      if (!contentRef.current) return 0;

      const selection = window.getSelection();
      if (selection.rangeCount === 0) return 0;

      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(contentRef.current);
      preCaretRange.setEnd(range.startContainer, range.startOffset);
      return preCaretRange.toString().length;
    }, []);

    // Slash command detection - disabled for read-only and checked TODOs
    const shouldTriggerSlashMenu = useCallback(() => {
      // Check if TODO is checked - prevent slash commands
      const isTodoChecked =
        block.type === BlockType.TODO && block.properties?.checked;

      if (!contentRef.current || readOnly || isTodoChecked) return false;

      const selection = window.getSelection();
      if (selection.rangeCount === 0) return false;

      const textContent = contentRef.current.textContent || "";
      const cursorPos = getAbsoluteCursorPosition();

      if (cursorPos > 0 && textContent[cursorPos - 1] === "/") {
        if (cursorPos === 1) return true;
        if (cursorPos >= 2 && textContent[cursorPos - 2] === " ") return true;
      }

      return false;
    }, [readOnly, getAbsoluteCursorPosition, block.type, block.properties]);

    // Enhanced keyboard handling - conditional based on read-only
    const handleKeyDownInternal = useCallback(
      (e) => {
        // Check if TODO is checked - allow navigation but block typing
        const isTodoChecked =
          block.type === BlockType.TODO && block.properties?.checked;

        // Block all keyboard input in read-only mode except navigation
        if (readOnly) {
          // Allow navigation keys
          if (
            [
              "ArrowUp",
              "ArrowDown",
              "ArrowLeft",
              "ArrowRight",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          ) {
            onKeyDown?.(e, block.id);
            return;
          }

          // Block all other keys
          e.preventDefault();
          return;
        }

        // For checked TODOs, allow navigation and selection but block typing
        if (isTodoChecked) {
          // Allow navigation keys
          if (
            [
              "ArrowUp",
              "ArrowDown",
              "ArrowLeft",
              "ArrowRight",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          ) {
            onKeyDown?.(e, block.id);
            return;
          }

          // Allow copy operations
          if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
            return; // Allow copying
          }

          // Allow select all
          if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
            return; // Allow select all
          }

          // Block all other keys (typing, pasting, etc.)
          e.preventDefault();
          return;
        }

        // Handle Tab key for indentation
        if (e.key === "Tab") {
          e.preventDefault();

          // For bullet and numbered lists, handle indentation levels with Shift+Tab
          if ((block.type === BlockType.BULLET_LIST || block.type === BlockType.NUMBERED_LIST) && e.shiftKey) {
            const currentIndent = block.properties?.indentLevel || 0;
            const maxIndent = 3; // 0 = main, 1 = first sub, 2 = second sub, 3 = third sub

            if (currentIndent < maxIndent) {
              onChange(block.id, {
                properties: { ...block.properties, indentLevel: currentIndent + 1 }
              });
            }
            return;
          }

          // Default tab behavior: insert spaces
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);

            // Create a text node with 4 spaces
            const tabSpaces = document.createTextNode(
              "\u00A0\u00A0\u00A0\u00A0"
            );

            // Delete any selected content first
            range.deleteContents();

            // Insert the spaces
            range.insertNode(tabSpaces);

            // Move cursor after the inserted spaces
            range.setStartAfter(tabSpaces);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            // Trigger input event to save the change
            const inputEvent = new Event("input", { bubbles: true });
            contentRef.current?.dispatchEvent(inputEvent);
          }
          return;
        }

        // Handle slash command
        if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
          setTimeout(() => {
            if (shouldTriggerSlashMenu() && onKeyDown) {
              onKeyDown(e, block.id, { triggerSlash: true });
            }
          }, 10);
          return;
        }

        // Handle space key
        if (e.key === " " && onKeyDown) {
          onKeyDown(e, block.id, { closeSlash: true });
        }

        // Handle Delete key
        if (e.key === "Delete") {
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const textContent = contentRef.current?.textContent || "";
            const cursorPos = getAbsoluteCursorPosition();

            if (range.collapsed && cursorPos >= textContent.length) {
              e.preventDefault();
              onKeyDown?.(e, block.id, { handleDelete: true });
              return;
            }
          }
        }

        // Handle Backspace key
        if (e.key === "Backspace") {
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const cursorPos = getAbsoluteCursorPosition();

            if (range.collapsed && cursorPos === 0) {
              e.preventDefault();
              onKeyDown?.(e, block.id, { handleBackspace: true });
              return;
            }
          }
        }

        // Handle Enter key
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();

          // Simple debounce for rapid Enter key presses - balanced for speed and preventing duplicates
          const now = Date.now();
          if (now - lastEnterTimeRef.current < 150) {
            return;
          }
          lastEnterTimeRef.current = now;

          if (onKeyDown) {
            onKeyDown(e, block.id);
          }
          return;
        }

        // Handle Shift+Enter key
        if (e.key === "Enter" && e.shiftKey) {
          const isListType = [
            BlockType.NUMBERED_LIST,
            BlockType.BULLET_LIST,
            BlockType.TODO,
          ].includes(block.type);

          if (isListType) {
            // Insert line break for list items but don't add markers
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);

              const br = document.createElement("br");
              range.insertNode(br);

              range.setStartAfter(br);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);

              // Trigger content update to save the changes
              const inputEvent = new Event("input", { bubbles: true });
              contentRef.current?.dispatchEvent(inputEvent);
            }
            return;
          }

          // For non-list types, let browser handle line breaks naturally
          return;
        }

        // Handle arrow keys for block navigation only when at true boundaries
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          const selection = window.getSelection();
          if (selection.rangeCount > 0 && contentRef.current) {
            const textContent = contentRef.current.textContent || "";

            if (textContent.length === 0) {
              // Empty block - navigate immediately
              e.preventDefault();
              onKeyDown?.(e, block.id, { navigateBlocks: true });
              return;
            }

            // Store current cursor position
            const beforeRange = selection.getRangeAt(0);
            const beforeContainer = beforeRange.startContainer;
            const beforeOffset = beforeRange.startOffset;

            // Let the browser handle the arrow key first, then check if cursor actually moved
            setTimeout(() => {
              try {
                const currentSelection = window.getSelection();
                if (currentSelection.rangeCount > 0) {
                  const afterRange = currentSelection.getRangeAt(0);
                  const afterContainer = afterRange.startContainer;
                  const afterOffset = afterRange.startOffset;

                  // Check if cursor position is exactly the same (true boundary hit)
                  const positionUnchanged =
                    beforeContainer === afterContainer &&
                    beforeOffset === afterOffset;

                  if (positionUnchanged) {
                    // Cursor couldn't move - we're at a true boundary
                    onKeyDown?.(
                      new KeyboardEvent("keydown", {
                        key: e.key,
                        code: e.code,
                        bubbles: true,
                        cancelable: true,
                      }),
                      block.id,
                      { navigateBlocks: true }
                    );
                  }
                }
              } catch (error) {
                console.warn("Arrow navigation error:", error);
              }
            }, 0);
          }
        }

        // Forward all other regular keys to parent for slash menu handling
        // This allows ModernBlockEditor to track what's being typed after '/'
        if (onKeyDown && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          onKeyDown(e, block.id);
        }
      },
      [
        block.id,
        shouldTriggerSlashMenu,
        onKeyDown,
        readOnly,
        getAbsoluteCursorPosition,
        block.type,
        block.properties,
      ]
    );

    // Handle type changes
    useEffect(() => {
      // Detect manual type changes
      if (prevBlockTypeRef.current !== block.type) {
        const wasTextBlock = prevBlockTypeRef.current === BlockType.TEXT;
        manualTypeChangeRef.current = true;
        prevBlockTypeRef.current = block.type;

        // Reset the flag after a short delay to allow auto-detection to resume
        setTimeout(() => {
          manualTypeChangeRef.current = false;
        }, 300);

        // CRITICAL FIX: When converting FROM text blocks, immediately force clean content
        const isListType = [
          BlockType.BULLET_LIST,
          BlockType.NUMBERED_LIST,
          BlockType.TODO,
        ].includes(block.type);

        // Universal fix: ensure content synchronization for ALL block type changes
        if (contentRef.current) {
          // Always ensure the content is properly synchronized after type changes
          const blockContent = block.content || "";

          // Check if DOM content doesn't match block state
          if (contentRef.current.innerHTML !== blockContent) {
            // Clear any stray content that might be in the wrong DOM location
            const parentElement = contentRef.current.parentElement;
            if (parentElement) {
              // Remove any text nodes that might be outside the contentEditable div
              const childNodes = Array.from(parentElement.childNodes);
              childNodes.forEach((node) => {
                if (
                  node.nodeType === Node.TEXT_NODE &&
                  node.textContent.trim()
                ) {
                  node.remove();
                }
              });
            }

            // Force content synchronization
            contentRef.current.innerHTML = blockContent;
            lastContentRef.current = blockContent;
          }
        }
      }
    }, [block.type]); // Remove block.content dependency to prevent infinite loops

    // Cleanup
    useEffect(() => {
      return () => {
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }
      };
    }, []);

    // Get numbered list index - now accounts for indentation levels
    const numberedListIndex = useMemo(() => {
      if (block.type !== BlockType.NUMBERED_LIST) return 0;

      const blockIndex = allBlocks?.findIndex((b) => b.id === block.id) ?? -1;
      if (blockIndex === -1) return 0;

      const currentIndent = block.properties?.indentLevel || 0;
      let index = 0;

      // Count backwards to find previous items at the same indentation level
      for (let i = blockIndex - 1; i >= 0; i--) {
        const prevBlock = allBlocks[i];

        if (prevBlock.type !== BlockType.NUMBERED_LIST) {
          break;
        }

        const prevIndent = prevBlock.properties?.indentLevel || 0;

        // If we find a block at a lower indentation level, stop counting
        if (prevIndent < currentIndent) {
          break;
        }

        // Only count blocks at the same indentation level
        if (prevIndent === currentIndent) {
          index++;
        }
      }

      return index;
    }, [allBlocks, block.id, block.type, block.properties?.indentLevel]);

    // Update block content when block.content changes - preserve cursor position
    useEffect(() => {
      if (!contentRef.current) return;

      const currentHTML = contentRef.current.innerHTML;
      const newContent = block.content || "";

      // Check if TODO is checked
      const isTodoChecked =
        block.type === BlockType.TODO && block.properties?.checked;

      // Only update if content is actually different AND element is not focused
      // This prevents cursor jumping during active typing
      const isActiveElement = document.activeElement === contentRef.current;
      const shouldSkipUpdate =
        isActiveElement && updateTimeoutRef.current && newContent !== "";

      // Skip update if we just did a manual type change to prevent conflicts
      const recentTypeChange = manualTypeChangeRef.current;

      // Skip update if we just pasted content (within 1000ms - increased for large pastes)
      const timeSinceLastPaste = Date.now() - lastPasteTimeRef.current;
      const recentPaste = timeSinceLastPaste < 1000;

      if (
        currentHTML !== newContent &&
        !shouldSkipUpdate &&
        !recentTypeChange &&
        !recentPaste &&
        (!rapidDeleteMode || newContent === "")
      ) {
        const selection = window.getSelection();
        let savedCursorPosition = null;

        // Save cursor position only if element is focused and not read-only
        // For checked TODOs, don't save cursor position but allow focus
        const isTodoChecked =
          block.type === BlockType.TODO && block.properties?.checked;
        if (
          isActiveElement &&
          selection.rangeCount > 0 &&
          !readOnly &&
          !isTodoChecked
        ) {
          try {
            const range = selection.getRangeAt(0);
            const textContent = contentRef.current.textContent || "";

            // Simple offset calculation
            const walker = document.createTreeWalker(
              contentRef.current,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );

            let textOffset = 0;
            let node;
            while ((node = walker.nextNode())) {
              if (node === range.startContainer) {
                textOffset += range.startOffset;
                break;
              }
              textOffset += node.textContent.length;
            }

            savedCursorPosition = {
              offset: textOffset,
              isAtEnd: textOffset >= textContent.length,
            };
          } catch (error) {
            // Silently handle cursor position errors
          }
        }

        // Cancel any pending update timer once we accept the new content
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }

        // Update content
        contentRef.current.innerHTML = newContent;
        lastContentRef.current = newContent;

        // Restore cursor position if needed (skip for checked TODOs)
        if (
          savedCursorPosition &&
          isActiveElement &&
          !readOnly &&
          !isTodoChecked
        ) {
          // Use double requestAnimationFrame for better timing
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try {
                const range = document.createRange();
                const sel = window.getSelection();
                const newTextContent = contentRef.current.textContent || "";

                if (savedCursorPosition.isAtEnd) {
                  // Place cursor at end
                  const walker = document.createTreeWalker(
                    contentRef.current,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                  );

                  let lastNode = null;
                  let node;
                  while ((node = walker.nextNode())) {
                    lastNode = node;
                  }

                  if (lastNode) {
                    range.setStart(lastNode, lastNode.textContent.length);
                  } else {
                    range.setStart(contentRef.current, 0);
                  }
                } else {
                  // Restore to saved position
                  const targetOffset = Math.min(
                    savedCursorPosition.offset,
                    newTextContent.length
                  );

                  const walker = document.createTreeWalker(
                    contentRef.current,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                  );

                  let currentOffset = 0;
                  let targetNode = walker.nextNode();

                  while (
                    targetNode &&
                    currentOffset + targetNode.textContent.length < targetOffset
                  ) {
                    currentOffset += targetNode.textContent.length;
                    targetNode = walker.nextNode();
                  }

                  if (targetNode) {
                    const nodeOffset = targetOffset - currentOffset;
                    range.setStart(
                      targetNode,
                      Math.min(nodeOffset, targetNode.textContent.length)
                    );
                  } else {
                    range.setStart(contentRef.current, 0);
                  }
                }

                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              } catch (error) {
                // Silently handle restoration errors
              }
            });
          });
        }
      }
    }, [
      block.content,
      block.type,
      readOnly,
      rapidDeleteMode,
      block.properties,
    ]);

    // Render block content with read-only awareness
    const renderBlockContent = () => {
      const baseClasses =
        "w-full outline-none resize-none bg-transparent border-none block-content rounded-md whitespace-pre-wrap";
      const textClasses =
        "text-gray-900 dark:text-gray-100 midnight:text-gray-100";
      const readOnlyClasses = readOnly
        ? "cursor-not-allowed opacity-70 select-none"
        : "cursor-text";

      const commonProps = {
        "data-block-id": block.id,
        onInput: readOnly ? undefined : handleInput,
        onPaste: readOnly ? undefined : handlePaste,
        onKeyDown: handleKeyDownInternal,
        onFocus: handleFocus,
        onBlur: handleBlur,
        onMouseDown: handleMouseDown,
        onClick: handleClick,
        suppressContentEditableWarning: true,
      };

      switch (block.type) {
        case BlockType.HEADING1:
          return (
            <h1
              ref={contentRef}
              contentEditable={!readOnly}
              className={`${baseClasses} text-3xl font-bold leading-tight ${textClasses} ${readOnlyClasses}`}
              style={{ minHeight: "1.2em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
              placeholder={readOnly ? "" : "Heading 1"}
              {...commonProps}
            />
          );

        case BlockType.HEADING2:
          return (
            <h2
              ref={contentRef}
              contentEditable={!readOnly}
              className={`${baseClasses} text-2xl font-semibold leading-tight ${textClasses} ${readOnlyClasses}`}
              style={{ minHeight: "1.2em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
              placeholder={readOnly ? "" : "Heading 2"}
              {...commonProps}
            />
          );

        case BlockType.HEADING3:
          return (
            <h3
              ref={contentRef}
              contentEditable={!readOnly}
              className={`${baseClasses} text-xl font-medium leading-tight ${textClasses} ${readOnlyClasses}`}
              style={{ minHeight: "1.2em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
              placeholder={readOnly ? "" : "Heading 3"}
              {...commonProps}
            />
          );

        case BlockType.NUMBERED_LIST:
          const numberedIndentLevel = block.properties?.indentLevel || 0;
          const numberedIndentPadding = numberedIndentLevel * 2; // 2rem per level

          return (
            <div className="flex items-start gap-2" style={{ paddingLeft: `${numberedIndentPadding}rem` }}>
              <ListNumber blockIndex={numberedListIndex} indentLevel={numberedIndentLevel} />
              <div
                ref={contentRef}
                contentEditable={!readOnly}
                className={`${baseClasses} flex-1 ${textClasses} ${readOnlyClasses}`}
                style={{ minHeight: "1.2em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
                placeholder={readOnly ? "" : "List item"}
                {...commonProps}
              />
            </div>
          );

        case BlockType.BULLET_LIST:
          const indentLevel = block.properties?.indentLevel || 0;
          const bulletShapes = ['•', '◦', '▪', '▫']; // Main, sub1, sub2, sub3
          const bulletShape = bulletShapes[indentLevel] || '•';
          const indentPadding = indentLevel * 2; // 2rem per level

          return (
            <div className="flex items-start gap-2" style={{ paddingLeft: `${indentPadding}rem` }}>
              <span className="text-gray-500 dark:text-gray-400 mt-0.4 select-none text-lg">
                {bulletShape}
              </span>
              <div
                ref={contentRef}
                contentEditable={!readOnly}
                className={`${baseClasses} flex-1 ${textClasses} ${readOnlyClasses}`}
                style={{ minHeight: "1.2em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
                placeholder={readOnly ? "" : "List item"}
                {...commonProps}
              />
            </div>
          );

        case BlockType.TODO:
          const isTodoChecked = block.properties?.checked;
          const isTodoReadOnly = readOnly || isTodoChecked;
          const canToggleTodo = isTodoChecked || hasTodoContent;
          const todoTooltip =
            !canToggleTodo && !isTodoChecked
              ? "Add content before marking this todo complete"
              : undefined;
          const todoCommonProps = {
            "data-block-id": block.id,
            onInput: isTodoReadOnly ? undefined : handleInput,
            onPaste: isTodoReadOnly ? undefined : handlePaste,
            onKeyDown: handleKeyDownInternal,
            onFocus: handleFocus,
            onBlur: handleBlur,
            onMouseDown: handleMouseDown,
            onClick: handleClick,
            suppressContentEditableWarning: true,
          };
          return (
            <div className="flex items-start gap-2">
              <TodoCheckbox
                checked={isTodoChecked}
                onChange={handleTodoChange}
                blockId={block.id}
                onBlockFocus={onFocus}
                readOnly={readOnly}
                canToggle={canToggleTodo}
                tooltip={todoTooltip}
              />
              <div
                ref={contentRef}
                contentEditable={!isTodoReadOnly}
                className={`${baseClasses} flex-1 ${textClasses} ${
                  isTodoChecked
                    ? "cursor-pointer select-text opacity-60"
                    : readOnlyClasses
                } ${
                  isTodoChecked
                    ? "line-through decoration-teal-500 dark:decoration-teal-400 midnight:decoration-teal-300"
                    : ""
                }`}
                style={{ minHeight: "1.2em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
                placeholder={isTodoReadOnly ? "" : "Todo item"}
                {...todoCommonProps}
              />
            </div>
          );

        case BlockType.QUOTE:
          return (
            <div className="flex gap-3">
              <div className="w-1 bg-gray-300 dark:bg-gray-600 rounded-full flex-shrink-0 self-stretch -my-1"></div>
              <div
                ref={contentRef}
                contentEditable={!readOnly}
                className={`${baseClasses} flex-1 italic text-gray-700 dark:text-gray-300 ${textClasses} ${readOnlyClasses}`}
                style={{ minHeight: "1.2em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
                placeholder={readOnly ? "" : "Quote"}
                {...commonProps}
              />
            </div>
          );

        case BlockType.TABLE:
          return (
            <TableBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              readOnly={readOnly}
              commonProps={commonProps}
            />
          );

        case BlockType.CODE:
          return (
            <CodeBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.DIVIDER:
          return (
            <DividerBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              readOnly={readOnly}
            />
          );

        case BlockType.IMAGE:
          return (
            <ImageBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.VIDEO:
          return (
            <VideoBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.AUDIO:
          return (
            <AudioBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.FILE:
          return (
            <FileBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.CALLOUT:
          return (
            <CalloutBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.TOGGLE:
          return (
            <ToggleBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.EMBED:
          return (
            <EmbedBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.MATH:
          return (
            <MathBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.LINK_PREVIEW:
          return (
            <LinkPreviewBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        // Chart blocks
        case BlockType.LINE_CHART:
          return (
            <LineChartBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.BAR_CHART:
          return (
            <BarChartBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.PIE_CHART:
          return (
            <PieChartBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.AREA_CHART:
          return (
            <AreaChartBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.SCATTER_CHART:
          return (
            <ScatterChartBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.DONUT_CHART:
          return (
            <DonutChartBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        // Advanced blocks
        case BlockType.PROGRESS_BAR:
          return (
            <ProgressBarBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.BREADCRUMB:
          return (
            <BreadcrumbBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        case BlockType.BUTTON:
          return (
            <ButtonBlock
              block={block}
              onChange={readOnly ? undefined : onChange}
              contentRef={contentRef}
              commonProps={commonProps}
              readOnly={readOnly}
            />
          );

        default: // TEXT
          return (
            <div
              ref={contentRef}
              contentEditable={!readOnly}
              className={`${baseClasses} ${textClasses} ${readOnlyClasses}`}
              style={{ minHeight: "1.2em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
              placeholder={readOnly ? "" : "Type '/' for commands..."}
              {...commonProps}
            />
          );
      }
    };

    return (
      <div>
        <div
          className={`group relative py-2 px-3 rounded-lg transition-all duration-200 ${
            readOnly
              ? "bg-gray-100/40 dark:bg-gray-800/20 midnight:bg-gray-800/20 cursor-not-allowed"
              : "bg-transparent"
          } ${
            isAllBlocksSelected && shouldHideButtonsOnSelectAll()
              ? "block-selected-overlay"
              : ""
          } ${
            isSelected
              ? "ring-2 ring-blue-500/50 dark:ring-blue-400/60 midnight:ring-indigo-400/60 bg-blue-500/10 dark:bg-blue-500/10 midnight:bg-indigo-500/10"
              : ""
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !readOnly) {
              if (contentRef.current && !isNonEditableBlock()) {
                contentRef.current.focus();
                if (onFocus) {
                  onFocus(block.id);
                }
              } else if (isNonEditableBlock()) {
                if (onFocus) {
                  onFocus(block.id);
                }
              }
            } else if (e.target === e.currentTarget && readOnly) {
              if (onFocus) {
                onFocus(block.id);
              }
            }
          }}
        >
          <div className="flex items-start gap-2 w-full pr-28 relative">
            <div className="flex-1 min-w-0 w-full">{renderBlockContent()}</div>

            {/* Block actions - hidden in read-only mode */}
            {!readOnly && (
              <div
                className="absolute right-[-0.5rem] top-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0 z-10 block-actions-container"
                data-block-selection-disabled="true"
              >
                <BlockActions
                  onAction={onAction}
                  blockId={block.id}
                  onCopy={onCopy}
                  blockType={block.type}
                  onTypeChange={onTypeChange}
                  dragListeners={dragListeners}
                  dragAttributes={dragAttributes}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

Block.displayName = "Block";

export default memo(Block);
