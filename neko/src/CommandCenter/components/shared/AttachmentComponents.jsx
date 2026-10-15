// Files attached to a message: a chip per file, and a larger view of an image.
import { useState, useEffect } from "react";
import { File, FileText, Image, Music, X } from "lucide-react";
import { filesApi } from "../../api";
import Dialog from "../../../components/ui/Dialog.jsx";

const KIND_ICON = { image: Image, audio: Music, pdf: FileText, text: FileText, file: File };

export function attachmentKind(file = {}) {
  const mime = String(file.mime || "").toLowerCase();
  const ext = String(
    file.ext || file.name?.split(".").pop() || file.path?.split(".").pop() || ""
  ).toLowerCase();
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext))
    return "image";
  if (mime.startsWith("audio/") || ["wav", "mp3", "m4a", "ogg", "flac", "webm"].includes(ext))
    return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    ["txt", "md", "json", "csv", "tsv", "js", "jsx", "ts", "tsx", "py", "html", "css", "xml", "yaml", "yml", "toml", "sql", "log"].includes(ext)
  )
    return "text";
  return "file";
}

export function attachmentBadge(file, capabilities = null) {
  const kind = attachmentKind(file);
  if (capabilities) {
    if (kind === "image") {
      return capabilities?.vision?.ready
        ? { label: "Image input ready", tone: "emerald" }
        : { label: "Text-only model", tone: "amber" };
    }
    if (kind === "audio") {
      return capabilities?.stt?.ready
        ? { label: "Whisper ready", tone: "emerald" }
        : { label: "Needs Whisper", tone: "amber" };
    }
  }
  if (kind === "image") return { label: "Image", tone: "blue" };
  if (kind === "audio") return { label: "Audio", tone: "emerald" };
  if (kind === "pdf") return { label: "PDF", tone: "blue" };
  if (kind === "text") return { label: "Text", tone: "slate" };
  return { label: "File", tone: "slate" };
}

// Green and amber say whether the model can use the file; the kind of file
// itself (blue, slate) is neutral.
export const badgeToneClass = {
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  blue: "bg-hover text-fg-muted",
  slate: "bg-hover text-fg-muted",
};

export function AttachmentChip({ file, capabilities, onRemove, onPreview }) {
  const kind = attachmentKind(file);
  const Icon = KIND_ICON[kind] || File;
  const badge = attachmentBadge(file, capabilities);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (file.dataUrl) {
      setPreviewUrl(file.dataUrl);
      return undefined;
    }
    if (!["image", "audio"].includes(kind) || !file.rootId || !file.path) return undefined;
    let cancelled = false;
    filesApi
      .fetchRawBlob(file.rootId, file.path)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file.path, file.rootId, kind]);

  const handlePreview = () => {
    if (kind === "image" && previewUrl && onPreview) {
      onPreview({ url: previewUrl, name: file.name });
    }
  };

  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] font-medium text-fg">
      {kind === "image" && previewUrl ? (
        onPreview ? (
          <button
            type="button"
            onClick={handlePreview}
            aria-label={`Preview ${file.name}`}
            className="h-8 w-8 shrink-0 overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <img src={previewUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
        )
      ) : kind === "audio" && previewUrl ? (
        <audio src={previewUrl} controls className="h-7 w-32 max-w-[35vw]" />
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
      )}
      <span className="min-w-0">
        <span className="block max-w-[12rem] truncate">{file.name}</span>
        <span
          className={`mt-0.5 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${badgeToneClass[badge.tone] || badgeToneClass.slate}`}
        >
          {badge.label}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

export function ImageLightbox({ url, name, onClose }) {
  return (
    <Dialog open size="xl" title={name || "Image"} onClose={onClose}>
      <div className="flex justify-center rounded-lg bg-hover p-2">
        <img src={url} alt={name || "Preview"} className="max-h-[65vh] max-w-full object-contain" />
      </div>
    </Dialog>
  );
}
