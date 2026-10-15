// A callout: a short note set apart with an icon and a title, in one of a
// few kinds. Info, warning, error and success keep a light tint of their
// status colour (the user picks the kind); the rest are neutral.

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import {
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Lightbulb,
  ChevronDown,
  NotepadText,
  ChevronsRight,
  ChevronsDown,
} from "lucide-react";
import { Menu, MenuItem } from "../../../components/ui/Menu.jsx";
import Switch from "../../../components/ui/Switch.jsx";

const NEUTRAL = {
  box: "bg-hover border-line-strong",
  icon: "text-fg-muted",
};

const CALLOUT_TYPES = [
  {
    type: "info",
    icon: Info,
    label: "Info",
    box: "bg-accent-soft border-accent/50",
    iconColor: "text-accent",
  },
  {
    type: "warning",
    icon: AlertTriangle,
    label: "Warning",
    box: "bg-amber-500/10 border-amber-500/60",
    iconColor: "text-amber-700 dark:text-amber-400",
  },
  {
    type: "error",
    icon: AlertCircle,
    label: "Error",
    box: "bg-red-500/10 border-red-500/60",
    iconColor: "text-red-600 dark:text-red-400",
  },
  {
    type: "success",
    icon: CheckCircle,
    label: "Success",
    box: "bg-emerald-500/10 border-emerald-500/60",
    iconColor: "text-emerald-700 dark:text-emerald-400",
  },
  { type: "question", icon: HelpCircle, label: "Question", box: NEUTRAL.box, iconColor: NEUTRAL.icon },
  { type: "tip", icon: Lightbulb, label: "Tip", box: NEUTRAL.box, iconColor: NEUTRAL.icon },
  { type: "note", icon: NotepadText, label: "Note", box: NEUTRAL.box, iconColor: NEUTRAL.icon },
];

const CALLOUT_SELECTION_STYLE_ID = "callout-selection-overlay-style";

const ensureCalloutSelectionStyle = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(CALLOUT_SELECTION_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = CALLOUT_SELECTION_STYLE_ID;
  style.textContent = `
    .callout-unselectable,
    .callout-unselectable * {
      user-select: none !important;
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
    }
    .callout-unselectable ::selection,
    .callout-unselectable *::selection {
      background: transparent !important;
      color: inherit !important;
    }
    .callout-unselectable ::-moz-selection,
    .callout-unselectable *::-moz-selection {
      background: transparent !important;
      color: inherit !important;
    }
  `;
  document.head.appendChild(style);
};

const CalloutBlock = ({ block, onChange, contentRef, commonProps }) => {
  const [isCollapsed, setIsCollapsed] = useState(
    block.properties?.collapsed || false
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const calloutType = block.properties?.type || "info";
  const title =
    block.properties?.title ||
    calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
  const isCollapsible = block.properties?.collapsible || false;

  const currentCallout =
    CALLOUT_TYPES.find((c) => c.type === calloutType) || CALLOUT_TYPES[0];
  const Icon = currentCallout.icon;

  // Ensure selection style is injected
  useEffect(() => {
    ensureCalloutSelectionStyle();
  }, []);

  const handleTypeChange = (newType) => {
    onChange(block.id, {
      properties: {
        ...block.properties,
        type: newType,
        title: newType.charAt(0).toUpperCase() + newType.slice(1),
      },
    });
    setIsDropdownOpen(false);
  };

  const handleTitleChange = (newTitle) => {
    onChange(block.id, {
      properties: {
        ...block.properties,
        title: newTitle,
      },
    });
  };

  const toggleCollapsible = () => {
    const newCollapsible = !isCollapsible;
    onChange(block.id, {
      properties: {
        ...block.properties,
        collapsible: newCollapsible,
        collapsed: newCollapsible ? false : undefined,
      },
    });
  };

  const toggleCollapsed = () => {
    if (isCollapsible) {
      const newCollapsed = !isCollapsed;
      setIsCollapsed(newCollapsed);
      onChange(block.id, {
        properties: {
          ...block.properties,
          collapsed: newCollapsed,
        },
      });
    }
  };

  return (
    <div
      className={`callout-block group rounded-lg border-l-[3px] ${currentCallout.box}`}
    >
      {/* Controls - shown on hover or while the kind menu is open */}
      <div
        className={`callout-unselectable ${
          isDropdownOpen ? "opacity-100 max-h-20 p-2 border-b" : "opacity-0 max-h-0 p-0 group-hover:opacity-100 group-hover:max-h-20 group-hover:p-2 group-hover:border-b"
        } flex items-center justify-between overflow-hidden border-line transition-all duration-200`}
      >
        <div className="flex items-center gap-3">
          {/* Kind */}
          <button
            ref={dropdownRef}
            type="button"
            onClick={() => setIsDropdownOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={isDropdownOpen}
            className="flex h-7 w-28 items-center justify-between gap-1 rounded-md border border-line-strong bg-canvas px-2 text-[12px] text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${currentCallout.iconColor}`} />
              <span className="truncate">{currentCallout.label}</span>
            </span>
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          </button>

          {/* Collapsible */}
          <label className="flex items-center gap-2 text-[12px] text-fg-muted">
            <Switch
              size="sm"
              checked={isCollapsible}
              onChange={toggleCollapsible}
              label="Collapsible"
            />
            Collapsible
          </label>
        </div>
      </div>

      {/* Header */}
      <div
        className={`callout-unselectable flex items-center gap-2 p-3 ${
          isCollapsible ? "cursor-pointer" : ""
        }`}
        onClick={isCollapsible ? toggleCollapsed : undefined}
      >
        <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${currentCallout.iconColor}`} />

        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="flex-1 border-none bg-transparent font-medium text-fg outline-none placeholder:text-fg-subtle"
          placeholder="Callout title"
          onClick={(e) => isCollapsible && e.stopPropagation()}
        />

        {isCollapsible && (
          <div className="text-fg-subtle">
            {isCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsDown className="h-4 w-4" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {(!isCollapsible || !isCollapsed) && (
        <div className="px-3 pb-3">
          <div
            ref={contentRef}
            contentEditable
            className="text-fg outline-none"
            style={{ minHeight: "1.5em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
            placeholder="Type your callout content..."
            {...commonProps}
          />
        </div>
      )}

      <Menu
        anchorRef={dropdownRef}
        open={isDropdownOpen}
        onClose={() => setIsDropdownOpen(false)}
        width={168}
        label="Callout kind"
      >
        {CALLOUT_TYPES.map((type) => (
          <MenuItem
            key={type.type}
            icon={type.icon}
            label={type.label}
            checked={type.type === calloutType}
            onSelect={() => handleTypeChange(type.type)}
          />
        ))}
      </Menu>
    </div>
  );
};

CalloutBlock.propTypes = {
  block: PropTypes.shape({
    id: PropTypes.string.isRequired,
    properties: PropTypes.object,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  contentRef: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  commonProps: PropTypes.object,
};

export default CalloutBlock;
