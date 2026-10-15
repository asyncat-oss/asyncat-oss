// The formatting buttons that float above selected text.

import { Bold, Italic, Underline, Strikethrough, Highlighter } from 'lucide-react';

const FloatingToolbar = ({ position, onFormat, selection }) => {

  // EARLY RETURN AFTER ALL HOOKS
  if (!position) return null;

  const isDisabled = Boolean(selection?.disabled);

  const buttons = [
    { icon: Bold, action: 'bold', active: selection?.bold },
    { icon: Italic, action: 'italic', active: selection?.italic },
    { icon: Underline, action: 'underline', active: selection?.underline },
    { icon: Strikethrough, action: 'strikethrough', active: selection?.strikethrough },
    { icon: Highlighter, action: 'highlight', active: selection?.highlight }
  ];



  const topOffset = Math.max(position.top - 12, 12);

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-line bg-elevated p-0.5 shadow-lg shadow-black/10 dark:shadow-black/40"
      style={{
        top: `${topOffset}px`,
        left: `${position.left}px`,
        transform: "translate(-50%, -100%)",
        animation: "fadeIn 0.1s ease-out",
        willChange: "transform, top, left",
      }}
    >
      {/* Format buttons */}
      {buttons.map((button) => {
        const Icon = button.icon;
        return (
          <button
            key={button.action}
            className={`rounded-md p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
              isDisabled
                ? 'cursor-not-allowed text-fg-subtle opacity-50'
                : button.active
                ? 'bg-selected text-fg'
                : 'text-fg-muted hover:bg-hover hover:text-fg'
            }`}
            onClick={() => {
              if (!isDisabled) {
                onFormat(button.action);
              }
            }}
            title={
              isDisabled
                ? "Ticked todos can't be formatted"
                : button.action.charAt(0).toUpperCase() + button.action.slice(1)
            }
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-pressed={Boolean(button.active)}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}

    </div>
  );
};

export default FloatingToolbar;
