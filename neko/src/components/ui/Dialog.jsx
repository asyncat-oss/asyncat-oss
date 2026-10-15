import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';
import { backdropCloses, isTopLayer, useLayer } from './floating.js';

/**
 * A centred modal dialog. Escape and a click on the backdrop close it, unless
 * something is open on top of it: with a Select open in it, or dialogs
 * stacked, they close only the top one.
 *
 *   <Dialog open title="Connect OpenAI" description="…" onClose={close}
 *     footer={<Button variant="primary">Save</Button>}>
 *     …body…
 *   </Dialog>
 *
 * Pass `as="form"` with `onSubmit` to make the whole panel a form.
 * `role="alertdialog"` is for questions that interrupt (the confirm dialog):
 * it sits above other dialogs, since it often opens on top of one.
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
  role = 'dialog',
  closeButton = true,
  children,
}) {
  const panelRef = useRef(null);
  const layerRef = useLayer(open, panelRef);
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const target = panelRef.current?.querySelector('[autofocus], input:not([type="hidden"]), select, textarea, button');
    target?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && isTopLayer(layerRef.current)) {
        event.stopPropagation();
        onCloseRef.current?.();
      }
    };
    // An alertdialog has only buttons, so it takes Escape first (window,
    // capture phase) and stops it there: older overlays underneath that
    // aren't in the layer stack never see it. A plain dialog waits for the
    // bubble phase, so a field inside it can use Escape first.
    const capture = role === 'alertdialog';
    const listenOn = capture ? window : document;
    listenOn.addEventListener('keydown', onKeyDown, capture);
    return () => {
      listenOn.removeEventListener('keydown', onKeyDown, capture);
      previous?.focus?.({ preventScroll: true });
    };
    // Focus once per opening.
  }, [layerRef, open, role]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-4xl' }[size] || 'max-w-xl';

  return createPortal(
    <div
      className={`fixed inset-0 ${role === 'alertdialog' ? 'z-[300]' : 'z-[200]'} flex items-center justify-center bg-black/45 p-4 animate-[fadeIn_120ms_ease-out]`}
      // React runs this before useDismiss's document listener, so a list open
      // in the dialog is still the top layer here and only it closes.
      onMouseDown={(event) => {
        if (backdropCloses(event, layerRef.current)) onClose?.();
      }}
    >
      <Panel
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        aria-describedby={description ? descriptionId : undefined}
        onSubmit={onSubmit}
        className={`flex max-h-[min(90vh,820px)] w-full ${width} flex-col overflow-hidden rounded-2xl border border-line bg-elevated text-fg shadow-xl shadow-black/10 dark:shadow-black/40`}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
            {description ? <p id={descriptionId} className="mt-0.5 whitespace-pre-line text-[13px] leading-5 text-fg-muted">{description}</p> : null}
          </div>
          {closeButton ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
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
  role: PropTypes.oneOf(['dialog', 'alertdialog']),
  closeButton: PropTypes.bool,
  children: PropTypes.node,
};
