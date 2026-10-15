// A photo or video shown full screen over the app: a dark backdrop, the
// media, and a close button. Escape or a click beside the media closes it.
// It is a modal dialog to assistive tech: focus moves to the close button,
// Tab stays inside, and focus goes back where it was when it closes. Not the
// app's Dialog, which is a card; this fills the screen with the media.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { X } from "lucide-react";
import { wrapFocusIndex } from "./focusWrap";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"]), video[controls]';

export default function MediaViewer({ label, onClose, children }) {
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !rootRef.current) return;
      const items = [...rootRef.current.querySelectorAll(FOCUSABLE)];
      const next = wrapFocusIndex(items.length, items.indexOf(document.activeElement), event.shiftKey);
      if (next >= 0) {
        event.preventDefault();
        items[next].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      {children}
      <button
        ref={closeRef}
        type="button"
        aria-label="Close"
        title="Close (Esc)"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-black/50 text-white outline-none transition-colors hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body
  );
}

MediaViewer.propTypes = {
  label: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node,
};
