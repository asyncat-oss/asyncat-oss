import React, { useState, useRef } from 'react';
import { Link, Youtube, ExternalLink, RefreshCw, Edit3 } from 'lucide-react';

const EmbedBlock = ({ block, onChange, contentRef, commonProps }) => {
  const [url, setUrl] = useState(block.properties?.url || '');
  const [embedType, setEmbedType] = useState(block.properties?.type || 'generic');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(!block.properties?.url);
  const inputRef = useRef(null);

  const embedTypes = [
    { type: 'youtube', label: 'YouTube', icon: Youtube, pattern: /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/ },
    { type: 'vimeo', label: 'Vimeo', icon: ExternalLink, pattern: /vimeo\.com\/(?:.*#|.*\/)?(\d+)/ },
    { type: 'codepen', label: 'CodePen', icon: ExternalLink, pattern: /codepen\.io\/.*\/pen\/(.*)/ },
    { type: 'figma', label: 'Figma', icon: ExternalLink, pattern: /figma\.com\/(file|proto)\/([a-zA-Z0-9]{22,128})/ },
    { type: 'generic', label: 'Generic', icon: Link, pattern: null }
  ];

  const detectEmbedType = (url) => {
    for (const type of embedTypes) {
      if (type.pattern && type.pattern.test(url)) {
        return type.type;
      }
    }
    return 'generic';
  };

  const handleUrlChange = (newUrl) => {
    setUrl(newUrl);
    const detectedType = detectEmbedType(newUrl);
    setEmbedType(detectedType);
  };

  const handleSaveUrl = () => {
    setIsLoading(true);
    
    // Simulate loading and URL validation
    setTimeout(() => {
      onChange(block.id, {
        properties: {
          ...block.properties,
          url: url,
          type: embedType,
          title: getUrlTitle(url)
        }
      });
      setIsEditing(false);
      setIsLoading(false);
    }, 1000);
  };

  const getUrlTitle = (url) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return `${domain.charAt(0).toUpperCase() + domain.slice(1)} embed`;
    } catch {
      return 'Embedded content';
    }
  };

  const renderEmbed = () => {
    if (!url) return null;

    switch (embedType) {
      case 'youtube':
        const youtubeId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
        return (
          <div className="aspect-video bg-gray-900 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg flex items-center justify-center">
            <div className="text-center text-white">
              <Youtube className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">YouTube Video</p>
              <p className="text-xs opacity-75">{youtubeId}</p>
            </div>
          </div>
        );

      case 'vimeo':
        return (
          <div className="aspect-video bg-blue-900 dark:bg-blue-800 midnight:bg-blue-900 rounded-lg flex items-center justify-center">
            <div className="text-center text-white">
              <ExternalLink className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">Vimeo Video</p>
              <p className="text-xs opacity-75">Click to view</p>
            </div>
          </div>
        );

      case 'codepen':
        return (
          <div className="aspect-video bg-gray-900 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg flex items-center justify-center border border-gray-700 dark:border-gray-600 midnight:border-gray-700">
            <div className="text-center text-gray-300">
              <ExternalLink className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">CodePen</p>
              <p className="text-xs opacity-75">Interactive code demo</p>
            </div>
          </div>
        );

      case 'figma':
        return (
          <div className="aspect-video bg-purple-100 dark:bg-purple-900 midnight:bg-purple-950 rounded-lg flex items-center justify-center border">
            <div className="text-center text-purple-800 dark:text-purple-200 midnight:text-purple-300">
              <ExternalLink className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">Figma Design</p>
              <p className="text-xs opacity-75">Design prototype</p>
            </div>
          </div>
        );

      default:
        return (
          <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Link className="w-8 h-8 text-gray-400" />
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-200">
                  {getUrlTitle(url)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 truncate">
                  {url}
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        );
    }
  };

  if (isEditing) {
    return (
      <div className="embed-block border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-1">
              Embed URL
            </label>
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="Paste a link to embed content (YouTube, Vimeo, CodePen, Figma...)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {url && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-1">
                Detected type
              </label>
              <select
                value={embedType}
                onChange={(e) => setEmbedType(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-md bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-900 dark:text-gray-100 midnight:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {embedTypes.map(type => (
                  <option key={type.type} value={type.type}>{type.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSaveUrl}
              disabled={!url || isLoading}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-700 midnight:bg-indigo-600 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 midnight:hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Loading...' : 'Embed'}
            </button>
            
            {block.properties?.url && (
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 midnight:hover:text-gray-300"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="embed-block group">
      {/* Controls - shown on hover */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex justify-between items-center mb-2">
        <div className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500">
          {embedTypes.find(t => t.type === embedType)?.label} embed
        </div>
        
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 midnight:bg-gray-800 text-gray-600 dark:text-gray-400 midnight:text-gray-500 rounded hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-700"
        >
          <Edit3 className="w-3 h-3" />
          Edit URL
        </button>
      </div>

      {/* Embed content */}
      <div className="cursor-pointer" onClick={() => window.open(url, '_blank')}>
        {renderEmbed()}
      </div>
    </div>
  );
};

export default EmbedBlock;
