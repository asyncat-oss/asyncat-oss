// A small floating panel for a few fields (options for "Try it", say),
// anchored to a button. Menu is role="menu" and can't hold form fields; this
// can.

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { floatingStyle, useDismiss, useFloatingPosition } from './floating.js';

const FOCUSABLE = '[autofocus], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 *   const ref = useRef(null);
 *   <Button ref={ref} onClick={() => setOpen(true)}>Options</Button>
 *   <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} label="Image options">
 *     …fields…
 *   </Popover>
 *
 * Focuses its first field when it opens and gives focus back to the anchor
 * when it closes. Escape and a click outside close it, and so does tabbing
 * past its first or last field.
 */
export default function Popover({ anchorRef, open, onClose, placement = 'bottom-start', width = 280, label, className = '', children }) {
  const panelRef = useRef(null);
  const position = useFloatingPosition(anchorRef, panelRef, open, { placement });
  const placed = Boolean(position);
  useDismiss(panelRef, anchorRef, onClose, Boolean(open));

  useEffect(() => {
    if (!open || !placed) return undefined;
    panelRef.current?.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    return () => {
      // Back to the anchor, unless focus already moved somewhere else on purpose.
      const current = document.activeElement;
      if (!current || current === document.body || panel?.contains(current)) anchor?.focus?.({ preventScroll: true });
    };
  }, [anchorRef, open, placed]);

  if (!open) return null;

  const onKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const fields = [...(panelRef.current?.querySelectorAll(FOCUSABLE) || [])];
    if (!fields.length) return;
    const leavingEnd = !event.shiftKey && document.activeElement === fields[fields.length - 1];
    const leavingStart = event.shiftKey && document.activeElement === fields[0];
    if (leavingEnd || leavingStart) {
      event.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={floatingStyle(position, { width })}
      className={`z-[250] animate-[fadeIn_120ms_ease-out] overflow-y-auto rounded-xl border border-line bg-elevated p-3 text-fg shadow-xl shadow-black/10 dark:shadow-black/40 ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

Popover.propTypes = {
  anchorRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  placement: PropTypes.oneOf(['bottom-start', 'bottom-end', 'top-start', 'top-end', 'right-start', 'right-end']),
  width: PropTypes.number,
  label: PropTypes.string.isRequired,
  className: PropTypes.string,
  children: PropTypes.node,
};
