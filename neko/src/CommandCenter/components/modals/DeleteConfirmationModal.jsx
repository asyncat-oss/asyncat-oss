// "Delete chat?" for the trash button in a chat's header. It is the shared
// confirm dialog with the sidebar's words, so deleting a chat asks the same
// question wherever you start it.

import PropTypes from 'prop-types';
import ConfirmModal from './ConfirmModal.jsx';

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, title, isDeleting = false }) => (
  <ConfirmModal
    isOpen={isOpen}
    onClose={onClose}
    onConfirm={onConfirm}
    title="Delete chat?"
    message={`"${title || 'Untitled conversation'}" will be moved to Trash, where you can restore it.`}
    confirmLabel="Move to Trash"
    isDestructive
    isProcessing={isDeleting}
  />
);

DeleteConfirmationModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  title: PropTypes.string,
  isDeleting: PropTypes.bool,
};

export default DeleteConfirmationModal;
