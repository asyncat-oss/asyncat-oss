// The chat's side panel as a sheet from the right edge, for windows too narrow
// to show it beside the chat. Dialog centres its panel, so the sheet is built
// here: it opens in <body> (over the app rail), takes focus and keeps Tab
// inside while open, gives focus back when it closes, and closes on Escape or
// a click on the dimmed page, unless a menu or dialog is open on top of it.

import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { backdropCloses, isTopLayer, useLayer } from '../../components/ui/floating.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled]), [tabindex]:not([tabindex="-1"]), webview';

export default function SidePanelSheet({ label, onClose, children }) {
  const panelRef = useRef(null);
  const layerRef = useLayer(true, panelRef);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    // The bubble phase, as in Dialog: a field or terminal in the panel that
    // uses Escape itself (and marks it handled) gets it first.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopLayer(layerRef.current)) return;
      event.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, [layerRef]);

  const keepTabInside = (event) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const panel = panelRef.current;
    const fields = [...(panel?.querySelectorAll(FOCUSABLE) || [])].filter((node) => node.getClientRects().length > 0);
    if (!fields.length) {
      event.preventDefault();
      return;
    }
    const first = fields[0];
    const last = fields[fields.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || current === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    // data-command-center: the side panels still carry some older colour
    // classes that rely on the chat page's midnight fallbacks.
    <div
      data-command-center
      className="fixed inset-0 z-[60] flex justify-end bg-black/45 xl:hidden"
      onMouseDown={(event) => {
        if (backdropCloses(event, layerRef.current)) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={keepTabInside}
        className="h-full w-[min(24rem,92vw)] border-l border-line bg-canvas shadow-xl shadow-black/10 outline-none dark:shadow-black/40"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

SidePanelSheet.propTypes = {
  label: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node,
};
