// ArtifactsGallery.jsx - View all artifacts from the conversation
import { useState, useEffect } from 'react';
import { X, Code, FileText, Download, Copy, Check, Search } from 'lucide-react';
import ArtifactRenderer from './ArtifactRenderer';

/**
 * ArtifactsGallery - Shows all artifacts from the conversation
 * Can be opened in a sidebar or modal to browse all artifacts
 */
const ArtifactsGallery = ({ messages = [], onClose, onSaveToNotes }) => {
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Handle ESC key to close modal or go back
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (selectedArtifact) {
          setSelectedArtifact(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [selectedArtifact, onClose]);

  // Extract all artifacts from messages
  const allArtifacts = messages
    .filter(msg => msg.type === 'assistant' && msg.artifacts)
    .flatMap((msg, msgIndex) => 
      msg.artifacts.map((artifact, artIndex) => ({
        ...artifact,
        messageIndex: msgIndex,
        artifactIndex: artIndex,
        timestamp: msg.timestamp || new Date().toISOString()
      }))
    );

  // Filter artifacts by search term
  const filteredArtifacts = allArtifacts.filter(artifact => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      artifact.title?.toLowerCase().includes(search) ||
      artifact.type?.toLowerCase().includes(search) ||
      artifact.content?.toLowerCase().includes(search)
    );
  });

  const getArtifactIcon = (type) => {
    switch (type) {
      case 'code':
        return <Code className="w-5 h-5" />;
      case 'document':
        return <FileText className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (selectedArtifact) {
    // Full view of selected artifact - using same polished view as message artifacts
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 midnight:bg-slate-950 overflow-auto">
        {/* Header with close button */}
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 midnight:bg-slate-950/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
                {selectedArtifact.title}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                {formatTimestamp(selectedArtifact.timestamp)}
              </p>
            </div>
            <button
              onClick={() => setSelectedArtifact(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:text-gray-900 dark:hover:text-gray-100 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
              title="Back to gallery"
            >
              Close
            </button>
          </div>
        </div>

        {/* Artifact Content - Same as ArtifactViewer full view */}
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            <ArtifactRenderer
              artifact={selectedArtifact}
              onSaveToNotes={onSaveToNotes}
              isFullView={true}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 midnight:bg-slate-950 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 midnight:bg-slate-950 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
              Artifacts Gallery
            </h2>
            <span className="px-2.5 py-1 text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/40 text-blue-700 dark:text-blue-300 midnight:text-blue-300 rounded-full">
              {filteredArtifacts.length} {filteredArtifacts.length === 1 ? 'artifact' : 'artifacts'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-400 midnight:text-slate-400" />
          </button>
        </div>

        {/* Search Controls */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search artifacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 midnight:text-slate-100 placeholder-gray-500 dark:placeholder-gray-400 midnight:placeholder-slate-400"
          />
        </div>
      </div>

      {/* Artifacts Grid */}
      <div className="p-6">
        {filteredArtifacts.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {searchTerm ? 'No artifacts found matching your search' : 'No artifacts in this conversation yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredArtifacts.map((artifact, index) => (
              <div
                key={`${artifact.messageIndex}-${artifact.artifactIndex}-${index}`}
                onClick={() => setSelectedArtifact(artifact)}
                className="group cursor-pointer bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg p-3 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex-shrink-0">
                    {getArtifactIcon(artifact.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100 truncate text-sm">
                      {artifact.title}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 midnight:bg-slate-700 rounded">
                    {artifact.type}
                  </span>
                  <span>{formatTimestamp(artifact.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtifactsGallery;
