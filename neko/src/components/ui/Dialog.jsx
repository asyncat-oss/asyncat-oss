import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';

/**
 * A centred modal dialog. Escape and a click on the backdrop close it.
 *
 *   <Dialog open title="Connect OpenAI" description="…" onClose={close}
 *     footer={<Button variant="primary">Save</Button>}>
 *     …body…
 *   </Dialog>
 *
 * Pass `as="form"` with `onSubmit` to make the whole panel a form.
 */
export default function Dialog({
  open = true,
  title,
  description,
  icon = null,
  onClose,
  footer = null,
  size = 'md',
  as: Panel = 'div',
  onSubmit,
  children,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const target = panelRef.current?.querySelector('[autofocus], input:not([type="hidden"]), select, textarea, button');
    target?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.({ preventScroll: true });
    };
    // Focus once per opening; onClose changes identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-4xl' }[size] || 'max-w-xl';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 animate-[fadeIn_120ms_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <Panel
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onSubmit={onSubmit}
        className={`flex max-h-[min(90vh,820px)] w-full ${width} flex-col overflow-hidden rounded-2xl border border-line bg-elevated text-fg shadow-2xl shadow-black/20`}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] leading-5 text-fg-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div> : <div className="pb-2" />}
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/40 px-5 py-3">{footer}</div> : null}
      </Panel>
    </div>,
    document.body,
  );
}

Dialog.propTypes = {
  open: PropTypes.bool,
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  icon: PropTypes.node,
  onClose: PropTypes.func,
  footer: PropTypes.node,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  as: PropTypes.elementType,
  onSubmit: PropTypes.func,
  children: PropTypes.node,
};
