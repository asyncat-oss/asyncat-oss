import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Portal from '../Portal';

const TRANSFORMS = {
  right: 'translateY(-50%)',
  top: 'translate(-50%, -100%)',
  bottom: 'translateX(-50%)',
};

/**
 * A label shown on hover or keyboard focus, for controls whose text is hidden
 * (icon-only buttons, the collapsed sidebar). Wraps its child in a block
 * element; pass `disabled` while the label is already visible.
 */
export default function Tooltip({ label, shortcut, side = 'right', disabled = false, delay = 350, className = '', children }) {
  const anchorRef = useRef(null);
  const timerRef = useRef(null);
  const [position, setPosition] = useState(null);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setPosition(null);
  }, []);

  const show = useCallback(() => {
    if (disabled) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (side === 'top') setPosition({ left: rect.left + rect.width / 2, top: rect.top - 6 });
      else if (side === 'bottom') setPosition({ left: rect.left + rect.width / 2, top: rect.bottom + 6 });
      else setPosition({ left: rect.right + 8, top: rect.top + rect.height / 2 });
    }, delay);
  }, [delay, disabled, side]);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);

  return (
    <div
      ref={anchorRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
      onFocus={(event) => {
        // Clicking also focuses; only keyboard focus should reveal the label.
        if (event.target.matches?.(':focus-visible')) show();
      }}
      onBlur={hide}
    >
      {children}
      {position ? (
        <Portal containerId="tooltip-root">
          <div
            role="tooltip"
            style={{ position: 'fixed', left: position.left, top: position.top, transform: TRANSFORMS[side] || TRANSFORMS.right }}
            className="pointer-events-none z-[300] flex animate-[fadeIn_120ms_ease-out] items-center gap-2 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-xs font-medium text-canvas shadow-lg dark:bg-elevated dark:text-fg dark:ring-1 dark:ring-line-strong"
          >
            {label}
            {shortcut ? <span className="font-normal text-white/55 dark:text-fg-subtle">{shortcut}</span> : null}
          </div>
        </Portal>
      ) : null}
    </div>
  );
}

Tooltip.propTypes = {
  label: PropTypes.node.isRequired,
  shortcut: PropTypes.string,
  side: PropTypes.oneOf(['right', 'top', 'bottom']),
  disabled: PropTypes.bool,
  delay: PropTypes.number,
  className: PropTypes.string,
  children: PropTypes.node,
};
