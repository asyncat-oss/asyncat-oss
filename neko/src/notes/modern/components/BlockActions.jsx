// The buttons beside a block while it is hovered: its type (opens "Change
// to"), more actions (copy, duplicate, delete) and the drag handle. In a
// narrow editor the type button hides and "Change to" is in "more" instead.

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import {
  MoreHorizontal,
  ChevronDown,
  Copy,
  Trash2,
  CopyPlus,
  GripVertical,
  ArrowLeftRight,
} from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "../../../components/ui/Menu.jsx";
import BlockTypeSelector from "./BlockTypeSelector";

// No display class here: each button adds its own (the type button is
// hidden below the editor's @2xl width).
const HANDLE =
  "h-6 select-none items-center rounded-md text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40";

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
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const moreActionsButtonRef = useRef(null);
  // "Change to" hangs from the type button, or from "more" when the type
  // button is hidden (a narrow editor) and it was chosen from that menu.
  const [typeMenuFromMore, setTypeMenuFromMore] = useState(false);
  const [typeButtonHidden, setTypeButtonHidden] = useState(false);
  const menuOpen = isOpen || showTypeSelector;

  // While a menu is open, the buttons stay visible (they show on hover) and
  // sit above the blocks around them.
  useEffect(() => {
    const parentDiv = menuRef.current?.parentElement;
    if (!parentDiv || !menuOpen) return undefined;
    parentDiv.style.opacity = "1";
    parentDiv.style.visibility = "visible";
    parentDiv.style.zIndex = "9999";
    return () => {
      parentDiv.style.opacity = "";
      parentDiv.style.visibility = "";
      parentDiv.style.zIndex = "";
    };
  }, [menuOpen]);

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
      case BlockType.FILE:
        return "File";
      case BlockType.CALLOUT:
        return "Callout";
      case BlockType.TOGGLE:
        return "Toggle";
      case BlockType.EMBED:
        return "Embed";
      case BlockType.MATH:
        return "Math";
      case BlockType.LINK_PREVIEW:
        return "Link";
      // Charts
      case BlockType.LINE_CHART:
        return "Line chart";
      case BlockType.BAR_CHART:
        return "Bar chart";
      case BlockType.PIE_CHART:
        return "Pie chart";
      case BlockType.AREA_CHART:
        return "Area chart";
      case BlockType.SCATTER_CHART:
        return "Scatter";
      case BlockType.DONUT_CHART:
        return "Donut";
      // Advanced
      case BlockType.PROGRESS_BAR:
        return "Progress";
      case BlockType.BREADCRUMB:
        return "Breadcrumb";
      case BlockType.BUTTON:
        return "Button";
      default:
        return "Text";
    }
  };

  const handleCopyBlock = async () => {
    if (onCopy) {
      await onCopy(blockId);
    }
  };

  const handleTypeChange = (newType) => {
    setShowTypeSelector(false);
    if (onTypeChange) {
      onTypeChange(blockId, newType);
    }
  };

  return (
    <div
      className="relative flex items-center gap-0.5"
      ref={menuRef}
      data-block-selection-disabled="true"
    >
      {/* Block type */}
      <button
        ref={buttonRef}
        type="button"
        className={`${HANDLE} hidden gap-0.5 px-1.5 text-[11px] font-medium @2xl:flex ${
          showTypeSelector ? "bg-selected text-fg" : ""
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(false);
          setTypeMenuFromMore(false);
          setShowTypeSelector((open) => !open);
        }}
        aria-haspopup="menu"
        aria-expanded={showTypeSelector}
        title="Change block type"
      >
        {getDisplayName(blockType)}
        <ChevronDown className="h-3 w-3" />
      </button>

      {/* More actions */}
      <button
        ref={moreActionsButtonRef}
        type="button"
        className={`${HANDLE} flex w-6 justify-center ${isOpen ? "bg-selected text-fg" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowTypeSelector(false);
          setTypeButtonHidden(!buttonRef.current?.getClientRects().length);
          setIsOpen((open) => !open);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="More actions"
        aria-label="More actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {/* Drag handle (the editor finds it by its title) */}
      <div
        className={`${HANDLE} flex w-6 cursor-grab justify-center active:cursor-grabbing`}
        title="Drag to reorder"
        {...(dragListeners || {})}
        {...(dragAttributes || {})}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <BlockTypeSelector
        anchorRef={typeMenuFromMore ? moreActionsButtonRef : buttonRef}
        open={showTypeSelector}
        onClose={() => setShowTypeSelector(false)}
        currentType={blockType}
        onSelect={handleTypeChange}
      />

      <Menu
        anchorRef={moreActionsButtonRef}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        placement="bottom-end"
        width={184}
        label="Block actions"
      >
        <div data-more-actions-dropdown="true" data-block-selection-modal data-block-selection-disabled="true">
          {typeButtonHidden && (
            <>
              <MenuItem
                icon={ArrowLeftRight}
                label="Change to…"
                onSelect={() => {
                  // Back on "more", so a keyboard user lands in the new menu.
                  moreActionsButtonRef.current?.focus({ preventScroll: true });
                  setTypeMenuFromMore(true);
                  setShowTypeSelector(true);
                }}
              />
              <MenuSeparator />
            </>
          )}
          <MenuItem icon={Copy} label="Copy block" onSelect={handleCopyBlock} />
          <MenuItem
            icon={CopyPlus}
            label="Duplicate block"
            onSelect={() => onAction("duplicate", blockId)}
          />
          <MenuSeparator />
          <MenuItem
            icon={Trash2}
            label="Delete block"
            danger
            onSelect={() => onAction("delete", blockId)}
          />
        </div>
      </Menu>
    </div>
  );
};

BlockActions.propTypes = {
  onAction: PropTypes.func.isRequired,
  blockId: PropTypes.string.isRequired,
  onCopy: PropTypes.func,
  blockType: PropTypes.string,
  onTypeChange: PropTypes.func,
  dragListeners: PropTypes.object,
  dragAttributes: PropTypes.object,
};

export default BlockActions;
