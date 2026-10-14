import { createContext, useContext, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { floatingStyle, useDismiss, useFloatingPosition } from './floating.js';

const MenuContext = createContext({ close: () => {} });

/**
 * A floating menu anchored to a trigger element:
 *
 *   const ref = useRef(null);
 *   <button ref={ref} onClick={() => setOpen(true)}>…</button>
 *   <Menu anchorRef={ref} open={open} onClose={() => setOpen(false)} placement="top-start">
 *     <MenuItem icon={Settings} label="Settings" onSelect={openSettings} />
 *     <MenuSeparator />
 *   </Menu>
 *
 * Closes on Escape, on a click outside, and after an item is chosen. Opens
 * above its trigger when there is no room below. Arrow keys, Home and End
 * move between items.
 */
export function Menu({ anchorRef, open, onClose, placement = 'bottom-start', width = 224, label, className = '', children }) {
  const menuRef = useRef(null);
  const position = useFloatingPosition(anchorRef, menuRef, open, { placement });
  useDismiss(menuRef, anchorRef, onClose, Boolean(open));

  // Focus the first item once the menu is placed (a hidden element can't take focus).
  const placed = Boolean(position);
  useEffect(() => {
    if (open && placed) menuRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
  }, [open, placed]);

  if (!open) return null;

  const onKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    const next = {
      ArrowDown: items[(index + 1) % items.length],
      ArrowUp: items[(index - 1 + items.length) % items.length],
      Home: items[0],
      End: items[items.length - 1],
    }[event.key];
    next.focus();
  };

  // Portal straight into <body> (not the shared Portal, which mounts a render
  // later) so the layout effect in useFloatingPosition can measure it on open.
  return createPortal(
    <MenuContext.Provider value={{ close: onClose }}>
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        style={floatingStyle(position, { width })}
        className={`z-[250] animate-[fadeIn_120ms_ease-out] overflow-y-auto rounded-xl border border-line bg-elevated p-1 text-fg shadow-xl shadow-black/10 dark:shadow-black/40 ${className}`}
      >
        {children}
      </div>
    </MenuContext.Provider>,
    document.body,
  );
}

Menu.propTypes = {
  anchorRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  placement: PropTypes.oneOf(['bottom-start', 'bottom-end', 'top-start', 'top-end', 'right-start', 'right-end']),
  width: PropTypes.number,
  label: PropTypes.string,
  className: PropTypes.string,
  children: PropTypes.node,
};

export function MenuItem({ icon: Icon, label, hint, checked, danger = false, disabled = false, keepOpen = false, onSelect }) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        if (!keepOpen) close();
        onSelect?.();
      }}
      className={`flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2.5 py-1 text-left text-[13px] outline-none transition-colors disabled:cursor-default disabled:opacity-50 ${
        danger
          ? 'text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10'
          : 'text-fg-muted hover:bg-hover hover:text-fg focus:bg-hover focus:text-fg'
      }`}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-xs text-fg-subtle">{hint}</span> : null}
      {checked ? <Check className="h-3.5 w-3.5 shrink-0 text-fg" /> : null}
    </button>
  );
}

MenuItem.propTypes = {
  icon: PropTypes.elementType,
  label: PropTypes.node.isRequired,
  hint: PropTypes.node,
  checked: PropTypes.bool,
  danger: PropTypes.bool,
  disabled: PropTypes.bool,
  keepOpen: PropTypes.bool,
  onSelect: PropTypes.func,
};

export function MenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-line" />;
}

export function MenuLabel({ children }) {
  return <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-fg-subtle">{children}</div>;
}

MenuLabel.propTypes = { children: PropTypes.node };
