// ArtifactSidePanel.jsx — Right-side panel showing the active artifact
import { useState } from 'react';
import { X, Copy, Download, Save, Eye, Code, Check } from 'lucide-react';
import ArtifactRenderer from './ArtifactRenderer';

const ArtifactSidePanel = ({ artifact, onClose, onSaveToNotes }) => {
  const [showPreview, setShowPreview] = useState(true);
  const [copied, setCopied]           = useState(false);
  const [saveStatus, setSaveStatus]   = useState(null);

  const canPreview = () => {
    if (artifact.type === 'diagram' || artifact.type === 'visualization') return true;
    if (artifact.type === 'react_component') return true;
    if (artifact.type !== 'code') return false;
    const lang = artifact.language?.toLowerCase();
    return lang === 'html' || lang === 'svg' || lang === 'xml';
  };
  const hasPreview = canPreview();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    const lang  = (artifact.language || '').toLowerCase();
    const extMap = { javascript: 'js', typescript: 'ts', python: 'py', html: 'html', css: 'css', json: 'json', sql: 'sql', bash: 'sh', shell: 'sh' };
    const ext   = extMap[lang] || lang || { document: 'md', diagram: 'mmd', visualization: 'json' }[artifact.type] || 'txt';
    const blob  = new Blob([artifact.content], { type: 'text/plain' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'artifact'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!onSaveToNotes) return;
    setSaveStatus('saving');
    try {
      await onSaveToNotes(artifact);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700">
        {/* Title + type badge */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100 truncate">
            {artifact.title || 'Artifact'}
          </span>
          {artifact.language && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-500 dark:text-gray-400 midnight:text-slate-400 rounded uppercase">
              {artifact.language}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {hasPreview && (
            <button
              onClick={() => setShowPreview(p => !p)}
              title={showPreview ? 'Show code' : 'Show preview'}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                showPreview
                  ? 'bg-gray-900 dark:bg-gray-100 midnight:bg-slate-100 text-white dark:text-gray-900 midnight:text-slate-900'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800'
              }`}
            >
              {showPreview ? <><Eye className="w-3.5 h-3.5" /> Preview</> : <><Code className="w-3.5 h-3.5" /> Code</>}
            </button>
          )}

          <button onClick={handleCopy} title="Copy" className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>

          {onSaveToNotes && (
            <button onClick={handleSave} title="Save to Notes" className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors">
              {saveStatus === 'saved'
                ? <Check className="w-4 h-4 text-green-500" />
                : <Save className="w-4 h-4" />}
            </button>
          )}

          <button onClick={handleDownload} title="Download" className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" />
          </button>

          <button onClick={onClose} title="Close panel" className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <ArtifactRenderer
          artifact={artifact}
          onSaveToNotes={onSaveToNotes}
          isFullView={true}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
        />
      </div>
    </div>
  );
};

export default ArtifactSidePanel;
