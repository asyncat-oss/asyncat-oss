import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

const MenuContext = createContext({ close: () => {} });
const GAP = 6;
const EDGE = 8;

function placeMenu(anchor, menu, placement) {
  let left = anchor.left;
  let top = anchor.bottom + GAP;
  if (placement === 'top-start') top = anchor.top - menu.height - GAP;
  if (placement === 'bottom-end') left = anchor.right - menu.width;
  if (placement === 'right-start') {
    left = anchor.right + GAP;
    top = anchor.top;
  }
  if (placement === 'right-end') {
    left = anchor.right + GAP;
    top = anchor.bottom - menu.height;
  }
  return {
    left: Math.max(EDGE, Math.min(left, window.innerWidth - menu.width - EDGE)),
    top: Math.max(EDGE, Math.min(top, window.innerHeight - menu.height - EDGE)),
  };
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
 * Closes on Escape, on a click outside, and after an item is chosen.
 * Arrow keys move between items.
 */
export function Menu({ anchorRef, open, onClose, placement = 'bottom-start', width = 224, label, className = '', children }) {
  const menuRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = anchorRef.current?.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    if (anchor && menu) setPosition(placeMenu(anchor, menu, placement));
  }, [anchorRef, open, placement]);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });

    const close = () => onCloseRef.current();
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        anchorRef.current?.focus?.();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown'
        ? items[(index + 1) % items.length]
        : items[(index - 1 + items.length) % items.length];
      next.focus();
    };
    const onScroll = (event) => {
      if (!menuRef.current?.contains(event.target)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef, open]);

  if (!open) return null;

  // Portal straight into <body> (not the shared Portal, which mounts a render
  // later) so the layout effect above can measure the menu on open.
  return createPortal(
    <MenuContext.Provider value={{ close: onClose }}>
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        style={{
          position: 'fixed',
          width,
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          visibility: position ? 'visible' : 'hidden',
        }}
        className={`z-[250] animate-[fadeIn_120ms_ease-out] rounded-xl border border-line bg-elevated p-1 text-fg shadow-xl shadow-black/10 dark:shadow-black/40 ${className}`}
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
  placement: PropTypes.oneOf(['bottom-start', 'bottom-end', 'top-start', 'right-start', 'right-end']),
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
