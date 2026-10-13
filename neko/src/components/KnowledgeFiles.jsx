import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { FileCode2, FileImage, FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import Button from './ui/Button';

const ACCEPT = [
  '.txt', '.md', '.markdown', '.mdx', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.xml', '.html',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.sh', '.sql',
  '.css', '.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.gif',
].join(',');

const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

const formatTokens = (n) => {
  const value = Number(n) || 0;
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k tokens` : `${value} tokens`;
};

function KindIcon({ kind }) {
  if (kind === 'image') return <FileImage className="h-4 w-4" />;
  if (kind === 'text') return <FileCode2 className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}
KindIcon.propTypes = { kind: PropTypes.string };

/**
 * The knowledge files of a project or agent: a list with sizes and token
 * counts, an "Add files" button and drag-and-drop.
 */
export default function KnowledgeFiles({ files = [], onUpload, onDelete, uploading = false, errors = [], emptyHint }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const pick = (list) => {
    const chosen = Array.from(list || []);
    if (chosen.length) onUpload?.(chosen);
  };

  return (
    <div
      className={`rounded-xl border transition-colors ${dragging ? 'border-accent bg-accent-soft' : 'border-line'}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
    >
      {files.length > 0 ? (
        <ul className="divide-y divide-line">
          {files.map((file) => (
            <li key={file.id} className="group flex items-center gap-3 px-3 py-2">
              <span className="text-fg-subtle"><KindIcon kind={file.kind} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg" title={file.name}>{file.name}</span>
                <span className="block text-[11px] text-fg-subtle">
                  {formatSize(file.size_bytes)} · {file.kind === 'image' ? 'image' : formatTokens(file.token_estimate)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onDelete?.(file)}
                className="rounded-md p-1.5 text-fg-subtle opacity-0 transition-opacity hover:bg-hover hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`Remove ${file.name}`}
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <Paperclip className="h-5 w-5 text-fg-subtle" />
          <p className="max-w-xs text-[12px] leading-5 text-fg-muted">
            {emptyHint || 'Drop documents, notes, code, PDFs or images here. Every chat can use them.'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <span className="text-[11px] text-fg-subtle">
          {uploading ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Reading files…</span> : 'Up to 25 MB per file'}
        </span>
        <Button size="xs" variant="secondary" icon={Upload} onClick={() => inputRef.current?.click()} disabled={uploading}>
          Add files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
        />
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 border-t border-line px-3 py-2">
          {errors.map((err) => (
            <li key={`${err.name}:${err.error}`} className="text-[12px] leading-5 text-red-600 dark:text-red-400">
              <span className="font-medium">{err.name}:</span> {err.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

KnowledgeFiles.propTypes = {
  files: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    kind: PropTypes.string,
    size_bytes: PropTypes.number,
    token_estimate: PropTypes.number,
  })),
  onUpload: PropTypes.func,
  onDelete: PropTypes.func,
  uploading: PropTypes.bool,
  errors: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string, error: PropTypes.string })),
  emptyHint: PropTypes.string,
};
