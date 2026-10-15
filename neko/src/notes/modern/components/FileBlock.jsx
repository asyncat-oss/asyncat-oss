// A file attached to a note: its name, size and kind, with buttons to open,
// replace or remove it. Empty, it is a drop zone for any file.

import { useState, useRef } from 'react';
import {
  Upload, Trash2, File, ExternalLink, Loader2 as Loader,
  FileImage, FileVideo, FileAudio, FileText, FileSpreadsheet, Presentation, FileArchive, FileCode,
} from 'lucide-react';
import { attachmentsApi } from '../../noteApi';
import { fileKind } from '../../utils/fileKind';
import { useNoteContext } from '../../context/NoteContext';

const KIND_ICONS = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  slides: Presentation,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  file: File,
};

const ICON_BUTTON =
  'rounded-md p-1.5 text-fg-subtle outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50';

const FileBlock = ({ block, onChange, contentRef }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const { selectedNote } = useNoteContext();

  const fileUrl = block.properties?.url || '';
  const filename = block.properties?.filename || '';
  const originalName = block.properties?.originalName || '';
  const fileSize = block.properties?.size || 0;
  const contentType = block.properties?.contentType || '';

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    if (!selectedNote?.id) {
      setError('No note selected for upload');
      return;
    }

    const file = files[0];
    
    // Validate file
    const validation = await attachmentsApi.validateFile(file, {
      maxSize: 100 * 1024 * 1024 // 100MB for general files
    });

    if (!validation.isValid) {
      setError(validation.errors[0]);
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const result = await attachmentsApi.uploadAttachment(
        selectedNote.id,
        file,
        (progress) => setUploadProgress(progress)
      );

      if (result.success) {
        const attachmentUrl = attachmentsApi.getAttachmentUrl(selectedNote.id, result.data.filename);
        
        onChange(block.id, {
          properties: {
            ...block.properties,
            url: attachmentUrl,
            filename: result.data.filename,
            originalName: result.data.originalName,
            size: result.data.size,
            contentType: result.data.contentType
          }
        });
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (err) {
      console.error('File upload error:', err);
      setError(err.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleDownload = () => {
    if (fileUrl) {
      // Open file in new tab/window
      window.open(fileUrl, '_blank');
    }
  };

  const handleDeleteFile = async () => {
    if (filename && selectedNote?.id) {
      try {
        await attachmentsApi.deleteAttachment(selectedNote.id, filename);
      } catch (err) {
        console.error('Failed to delete attachment:', err);
        // Continue with removal from block even if deletion fails
      }
    }

    onChange(block.id, {
      properties: {
        ...block.properties,
        url: '',
        filename: '',
        originalName: '',
        size: 0,
        contentType: '',
        description: ''
      }
    });
  };

  const handleDescriptionChange = (newDescription) => {
    onChange(block.id, {
      properties: {
        ...block.properties,
        description: newDescription
      }
    });
  };

  const KindIcon = KIND_ICONS[fileKind(originalName || filename, contentType)] || File;

  const getFormattedSize = () => {
    return attachmentsApi.formatFileSize(fileSize);
  };

  const isPreviewable = () => {
    return contentType.startsWith('text/') || 
           contentType === 'application/pdf' ||
           ['txt', 'md', 'json', 'xml', 'csv'].includes(originalName?.split('.').pop()?.toLowerCase());
  };

  return (
    <div className="file-block group">
      {/* Error message */}
      {error && (
        <div role="alert" className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="mb-2">
          <div className="mb-1 flex justify-between text-[12px] text-fg-muted">
            <span>Uploading {originalName || 'file'}…</span>
            <span className="tabular-nums">{uploadProgress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* File display or upload area */}
      {fileUrl ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <KindIcon className="h-7 w-7 flex-shrink-0 text-fg-subtle" strokeWidth={1.5} />

              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <h4 className="truncate text-[14px] font-medium text-fg">
                    {originalName || filename}
                  </h4>
                  {isPreviewable() && (
                    <span className="rounded-md bg-hover px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">
                      Previewable
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
                  <span>{getFormattedSize()}</span>
                  {contentType && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {contentType.split('/')[0].charAt(0).toUpperCase() + contentType.split('/')[0].slice(1)} file
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                onClick={handleDownload}
                className={ICON_BUTTON}
                title="Open the file"
                aria-label="Open the file"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={ICON_BUTTON}
                title="Replace the file"
                aria-label="Replace the file"
              >
                <Upload className="w-4 h-4" />
              </button>
              
              <button
                onClick={handleDeleteFile}
                disabled={isUploading}
                className={`${ICON_BUTTON} hover:text-red-600 dark:hover:text-red-400`}
                title="Remove the file"
                aria-label="Remove the file"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Description */}
          <div className="mt-3">
            <div
              ref={contentRef}
              contentEditable
              className="text-[13px] text-fg-muted outline-none"
              style={{ minHeight: '1.2em', overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'none' }}
              placeholder="Add a description..."
              onInput={(e) => handleDescriptionChange(e.target.textContent)}
              suppressContentEditableWarning={true}
            />
          </div>
        </div>
      ) : (
        <div
          className={`cursor-pointer rounded-xl border border-dashed p-8 text-center transition-colors ${
            isDragging
              ? 'border-accent bg-accent-soft'
              : 'border-line-strong hover:bg-hover'
          } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          {isUploading ? (
            <>
              <Loader className="mx-auto mb-2 h-5 w-5 animate-spin text-fg-subtle" />
              <p className="text-[13px] font-medium text-fg-muted">
                Uploading… {uploadProgress}%
              </p>
            </>
          ) : (
            <>
              <File className="mx-auto mb-3 h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
              <p className="mb-1 text-[13px] font-medium text-fg-muted">
                Click to upload a file or drag and drop
              </p>
              <p className="text-[12px] text-fg-subtle">
                Any file type up to 100MB
              </p>
            </>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />
    </div>
  );
};

export default FileBlock;
