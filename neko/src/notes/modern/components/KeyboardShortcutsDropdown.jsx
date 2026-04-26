import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Command as CommandIcon,
  Keyboard,
} from "lucide-react";

const KeyboardShortcutsDropdown = ({ isVisible, onClose, triggerRef }) => {
  const dropdownRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle animated close
  const handleClose = useCallback(() => {
    if (!isClosing) {
      setIsClosing(true);
      setTimeout(() => {
        setIsClosing(false);
        setShouldRender(false);
        onClose();
      }, 200); // Animation duration
    }
  }, [onClose, isClosing]);

  // Handle visibility changes
  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setIsClosing(false);
    }
  }, [isVisible]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside dropdown
      const isOutsideDropdown =
        dropdownRef.current && !dropdownRef.current.contains(event.target);
      const isOnTrigger =
        triggerRef?.current && triggerRef.current.contains(event.target);

      if (isOutsideDropdown) {
        if (isOnTrigger) {
          // If clicking on trigger while dropdown is open, close it
          handleClose();
        } else {
          // If clicking outside, close it
          handleClose();
        }
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    if (isVisible) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isVisible, handleClose]);

  if (!shouldRender) return null;

  const shortcuts = [
    {
      category: "Navigation",
      shortcuts: [
        { keys: ["↑", "↓", "←", "→"], description: "Navigate Between Blocks" },
        { keys: ["tab"], description: "Navigate Cells in Tables" },
        { keys: ["Escape"], description: "Close Fullscreen Image" },
      ],
    },
    // {
    //   category: "Version History",
    //   shortcuts: [
    //     {
    //       keys: ["Ctrl", "Alt", "Shift", "H"],
    //       description: "Toggle Version History",
    //       mac: ["⌘", "Option", "Shift", "H"],
    //     },
    //     {
    //       keys: ["↑", "↓"],
    //       description: "Navigate Versions",
    //     },
    //     {
    //       keys: ["Esc"],
    //       description: "Close Version Comparison View",
    //     },
    //   ],
    // },
    {
      category: "Text Input",
      shortcuts: [
        {
          keys: ["Enter"],
          description: "Create New Block (Exit List if Empty)",
        },
        {
          keys: ["Shift", "Enter"],
          description: "New Line",
          mac: ["Shift", "Enter"],
        },
        {
          keys: ["Shift", "Tab"],
          description: "Create Subpoint in List",
          mac: ["Shift", "Tab"],
        },
      ],
    },
    {
      category: "Formatting",
      shortcuts: [
        { keys: ["Ctrl", "B"], description: "Bold Text", mac: ["⌘", "B"] },
        { keys: ["Ctrl", "I"], description: "Italic Text", mac: ["⌘", "I"] },
        { keys: ["Ctrl", "U"], description: "Underline Text", mac: ["⌘", "U"] },
        {
          keys: ["Ctrl", "Shift", "S"],
          description: "Strikethrough Text",
          mac: ["⌘", "Shift", "S"],
        },
        {
          keys: ["Ctrl", "Shift", "H"],
          description: "Highlight Text",
          mac: ["⌘", "Shift", "H"],
        },
      ],
    },
    {
      category: "Clipboard",
      shortcuts: [
        { keys: ["Ctrl", "C"], description: "Copy", mac: ["⌘", "C"] },
        { keys: ["Ctrl", "X"], description: "Cut", mac: ["⌘", "X"] },
        { keys: ["Ctrl", "V"], description: "Paste", mac: ["⌘", "V"] },
      ],
    },

    {
      category: "Block Actions",
      shortcuts: [
        {
          keys: ["Ctrl", "D"],
          description: "Duplicate Block",
          mac: ["⌘", "D"],
        },
        {
          keys: ["Ctrl", "Shift", "D"],
          description: "Delete Block",
          mac: ["⌘", "Shift", "D"],
        },
        {
          keys: ["Ctrl", "Delete"],
          description: "Clear Block Content",
          mac: ["⌘", "Delete"],
        },
        {
          keys: ["Ctrl", "A", "A", "Delete"],
          description: "Clear All Content",
          mac: ["⌘", "A", "A", "Delete"],
        },
        {
          keys: ["Alt", "↑"],
          description: "Move Block Up",
          mac: ["Option", "↑"],
        },
        {
          keys: ["Alt", "↓"],
          description: "Move Block Down",
          mac: ["Option", "↓"],
        },
      ],
    },
    {
      category: "Selection",
      shortcuts: [
        {
          keys: ["Ctrl", "A"],
          description: "Select Text in Block",
          mac: ["⌘", "A"],
        },
        {
          keys: ["Ctrl", "A", "A"],
          description: "Select All Blocks",
          mac: ["⌘", "A", "A"],
        },
        {
          keys: ["Ctrl", "Shift", "A"],
          description: "Select Entire Table",
          mac: ["⌘", "Shift", "A"],
        },
      ],
    },
    {
      category: "Commands",
      shortcuts: [{ keys: ["/"], description: "Open Command Menu" }],
    },
    {
      category: "History",
      shortcuts: [
        { keys: ["Ctrl", "Z"], description: "Undo in Block", mac: ["⌘", "Z"] },
        { keys: ["Ctrl", "Y"], description: "Redo in Block", mac: ["⌘", "Y"] },
      ],
    },
    {
      category: "Save & View",
      shortcuts: [
        { keys: ["Ctrl", "S"], description: "Save Note", mac: ["⌘", "S"] },
      ],
    },
  ];

  const isMac = navigator.userAgent.toUpperCase().indexOf("MAC") >= 0;

  const getKeyDisplay = (key) => {
    const normalized = String(key).trim();
    const lower = normalized.toLowerCase();
    const iconClassName = "h-3.5 w-3.5";

    const iconMap = {
      command: <CommandIcon className={iconClassName} strokeWidth={3.2} />,
      cmd: <CommandIcon className={iconClassName} strokeWidth={3.2} />,
      "⌘": <CommandIcon className={iconClassName} strokeWidth={3.2} />,
      arrowup: <ArrowUp className={iconClassName} strokeWidth={3.2} />,
      arrowdown: <ArrowDown className={iconClassName} strokeWidth={3.2} />,
      arrowleft: <ArrowLeft className={iconClassName} strokeWidth={3.2} />,
      arrowright: <ArrowRight className={iconClassName} strokeWidth={3.2} />,
      up: <ArrowUp className={iconClassName} strokeWidth={3.2} />,
      down: <ArrowDown className={iconClassName} strokeWidth={3.2} />,
      left: <ArrowLeft className={iconClassName} strokeWidth={3.2} />,
      right: <ArrowRight className={iconClassName} strokeWidth={3.2} />,
      "↑": <ArrowUp className={iconClassName} strokeWidth={3.2} />,
      "↓": <ArrowDown className={iconClassName} strokeWidth={3.2} />,
      "←": <ArrowLeft className={iconClassName} strokeWidth={3.2} />,
      "→": <ArrowRight className={iconClassName} strokeWidth={3.2} />,
    };

    if (iconMap[normalized]) {
      return { content: iconMap[normalized], isIcon: true };
    }
    if (iconMap[lower]) {
      return { content: iconMap[lower], isIcon: true };
    }

    const keyMap = {
      ctrl: isMac ? "⌃" : "Ctrl",
      control: isMac ? "⌃" : "Ctrl",
      command: "Command",
      "⌘": "Command",
      alt: isMac ? "⌥" : "Alt",
      option: "Option",
      shift: "Shift",
      enter: "Enter",
      return: "Enter",
      tab: "Tab",
      escape: "Esc",
      esc: "Esc",
      delete: "Delete",
      backspace: "Backspace",
      space: "Space",
    };

    if (keyMap[lower]) {
      return { content: keyMap[lower], isIcon: false };
    }
    if (keyMap[normalized]) {
      return { content: keyMap[normalized], isIcon: false };
    }

    const fallback =
      normalized.length === 1 ? normalized.toUpperCase() : normalized;
    return { content: fallback, isIcon: false };
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-[-1.2rem] mt-0.5 z-50 w-[22rem] sm:w-[26rem] max-h-[82vh] overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_22px_50px_-25px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-800 midnight:border-slate-800/60 midnight:bg-slate-900"
      style={{
        animation: isClosing
          ? "fadeOutUp 0.2s ease-in forwards"
          : "fadeInDown 0.24s ease-out",
      }}
    >
      <div className="relative">
        {/* Header */}
        <div className="relative flex items-start justify-between px-5 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400 bg-white/80 text-cyan-500 dark:border-cyan-400/80 dark:bg-slate-900/65 dark:text-cyan-300 midnight:border-cyan-400/80 midnight:bg-slate-900/65 midnight:text-cyan-300">
              <Keyboard className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-300 midnight:text-slate-100">
                Keyboard Shortcuts
              </h3>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative max-h-[70vh] overflow-y-auto px-5 pb-5">
          <div className="space-y-5 pb-2">
            {shortcuts.map((category, categoryIndex) => (
              <section
                key={categoryIndex}
                className="rounded-xl border border-slate-200/60 bg-white/80 px-4 py-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60 midnight:border-slate-800/60 midnight:bg-slate-900/60"
              >
                <header className="mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 midnight:text-slate-300">
                    {category.category}
                  </h4>
                </header>
                <ul className="space-y-2">
                  {category.shortcuts.map((shortcut, shortcutIndex) => {
                    const keysToUse =
                      isMac && shortcut.mac ? shortcut.mac : shortcut.keys;

                    return (
                      <li
                        key={shortcutIndex}
                        className="flex items-center justify-between rounded-lg border border-slate-300/70 bg-slate-50/70 px-3 py-2 backdrop-blur-sm dark:border-slate-600/70 dark:bg-slate-800/40 midnight:border-slate-700/70 midnight:bg-slate-900/40"
                      >
                        <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300 midnight:text-slate-200">
                          {shortcut.description}
                        </span>
                        <div className="ml-4 flex flex-shrink-0 items-center gap-1">
                          {keysToUse.map((key, keyIndex) => {
                            const { content, isIcon } = getKeyDisplay(key);

                            return (
                              <React.Fragment key={keyIndex}>
                                <span
                                  className={`inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/70 bg-white/80 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 shadow-sm dark:border-slate-600/70 dark:bg-slate-900/70 dark:text-slate-200 midnight:border-slate-700/70 midnight:bg-slate-900/70 midnight:text-slate-200 ${
                                    isIcon ? "min-w-[2.35rem]" : ""
                                  }`}
                                >
                                  {content}
                                </span>
                                {keyIndex < keysToUse.length - 1 && (
                                  <span className="text-[10px] font-semibold text-slate-300 dark:text-slate-500 midnight:text-slate-400">
                                    +
                                  </span>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      <style>
        {`@keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeOutUp {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-12px);
          }
        }`}
      </style>
    </div>
  );
};

export default KeyboardShortcutsDropdown;
