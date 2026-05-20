import { useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  Paperclip,
  Upload,
  Plus,
  Columns3,
  File,
  FileSpreadsheet,
  FileText,
  Image,
} from "lucide-react";
import { useColumnContext } from "../../../context/viewContexts";
import { useCardContext } from "../../../context/viewContexts";
import { useCardActions } from "../../../hooks/useCardActions";
import TaskChecklist from "../shared/components/TaskChecklist";
import DropdownBar from "../shared/components/DropdownBar";
import AddColumnModal from "../columns/components/AddColumnModal";

const priorityOptions = [
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const ALLOWED_MIME = [
  "image/png","image/jpeg","image/jpg","image/gif","image/webp","image/svg+xml","image/bmp",
  "application/pdf","application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain","text/csv","text/html","text/css","text/javascript",
  "application/json","application/xml","text/xml",
  "application/zip","application/x-zip-compressed","application/x-rar-compressed",
  "application/x-7z-compressed","application/x-tar","application/gzip",
];

function getFileIcon(type = "") {
  if (type.includes("pdf")) return <FileText className="w-4 h-4" />;
  if (type.startsWith("image/")) return <Image className="w-4 h-4" />;
  if (type.includes("spreadsheet") || type.includes("excel")) return <FileSpreadsheet className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

const AddCardModal = ({ onClose, onSuccess, defaultColumnId }) => {
  const { columns, selectedProject, loadColumns } = useColumnContext();
  const { addCard } = useCardActions();
  const { createdBy } = useCardContext();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateColumnModal, setShowCreateColumnModal] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [cardData, setCardData] = useState({
    title: "",
    description: "",
    priority: "Medium",
    columnId:
      defaultColumnId && columns.find((c) => c.id === defaultColumnId)
        ? defaultColumnId
        : columns[0]?.id || "",
    checklist: [],
    progress: 0,
    tasks: { completed: 0, total: 0 },
    createdBy,
  });

  const columnOptions = columns.map((c) => ({ value: c.id, label: c.title }));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCardData((prev) => ({ ...prev, [name]: value }));
  };

  const handleChecklistUpdate = (newChecklist) => {
    const completed = newChecklist.filter((t) => t.completed).length;
    setCardData((prev) => ({
      ...prev,
      checklist: newChecklist,
      progress: newChecklist.length ? Math.round((completed / newChecklist.length) * 100) : 0,
      tasks: { completed, total: newChecklist.length },
    }));
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    for (const file of newFiles) {
      if (!ALLOWED_MIME.includes(file.type)) {
        setFileError(`Unsupported file type: ${file.type}`);
        return;
      }
    }
    const totalSize = [...selectedFiles, ...newFiles].reduce((s, f) => s + f.size, 0);
    if (totalSize > 10 * 1024 * 1024) {
      setFileError("Total file size exceeds 10 MB.");
      return;
    }
    setFileError(null);
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cardData.title.trim() || !cardData.columnId) return;
    setIsSubmitting(true);
    try {
      await addCard(cardData.columnId, { ...cardData, files: selectedFiles });
      onSuccess ? onSuccess() : onClose();
    } catch (err) {
      console.error("Error adding card:", err);
      setIsSubmitting(false);
    }
  };

  const canSubmit = cardData.title.trim() && cardData.columnId && !isSubmitting;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/20 dark:bg-black/50 midnight:bg-black/70 backdrop-blur-[2px]"
            onClick={(e) => e.target === e.currentTarget && onClose()}
          />
          <div className="relative z-10 bg-white/95 dark:bg-gray-900/95 midnight:bg-gray-950/95 backdrop-blur-sm rounded-xl w-full max-w-2xl mx-6 shadow-2xl border border-gray-200/80 dark:border-gray-700 midnight:border-gray-800 flex flex-col overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200/80 dark:border-gray-700 midnight:border-gray-800">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white midnight:text-indigo-200">
                New Task
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Title + Priority */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                    Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={cardData.title}
                    onChange={handleChange}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-900 dark:text-white midnight:text-indigo-200 focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 text-sm"
                    placeholder="Task title"
                    required
                    disabled={isSubmitting}
                    autoFocus
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                    Priority
                  </label>
                  <DropdownBar
                    value={cardData.priority}
                    onChange={(value) => setCardData((prev) => ({ ...prev, priority: value }))}
                    options={priorityOptions}
                    type="priority"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                  Description
                </label>
                <textarea
                  name="description"
                  value={cardData.description}
                  onChange={handleChange}
                  onKeyDown={(e) => e.key === " " && e.stopPropagation()}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-900 dark:text-white midnight:text-indigo-200 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 text-sm resize-none"
                  placeholder="Describe the task..."
                  disabled={isSubmitting}
                />
              </div>

              {/* Column */}
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                  Column
                </label>
                {columnOptions.length === 0 ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <span className="text-amber-700 dark:text-amber-300">No columns yet — create one first.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateColumnModal(true)}
                      disabled={isSubmitting}
                      className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Create First Column
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <DropdownBar
                      value={cardData.columnId}
                      onChange={(value) => setCardData((prev) => ({ ...prev, columnId: value }))}
                      options={columnOptions}
                      type="column-custom"
                      placeholder="Select a column..."
                      disabled={isSubmitting}
                      enableSearch={true}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreateColumnModal(true)}
                      disabled={isSubmitting}
                      className="w-full px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center justify-center gap-2 border border-dashed border-gray-300 dark:border-gray-700"
                    >
                      <Columns3 className="w-3.5 h-3.5" /> New Column
                    </button>
                  </div>
                )}
              </div>

              {/* Subtasks */}
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                  Subtasks
                </label>
                <div className="max-h-48 overflow-y-auto">
                  <TaskChecklist
                    tasks={cardData.checklist}
                    onUpdate={handleChecklistUpdate}
                    isCreating={true}
                    readOnly={isSubmitting}
                    enableEditing={true}
                    disableCompletion={true}
                  />
                </div>
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                  <Paperclip className="w-3.5 h-3.5 inline mr-1" />
                  Attachments
                  {selectedFiles.length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                      {selectedFiles.length}
                    </span>
                  )}
                </label>
                <label className={`block border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center ${isSubmitting ? "cursor-not-allowed" : "cursor-pointer hover:border-gray-300 dark:hover:border-gray-600"} transition-colors`}>
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Click to attach files (max 10 MB)</span>
                  </div>
                  <input type="file" className="hidden" multiple disabled={isSubmitting} onChange={handleFileChange}
                    accept=".pdf,.png,.jpeg,.jpg,.gif,.webp,.svg,.doc,.docx,.xls,.xlsx,.txt,.csv,.json,.zip" />
                </label>
                {fileError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />{fileError}
                  </p>
                )}
                {selectedFiles.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {selectedFiles.map((file, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 group">
                        <span className="text-gray-400">{getFileIcon(file.type)}</span>
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
                        <button
                          type="button"
                          onClick={() => setSelectedFiles((prev) => prev.filter((_, j) => j !== i))}
                          disabled={isSubmitting}
                          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200/80 dark:border-gray-700 midnight:border-gray-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-5 py-2 rounded-lg text-sm bg-gray-900 dark:bg-indigo-600 text-white hover:bg-gray-800 dark:hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {isSubmitting ? "Creating…" : "Create Task"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showCreateColumnModal && (
        <AddColumnModal
          onClose={() => setShowCreateColumnModal(false)}
          onSuccess={async () => { setShowCreateColumnModal(false); await loadColumns(); }}
          projectId={selectedProject?.id}
        />
      )}
    </>
  );
};

export default AddCardModal;
