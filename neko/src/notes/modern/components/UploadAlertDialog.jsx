// Why a file couldn't be added to a note (too big, or a format it doesn't
// take): the reason, the file's details and what to try. Shared by the
// image, video, audio and banner pickers.

import PropTypes from "prop-types";
import Dialog from "../../../components/ui/Dialog.jsx";
import Button from "../../../components/ui/Button.jsx";

const formatFileSize = (bytes) => {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function Detail({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <span className="text-fg-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-fg">{children}</span>
    </div>
  );
}

Detail.propTypes = { label: PropTypes.node, children: PropTypes.node };

export default function UploadAlertDialog({
  isOpen,
  onClose,
  title = "Couldn't upload that",
  message,
  fileName,
  fileSize,
  maxSize,
  allowedFormats,
  tips = [],
}) {
  return (
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
          Got it
        </Button>
      }
    >
      <div className="divide-y divide-line rounded-xl border border-line text-[12px]">
        {fileName ? <Detail label="File">{fileName}</Detail> : null}
        {fileSize ? <Detail label="Size">{formatFileSize(fileSize)}</Detail> : null}
        {maxSize ? <Detail label="Limit">{maxSize}</Detail> : null}
        {allowedFormats ? <Detail label="Formats">{allowedFormats}</Detail> : null}
      </div>
      {tips.length ? (
        <div className="mt-4">
          <p className="text-[12px] font-medium text-fg-muted">To fix it</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] leading-5 text-fg-muted">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Dialog>
  );
}

UploadAlertDialog.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node,
  message: PropTypes.node,
  fileName: PropTypes.string,
  fileSize: PropTypes.number,
  maxSize: PropTypes.string,
  allowedFormats: PropTypes.string,
  tips: PropTypes.arrayOf(PropTypes.string),
};
