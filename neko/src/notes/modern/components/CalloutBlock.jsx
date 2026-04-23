import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const dropdownRef = useRef(null);
  const dropdownMenuRef = useRef(null);

  const calloutType = block.properties?.type || "info";
  const title =
    block.properties?.title ||
    calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
  const isCollapsible = block.properties?.collapsible || false;

  const calloutTypes = [
    {
      type: "info",
      icon: Info,
      label: "Info",
      bgColor: "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-950/30",
      borderColor:
        "border-blue-200 dark:border-blue-800 midnight:border-blue-900",
      textColor: "text-blue-800 dark:text-blue-200 midnight:text-blue-300",
    },
    {
      type: "warning",
      icon: AlertTriangle,
      label: "Warning",
      bgColor: "bg-yellow-50 dark:bg-yellow-900/20 midnight:bg-yellow-950/30",
      borderColor:
        "border-yellow-200 dark:border-yellow-800 midnight:border-yellow-900",
      textColor:
        "text-yellow-800 dark:text-yellow-200 midnight:text-yellow-300",
    },
    {
      type: "error",
      icon: AlertCircle,
      label: "Error",
      bgColor: "bg-red-50 dark:bg-red-900/20 midnight:bg-red-950/30",
      borderColor: "border-red-200 dark:border-red-800 midnight:border-red-900",
      textColor: "text-red-800 dark:text-red-200 midnight:text-red-300",
    },
    {
      type: "success",
      icon: CheckCircle,
      label: "Success",
      bgColor: "bg-green-50 dark:bg-green-900/20 midnight:bg-green-950/30",
      borderColor:
        "border-green-200 dark:border-green-800 midnight:border-green-900",
      textColor: "text-green-800 dark:text-green-200 midnight:text-green-300",
    },
    {
      type: "question",
      icon: HelpCircle,
      label: "Question",
      bgColor: "bg-purple-50 dark:bg-purple-900/20 midnight:bg-purple-950/30",
      borderColor:
        "border-purple-200 dark:border-purple-800 midnight:border-purple-900",
      textColor:
        "text-purple-800 dark:text-purple-200 midnight:text-purple-300",
    },
    {
      type: "tip",
      icon: Lightbulb,
      label: "Tip",
      bgColor:
        "bg-emerald-50 dark:bg-emerald-900/20 midnight:bg-emerald-950/30",
      borderColor:
        "border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900",
      textColor:
        "text-emerald-800 dark:text-emerald-200 midnight:text-emerald-300",
    },
    {
      type: "note",
      icon: NotepadText,
      label: "Note",
      bgColor: "bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/60",
      borderColor:
        "border-gray-200 dark:border-gray-700 midnight:border-gray-800",
      textColor: "text-gray-800 dark:text-gray-200 midnight:text-gray-300",
    },
  ];

  const currentCallout =
    calloutTypes.find((c) => c.type === calloutType) || calloutTypes[0];
  const Icon = currentCallout.icon;

  // Ensure selection style is injected
  useEffect(() => {
    ensureCalloutSelectionStyle();
  }, []);

  // Function to calculate and update dropdown position
  const updateDropdownPosition = () => {
    if (dropdownRef.current) {
      const buttonRect = dropdownRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: buttonRect.bottom + 2,
        left: buttonRect.left,
      });
    }
  };

  // Close dropdown on scroll, resize, or visibility change
  useEffect(() => {
    if (isDropdownOpen) {
      const handleScroll = () => setIsDropdownOpen(false);
      const handleResize = () => setIsDropdownOpen(false);
      const handleVisibilityChange = () => setIsDropdownOpen(false);

      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", handleResize);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", handleResize);
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      };
    }
  }, [isDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        dropdownMenuRef.current &&
        !dropdownMenuRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  // Close dropdown when mouse leaves the callout block
  const handleMouseLeave = () => {
    setIsDropdownOpen(false);
  };

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
      className={`callout-block border-l-4 rounded-lg ${currentCallout.bgColor} ${currentCallout.borderColor} group`}
      onMouseLeave={(e) => {
        // Check if mouse is entering the dropdown menu
        const dropdownMenu = dropdownMenuRef.current;
        if (dropdownMenu && dropdownMenu.contains(e.relatedTarget)) {
          return; // Don't close if moving to dropdown menu
        }
        setIsDropdownOpen(false);
      }}
    >
      {/* Controls - shown on hover or when dropdown is open */}
      <div
        className={`callout-unselectable ${
          isDropdownOpen ? "opacity-100 max-h-20 p-2 border-b" : "opacity-0 max-h-0 p-0 group-hover:opacity-100 group-hover:max-h-20 group-hover:p-2 group-hover:border-b"
        } transition-all duration-200 flex justify-between items-center overflow-hidden border-gray-200 dark:border-gray-700`}
      >
        <div className="flex items-center gap-2">
          {/* Type selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => {
                if (isDropdownOpen) {
                  setIsDropdownOpen(false);
                  return;
                }
                // Calculate initial position and show dropdown
                updateDropdownPosition();
                setIsDropdownOpen(true);
              }}
              className="text-xs bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded px-2 py-1 text-gray-600 dark:text-gray-400 midnight:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 midnight:focus:ring-indigo-500 flex items-center justify-between w-24"
            >
              <div className="flex items-center gap-1 min-w-0">
                <Icon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{currentCallout.label}</span>
              </div>
              <ChevronDown
                className={`w-3 h-3 flex-shrink-0 transition-transform ${
                  isDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {/* Collapsible toggle */}
          <button
            onClick={toggleCollapsible}
            className={`text-xs px-2 py-1 rounded border ${
              isCollapsible
                ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600"
            }`}
          >
            {isCollapsible ? "Collapsible" : "Make collapsible"}
          </button>
        </div>
      </div>

      {/* Header */}
      <div
        className={`callout-unselectable flex items-center gap-2 p-3 ${
          isCollapsible ? "cursor-pointer" : ""
        }`}
        onClick={isCollapsible ? toggleCollapsed : undefined}
      >
        <Icon className={`w-5 h-5 ${currentCallout.textColor} flex-shrink-0`} />

        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className={`flex-1 font-medium bg-transparent border-none outline-none ${currentCallout.textColor}`}
          placeholder="Callout title"
          onClick={(e) => isCollapsible && e.stopPropagation()}
        />

        {isCollapsible && (
          <div className={`${currentCallout.textColor}`}>
            {isCollapsed ? (
              <ChevronsRight className="w-4 h-4" />
            ) : (
              <ChevronsDown className="w-4 h-4" />
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
            className={`outline-none ${currentCallout.textColor} opacity-90`}
            style={{ minHeight: "1.5em", overflowWrap: "anywhere", wordBreak: "break-word", hyphens: "none" }}
            placeholder="Type your callout content..."
            {...commonProps}
          />
        </div>
      )}

      {/* Dropdown portal */}
      {isDropdownOpen &&
        dropdownPosition &&
        createPortal(
          <div
            ref={dropdownMenuRef}
            onMouseLeave={() => setIsDropdownOpen(false)}
            className="fixed bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded shadow-lg z-[40] w-24"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              animation: "fadeIn 0.1s ease-out",
            }}
          >
            {calloutTypes.map((type) => {
              const TypeIcon = type.icon;
              return (
                <button
                  key={type.type}
                  onClick={() => handleTypeChange(type.type)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 flex items-center gap-2 ${
                    type.type === calloutType
                      ? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-950/30 text-blue-700 dark:text-blue-300 midnight:text-blue-400"
                      : "text-gray-600 dark:text-gray-400 midnight:text-gray-500"
                  }`}
                >
                  <TypeIcon className="w-3 h-3" />
                  {type.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};

export default CalloutBlock;
