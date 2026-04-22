// PublicChatViewer.jsx - Component for viewing public conversations - FIXED
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { MessageListV2 } from './MessageListV2';
import { chatApi } from '../commandCenterApi';
import { AlertCircle, Globe, Clock, Share2, Copy, CheckCircle, XCircle, MessageCircle, Hammer, Image as ImageIcon } from 'lucide-react';

const PublicChatViewer = () => {
  const { token } = useParams();
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copyStatus, setCopyStatus] = useState(null);
  const messagesEndRef = useRef(null);

  // Load public conversation
  useEffect(() => {
    const loadPublicConversation = async () => {
      if (!token) {
        setError('Invalid public link');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        const result = await chatApi.getPublicConversation(token);
        
        if (result.success) {
          setConversation(result.conversation);
          setError(null);
        } else {
          console.error('Failed to load public conversation:', result.error);
          setError(result.error || 'Failed to load conversation');
        }
      } catch (err) {
        console.error('Failed to load public conversation:', err);
        setError('This conversation link has expired or is no longer available');
      } finally {
        setLoading(false);
      }
    };

    loadPublicConversation();
  }, [token]);

  // Auto-scroll to bottom when conversation loads
  useEffect(() => {
    if (conversation && conversation.messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [conversation]);

  // Copy current URL to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyStatus('success');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      setCopyStatus('error');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Unknown date';
    }
  };

  // Get mode icon
  const getModeIcon = (mode) => {
    switch (mode) {
      case 'build':
        return <Hammer className="w-4 h-4" />;
      case 'image':
        return <ImageIcon className="w-4 h-4" />;
      default:
        return <MessageCircle className="w-4 h-4" />;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Loading conversation...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Conversation Not Available
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
            {error}
          </p>
          
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.href = '/'}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg font-medium text-sm transition-colors"
            >
              Go to Asyncat Workspace
            </button>
            
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium text-sm transition-colors border border-gray-200 dark:border-gray-600"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main conversation view
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 midnight:bg-slate-900 border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left side - conversation info */}
            <div className="flex items-center gap-3">
              <img src="/cat.svg" alt="Asyncat Workspace" className="w-6 h-6 opacity-80" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
                  {conversation.title}
                </h1>
              </div>
            </div>

            {/* Right side - actions */}
            <div className="flex items-center gap-3">
              {/* Share button */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm"
                title="Copy link to this conversation"
              >
                {copyStatus === 'success' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Copied</span>
                  </>
                ) : copyStatus === 'error' ? (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span>Error</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Share</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conversation metadata */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{formatDate(conversation.createdAt)}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            <span>{conversation.messages.length} {conversation.messages.length === 1 ? 'message' : 'messages'}</span>
          </div>
          
          {conversation.mode && conversation.mode !== 'chat' && (
            <div className="flex items-center gap-2">
              {getModeIcon(conversation.mode)}
              <span className="capitalize">{conversation.mode} mode</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white dark:bg-gray-900 midnight:bg-slate-900">
          {conversation.messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                This conversation has no messages yet.
              </p>
            </div>
          ) : (
            <MessageListV2
              messages={conversation.messages}
              isLoading={false}
              isConversationLoading={false}
              onRegenerate={() => {}} // Disabled for public view
              messagesEndRef={messagesEndRef}
              onReset={() => {}} // Disabled for public view
              imageMode={conversation.mode === 'image'}
              onQuestionClick={() => {}} // Disabled for public view
              mode={conversation.mode || 'chat'}
              projectIds={[]}
              userContext={null}
              persistentSuggestions={[]}
              isPublicView={true} // Add this prop to disable interactive features
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 midnight:border-slate-700 bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="mb-6">
              <img src="/cat.svg" alt="Asyncat Workspace" className="w-6 h-6 mx-auto mb-3 opacity-70" />
              <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-slate-400 mb-4">
                Create your own AI conversations with Asyncat Workspace
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-700 midnight:bg-slate-700 hover:bg-gray-800 dark:hover:bg-gray-600 midnight:hover:bg-slate-600 text-white rounded-lg font-medium text-sm transition-colors"
              >
                Try Asyncat Workspace
              </a>
              
              <a
                href="/signup"
                className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 midnight:bg-slate-800 hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 text-gray-700 dark:text-gray-200 midnight:text-slate-200 rounded-lg font-medium text-sm transition-colors border border-gray-200 dark:border-gray-600 midnight:border-slate-600"
              >
                Sign up
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Invisible div for auto-scroll reference */}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default PublicChatViewer;