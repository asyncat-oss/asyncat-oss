import { createContext, useContext } from 'react';

export const ConfirmContext = createContext(null);

/**
 * Ask the user to confirm an action. Returns a function that opens the shared
 * confirm dialog and resolves to true (confirmed) or false (cancelled):
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete model?', message: '…', confirmLabel: 'Delete', destructive: true }))) return;
 *
 * Outside a ConfirmProvider (isolated renders, tests) it falls back to the
 * browser's native dialog so callers never silently skip the question.
 */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (confirm) return confirm;
  return ({ title = 'Are you sure?', message = '' } = {}) =>
    Promise.resolve(typeof window !== 'undefined' && window.confirm(message ? `${title}\n\n${message}` : title));
}
