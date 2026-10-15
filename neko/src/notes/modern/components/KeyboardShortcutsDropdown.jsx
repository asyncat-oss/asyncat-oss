// The note's keyboard shortcuts, in a panel under the header's keyboard button.

import { Fragment } from "react";
import PropTypes from "prop-types";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Command as CommandIcon,
} from "lucide-react";
import Popover from "../../../components/ui/Popover.jsx";

const KeyboardShortcutsDropdown = ({ isVisible, onClose, triggerRef }) => {
  const shortcuts = [
    {
      category: "Navigation",
      shortcuts: [
        { keys: ["↑", "↓", "←", "→"], description: "Move between blocks" },
        { keys: ["tab"], description: "Move between table cells" },
        { keys: ["Escape"], description: "Close a full-screen image" },
      ],
    },
    {
      category: "Typing",
      shortcuts: [
        {
          keys: ["Enter"],
          description: "New block (leaves an empty list)",
        },
        {
          keys: ["Shift", "Enter"],
          description: "New line",
          mac: ["Shift", "Enter"],
        },
        {
          keys: ["Shift", "Tab"],
          description: "Indent a list item",
          mac: ["Shift", "Tab"],
        },
      ],
    },
    {
      category: "Formatting",
      shortcuts: [
        { keys: ["Ctrl", "B"], description: "Bold", mac: ["⌘", "B"] },
        { keys: ["Ctrl", "I"], description: "Italic", mac: ["⌘", "I"] },
        { keys: ["Ctrl", "U"], description: "Underline", mac: ["⌘", "U"] },
        {
          keys: ["Ctrl", "Shift", "S"],
          description: "Strikethrough",
          mac: ["⌘", "Shift", "S"],
        },
        {
          keys: ["Ctrl", "Shift", "H"],
          description: "Highlight",
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
      category: "Blocks",
      shortcuts: [
        {
          keys: ["Ctrl", "D"],
          description: "Duplicate block",
          mac: ["⌘", "D"],
        },
        {
          keys: ["Ctrl", "Shift", "D"],
          description: "Delete block",
          mac: ["⌘", "Shift", "D"],
        },
        {
          keys: ["Ctrl", "Delete"],
          description: "Clear block",
          mac: ["⌘", "Delete"],
        },
        {
          keys: ["Ctrl", "A", "A", "Delete"],
          description: "Clear the whole note",
          mac: ["⌘", "A", "A", "Delete"],
        },
        {
          keys: ["Alt", "↑"],
          description: "Move block up",
          mac: ["Option", "↑"],
        },
        {
          keys: ["Alt", "↓"],
          description: "Move block down",
          mac: ["Option", "↓"],
        },
      ],
    },
    {
      category: "Selection",
      shortcuts: [
        {
          keys: ["Ctrl", "A"],
          description: "Select text in block",
          mac: ["⌘", "A"],
        },
        {
          keys: ["Ctrl", "A", "A"],
          description: "Select all blocks",
          mac: ["⌘", "A", "A"],
        },
        {
          keys: ["Ctrl", "Shift", "A"],
          description: "Select the whole table",
          mac: ["⌘", "Shift", "A"],
        },
      ],
    },
    {
      category: "Commands",
      shortcuts: [{ keys: ["/"], description: "Open the block menu" }],
    },
    {
      category: "History",
      shortcuts: [
        { keys: ["Ctrl", "Z"], description: "Undo", mac: ["⌘", "Z"] },
        { keys: ["Ctrl", "Y"], description: "Redo", mac: ["⌘", "Y"] },
      ],
    },
    {
      category: "Saving",
      shortcuts: [
        { keys: ["Ctrl", "S"], description: "Save now", mac: ["⌘", "S"] },
      ],
    },
  ];

  const isMac = navigator.userAgent.toUpperCase().indexOf("MAC") >= 0;

  const getKeyDisplay = (key) => {
    const normalized = String(key).trim();
    const lower = normalized.toLowerCase();
    const iconClassName = "h-3 w-3";

    const iconMap = {
      command: <CommandIcon className={iconClassName} strokeWidth={2.25} />,
      cmd: <CommandIcon className={iconClassName} strokeWidth={2.25} />,
      "⌘": <CommandIcon className={iconClassName} strokeWidth={2.25} />,
      arrowup: <ArrowUp className={iconClassName} strokeWidth={2.25} />,
      arrowdown: <ArrowDown className={iconClassName} strokeWidth={2.25} />,
      arrowleft: <ArrowLeft className={iconClassName} strokeWidth={2.25} />,
      arrowright: <ArrowRight className={iconClassName} strokeWidth={2.25} />,
      up: <ArrowUp className={iconClassName} strokeWidth={2.25} />,
      down: <ArrowDown className={iconClassName} strokeWidth={2.25} />,
      left: <ArrowLeft className={iconClassName} strokeWidth={2.25} />,
      right: <ArrowRight className={iconClassName} strokeWidth={2.25} />,
      "↑": <ArrowUp className={iconClassName} strokeWidth={2.25} />,
      "↓": <ArrowDown className={iconClassName} strokeWidth={2.25} />,
      "←": <ArrowLeft className={iconClassName} strokeWidth={2.25} />,
      "→": <ArrowRight className={iconClassName} strokeWidth={2.25} />,
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
    <Popover
      anchorRef={triggerRef}
      open={Boolean(isVisible)}
      onClose={onClose}
      placement="bottom-end"
      width={360}
      label="Keyboard shortcuts"
      className="max-h-[70vh]"
    >
      <h3 className="px-1 text-[13px] font-semibold text-fg">
        Keyboard shortcuts
      </h3>
      <div className="space-y-4 px-1 pb-1 pt-3">
        {shortcuts.map((category) => (
          <section key={category.category}>
            <h4 className="mb-1 text-[12px] text-fg-subtle">{category.category}</h4>
            <ul>
              {category.shortcuts.map((shortcut) => {
                const keysToUse =
                  isMac && shortcut.mac ? shortcut.mac : shortcut.keys;

                return (
                  <li
                    key={shortcut.description}
                    className="flex items-center justify-between gap-4 py-1"
                  >
                    <span className="text-[13px] text-fg-muted">
                      {shortcut.description}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1">
                      {keysToUse.map((key, keyIndex) => {
                        const { content } = getKeyDisplay(key);
                        return (
                          <Fragment key={keyIndex}>
                            {keyIndex > 0 && (
                              <span className="text-[11px] text-fg-subtle">+</span>
                            )}
                            <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface px-1.5 font-sans text-[11px] text-fg-muted">
                              {content}
                            </kbd>
                          </Fragment>
                        );
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Popover>
  );
};

KeyboardShortcutsDropdown.propTypes = {
  isVisible: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  triggerRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
};

export default KeyboardShortcutsDropdown;
