import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  MoreHorizontal,
  ChevronDown,
  Copy,
  Trash2,
  CopyPlus,
  Move,
} from "lucide-react";
import BlockTypeSelector from "./BlockTypeSelector";

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
  FILE: "file", // NEW: File attachment block
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

const BlockActions = ({
  onAction,
  blockId,
  onCopy,
  blockType,
  onTypeChange,
  dragListeners,
  dragAttributes,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectorPosition, setSelectorPosition] = useState(null);
  const [moreActionsPosition, setMoreActionsPosition] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const moreActionsButtonRef = useRef(null);
  const moreActionsMenuRef = useRef(null);

  // Function to calculate and update selector position
  const updateSelectorPosition = () => {
    if (buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      setSelectorPosition({
        top: buttonRect.bottom + 2,
        left: buttonRect.left,
      });
    }
  };

  // Function to calculate and update more actions position
  const updateMoreActionsPosition = () => {
    if (moreActionsButtonRef.current) {
      const buttonRect = moreActionsButtonRef.current.getBoundingClientRect();
      setMoreActionsPosition({
        top: buttonRect.bottom + 2,
        left: buttonRect.left,
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Only handle mousedown events
      if (event.type !== "mousedown") return;

      // Check if click is inside this specific menu or the portal selector
      const isInsideThisMenu =
        menuRef.current && menuRef.current.contains(event.target);
      const isInsidePortalSelector = event.target.closest(
        "[data-block-type-selector]"
      );
      const isInsideMoreActionsMenu =
        moreActionsMenuRef.current && moreActionsMenuRef.current.contains(event.target);

      if (!isInsideThisMenu && !isInsidePortalSelector && !isInsideMoreActionsMenu) {
        setIsOpen(false);
        setShowTypeSelector(false);
      }
    };

    if (showTypeSelector || isOpen) {
      document.addEventListener("mousedown", handleClickOutside, true);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside, true);
      };
    }
  }, [showTypeSelector, isOpen]);

  // Update selector position on scroll or resize
  useEffect(() => {
    if (showTypeSelector) {
      const handleScroll = () => updateSelectorPosition();
      const handleResize = () => updateSelectorPosition();

      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", handleResize);
      };
    }
  }, [showTypeSelector]);

  // Update more actions position on scroll or resize
  useEffect(() => {
    if (isOpen) {
      const handleScroll = () => updateMoreActionsPosition();
      const handleResize = () => updateMoreActionsPosition();

      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", handleResize);
      };
    }
  }, [isOpen]);

  // Force parent visibility when selector is open
  useEffect(() => {
    const parentDiv = menuRef.current?.parentElement;
    if (parentDiv && showTypeSelector) {
      // Force the parent BlockActions wrapper to stay visible
      parentDiv.style.opacity = "1";
      parentDiv.style.visibility = "visible";

      return () => {
        // Reset when selector closes
        if (parentDiv) {
          parentDiv.style.opacity = "";
          parentDiv.style.visibility = "";
        }
      };
    }
  }, [showTypeSelector]);

  // Force parent visibility when more actions menu is open
  useEffect(() => {
    const parentDiv = menuRef.current?.parentElement;
    if (parentDiv && isOpen) {
      // Force the parent BlockActions wrapper to stay visible and increase z-index
      parentDiv.style.opacity = "1";
      parentDiv.style.visibility = "visible";
      parentDiv.style.zIndex = "9999";

      return () => {
        // Reset when menu closes
        if (parentDiv) {
          parentDiv.style.opacity = "";
          parentDiv.style.visibility = "";
          parentDiv.style.zIndex = "";
        }
      };
    }
  }, [isOpen]);

  const getDisplayName = (type) => {
    switch (type) {
      case BlockType.TEXT:
        return "Text";
      case BlockType.HEADING1:
        return "H1";
      case BlockType.HEADING2:
        return "H2";
      case BlockType.HEADING3:
        return "H3";
      case BlockType.NUMBERED_LIST:
        return "Numbered";
      case BlockType.BULLET_LIST:
        return "Bullet";
      case BlockType.TODO:
        return "Todo";
      case BlockType.QUOTE:
        return "Quote";
      case BlockType.TABLE:
        return "Table";
      case BlockType.CODE:
        return "Code";
      case BlockType.DIVIDER:
        return "Divider";
      case BlockType.IMAGE:
        return "Image";
      case BlockType.VIDEO:
        return "Video";
      case BlockType.AUDIO:
        return "Audio";
      // case BlockType.FILE:
      //   return "File"; // NEW: Display name for file blocks
      case BlockType.CALLOUT:
        return "Callout";
      // case BlockType.TOGGLE:
      //   return "Toggle";
      // case BlockType.EMBED:
      //   return "Embed";
      // case BlockType.MATH:
      //   return "Math";
      case BlockType.LINK_PREVIEW:
        return "Link";
      // Charts
      case BlockType.LINE_CHART:
        return "Line Chart";
      case BlockType.BAR_CHART:
        return "Bar Chart";
      case BlockType.PIE_CHART:
        return "Pie Chart";
      case BlockType.AREA_CHART:
        return "Area Chart";
      case BlockType.SCATTER_CHART:
        return "Scatter";
      case BlockType.DONUT_CHART:
        return "Donut";
      // Layout
      // Advanced
      // case BlockType.PROGRESS_BAR:
      //   return "Progress";
      // case BlockType.BREADCRUMB:
      //   return "Breadcrumb";
      // case BlockType.BUTTON:
      //   return "Button";
      default:
        return "Text";
    }
  };

  const handleCopyBlock = async () => {
    setIsOpen(false);
    if (onCopy) {
      await onCopy(blockId);
    }
  };

  const handleDuplicateBlock = () => {
    setIsOpen(false);
    onAction("duplicate", blockId);
  };

  const handleDeleteBlock = () => {
    setIsOpen(false);
    onAction("delete", blockId);
  };

  const handleTypeChange = (newType) => {
    setShowTypeSelector(false);
    if (onTypeChange) {
      onTypeChange(blockId, newType);
    }
  };

  return (
    <div
      className={`relative flex items-center gap-1 ${
        showTypeSelector ? "opacity-100" : ""
      }`}
      ref={menuRef}
      data-block-selection-disabled="true"
      style={
        showTypeSelector
          ? { visibility: "visible", opacity: "1 !important" }
          : {}
      }
    >
      {/* Block type selector button */}
      <button
        ref={buttonRef}
        className={`p-1 rounded flex items-center gap-1 select-none ${
          showTypeSelector
            ? "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-600 dark:text-gray-200 midnight:text-gray-200"
            : "hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 midnight:hover:text-gray-200"
        }`}
        onClick={(e) => {
          if (showTypeSelector) {
            setShowTypeSelector(false);
            return;
          }
          e.preventDefault();
          e.stopPropagation();

          // Calculate initial position and show selector
          updateSelectorPosition();
          setShowTypeSelector(true);
          setIsOpen(false);
        }}
        title="Change block type"
      >
        <span className="text-xs font-medium select-none">
          {getDisplayName(blockType)}
        </span>
        <ChevronDown className="w-3 h-3 select-none" />
      </button>

      {/* More actions button */}
      <button
        ref={moreActionsButtonRef}
        className={`p-1 rounded select-none ${
          isOpen
            ? "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-600 dark:text-gray-200 midnight:text-gray-200"
            : "hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 midnight:hover:text-gray-200"
        }`}
        onClick={(e) => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          e.preventDefault();
          e.stopPropagation();

          // Calculate initial position and show menu
          updateMoreActionsPosition();
          setIsOpen(true);
          setShowTypeSelector(false);
        }}
        title="More actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Drag handle */}
      <div
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 midnight:hover:text-gray-200 cursor-grab active:cursor-grabbing select-none"
        title="Drag to reorder"
        {...(dragListeners || {})}
        {...(dragAttributes || {})}
      >
        <Move className="w-4 h-4" />
      </div>

      {/* Block Type Selector */}
      {showTypeSelector && selectorPosition && (
        <BlockTypeSelector
          currentType={blockType}
          position={selectorPosition}
          buttonRef={buttonRef}
          onSelect={handleTypeChange}
          onClose={() => setShowTypeSelector(false)}
        />
      )}

      {/* Actions Menu - using portal for proper z-index */}
      {isOpen && moreActionsPosition && createPortal(
        <div
          ref={moreActionsMenuRef}
          className="fixed z-[9999] bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-600 py-1 w-44 select-none"
          style={{
            top: moreActionsPosition.top,
            left: moreActionsPosition.left,
            animation: "fadeIn 0.1s ease-out",
          }}
          data-more-actions-dropdown="true"
          data-block-selection-modal
          data-block-selection-disabled="true"
          onMouseLeave={(e) => {
            const relatedTarget = e.relatedTarget;

            // Don't close if hovering over this block's more actions button
            if (moreActionsButtonRef?.current && moreActionsButtonRef.current.contains(relatedTarget)) {
              return;
            }

            // Don't close if hovering over this block's actions container
            if (menuRef?.current && menuRef.current.contains(relatedTarget)) {
              return;
            }

            setIsOpen(false);
          }}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-gray-900 dark:text-gray-300 midnight:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-600 flex items-center gap-2"
            onClick={handleCopyBlock}
          >
            <Copy className="w-4 h-4" />
            Copy Block
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-gray-900 dark:text-gray-300 midnight:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-600 flex items-center gap-2"
            onClick={handleDuplicateBlock}
          >
            <CopyPlus className="w-4 h-4" />
            Duplicate Block
          </button>
          <hr className="my-1 border-gray-200 dark:border-gray-700 midnight:border-gray-600" />
          <button
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-600 flex items-center gap-2 text-red-600 dark:text-red-400 midnight:text-red-300"
            onClick={handleDeleteBlock}
          >
            <Trash2 className="w-4 h-4" />
            Delete Block
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default BlockActions;
