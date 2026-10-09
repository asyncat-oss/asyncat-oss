import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

const fallback = {
  // Outside a ToastProvider (isolated renders, tests) failures still reach the
  // console instead of disappearing.
  error: (message, opts) => console.error(message, opts?.detail || ''),
  success: () => {},
  info: () => {},
};

/**
 * Show a short notice in the corner of the app:
 *
 *   const toast = useToast();
 *   toast.error("Couldn't delete the chat", { detail: err.message });
 *   toast.success('Project saved');
 *
 * Use it for the outcome of something the user just did, especially a failure
 * that would otherwise only reach the console.
 */
export function useToast() {
  return useContext(ToastContext) || fallback;
}

/** The message to show for a caught error: its own message, kept short. */
export function errorDetail(err) {
  const text = String(err?.message || err || '').trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text;
}
