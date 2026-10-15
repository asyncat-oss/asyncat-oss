// The editor's "are you sure?" question (clearing the whole note), built on
// the app's Dialog like the shared confirm dialog.

import PropTypes from "prop-types";
import Dialog from "../../components/ui/Dialog.jsx";
import Button from "../../components/ui/Button.jsx";

const ConfirmationModal = ({
  isOpen,
  onConfirm,
  onCancel,
  title = "Are you sure?",
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDangerous = false,
}) => (
  <Dialog
    open={Boolean(isOpen)}
    role="alertdialog"
    size="sm"
    title={title}
    description={message || null}
    closeButton={false}
    onClose={onCancel}
    footer={
      <>
        <Button variant="ghost" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button
          variant={isDangerous ? "destructive" : "primary"}
          onClick={onConfirm}
          data-confirm-action
        >
          {confirmText}
        </Button>
      </>
    }
  />
);

ConfirmationModal.propTypes = {
  isOpen: PropTypes.bool,
  onConfirm: PropTypes.func,
  onCancel: PropTypes.func.isRequired,
  title: PropTypes.node,
  message: PropTypes.node,
  confirmText: PropTypes.node,
  cancelText: PropTypes.node,
  isDangerous: PropTypes.bool,
};

export default ConfirmationModal;
