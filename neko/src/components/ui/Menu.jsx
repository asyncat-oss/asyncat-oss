import { createContext, useContext, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { floatingStyle, useDismiss, useFloatingPosition } from './floating.js';

const MenuContext = createContext({ close: () => {} });
const MOVE_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

function menuItems(menu) {
  return [...(menu?.querySelectorAll('[role^="menuitem"]:not([disabled])') || [])];
}

/**
 * Arrow keys, Home and End move to the next item, wrapping round. From
 * outside the menu, down starts at the top and up at the bottom.
 */
function moveFocus(event, items) {
  if (!items.length) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement);
  const last = items.length - 1;
  let next;
  if (event.key === 'Home' || (event.key === 'ArrowDown' && index === -1)) next = 0;
  else if (event.key === 'End' || (event.key === 'ArrowUp' && index === -1)) next = last;
  else next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
  items[next].focus();
}

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

  // The menu stays hidden until it is placed, and a hidden item can't take
  // focus, so this waits for the position. Opened from the keyboard, the
  // first item gets focus; opened by a click, focus stays on the trigger
  // and the arrow keys start from the top.
  const placed = Boolean(position);
  useEffect(() => {
    if (!open || !placed) return;
    const trigger = document.activeElement;
    if (!anchorRef.current?.contains(trigger) || !trigger.matches(':focus-visible')) return;
    menuItems(menuRef.current)[0]?.focus({ preventScroll: true });
  }, [anchorRef, open, placed]);

  // With focus still on the trigger (opened by a click), the arrow keys go
  // into the menu: down and Home to the first item, up and End to the last.
  // Keys pressed inside the menu are handled by onKeyDown below.
  useEffect(() => {
    if (!open || !placed) return undefined;
    const onTriggerKeyDown = (event) => {
      if (!MOVE_KEYS.includes(event.key) || !anchorRef.current?.contains(document.activeElement)) return;
      // The open menu owns these keys, not a list the trigger sits in.
      event.stopPropagation();
      moveFocus(event, menuItems(menuRef.current));
    };
    document.addEventListener('keydown', onTriggerKeyDown, true);
    return () => document.removeEventListener('keydown', onTriggerKeyDown, true);
  }, [anchorRef, open, placed]);

  if (!open) return null;

  const onKeyDown = (event) => {
    if (MOVE_KEYS.includes(event.key)) moveFocus(event, menuItems(menuRef.current));
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
      // A choice among options (a model, a sort order) says whether it is the
      // chosen one, for screen readers too.
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked === undefined ? undefined : Boolean(checked)}
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
