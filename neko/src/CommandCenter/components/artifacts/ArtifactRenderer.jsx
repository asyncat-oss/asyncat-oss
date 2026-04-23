// ArtifactRenderer.jsx - Main artifact display component
import { useState, useEffect, useRef, useMemo } from 'react';
import { Code, FileText, Download, Copy, Check, Play, Edit3, Eye, EyeOff, Save, BarChart2, Sigma, RotateCcw } from 'lucide-react';
import { parseAIResponseToBlocks, BlockRenderer } from '../BlockBasedMessageRenderer';
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts';
import { GenUIArtifact } from './GenUIArtifact';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import 'highlight.js/styles/github.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('jsx', javascript);

/**
 * Artifact Types:
 * - code: Executable/editable code
 * - document: Rich text documents, templates
 * - diagram: Mermaid diagrams, flowcharts
 * - canvas: Interactive React components
 * - visualization: Charts and data visualizations
 */

const ArtifactRenderer = ({ artifact, onSaveToNotes, isFullView = false, showPreview: externalShowPreview, setShowPreview: externalSetShowPreview }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(artifact.content);
  const [internalShowPreview, setInternalShowPreview] = useState(true);
  const [saveStatus, setSaveStatus] = useState(null);
  // ── Version history (session-only undo) ──────────────────────────────────
  const [history, setHistory] = useState([artifact.content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canUndo = historyIndex > 0;

  const pushHistory = (newContent) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    artifact.content = newContent;
  };

  const handleUndo = () => {
    if (!canUndo) return;
    const prevIndex = historyIndex - 1;
    setHistoryIndex(prevIndex);
    setEditedContent(history[prevIndex]);
    artifact.content = history[prevIndex];
  };

  // Use external preview state in full view, internal state otherwise
  const showPreview = isFullView ? externalShowPreview : internalShowPreview;
  const setShowPreview = isFullView ? externalSetShowPreview : setInternalShowPreview;

  // Check if artifact can be previewed
  const canPreview = () => {
    if (artifact.type === 'code') {
      const lang = artifact.language?.toLowerCase();
      return lang === 'html' || lang === 'svg' || lang === 'xml';
    }
    // Diagram preview is now supported!
    if (artifact.type === 'diagram') return true;
    if (artifact.type === 'visualization') return true;
    if (artifact.type === 'react_component') return true;
    return false;
  };

  const hasPreview = canPreview();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDownload = () => {
    const extension = getFileExtension(artifact);
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'artifact'}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveToNotes = async () => {
    if (onSaveToNotes) {
      setSaveStatus('saving');
      try {
        await onSaveToNotes(artifact);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (error) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus(null), 2000);
      }
    }
  };

  const getFileExtension = (artifact) => {
    switch (artifact.type) {
      case 'code': {
        const lang = (artifact.language || '').toLowerCase();
        const map = { javascript: 'js', typescript: 'ts', python: 'py', html: 'html', css: 'css', json: 'json', sql: 'sql', bash: 'sh', shell: 'sh' };
        return map[lang] || lang || 'txt';
      }
      case 'document':
        return 'md';
      case 'diagram':
        return 'mmd';
      case 'visualization':
        return 'json';
      case 'react_component':
        return 'jsx';
      default:
        return 'txt';
    }
  };

  const getArtifactIcon = () => {
    switch (artifact.type) {
      case 'code':
        return <Code className="w-5 h-5" />;
      case 'document':
        return <FileText className="w-5 h-5" />;
      case 'visualization':
        return <BarChart2 className="w-5 h-5" />;
      case 'react_component':
        return <Play className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <div className={isFullView ? "" : "artifact-container rounded-xl overflow-hidden bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-600 shadow-sm"}>
      {/* Artifact Header - Only show in card view, not in full view */}
      {!isFullView && (
        <div className="artifact-header flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-gray-800 midnight:bg-slate-800 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-600">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700">
              <div className="text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                {getArtifactIcon()}
              </div>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
                {artifact.title || 'Artifact'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                {artifact.type === 'code' && artifact.language && `${artifact.language} • `}
                {artifact.content.split('\n').length} lines
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Edit Mode Toggle */}
            {artifact.metadata?.editable !== false && (
              <>
                {isEditing ? (
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      onClick={() => {
                        pushHistory(editedContent);
                        setIsEditing(false);
                      }}
                      className="p-1.5 text-green-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition-all shadow-sm"
                      title="Save Changes"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditedContent(artifact.content);
                        setIsEditing(false);
                      }}
                      className="p-1.5 text-red-500 hover:bg-white dark:hover:bg-gray-600 rounded-md transition-all shadow-sm"
                      title="Cancel"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {canUndo && (
                      <button
                        onClick={handleUndo}
                        className="p-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title={`Undo (${historyIndex} version${historyIndex !== 1 ? 's' : ''} back)`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Edit Artifact"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

            {/* Preview Toggle - PRIORITY for previewable artifacts */}
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

            <button
              onClick={handleCopy}
              className="p-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 midnight:text-slate-300 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-600 rounded-lg transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <span className="text-green-600 dark:text-green-400 text-xs font-medium px-2">Copied!</span>
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>

            {onSaveToNotes && (
              <button
                onClick={handleSaveToNotes}
                className="p-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 midnight:text-slate-300 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-600 rounded-lg transition-colors"
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

            {artifact.metadata?.downloadable !== false && (
              <button
                onClick={handleDownload}
                className="p-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 midnight:text-slate-300 midnight:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-600 rounded-lg transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Artifact Content - Allow full height for previews */}
      <div className={`artifact-content ${isFullView ? '' : 'bg-gray-50 dark:bg-gray-900 midnight:bg-slate-900'} ${showPreview && hasPreview ? '' : 'overflow-auto'}`}>
        {artifact.type === 'code' && (
          <>
            {showPreview && hasPreview ? (
              <PreviewArtifact
                content={isEditing ? editedContent : artifact.content}
                language={artifact.language}
              />
            ) : (
              <CodeArtifact
                content={isEditing ? editedContent : artifact.content}
                language={artifact.language}
                isEditing={isEditing}
                onContentChange={setEditedContent}
              />
            )}
          </>
        )}

        {artifact.type === 'document' && (
          <DocumentArtifact content={artifact.content} />
        )}

        {artifact.type === 'diagram' && (
          <>
            {showPreview ? (
              <DiagramArtifact content={artifact.content} />
            ) : (
              <CodeArtifact
                content={isEditing ? editedContent : artifact.content}
                language="mermaid"
                isEditing={isEditing}
                onContentChange={setEditedContent}
              />
            )}
          </>
        )}

        {artifact.type === 'visualization' && (
          <VisualizationArtifact content={artifact.content} />
        )}

        {artifact.type === 'react_component' && (
          <>
            {showPreview ? (
              <GenUIArtifact codeString={isEditing ? editedContent : artifact.content} />
            ) : (
              <CodeArtifact
                content={isEditing ? editedContent : artifact.content}
                language="jsx"
                isEditing={isEditing}
                onContentChange={setEditedContent}
              />
            )}
          </>
        )}
      </div>

    </div>
  );
};

// Code Artifact Component — with syntax highlighting
const CodeArtifact = ({ content, language, isEditing, onContentChange }) => {
  const highlighted = useMemo(() => {
    if (!content) return '';
    const lang = (language || 'text').toLowerCase();
    try {
      if (hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang }).value;
      }
      return hljs.highlightAuto(content).value;
    } catch {
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }, [content, language]);

  if (isEditing) {
    return (
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        className="w-full h-full p-5 font-mono text-sm bg-gray-50 dark:bg-gray-900 midnight:bg-slate-900 text-gray-900 dark:text-gray-100 midnight:text-slate-100 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 leading-7"
        style={{ minHeight: '300px', resize: 'vertical' }}
        spellCheck={false}
      />
    );
  }

  return (
    <pre className="p-5 overflow-x-auto bg-gray-50 dark:bg-gray-900 midnight:bg-slate-900">
      <code
        className="text-sm font-mono leading-7 hljs"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
};

// Document Artifact Component
const DocumentArtifact = ({ content }) => {
  // Parse content into blocks for rich rendering
  const blocks = parseAIResponseToBlocks(content);

  return (
    <div className="p-6 max-w-none">
      <div className="space-y-4">
        {blocks.map(block => (
          <BlockRenderer key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
};

// Diagram Artifact Component (code view)
const DiagramArtifact = ({ content }) => {
  const elementRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!elementRef.current) return;
      
      try {
        // Try to import mermaid
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule.default;
        
        mermaid.initialize({ 
          startOnLoad: false, 
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
          securityLevel: 'loose'
        });
        
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, content);
        elementRef.current.innerHTML = svg;
        setError(null);
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(err.message);
        // Fallback to showing code if mermaid fails or isn't installed
      }
    };

    renderDiagram();
  }, [content]);

  if (error) {
    return (
      <div className="p-6 bg-white dark:bg-gray-900 midnight:bg-slate-900">
        <div className="text-red-500 mb-2 text-sm font-medium">
          Diagram Render Error
        </div>
        <div className="text-red-400 mb-4 text-xs font-mono whitespace-pre-wrap">
          {error}
        </div>
        <div className="text-gray-500 text-xs mb-2">Raw Mermaid Code:</div>
        <pre className="text-left text-sm bg-gray-50 dark:bg-gray-800 midnight:bg-slate-800 p-4 rounded overflow-auto">
          <code className="text-gray-900 dark:text-gray-100 midnight:text-slate-100 font-mono">
            {content}
          </code>
        </pre>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-900 midnight:bg-slate-900 overflow-auto flex justify-center">
      <div ref={elementRef} className="mermaid-container" />
    </div>
  );
};

// Visualization Artifact Component
const VisualizationArtifact = ({ content }) => {
  const [data, setData] = useState(null);
  const [type, setType] = useState('bar');
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      setData(parsed.data || []);
      setType(parsed.type || 'bar');
      setError(null);
    } catch (e) {
      setError('Invalid JSON data for visualization');
    }
  }, [content]);

  if (error) {
    return <div className="p-6 text-red-500">{error}</div>;
  }

  if (!data || data.length === 0) {
    return <div className="p-6 text-gray-500">No data to display</div>;
  }

  const renderChart = () => {
    const commonProps = {
      width: "100%",
      height: 400,
      data: data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={150}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042'][index % 4]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );
      case 'bar':
      default:
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 midnight:bg-slate-900">
      {renderChart()}
    </div>
  );
};

// HTML/SVG Preview Component
const PreviewArtifact = ({ content, language }) => {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (iframeRef.current && language?.toLowerCase() === 'html') {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(content);
        iframeDoc.close();
      }
    }
  }, [content, language]);

  if (language?.toLowerCase() === 'svg' || language?.toLowerCase() === 'xml') {
    // Direct SVG rendering - full width
    return (
      <div className="p-6 bg-white dark:bg-gray-900 midnight:bg-slate-900 flex items-center justify-center min-h-[600px] w-full">
        <div className="w-full" dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    );
  }

  // HTML iframe preview - Use full available space
  return (
    <div className="bg-white dark:bg-gray-900 midnight:bg-slate-900 w-full" style={{ height: '80vh', minHeight: '600px' }}>
      <iframe
        ref={iframeRef}
        title="HTML Preview"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
};

export default ArtifactRenderer;
