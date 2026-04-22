// ArtifactViewer.jsx - Container for artifacts with explanation
import { useState, useEffect } from 'react';
import ArtifactRenderer from './ArtifactRenderer';
import { ChevronDown, ChevronUp, Code, FileText, Maximize2, Copy, Download, Save, Eye, GitBranch, Cpu, BarChart2, Play } from 'lucide-react';

/**
 * ArtifactViewer displays one or more artifacts as compact cards
 * Clicking a card opens it in full modal view
 */

const ArtifactViewer = ({ artifacts = [], explanation = '', showExplanation = true, onSaveToNotes, onArtifactOpen }) => {
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const [showExplanationSection, setShowExplanationSection] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [saveStatus, setSaveStatus] = useState(null);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && selectedArtifact) {
        setSelectedArtifact(null);
      }
    };

    if (selectedArtifact) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [selectedArtifact]);

  if (!artifacts || artifacts.length === 0) {
    return null;
  }

  const getArtifactIcon = (type) => {
    switch (type) {
      case 'code':
        return <Code className="w-4 h-4" />;
      case 'document':
        return <FileText className="w-4 h-4" />;
      case 'diagram':
        return <GitBranch className="w-4 h-4" />;
      case 'react_component':
        return <Cpu className="w-4 h-4" />;
      case 'visualization':
        return <BarChart2 className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getArtifactBadge = (artifact) => {
    if (artifact.language) return artifact.language;
    switch (artifact.type) {
      case 'diagram': return 'mermaid';
      case 'react_component': return 'react';
      case 'visualization': return 'chart';
      case 'document': return 'doc';
      default: return artifact.type;
    }
  };

  const formatLineCount = (content) => {
    return content.split('\n').length;
  };

  // Helper functions for full view
  const handleCopy = async () => {
    if (!selectedArtifact) return;
    try {
      await navigator.clipboard.writeText(selectedArtifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDownload = () => {
    if (!selectedArtifact) return;
    const extension = selectedArtifact.language || 'txt';
    const blob = new Blob([selectedArtifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedArtifact.title || 'artifact'}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!selectedArtifact || !onSaveToNotes) return;
    setSaveStatus('saving');
    try {
      await onSaveToNotes(selectedArtifact);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  const canPreview = () => {
    if (!selectedArtifact) return false;
    if (selectedArtifact.type === 'diagram') return true;
    if (selectedArtifact.type === 'visualization') return true;
    if (selectedArtifact.type === 'react_component') return true;
    if (selectedArtifact.type !== 'code') return false;
    const lang = selectedArtifact.language?.toLowerCase();
    return lang === 'html' || lang === 'svg' || lang === 'xml';
  };

  // Full artifact modal view
  if (selectedArtifact) {
    const hasPreview = canPreview();
    
    return (
      <div className="fixed inset-0 z-[9999] bg-white dark:bg-gray-900 midnight:bg-slate-950 flex flex-col">
        {/* Header with title, actions, and close button */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-white/95 dark:bg-gray-900/95 midnight:bg-slate-950/95 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* Title */}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
              {selectedArtifact.title || 'Artifact'}
            </h2>
            
            {/* Action buttons + Close */}
            <div className="flex items-center gap-2">
              {/* Preview Toggle */}
              {hasPreview && (
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                    showPreview
                      ? 'bg-gray-900 dark:bg-gray-100 midnight:bg-slate-100 text-white dark:text-gray-900 midnight:text-slate-900'
                      : 'bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-600 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-slate-600'
                  }`}
                  title={showPreview ? "Show Code" : "Show Preview"}
                >
                  {showPreview ? (
                    <>
                      <Eye className="w-4 h-4" />
                      <span>Preview</span>
                    </>
                  ) : (
                    <>
                      <Code className="w-4 h-4" />
                      <span>Code</span>
                    </>
                  )}
                </button>
              )}
              
              {/* Copy Button */}
              <button
                onClick={handleCopy}
                className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 midnight:text-slate-300 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
                title="Copy"
              >
                {copied ? (
                  <span className="text-green-600 dark:text-green-400 text-xs font-medium px-2">Copied!</span>
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>

              {/* Save Button */}
              {onSaveToNotes && (
                <button
                  onClick={handleSave}
                  className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 midnight:text-slate-300 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
                  title="Save to Notes"
                >
                  {saveStatus === 'saved' ? (
                    <span className="text-green-600 dark:text-green-400 text-xs font-medium px-2">Saved!</span>
                  ) : saveStatus === 'saving' ? (
                    <span className="text-blue-600 dark:text-blue-400 text-xs font-medium px-2">Saving...</span>
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                </button>
              )}

              {/* Download Button */}
              <button
                onClick={handleDownload}
                className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 midnight:text-slate-300 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              
              {/* Close Button */}
              <button
                onClick={() => setSelectedArtifact(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:text-gray-900 dark:hover:text-gray-100 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        
        {/* Artifact Content - Simplified, no box, blends with background */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-6">
            <ArtifactRenderer
              artifact={selectedArtifact}
              onSaveToNotes={onSaveToNotes}
              isFullView={true}
              showPreview={showPreview}
              setShowPreview={setShowPreview}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="artifact-viewer space-y-4">
      {/* Artifacts as simple cards */}
      <div className="grid gap-2 grid-cols-1">
        {artifacts.map((artifact, index) => (
          <div
            key={artifact.id || index}
            onClick={() => onArtifactOpen ? onArtifactOpen(artifact) : setSelectedArtifact(artifact)}
            className="group cursor-pointer bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg p-3 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-slate-500 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-500 dark:text-gray-400 midnight:text-slate-400 flex-shrink-0">
                {getArtifactIcon(artifact.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100 truncate">
                    {artifact.title}
                  </h3>
                  <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 text-gray-500 dark:text-gray-400 text-xs rounded uppercase tracking-wide flex-shrink-0">
                    {getArtifactBadge(artifact)}
                  </span>
                </div>
              </div>
              <Maximize2 className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>

      {/* Artifact Counter for Multiple Artifacts */}
      {artifacts.length > 1 && (
        <div className="text-center text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
          {artifacts.length} artifacts generated
        </div>
      )}
    </div>
  );
};

export default ArtifactViewer;
