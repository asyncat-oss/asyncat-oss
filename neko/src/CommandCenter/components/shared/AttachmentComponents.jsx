import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { filesApi } from "../../api";
import { fileIconMeta } from "../../../files/fileUtils.js";

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
        ? { label: "Vision ready", tone: "emerald" }
        : { label: "Needs vision", tone: "amber" };
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

export const badgeToneClass = {
  emerald:
    "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/50",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50",
  blue:
    "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/50",
  slate:
    "bg-slate-50 text-slate-600 ring-slate-100 dark:bg-slate-900/50 dark:text-slate-300 dark:ring-slate-800",
};

export function AttachmentChip({ file, capabilities, onRemove, onPreview }) {
  const { Icon, color } = fileIconMeta(file.ext, "file");
  const kind = attachmentKind(file);
  const badge = attachmentBadge(file, capabilities);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
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
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 midnight:border-slate-700 midnight:bg-slate-900">
      {kind === "image" && previewUrl ? (
        onPreview ? (
          <button
            type="button"
            onClick={handlePreview}
            className="h-8 w-8 shrink-0 overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <img src={previewUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
        )
      ) : kind === "audio" && previewUrl ? (
        <audio src={previewUrl} controls className="h-7 w-32 max-w-[35vw]" />
      ) : (
        <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      )}
      <span className="min-w-0">
        <span className="block max-w-[12rem] truncate">{file.name}</span>
        <span
          className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] ring-1 ${badgeToneClass[badge.tone]}`}
        >
          {badge.label}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function ImageLightbox({ url, name, onClose }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 rounded-full p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-6 w-6" />
        </button>
        <img
          src={url}
          alt={name || "Preview"}
          className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        {name && (
          <div className="mt-3 text-center text-sm text-white/70">{name}</div>
        )}
      </div>
    </div>
  );
}
