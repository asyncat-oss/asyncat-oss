import { useState, useRef } from 'react';
import { Upload, Trash2, File, ExternalLink, Loader, AlertCircle } from 'lucide-react';
import { attachmentsApi } from '../../noteApi';
import { useNoteContext } from '../../context/NoteContext';

const FileBlock = ({ block, onChange, contentRef, commonProps }) => {
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
  const description = block.properties?.description || '';

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

  const getFileIcon = () => {
    return attachmentsApi.getFileIcon(originalName || filename, contentType);
  };

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
        <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 midnight:bg-red-950/20 border border-red-200 dark:border-red-800 midnight:border-red-900 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 midnight:text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 midnight:text-red-400">{error}</p>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-1">
            <span>Uploading {originalName || 'file'}...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 midnight:bg-gray-800 rounded-full h-2">
            <div 
              className="bg-blue-600 dark:bg-blue-500 midnight:bg-indigo-500 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* File display or upload area */}
      {fileUrl ? (
        <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="text-2xl flex-shrink-0">
                {getFileIcon()}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 truncate">
                    {originalName || filename}
                  </h4>
                  {isPreviewable() && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 midnight:bg-blue-950/50 text-blue-700 dark:text-blue-300 midnight:text-blue-400 rounded">
                      Previewable
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                  <span>{getFormattedSize()}</span>
                  {contentType && (
                    <span className="capitalize">
                      {contentType.split('/')[0]} file
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleDownload}
                className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 midnight:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 midnight:hover:bg-blue-950/50 rounded transition-colors"
                title="Download/Open file"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-2 text-gray-500 hover:text-green-600 dark:hover:text-green-400 midnight:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/50 midnight:hover:bg-green-950/50 rounded transition-colors disabled:opacity-50"
                title="Replace file"
              >
                <Upload className="w-4 h-4" />
              </button>
              
              <button
                onClick={handleDeleteFile}
                disabled={isUploading}
                className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 midnight:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/50 midnight:hover:bg-red-950/50 rounded transition-colors disabled:opacity-50"
                title="Remove file"
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
              className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500 outline-none"
              style={{ minHeight: '1.2em', overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'none' }}
              placeholder="Add a description..."
              onInput={(e) => handleDescriptionChange(e.target.textContent)}
              suppressContentEditableWarning={true}
            />
          </div>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragging 
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-950/20' 
              : 'border-gray-300 dark:border-gray-600 midnight:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600'
          } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          {isUploading ? (
            <>
              <Loader className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
              <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2">
                Uploading... {uploadProgress}%
              </p>
            </>
          ) : (
            <>
              <File className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 mb-2">
                Click to upload a file or drag and drop
              </p>
              <p className="text-xs text-gray-400">
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
