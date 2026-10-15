// What kind of file a note attachment is, from its name and MIME type, so a
// file block can show a matching icon (and no emoji).

const BY_EXTENSION = {
  image: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"],
  video: ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv"],
  audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a"],
  pdf: ["pdf"],
  document: ["doc", "docx", "odt", "rtf"],
  spreadsheet: ["xls", "xlsx", "ods", "csv"],
  slides: ["ppt", "pptx", "odp"],
  archive: ["zip", "rar", "7z", "tar", "gz"],
  code: ["js", "ts", "jsx", "tsx", "py", "java", "cpp", "c", "html", "css", "php", "rb", "go", "rs", "json"],
  text: ["txt", "md"],
};

/**
 * One of image, video, audio, pdf, document, spreadsheet, slides, archive,
 * code, text or file (anything else).
 */
export function fileKind(filename = "", mimeType = "") {
  const name = String(filename || "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";
  const type = String(mimeType || "").toLowerCase();

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";

  for (const [kind, extensions] of Object.entries(BY_EXTENSION)) {
    if (extensions.includes(extension)) return kind;
  }
  if (type.startsWith("text/")) return "text";
  return "file";
}
