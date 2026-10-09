import { useCallback, useRef, useState } from 'react';
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

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    // A second request replaces an unanswered first one; treat that as "no".
    resolveRef.current?.(false);
    resolveRef.current = resolve;
    setRequest(options);
  }), []);

  const settle = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  const cancel = useCallback(() => settle(false), [settle]);
  const accept = useCallback(() => settle(true), [settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
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
