import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import Portal from './Portal';
import { ToastContext } from './toastContext';

const DURATION = { error: 8000, success: 4000, info: 5000 };
const MAX_VISIBLE = 4;

const STYLE = {
  error: { Icon: XCircle, icon: 'text-red-500 dark:text-red-400', role: 'alert' },
  success: { Icon: CheckCircle2, icon: 'text-emerald-500 dark:text-emerald-400', role: 'status' },
  info: { Icon: Info, icon: 'text-sky-500 dark:text-sky-400', role: 'status' },
};

/**
 * App-wide toasts, opened through useToast(). Before this, most failed actions
 * (restoring from Trash, renaming a chat, saving a project, …) only logged to
 * the console, so from the user's side nothing happened.
 */
export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback((type, message, { detail = '' } = {}) => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = ++nextId.current;
    setToasts(list => {
      // The same notice is already up (e.g. a retried action failing again).
      if (list.some(t => t.type === type && t.message === text)) return list;
      return [...list, { id, type, message: text, detail: String(detail || '') }].slice(-MAX_VISIBLE);
    });
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[type] || DURATION.info));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({
    error: (message, opts) => show('error', message, opts),
    success: (message, opts) => show('success', message, opts),
    info: (message, opts) => show('info', message, opts),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Portal containerId="toast-root">
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(92vw,380px)] flex-col gap-2"
        >
          {toasts.map(({ id, type, message, detail }) => {
            const { Icon, icon, role } = STYLE[type] || STYLE.info;
            return (
              <div
                key={id}
                role={role}
                className="pointer-events-auto flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg dark:border-gray-700 dark:bg-gray-900 midnight:border-slate-700 midnight:bg-slate-900"
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">{message}</p>
                  {detail && (
                    <p className="mt-0.5 break-words text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">{detail}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(id)}
                  aria-label="Dismiss"
                  className="-mr-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

ToastProvider.propTypes = {
  children: PropTypes.node,
};
