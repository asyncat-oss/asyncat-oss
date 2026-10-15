// Pick a note's banner: a plain colour or an image of your own. Opens from
// the banner's button or "Add banner". (A gradient saved earlier, by hand or
// by an agent, still shows; it just isn't offered here.)

import { useState, useRef } from "react";
import PropTypes from "prop-types";
import { Check, Image, Loader2, Palette, Trash2, Upload } from "lucide-react";
import Dialog from "../../../components/ui/Dialog.jsx";
import Button from "../../../components/ui/Button.jsx";
import { Segmented } from "../../../components/ui/Tabs.jsx";
import { attachmentApi } from "../../attachmentApi";
import AlertModal from "../AlertModal";
import UploadAlertDialog from "./UploadAlertDialog";

const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const ALLOWED_IMAGE_FORMAT_LABEL = "JPG, JPEG, PNG, GIF, WebP";
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE_LABEL = "10MB";

// Muted swatches, so a banner sits quietly above the note.
const COLOR_OPTIONS = [
  { name: "Grey", value: "#9ca3af" },
  { name: "Slate", value: "#64748b" },
  { name: "Blue", value: "#7f9cc9" },
  { name: "Teal", value: "#7fb2ad" },
  { name: "Green", value: "#8fb58a" },
  { name: "Sand", value: "#d6c39a" },
  { name: "Orange", value: "#d9a27c" },
  { name: "Red", value: "#c98b8b" },
  { name: "Pink", value: "#c99bb5" },
  { name: "Purple", value: "#a497c4" },
];

const SIZE_TIPS = [
  "Compress the image",
  "Make it smaller in width and height",
  "Save it as WebP or JPEG",
];
const FORMAT_TIPS = [
  "Save or convert it to JPG, PNG, GIF or WebP",
  "Check the file's extension matches its format",
  "Check the image opens before uploading it",
];

const TABS = [
  { value: "colors", label: "Colors", icon: Palette },
  { value: "image", label: "Image", icon: Image },
];

const createInitialUploadAlert = () => ({
  isOpen: false,
  variant: null,
  title: "",
  message: "",
  fileName: "",
  fileSize: 0,
  maxSize: "",
  allowedFormats: "",
});

// A swatch button; the banner the note has now carries a check.
function Swatch({ name, background, chosen, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      aria-label={name}
      aria-pressed={chosen}
      className={`relative flex items-center justify-center rounded-lg border border-line outline-none transition-[box-shadow] hover:ring-2 hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-accent/40 ${
        chosen ? "ring-2 ring-fg ring-offset-2 ring-offset-elevated" : ""
      } ${className}`}
      style={{ background }}
    >
      {chosen ? (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-elevated text-fg shadow-sm">
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </span>
      ) : null}
    </button>
  );
}

Swatch.propTypes = {
  name: PropTypes.string.isRequired,
  background: PropTypes.string.isRequired,
  chosen: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  className: PropTypes.string,
};

const BannerSelector = ({ note, currentBanner, onBannerChange, onClose }) => {
  const [activeTab, setActiveTab] = useState("colors");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadAlert, setUploadAlert] = useState(createInitialUploadAlert());
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: "",
    message: "",
  });
  const fileInputRef = useRef(null);

  const handleCloseUploadAlert = () => {
    setUploadAlert(createInitialUploadAlert());
  };

  const handleColorSelect = async (color) => {
    try {
      await attachmentApi.setBanner(note.id, "color", { color });
      onBannerChange({ type: "color", color });
    } catch {
      // Silently handle error
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset any previous alert state
    setUploadAlert(createInitialUploadAlert());

    const mimeType = file.type?.toLowerCase() ?? "";
    const fileName = file.name?.toLowerCase() ?? "";
    const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext)
    );
    const isMimeAllowed = ALLOWED_IMAGE_MIME_TYPES.includes(mimeType);
    const appearsToBeImage =
      mimeType.startsWith("image/") || mimeType === "" || hasAllowedExtension;

    if (!appearsToBeImage || (!isMimeAllowed && !hasAllowedExtension)) {
      setUploadAlert({
        isOpen: true,
        variant: "format",
        title: "This image format isn't supported",
        message: "A banner can be a JPG, PNG, GIF or WebP image.",
        fileName: file.name,
        fileSize: file.size,
        maxSize: "",
        allowedFormats: ALLOWED_IMAGE_FORMAT_LABEL,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
      setUploadAlert({
        isOpen: true,
        variant: "size",
        title: "This image is too big",
        message: `It is ${sizeInMb}MB, and a banner can be up to ${MAX_IMAGE_SIZE_LABEL}.`,
        fileName: file.name,
        fileSize: file.size,
        maxSize: MAX_IMAGE_SIZE_LABEL,
        allowedFormats: ALLOWED_IMAGE_FORMAT_LABEL,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    let uploadSucceeded = false;

    try {
      const result = await attachmentApi.uploadBannerImage(
        note.id,
        file,
        (progress) => setUploadProgress(progress)
      );

      // Ensure we pass all necessary data for the banner
      const bannerData = {
        type: "image",
        filename: result.filename,
        url:
          result.url ||
          attachmentApi.getAttachmentUrl(note.id, result.filename),
        originalName: result.originalName,
        contentType: result.contentType || file.type,
        uploadedAt: result.uploadedAt || new Date().toISOString(),
      };

      onBannerChange(bannerData);
      uploadSucceeded = true;
    } catch (error) {
      setAlertModal({
        isOpen: true,
        title: "Couldn't upload the image",
        message: "Something went wrong. Try again.",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }

    if (uploadSucceeded) {
      onClose?.();
    }
  };

  const handleRemoveBanner = async () => {
    try {
      await attachmentApi.removeBanner(note.id);
      onBannerChange(null);
    } catch {
      // Silently handle error
    }
  };

  return (
    <>
      <Dialog
        open
        title="Banner"
        size="sm"
        onClose={onClose}
        footer={
          <>
            {currentBanner ? (
              <Button
                variant="danger"
                icon={Trash2}
                onClick={handleRemoveBanner}
                className="mr-auto"
              >
                Remove banner
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <Segmented
          value={activeTab}
          onChange={setActiveTab}
          items={TABS}
          label="Banner kind"
          className="mb-4"
        />

        {activeTab === "colors" && (
          <div className="grid grid-cols-5 gap-2.5">
            {COLOR_OPTIONS.map((color) => (
              <Swatch
                key={color.value}
                name={color.name}
                background={color.value}
                chosen={
                  currentBanner?.type === "color" &&
                  currentBanner.color?.toLowerCase() === color.value
                }
                onClick={() => handleColorSelect(color.value)}
                className="aspect-square"
              />
            ))}
          </div>
        )}

        {activeTab === "image" && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex h-32 w-full flex-col items-center justify-center rounded-xl border border-dashed border-line-strong text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:opacity-60"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mb-2 h-5 w-5 animate-spin text-fg-subtle" />
                  <span className="text-[13px] font-medium">
                    Uploading… {Math.round(uploadProgress)}%
                  </span>
                </>
              ) : (
                <>
                  <Upload className="mb-2 h-5 w-5 text-fg-subtle" />
                  <span className="text-[13px] font-medium">Upload an image</span>
                </>
              )}
              <span className="mt-1 text-[12px] text-fg-subtle">
                PNG, JPG up to 10MB
              </span>
            </button>

            {isUploading && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}
      </Dialog>

      <UploadAlertDialog
        isOpen={uploadAlert.isOpen}
        onClose={handleCloseUploadAlert}
        title={uploadAlert.title || undefined}
        message={uploadAlert.message}
        fileName={uploadAlert.fileName}
        fileSize={uploadAlert.fileSize}
        maxSize={uploadAlert.maxSize}
        allowedFormats={uploadAlert.allowedFormats}
        tips={
          uploadAlert.variant === "size"
            ? SIZE_TIPS
            : uploadAlert.variant === "format"
            ? FORMAT_TIPS
            : []
        }
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
      />
    </>
  );
};

BannerSelector.propTypes = {
  note: PropTypes.shape({ id: PropTypes.string }).isRequired,
  currentBanner: PropTypes.object,
  onBannerChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default BannerSelector;
