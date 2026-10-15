import { useCallback, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import ConfirmModal from '../CommandCenter/components/modals/ConfirmModal';
import { ConfirmContext } from './confirmContext';

/**
 * One app-wide confirm dialog, opened through useConfirm(). Keeps every
 * "are you sure?" question looking and behaving the same (Escape cancels,
 * focus starts on Cancel) instead of each page building its own.
 */
export default function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);
  const idRef = useRef(0);
  const currentIdRef = useRef(null);

  const settle = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    currentIdRef.current = null;
    setRequest(null);
  }, []);

  const open = useCallback((options = {}) => {
    const id = ++idRef.current;
    const promise = new Promise((resolve) => {
      // A second request replaces an unanswered first one; treat that as "no".
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      currentIdRef.current = id;
      setRequest(options);
    });
    return { id, promise };
  }, []);

  // The component that asked went away (its page closed): the question goes
  // too, answered "no", instead of staying open over another page.
  const dismiss = useCallback((id) => {
    if (id && currentIdRef.current === id) settle(false);
  }, [settle]);

  const cancel = useCallback(() => settle(false), [settle]);
  const accept = useCallback(() => settle(true), [settle]);
  const value = useMemo(() => ({ open, dismiss }), [open, dismiss]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmModal
        isOpen={Boolean(request)}
        onClose={cancel}
        onConfirm={accept}
        title={request?.title || 'Are you sure?'}
        message={request?.message || ''}
        confirmLabel={request?.confirmLabel || 'Confirm'}
        cancelLabel={request?.cancelLabel || 'Cancel'}
        isDestructive={Boolean(request?.destructive)}
      />
    </ConfirmContext.Provider>
  );
}

ConfirmProvider.propTypes = {
  children: PropTypes.node,
};
