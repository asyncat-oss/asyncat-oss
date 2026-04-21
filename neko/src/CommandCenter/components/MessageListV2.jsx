// MessageListV2.jsx - Clean Minimal Design with UNIFIED BLOCK SYSTEM
import React, { forwardRef, useState, useCallback } from 'react';
import BlockBasedMessageRenderer from './BlockBasedMessageRenderer';
import { ProjectBadges } from './ProjectManagerV2';
import { ToolCallList } from './ToolCallCard';
import { parseWebLinks } from './WebSourcesBar';
import { llamaServerApi } from '../../Settings/settingApi.js';
import { FileText, AlertCircle, RotateCcw, X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import ThinkingBlock, { parseThinkingContent, isInsideThinkBlock, stripThinkForStreaming } from './ThinkingBlock.jsx';

// ── Image grid with lightbox ──────────────────────────────────────────────────
function SearchImageGrid({ images }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const open  = useCallback(i => setLightboxIndex(i), []);
  const close = useCallback(() => setLightboxIndex(null), []);
  const prev  = useCallback(e => { e.stopPropagation(); setLightboxIndex(i => (i - 1 + images.length) % images.length); }, [images.length]);
  const next  = useCallback(e => { e.stopPropagation(); setLightboxIndex(i => (i + 1) % images.length); }, [images.length]);

  const current = lightboxIndex !== null ? images[lightboxIndex] : null;

  // Layout: first image featured (col-span-2) when ≥ 3 images
  const featured = images.length >= 3;

  return (
    <>
      {/* Grid */}
      <div className={`grid gap-1.5 mb-3 rounded-2xl overflow-hidden ${featured ? 'grid-cols-3' : 'grid-cols-2'}`}
        style={featured ? { gridTemplateRows: 'auto auto' } : undefined}
      >
        {images.slice(0, 6).map((img, i) => {
          const isFeatured = featured && i === 0;
          return (
            <button
              key={i}
              onClick={() => open(i)}
              className={`group relative overflow-hidden bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 focus:outline-none ${
                isFeatured ? 'col-span-2 row-span-2' : ''
              }`}
              style={isFeatured ? undefined : { aspectRatio: '1/1' }}
            >
              <img
                src={img.thumbnail || img.image}
                alt={img.title || ''}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                loading="lazy"
                onError={e => { if (img.image && e.target.src !== img.image) e.target.src = img.image; }}
              />
              {/* Subtle darkening on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-200" />
              {/* Source badge — bottom right, always visible on featured */}
              {(isFeatured && img.source) && (
                <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-[10px] font-medium bg-black/50 backdrop-blur-sm text-white rounded-md">
                  {img.source}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lightbox */}
      {current && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md"
          onClick={close}
        >
          {/* Image card */}
          <div
            className="relative flex flex-col max-w-3xl w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={current.image || current.thumbnail}
              alt={current.title || ''}
              className="w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl"
              onError={e => { if (current.thumbnail && e.target.src !== current.thumbnail) e.target.src = current.thumbnail; }}
            />

            {/* Caption bar */}
            <div className="flex items-center justify-between mt-3 px-1">
              <div className="min-w-0 flex-1">
                {current.title && (
                  <p className="text-white text-sm font-medium truncate">{current.title}</p>
                )}
                {current.source && (
                  <p className="text-white/50 text-xs mt-0.5">{current.source}</p>
                )}
              </div>
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="ml-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white border border-white/20 hover:border-white/40 rounded-xl transition-colors flex-shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
                Source
              </a>
            </div>

            {/* Counter */}
            <p className="text-center text-white/40 text-xs mt-2">
              {lightboxIndex + 1} / {images.length}
            </p>
          </div>

          {/* Nav arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={next}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Close button */}
          <button
            onClick={close}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}

// ── One-click model start button — appears in offline error messages ──────────
const ModelStartButton = () => {
  const lastModel = localStorage.getItem('asyncat-last-model');
  const [phase, setPhase] = useState('idle'); // idle | starting | done
  if (!lastModel) return null;
  const shortName = lastModel.replace(/\.gguf$/i, '');
  const handleStart = async () => {
    setPhase('starting');
    try { await llamaServerApi.start(lastModel); setPhase('done'); } catch { setPhase('idle'); }
  };
  return (
    <button
      onClick={handleStart}
      disabled={phase !== 'idle'}
      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
    >
      {phase === 'done' ? '✓ Loading…' : phase === 'starting' ? 'Starting…' : `▶ Start ${shortName}`}
    </button>
  );
};

// Thinking indicator — shown at the top of a streaming assistant message
const ThinkingIndicator = () => (
  <div className="flex items-center gap-2 mb-3">
    <img
      src="/cat.svg"
      alt=""
      className="w-3.5 h-3.5 opacity-60"
      style={{ animation: 'ccFloat 2s ease-in-out infinite' }}
    />
    <span
      className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 italic"
      style={{ animation: 'ccFade 1.5s ease-in-out infinite' }}
    >
      thinking...
    </span>
    <style>{`
      @keyframes ccFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
      @keyframes ccFade  { 0%,100%{opacity:.5} 50%{opacity:1} }
    `}</style>
  </div>
);

// Conversation loading indicator (different from message generation)
// Shows only a clean skeleton without redundant bouncing dots
const ConversationLoadingIndicator = () => (
  <div className="group mb-8">
    <div className="max-w-4xl mx-auto">
      {/* Assistant message header skeleton with subtle indicator */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-16 animate-pulse"></div>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500 animate-pulse">
          Loading conversation...
        </span>
      </div>
      
      {/* Content skeleton */}
      <div className="bg-white dark:bg-gray-900 midnight:bg-slate-950 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg p-4">
        <div className="space-y-3">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-full animate-pulse"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-4/5 animate-pulse" style={{ animationDelay: '0.1s' }}></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-3/4 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-5/6 animate-pulse" style={{ animationDelay: '0.3s' }}></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700 rounded w-2/3 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  </div>
);

// Enhanced message component with unified layout
const MessageComponent = ({
  message,
  messageIndex,
  onRegenerate,
  onEdit,
  onQuestionClick = null,
  mode = 'chat',
  projectIds = [],
  userContext = null,
  isLastMessage = false,
  persistentSuggestions = [],
  messages = [], // Added to determine if this is the last assistant message
  isLastAssistantMessage = false, // Added to control regenerate visibility
  onSaveArtifactToNotes = null, // NEW: Handler for saving artifacts
  onArtifactOpen = null, // NEW: Opens artifact in side panel
  onTermClick = null // NEW: Opens explain panel for annotated terms
}) => {
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (message.type === 'user') {
    return (
      <div id={`message-${messageIndex}`} className="group mb-6">
        <div className="max-w-4xl mx-auto flex justify-end">
          {/* User message bubble - right-aligned, distinct */}
          <div className="max-w-[75%] rounded-2xl px-4 py-3 relative transition-all duration-200 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800">
            <div className="text-gray-900 dark:text-white midnight:text-white leading-relaxed whitespace-pre-wrap font-medium">
              {message.content}
            </div>
            
            {/* Uploaded Files Display */}
            {message.uploadedFiles && message.uploadedFiles.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 midnight:border-slate-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-3">
                  Uploaded files ({message.uploadedFiles.length}):
                </div>
                
                {/* Box-shaped file grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {message.uploadedFiles.map((file) => (
                    <div 
                      key={file.id} 
                      className="p-2 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/30 border border-green-200 dark:border-green-800 midnight:border-green-700 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-green-600 dark:text-green-400 midnight:text-green-300 flex-shrink-0" />
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 midnight:bg-green-900/60 text-green-700 dark:text-green-300 midnight:text-green-200 rounded">
                          {file.name.split('.').pop()?.toUpperCase() || 'TXT'}
                        </span>
                      </div>
                      
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 truncate mb-1" title={file.name}>
                        {file.name}
                      </p>
                      
                      <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                        <div>{(file.size / 1024).toFixed(1)} KB</div>
                        {file.lines && <div>{file.lines} lines</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Project badges */}
            {message.projectIds && message.projectIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 midnight:border-slate-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 mb-2">Context projects:</div>
                <ProjectBadges 
                  projectIds={message.projectIds} 
                  maxDisplay={3}
                  showLabel={false}
                  variant="compact"
                />
              </div>
            )}
            
            {/* Time on hover - positioned in top right corner */}
            <span className="absolute top-2 right-2 text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatTime(message.timestamp)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Parse weblinks once per render (used by both WebSourcesBar and BlockBasedMessageRenderer)
  const parsedWebContent = parseWebLinks(message.content);

  // Assistant message with unified layout
  return (
    <div id={`message-${messageIndex}`} className="group mb-6">
      <div className="max-w-4xl mx-auto">
      <div className="relative transition-all duration-200">
        {/* Enhanced Error Display */}
        {message.isError && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/30 border-l-4 border-red-500 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                  {message.errorType === 'local_model_offline' ? 'Model Offline' :
                   message.content?.includes('Content Filter') ? 'Content Filtered' :
                   message.content?.includes('Connection') ? 'Connection Error' :
                   message.content?.includes('Too Long') ? 'Context Limit Exceeded' : 'Generation Failed'}
                </h3>
                <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => onRegenerate(messageIndex)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                  {message.errorType === 'local_model_offline' && (
                    <ModelStartButton />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Time on hover - positioned in top right corner */}
        <span className="absolute -top-1 right-0 text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatTime(message.timestamp)}
        </span>
        
        {/* Web search block — searching / sources */}
        {message.searchEvent && (
          <div className="mb-3">
            {/* Searching spinner — only while actively searching */}
            {message.isStreaming && message.searchEvent.type === 'search_start' && (
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span className="text-sm text-blue-600 dark:text-blue-400 midnight:text-blue-400 italic">
                  Searching the web for "{message.searchEvent.query}"...
                </span>
              </div>
            )}

            {/* Done — summary row + source cards + image grid */}
            {message.searchEvent.type === 'search_done' && (
              <div>
                {/* Summary line */}
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
                  </svg>
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400 midnight:text-blue-400">
                    {message.searchEvent.pagesRead > 0
                      ? `Read ${message.searchEvent.pagesRead} page${message.searchEvent.pagesRead !== 1 ? 's' : ''} · ${message.searchEvent.resultCount} results`
                      : `${message.searchEvent.resultCount} results (snippets only)`}
                    {message.searchEvent.images?.length > 0 && ` · ${message.searchEvent.images.length} images`}
                  </span>
                  {message.searchEvent.engine && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                      DuckDuckGo
                    </span>
                  )}
                </div>

                {/* Image grid */}
                {message.searchEvent.images?.length > 0 && (
                  <SearchImageGrid images={message.searchEvent.images} />
                )}

                {/* Source cards */}
                {message.searchEvent.sources?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {message.searchEvent.sources.map((src, i) => {
                      let hostname = '';
                      try { hostname = new URL(src.url).hostname.replace(/^www\./, ''); } catch {}
                      return (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={src.url}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors no-underline ${
                            src.read
                              ? 'bg-blue-50 dark:bg-blue-900/30 midnight:bg-blue-900/40 border-blue-200 dark:border-blue-700 midnight:border-blue-700 text-blue-700 dark:text-blue-300 midnight:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                              : 'bg-gray-50 dark:bg-gray-800 midnight:bg-gray-800 border-gray-200 dark:border-gray-700 midnight:border-gray-700 text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          {/* Favicon */}
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=16`}
                            alt=""
                            className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                          <span className="max-w-[140px] truncate">{src.title || hostname}</span>
                          {/* Read badge */}
                          {src.read && (
                            <svg className="w-3 h-3 flex-shrink-0 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Search error */}
            {message.searchEvent.type === 'search_error' && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 midnight:text-amber-400">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Search failed: {message.searchEvent.error}
              </div>
            )}
          </div>
        )}

        {/* Thinking indicator — shown only when no content has arrived yet */}
        {message.isStreaming
          && message.searchEvent?.type !== 'search_start'
          && !isInsideThinkBlock(message.content || '')
          && !stripThinkForStreaming(parsedWebContent.cleanContent || '').trim()
          && (
          <ThinkingIndicator />
        )}

        {/* Tool calls - shown before the response text */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2">
            <ToolCallList toolCalls={message.toolCalls} />
          </div>
        )}

        {/* Model offline — quick-start button */}
        {message.isError && message.errorType === 'local_model_offline' && (
          <ModelStartButton />
        )}

        {/* Thinking block — collapsible reasoning panel */}
        {(() => {
          const raw = parsedWebContent.cleanContent || message.content || '';
          const inside = message.isStreaming && isInsideThinkBlock(raw);
          const { thinking: thinkContent } = parseThinkingContent(raw);
          if (!thinkContent && !inside) return null;
          return (
            <ThinkingBlock
              content={thinkContent}
              isStreaming={inside}
            />
          );
        })()}

        {/* Assistant message content - no border, blends with background */}
        <div className="py-2" style={{ position: 'relative', zIndex: 1 }}>
          <BlockBasedMessageRenderer
            content={(() => {
              const raw = parsedWebContent.cleanContent || '';
              if (message.isStreaming) return stripThinkForStreaming(raw);
              const { answer } = parseThinkingContent(raw);
              return answer || raw;
            })()}
            isStreaming={message.isStreaming}
            onRegenerate={onRegenerate && isLastAssistantMessage ? () => onRegenerate(messageIndex) : null}
            onEdit={onEdit}
            onQuestionClick={message.type === 'assistant' ? onQuestionClick : null}
            mode={mode}
            projectIds={projectIds}
            userContext={userContext}
            isLastMessage={isLastMessage && message.type === 'assistant'}
            suggestions={(() => {
              const finalSuggestions = isLastMessage ? (message.suggestions || persistentSuggestions || []) : [];
              return finalSuggestions;
            })()}
            blocks={message.blocks} // Pass chart blocks from AI
            artifacts={message.artifacts} // NEW: Pass artifacts from AI
            artifactExplanation={message.artifactExplanation} // NEW: Pass artifact explanation
            onSaveArtifactToNotes={onSaveArtifactToNotes} // NEW: Pass save handler
            onArtifactOpen={onArtifactOpen} // NEW: Side panel opener
            onTermClick={onTermClick} // NEW: Explain panel for annotated terms
          />
          
          {/* Project badges */}
          {message.projectIds && message.projectIds.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 midnight:border-slate-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 mb-2">Related to:</div>
              <ProjectBadges 
                projectIds={message.projectIds} 
                maxDisplay={4}
                showLabel={false}
              />
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

// Main MessageListV2 component - REMOVED DUPLICATE WARNING
const MessageListV2 = forwardRef(({
  messages,
  isLoading,
  isConversationLoading = false,
  onRegenerate,
  onEdit,
  messagesEndRef,
  onQuestionClick = null,
  mode = 'chat',
  projectIds = [],
  userContext = null,
  persistentSuggestions = [],
  onSaveArtifactToNotes = null, // NEW: Handler for saving artifacts
  onArtifactOpen = null, // NEW: Side panel opener
  onTermClick = null, // NEW: Opens explain panel for annotated terms
}, ref) => {

  return (
    <div 
      ref={ref}
      className="flex-1 overflow-y-auto h-full relative"
      style={{ maxHeight: '100%' }}
    >
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 min-h-full">
        
        {/* Conversation loading indicator */}
        {isConversationLoading ? (
          <ConversationLoadingIndicator />
        ) : (
          <>
            {/* Messages */}
            <div className="space-y-1">
              {messages.map((message, idx) => {
                // Find the last assistant message index
                const lastAssistantMessageIndex = messages
                  .map((msg, index) => msg.type === 'assistant' ? index : -1)
                  .filter(index => index !== -1)
                  .pop();
                
                const isLastAssistantMessage = message.type === 'assistant' && idx === lastAssistantMessageIndex;
                
                return (
                  <MessageComponent
                    key={message.id || idx}
                    message={message}
                    messageIndex={idx}
                    onRegenerate={onRegenerate}
                    onEdit={onEdit}
                    onQuestionClick={onQuestionClick}
                    mode={mode}
                    projectIds={projectIds}
                    userContext={userContext}
                    isLastMessage={idx === messages.length - 1}
                    persistentSuggestions={persistentSuggestions}
                            messages={messages}
                    isLastAssistantMessage={isLastAssistantMessage}
                    onSaveArtifactToNotes={onSaveArtifactToNotes}
                    onArtifactOpen={onArtifactOpen}
                    onTermClick={onTermClick}
                  />
                );
              })}
            </div>

            {/* ThinkingIndicator is now rendered inline at the top of each streaming message */}
          </>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
});

MessageListV2.displayName = 'MessageListV2';

export { MessageListV2 };