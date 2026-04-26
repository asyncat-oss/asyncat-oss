// SaveAsNoteModal.jsx - Enhanced with Block Support
import { useState, useEffect } from 'react';
import { X, Save, FileText, Loader, Check, AlertCircle } from 'lucide-react';
import { notesApi } from '../../notes/noteApi';
import { blocksToHtml } from '../../notes/utils/blockConverter';
import authService from '../../services/authService';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const SaveAsNoteModal = ({ 
  isOpen,
  onClose,
  content,
  blocks = null,
  suggestedTitle = "AI Response",
  imageMode = false
}) => {
  const { currentWorkspace, getWorkspaceProjects } = useWorkspace();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [noteTitle, setNoteTitle] = useState(suggestedTitle);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Fetch projects when modal opens or workspace changes
  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setNoteTitle(suggestedTitle || "AI Response");
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, suggestedTitle, currentWorkspace]);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      // Wait a bit for session to initialize if needed
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        // Check if user is authenticated
        const isAuth = authService.isAuthenticated();
        const hasToken = !!authService.getAccessToken();
        
        if (!isAuth || !hasToken) {
          if (retries < maxRetries - 1) {
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 500));
            retries++;
            continue;
          } else {
            throw new Error('Please log in to save notes');
          }
        }
        break;
      }

      let workspaceProjects = [];
      
      if (currentWorkspace) {
        // Get projects from current workspace
        workspaceProjects = await getWorkspaceProjects();
      } else {
        // Fallback: get all user projects if no workspace is selected
        const response = await authService.authenticatedFetch(`${import.meta.env.VITE_USER_URL}/api/projects`);
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Authentication required. Please log in again.');
          }
          throw new Error(`Failed to fetch projects: ${response.status}`);
        }
        
        const result = await response.json();
        workspaceProjects = result.data || result.projects || result;
      }
      
      if (!Array.isArray(workspaceProjects)) {
        throw new Error('Invalid response format');
      }
      
      // Filter projects that support notes
      const notesEnabledProjects = workspaceProjects.filter(project => 
        project.has_notes !== false
      );
      
      setProjects(notesEnabledProjects);
      
      // Auto-select first project if available
      if (notesEnabledProjects.length > 0 && !selectedProjectId) {
        setSelectedProjectId(notesEnabledProjects[0].id);
      }
      
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedProjectId || !noteTitle.trim() || (!content && !blocks)) {
      setError('Please select a project and enter a title');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let htmlContent;
      let metadata = null;
      
      if (blocks && blocks.length > 0) {
        // Use blocks directly - perfect format preservation!
        htmlContent = blocksToHtml(blocks);
        metadata = {
          blocks: blocks,
          version: 2, // Mark as using block format
          savedFromAI: true,
          originalMode: imageMode ? 'image' : 'chat'
        };
      } else {
        // Fallback to content conversion
        htmlContent = convertToHtml(content);
      }
      
      await notesApi.createNote(
        noteTitle.trim(),
        htmlContent,
        selectedProjectId,
        metadata
      );

      setSuccess(true);
      
      // Close modal after short delay
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);

    } catch (err) {
      console.error('Error saving note:', err);
      setError(err.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  // Enhanced conversion to HTML with rich block support for notes
  const convertToHtml = (text) => {
    if (!text) return '<p><br></p>';
    
    let html = '';
    const lines = text.split('\n');
    let inCodeBlock = false;
    let codeContent = [];
    let codeLanguage = '';
    let inTable = false;
    let tableRows = [];
    let inList = { type: null, items: [] };
    
    const closeList = () => {
      if (inList.type && inList.items.length > 0) {
        const tag = inList.type === 'ordered' ? 'ol' : 'ul';
        html += `<${tag}>${inList.items.join('')}</${tag}>`;
        inList = { type: null, items: [] };
      }
    };
    
    const closeTable = () => {
      if (inTable && tableRows.length > 0) {
        html += '<table class="table-block">';
        tableRows.forEach((row, idx) => {
          const tag = idx === 0 ? 'th' : 'td';
          html += '<tr>';
          row.forEach(cell => html += `<${tag}>${cell}</${tag}>`);
          html += '</tr>';
        });
        html += '</table>';
        tableRows = [];
        inTable = false;
      }
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Handle code blocks FIRST
      if (trimmed.startsWith('```')) {
        closeList();
        closeTable();
        if (inCodeBlock) {
          html += `<div class="code-block" data-language="${codeLanguage}">`;
          html += `<div class="code-header"><span class="code-language">${codeLanguage}</span></div>`;
          html += `<pre><code class="language-${codeLanguage}">${codeContent.join('\n')}</code></pre>`;
          html += `</div>`;
          codeContent = [];
          codeLanguage = '';
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim() || 'text';
        }
        continue;
      }
      
      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }
      
      // Handle headings EARLY - before numbered lists
      if (trimmed.startsWith('### ')) {
        closeList();
        closeTable();
        html += `<h3>${trimmed.slice(4)}</h3>`;
        continue;
      } else if (trimmed.startsWith('## ')) {
        closeList();
        closeTable();
        html += `<h2>${trimmed.slice(3)}</h2>`;
        continue;
      } else if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        closeList();
        closeTable();
        html += `<h1>${trimmed.slice(2)}</h1>`;
        continue;
      }
      
      // Handle tables (markdown format: | col1 | col2 |)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        closeList();
        // Skip separator rows (|---|---|)
        if (trimmed.match(/^\|[\s\-:]+\|$/)) {
          continue;
        }
        const cells = trimmed.split('|').slice(1, -1).map(cell => cell.trim());
        tableRows.push(cells);
        inTable = true;
        continue;
      } else if (inTable) {
        closeTable();
      }
      
      // Handle callouts (> [!type] content)
      if (trimmed.startsWith('> [!') || trimmed.startsWith('>[!')) {
        closeList();
        const match = trimmed.match(/^>\s*\[!(\w+)\]\s*(.*)/);
        if (match) {
          const [, type, content] = match;
          const icons = {
            info: 'ℹ️', warning: '⚠️', error: '❌', 
            success: '✅', note: '📝', tip: '💡'
          };
          const icon = icons[type.toLowerCase()] || 'ℹ️';
          html += `<div class="callout-block callout-${type.toLowerCase()}" data-type="${type.toLowerCase()}">`;
          html += `<div class="callout-icon">${icon}</div>`;
          html += `<div class="callout-content">${content}</div>`;
          html += `</div>`;
          continue;
        }
      }
      
      // Handle todos (- [ ] or - [x])
      if (trimmed.match(/^[\-\*]\s*\[([ xX])\]/)) {
        closeList();
        const checked = trimmed.match(/\[([xX])\]/);
        const content = trimmed.replace(/^[\-\*]\s*\[([ xX])\]\s*/, '');
        html += `<div class="todo-item${checked ? ' todo-checked' : ''}" data-checked="${!!checked}">`;
        html += `<input type="checkbox" ${checked ? 'checked' : ''} disabled> `;
        html += `<span class="todo-content">${content}</span>`;
        html += `</div>`;
        continue;
      }
      
      // Handle horizontal rules
      if (trimmed.match(/^(---|___|(\*\*\*))$/)) {
        closeList();
        html += '<hr class="divider-block" data-style="line" />';
        continue;
      }
      
      // Handle blockquotes (not callouts)
      if (trimmed.startsWith('> ') && !trimmed.startsWith('> [!')) {
        closeList();
        html += `<blockquote>${trimmed.slice(2)}</blockquote>`;
        continue;
      }
      
      // Handle ordered lists
      if (trimmed.match(/^\d+\.\s/)) {
        const text = trimmed.replace(/^\d+\.\s/, '');
        if (inList.type !== 'ordered') {
          closeList();
          inList.type = 'ordered';
        }
        inList.items.push(`<li>${text}</li>`);
        continue;
      }
      
      // Handle unordered lists
      if (trimmed.match(/^[•\-\*]\s/) && !trimmed.match(/\[([ xX])\]/)) {
        const text = trimmed.replace(/^[•\-\*]\s/, '');
        if (inList.type !== 'unordered') {
          closeList();
          inList.type = 'unordered';
        }
        inList.items.push(`<li>${text}</li>`);
        continue;
      }
      
      // Close lists if we're in one and hit non-list content
      if (inList.type && trimmed !== '') {
        closeList();
      }
      
      // Empty lines
      if (trimmed === '') {
        continue;
      }
      
      // Regular text with inline formatting
      let formatted = trimmed;
      // Bold **text**
      formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Italic *text* (not part of **)
      formatted = formatted.replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>');
      // Code `text`
      formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
      
      html += `<p>${formatted}</p>`;
    }
    
    // Close any remaining open elements
    closeList();
    closeTable();
    
    return html || '<p><br></p>';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 midnight:bg-slate-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header - Clean */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50 dark:bg-gray-700 midnight:bg-slate-700">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-slate-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
              Save as Note
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-slate-600 rounded transition-colors"
            disabled={saving}
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Success State */}
          {success && (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/30 border border-green-200 dark:border-green-800 midnight:border-green-700 rounded-lg">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400 midnight:text-green-300" />
              <span className="text-green-700 dark:text-green-300 midnight:text-green-200 font-medium">
                Note saved successfully!
              </span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/30 border border-red-200 dark:border-red-800 midnight:border-red-700 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 midnight:text-red-300 mt-0.5" />
              <span className="text-red-700 dark:text-red-300 midnight:text-red-200 text-sm">
                {error}
              </span>
            </div>
          )}

          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 mb-2">
              Note Title
            </label>
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-slate-600 rounded-lg bg-white dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter note title..."
              disabled={saving || success}
            />
          </div>

          {/* Project Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 mb-2">
              Project
            </label>
            {loading ? (
              <div className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-600 midnight:border-slate-600 rounded-lg">
                <Loader className="w-4 h-4 animate-spin text-gray-500" />
                <span className="text-gray-500 dark:text-gray-400 midnight:text-slate-400 text-sm">
                  Loading projects...
                </span>
              </div>
            ) : projects.length > 0 ? (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-slate-600 rounded-lg bg-white dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={saving || success}
              >
                <option value="">Select a project...</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.emoji || '📁'} {project.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 border border-gray-300 dark:border-gray-600 midnight:border-slate-600 rounded-lg text-gray-500 dark:text-gray-400 midnight:text-slate-400 text-sm">
                {!currentWorkspace 
                  ? 'Please select a workspace to see available projects'
                  : 'No projects available with notes enabled in this workspace'
                }
              </div>
            )}
          </div>

          {/* Content Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 mb-2">
              Content Preview
            </label>
            <div className="max-h-32 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-700 midnight:bg-slate-700 border border-gray-200 dark:border-gray-600 midnight:border-slate-600 rounded-lg">
              <div className="text-sm text-gray-700 dark:text-gray-300 midnight:text-slate-300 whitespace-pre-wrap">
                {content?.length > 200 ? `${content.slice(0, 200)}...` : content}
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Clean */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 midnight:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-slate-600 rounded-lg transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedProjectId || !noteTitle.trim() || saving || success}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : success ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Note</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveAsNoteModal;