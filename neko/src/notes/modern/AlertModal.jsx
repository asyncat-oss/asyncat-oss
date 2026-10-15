// A short message with one button to dismiss it (a failed upload, say),
// built on the app's Dialog.

import PropTypes from "prop-types";
import Dialog from "../../components/ui/Dialog.jsx";
import Button from "../../components/ui/Button.jsx";

const AlertModal = ({
  isOpen,
  onClose,
  title = "Alert",
  message = "",
  buttonText = "OK",
}) => (
  <Dialog
    open={Boolean(isOpen)}
    role="alertdialog"
    size="sm"
    title={title}
    description={message || null}
    closeButton={false}
    onClose={onClose}
    footer={
      <Button variant="primary" onClick={onClose}>
        {buttonText}
      </Button>
    }
  />
);

AlertModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node,
  message: PropTypes.node,
  buttonText: PropTypes.node,
};

export default AlertModal;
