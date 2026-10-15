import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

export const ConfirmContext = createContext(null);

const browserConfirm = ({ title = 'Are you sure?', message = '' } = {}) =>
  Promise.resolve(typeof window !== 'undefined' && window.confirm(message ? `${title}\n\n${message}` : title));

/**
 * Ask the user to confirm an action. Returns a function that opens the shared
 * confirm dialog and resolves to true (confirmed) or false (cancelled):
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete model?', message: '…', confirmLabel: 'Delete', destructive: true }))) return;
 *
 * A question still open when the component that asked unmounts is closed
 * and answered false. Outside a ConfirmProvider (isolated renders, tests) it
 * falls back to the browser's native dialog so callers never silently skip
 * the question.
 */
export function useConfirm() {
  const context = useContext(ConfirmContext);
  const pendingRef = useRef(new Set());

  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      for (const id of pending) context?.dismiss(id);
      pending.clear();
    };
  }, [context]);

  return useCallback((options = {}) => {
    if (!context) return browserConfirm(options);
    const { id, promise } = context.open(options);
    pendingRef.current.add(id);
    return promise.finally(() => pendingRef.current.delete(id));
  }, [context]);
}
