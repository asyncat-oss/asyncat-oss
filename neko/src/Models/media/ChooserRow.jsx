// A row whose value is chosen from a list that opens under it: "Change"
// opens it, "Close" or Escape closes it. One chooser is open per page, and
// its footer has the ways to add files on the left and Cancel and the one
// primary button on the right.

import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../../components/ui/Button.jsx';
import { PropertyRow } from '../../components/ui/Rows.jsx';
import { isTopLayer, useLayer } from '../../components/ui/floating.js';
import { ChooserRowContext, ChooserScopeContext } from './chooserScope.js';

/** Wrap a page (or a group) in this so that opening one chooser closes the others. */
export function ChooserScope({ children }) {
  const [openId, setOpenId] = useState(null);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return <ChooserScopeContext.Provider value={value}>{children}</ChooserScopeContext.Provider>;
}

ChooserScope.propTypes = { children: PropTypes.node };

/**
 *   <ChooserRow id="listening-model" label="Model" value="Base (English)" meta={['60 MB']}>
 *     <WhisperChooser … />
 *   </ChooserRow>
 *
 * Inside a ChooserScope, `id` makes it one of the page's choosers; pass
 * `open` and `onOpenChange` to control it yourself instead. When it opens,
 * focus goes to the chosen option; when it closes, back to "Change".
 */
export default function ChooserRow({
  id,
  label,
  value,
  meta,
  status,
  open: openProp,
  onOpenChange,
  disabled = false,
  changeLabel = 'Change',
  highlight,
  children,
  ...rest
}) {
  const scope = useContext(ChooserScopeContext);
  const [ownOpen, setOwnOpen] = useState(false);
  const bodyId = useId();
  const bodyRef = useRef(null);
  const buttonRef = useRef(null);
  // The row is its Change button and the chooser under it.
  const rowRef = useMemo(() => ({
    current: { contains: (node) => Boolean(bodyRef.current?.contains(node) || buttonRef.current?.contains(node)) },
  }), []);

  const open = openProp ?? (scope && id ? scope.openId === id : ownOpen);
  const setOpen = useCallback((next) => {
    onOpenChange?.(next);
    if (openProp !== undefined) return;
    if (scope && id) scope.setOpenId((current) => (next ? id : current === id ? null : current));
    else setOwnOpen(next);
  }, [id, onOpenChange, openProp, scope]);
  const close = useCallback(() => setOpen(false), [setOpen]);

  // Escape closes the chooser when nothing is open above it (a Select's
  // list, a dialog): those take Escape first.
  const layerRef = useLayer(open, rowRef);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopLayer(layerRef.current)) return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, layerRef, open]);

  // Focus follows the chooser: in to the chosen option, back out to Change.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const body = bodyRef.current;
      // The chosen option first; a selector list would take whichever comes first on the page.
      const target = ['[role="radio"][tabindex="0"]', '[role="radio"]', 'input, button']
        .map((selector) => body?.querySelector(selector))
        .find(Boolean);
      target?.focus({ preventScroll: true });
      // The chooser comes into view, and in a long list, the chosen option.
      body?.scrollIntoView?.({ block: 'nearest' });
      target?.scrollIntoView?.({ block: 'nearest' });
    } else if (!open && wasOpen.current) {
      const active = document.activeElement;
      if (!active || active === document.body || rowRef.current?.contains(active)) buttonRef.current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open, rowRef]);

  const rowContext = useMemo(() => ({ close }), [close]);

  return (
    <PropertyRow
      label={label}
      value={value}
      meta={meta}
      status={status}
      highlight={highlight}
      open={open}
      data-chooser-row={id || undefined}
      data-open={open || undefined}
      control={(
        <Button
          ref={buttonRef}
          variant="ghost"
          size="sm"
          disabled={disabled && !open}
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : changeLabel}
        </Button>
      )}
      {...rest}
    >
      <div ref={bodyRef} id={bodyId}>
        <ChooserRowContext.Provider value={rowContext}>{children}</ChooserRowContext.Provider>
      </div>
    </PropertyRow>
  );
}

ChooserRow.propTypes = {
  id: PropTypes.string,
  label: PropTypes.node.isRequired,
  value: PropTypes.node,
  meta: PropTypes.oneOfType([PropTypes.node, PropTypes.arrayOf(PropTypes.node)]),
  status: PropTypes.node,
  open: PropTypes.bool,
  onOpenChange: PropTypes.func,
  disabled: PropTypes.bool,
  changeLabel: PropTypes.string,
  highlight: PropTypes.any,
  children: PropTypes.node,
};

/**
 * The bottom of a chooser: "Add from Hugging Face" and "Add a file" on the
 * left (each shown when its handler is given), Cancel and `primary` (a
 * Button, usually "Use Small" or "Download 190 MB and use it") on the right,
 * and `error` above them.
 */
export function ChooserFooter({ primary = null, onAddFromHuggingFace, onAddFile, error = null, note = null }) {
  const { close } = useContext(ChooserRowContext);
  return (
    <div className="mt-3 space-y-2">
      {note ? <p className="text-[12px] leading-5 text-fg-subtle">{note}</p> : null}
      {error ? <p role="alert" className="text-[12px] leading-5 text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {onAddFromHuggingFace || onAddFile ? (
          <div className="-ml-2 flex items-center gap-1">
            {onAddFromHuggingFace ? <Button variant="ghost" size="xs" onClick={onAddFromHuggingFace}>Add from Hugging Face</Button> : null}
            {onAddFile ? <Button variant="ghost" size="xs" onClick={onAddFile}>Add a file</Button> : null}
          </div>
        ) : null}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
          {primary}
        </div>
      </div>
    </div>
  );
}

ChooserFooter.propTypes = {
  primary: PropTypes.node,
  onAddFromHuggingFace: PropTypes.func,
  onAddFile: PropTypes.func,
  error: PropTypes.node,
  note: PropTypes.node,
};
