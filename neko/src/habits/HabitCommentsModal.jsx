import React, { useState, useEffect, useMemo } from 'react';
import { X, MessageSquare, Calendar, Plus, Trash2 } from 'lucide-react';
import Portal from '../components/Portal';
import { habitApi } from './habitApi';
import authService from '../services/authService';

const HabitCommentsModal = ({ habit, onClose, onRefresh }) => {
  const [newComment, setNewComment] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [deletingCommentKey, setDeletingCommentKey] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const commentsListRef = React.useRef(null);

  // Get current user ID on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await authService.getUser();
        if (user) {
          setCurrentUserId(user.id);
        }
      } catch (error) {
        console.error('Error fetching current user:', error);
      }
    };
    fetchCurrentUser();
  }, []);

  const MAX_COMMENT_LENGTH = 1000;

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Get all comments from recent completions (sorted by date, newest first)
  // Split multiple comments from the same day (separated by ---) into individual entries
  const allComments = useMemo(() => {
    if (!habit.recent_completions) return [];
    
    const comments = [];
    
    habit.recent_completions
      .filter(completion => completion.notes && completion.notes.trim())
      .forEach(completion => {
        // Split comments by the separator
        const individualComments = completion.notes.split('\n---\n');
        
        // Create an entry for each comment
        // Store both the display index (reversed) and the original index for deletion
        individualComments.forEach((comment, originalIndex) => {
          if (comment.trim()) {
            // Calculate the reversed index (most recent comment = 0)
            const displayIndex = individualComments.length - 1 - originalIndex;
            
            comments.push({
              date: completion.completed_date,
              comment: comment.trim(),
              value: completion.value,
              user: completion.user || null, // User details for team habit comments
              user_id: completion.user_id,
              formattedDate: new Date(completion.completed_date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              }),
              displayIndex, // For UI display (reversed)
              originalIndex // For backend deletion (original position)
            });
          }
        });
      });
    
    // Sort by date (newest first), then by display index (newest comment first within same day)
    return comments.sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.displayIndex - b.displayIndex; // Lower displayIndex = more recent
    });
  }, [habit.recent_completions]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!newComment.trim() || isAdding) return;
    
    if (newComment.length > MAX_COMMENT_LENGTH) {
      setError(`Comment is too long. Maximum ${MAX_COMMENT_LENGTH} characters allowed.`);
      return;
    }
    
    const commentText = newComment.trim();
    
    try {
      setIsAdding(true);
      setShowSuccess(false);
      setError(null);
      
      // Use the dedicated addHabitNote API (backend still uses 'note' parameter)
      const response = await habitApi.addHabitNote(habit.id, commentText);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to add comment');
      }
      
      // Clear the input immediately after successful API call
      setNewComment('');
      
      // Show success message
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      
      // Refresh the data to show the new comment
      if (onRefresh) {
        setIsRefreshing(true);
        try {
          await onRefresh();
          // Scroll to top of comments list to show newest comment
          if (commentsListRef.current) {
            commentsListRef.current.scrollTop = 0;
          }
        } catch (refreshError) {
          console.error('Error refreshing data:', refreshError);
          // Don't throw, comment was added successfully
        } finally {
          setIsRefreshing(false);
        }
      }
      
    } catch (error) {
      console.error('Failed to add comment:', error);
      // Show user-friendly error message
      const errorMessage = error.message || 'Failed to add comment. Please try again.';
      setError(errorMessage);
      // Don't clear the comment text so user can retry
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteComment = async (date, commentIndex, commentKey) => {
    if (deletingCommentKey || isRefreshing) return;
    
    try {
      setDeletingCommentKey(commentKey);
      setError(null);
      
      console.log('Deleting comment:', { habitId: habit.id, date, commentIndex, commentKey });
      
      // Call the delete API (backend still uses 'note' terminology)
      const response = await habitApi.deleteHabitNote(habit.id, date, commentIndex);
      
      console.log('Delete response:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete comment');
      }
      
      // Refresh the data to update the comments list
      if (onRefresh) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } catch (refreshError) {
          console.error('Error refreshing data:', refreshError);
          // Don't throw, comment was deleted successfully
        } finally {
          setIsRefreshing(false);
        }
      }
      
    } catch (error) {
      console.error('Failed to delete comment:', error);
      const errorMessage = error.message || 'Failed to delete comment. Please try again.';
      setError(errorMessage);
    } finally {
      setDeletingCommentKey(null);
    }
  };

  return (
    <Portal>
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isAdding && !isRefreshing) {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {/* Modal Content */}
        <div 
          className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 midnight:border-gray-800"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="habit-comments-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                style={{ 
                  backgroundColor: `${habit.color}15`,
                  border: `2px solid ${habit.color}40`
                }}
              >
                {habit.icon || '�'}
              </div>
              <div>
                <h2 
                  id="habit-comments-title"
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-white"
                >
                  Habit Comments
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                  {habit.name}
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg"
              disabled={isAdding || isRefreshing}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Add New Comment Section */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex-shrink-0">
            {/* Success Message */}
            {showSuccess && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 border border-green-200 dark:border-green-800 midnight:border-green-800/50 rounded-lg flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <span className="text-green-500 text-lg">✓</span>
                <p className="text-green-600 dark:text-green-400 midnight:text-green-400 text-sm font-medium">
                  Comment added successfully!
                </p>
              </div>
            )}
            
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-800/50 rounded-lg flex items-start justify-between space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-start space-x-2">
                  <span className="text-red-500 text-lg mt-0.5">⚠</span>
                  <p className="text-red-600 dark:text-red-400 midnight:text-red-400 text-sm">
                    {error}
                  </p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600 dark:hover:text-red-300 midnight:hover:text-red-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            
            <form onSubmit={handleAddComment} className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
                  Add New Comment
                </label>
                <span className={`text-xs ${
                  newComment.length > MAX_COMMENT_LENGTH 
                    ? 'text-red-500 dark:text-red-400 midnight:text-red-400 font-semibold' 
                    : 'text-gray-500 dark:text-gray-400 midnight:text-gray-400'
                }`}>
                  {newComment.length}/{MAX_COMMENT_LENGTH}
                </span>
              </div>
              <textarea
                value={newComment}
                onChange={(e) => {
                  setNewComment(e.target.value);
                  setError(null); // Clear error when typing
                }}
                onKeyDown={(e) => {
                  // Prevent event propagation for space key
                  if (e.key === ' ' || e.code === 'Space') {
                    e.stopPropagation();
                  }
                  // Submit on Ctrl+Enter or Cmd+Enter
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleAddComment(e);
                  }
                }}
                placeholder="Write a comment about this habit... (Ctrl+Enter to submit)"
                className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 dark:focus:ring-offset-0 midnight:focus:ring-offset-0 resize-none bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white placeholder-gray-400 dark:placeholder-gray-500 midnight:placeholder-gray-500 transition-colors ${
                  newComment.length > MAX_COMMENT_LENGTH
                    ? 'border-red-300 dark:border-red-600 midnight:border-red-700 focus:ring-red-500'
                    : 'border-gray-300 dark:border-gray-700/50 midnight:border-gray-800/50 focus:border-indigo-500 dark:focus:border-indigo-500 midnight:focus:border-indigo-500 focus:ring-indigo-500/50 dark:focus:ring-indigo-500/30 midnight:focus:ring-indigo-500/30'
                }`}
                rows="3"
                disabled={isAdding}
                autoFocus
                maxLength={MAX_COMMENT_LENGTH + 100} // Allow typing over limit to show warning
              />
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setNewComment('')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors"
                  disabled={isAdding || !newComment.trim()}
                >
                  Clear
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  style={{ backgroundColor: habit.color }}
                  disabled={isAdding || !newComment.trim() || newComment.length > MAX_COMMENT_LENGTH}
                >
                  {isAdding ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Add Comment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Comments List */}
          <div ref={commentsListRef} className="flex-1 overflow-y-auto p-6">
            {isRefreshing ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                  Loading comments...
                </p>
              </div>
            ) : allComments.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-16 h-16 text-gray-300 dark:text-gray-600 midnight:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                  No comments yet. Add your first comment above!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-100 midnight:text-gray-100 uppercase tracking-wider">
                    All Comments ({allComments.length})
                  </h3>
                </div>
                
                {allComments.map((item, index) => {
                  const isToday = item.date === new Date().toISOString().split('T')[0];
                  const commentKey = `${item.date}-${item.displayIndex}-${index}`;
                  const isDeleting = deletingCommentKey === commentKey;
                  
                  // Check if current user can delete this comment
                  // For private habits: only creator can delete
                  // For team habits: only the comment owner can delete
                  const canDelete = currentUserId && (
                    (habit.is_private && habit.created_by === currentUserId) ||
                    (!habit.is_private && item.user_id === currentUserId)
                  );
                  
                  return (
                    <div 
                      key={commentKey}
                      className="bg-gray-50 dark:bg-gray-700/40 midnight:bg-gray-800/40 rounded-lg p-4 border border-gray-200 dark:border-gray-600/40 midnight:border-gray-700/40 hover:border-gray-300 dark:hover:border-gray-600/60 midnight:hover:border-gray-700/60 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400 midnight:text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 midnight:text-gray-200">
                            {item.formattedDate}
                          </span>
                          {isToday && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ 
                              backgroundColor: `${habit.color}30`,
                              color: habit.color,
                              border: `1px solid ${habit.color}60`
                            }}>
                              Today
                            </span>
                          )}
                          {/* Show user name for team habits */}
                          {!habit.is_private && item.user && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 dark:bg-indigo-900/20 midnight:bg-indigo-900/10 text-indigo-700 dark:text-indigo-300 midnight:text-indigo-300 border border-indigo-200 dark:border-indigo-700 midnight:border-indigo-700">
                              👤 {item.user.name || item.user.email?.split('@')[0] || 'Team Member'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {habit.tracking_type !== 'boolean' && item.value > 0 && (
                            <span className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-semibold">
                              {item.value} {habit.unit}
                            </span>
                          )}
                          {/* Delete button - only show if user has permission */}
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteComment(item.date, item.originalIndex, commentKey)}
                              disabled={isDeleting || isRefreshing}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 midnight:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete comment"
                            >
                              {isDeleting ? (
                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 midnight:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {item.comment}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default HabitCommentsModal;
