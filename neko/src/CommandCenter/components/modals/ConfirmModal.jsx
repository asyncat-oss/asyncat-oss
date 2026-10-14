// The "are you sure?" dialog: a title, a message, then Cancel and the
// action. The action is red only when it destroys something. Most pages open
// it through useConfirm() (components/ConfirmProvider.jsx).

import PropTypes from 'prop-types';
import Dialog from '../../../components/ui/Dialog.jsx';
import Button from '../../../components/ui/Button.jsx';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', isDestructive = false, isProcessing = false }) => (
  <Dialog
    open={Boolean(isOpen)}
    role="alertdialog"
    size="sm"
    title={title}
    description={message || null}
    closeButton={false}
    // While it works, Escape and the backdrop don't cancel.
    onClose={isProcessing ? undefined : onClose}
    footer={(
      <>
        <Button variant="ghost" onClick={onClose} disabled={isProcessing}>{cancelLabel}</Button>
        <Button variant={isDestructive ? 'destructive' : 'primary'} onClick={onConfirm} loading={isProcessing} data-confirm-action>
          {isProcessing ? 'Working…' : confirmLabel}
        </Button>
      </>
    )}
  />
);

ConfirmModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  onConfirm: PropTypes.func,
  title: PropTypes.node,
  message: PropTypes.node,
  confirmLabel: PropTypes.node,
  cancelLabel: PropTypes.node,
  isDestructive: PropTypes.bool,
  isProcessing: PropTypes.bool,
};

export default ConfirmModal;
