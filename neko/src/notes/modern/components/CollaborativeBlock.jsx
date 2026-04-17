// CollaborativeBlock.jsx - Enhanced with editing locks and conflict prevention
import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import Block from './Block';
import { BlockCollaborationIndicators } from './CollaborativeCursors';
import { Lock, Eye, Edit3 } from 'lucide-react';

const CollaborativeBlock = forwardRef((
  {
    block,
    collaborationTracking,
    collaborators = [],
    blockLocks = {},
    onStartEditingBlock,
    onStopEditingBlock,
    isBlockLocked,
    getBlockLockInfo,
    onChange,
    onKeyDown,
    onFocus,
    onAction,
    onCopy,
    onTypeChange,
    isActive,
    allBlocks,
    ...otherProps
  },
  ref
) => {
  const blockRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const editingTimeoutRef = useRef(null);
  const lastCursorPosition = useRef(0);
  const [isCurrentlyEditing, setIsCurrentlyEditing] = useState(false);
  const [editAttemptBlocked, setEditAttemptBlocked] = useState(false);

  useImperativeHandle(ref, () => blockRef.current);

  // Check if this block is locked by someone else
  const lockInfo = getBlockLockInfo ? getBlockLockInfo(block.id) : null;
  const isLocked = isBlockLocked ? isBlockLocked(block.id) : false;
  const canEdit = !isLocked;

  // Track cursor position changes
  const trackCursorPosition = useCallback(() => {
    if (!collaborationTracking?.trackCursor || !isActive || !canEdit) return;

    try {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const blockElement = blockRef.current?.element;
      
      if (blockElement && blockElement.contains(range.startContainer)) {
        const cursorPosition = range.startOffset;
        
        if (cursorPosition !== lastCursorPosition.current) {
          collaborationTracking.trackCursor(block.id, cursorPosition);
          lastCursorPosition.current = cursorPosition;
        }
      }
    } catch (err) {
      console.warn('Failed to track cursor position:', err);
    }
  }, [block.id, collaborationTracking, isActive, canEdit]);

  // Track text selection
  const trackSelection = useCallback(() => {
    if (!collaborationTracking?.trackSelection || !isActive || !canEdit) return;

    try {
      const selection = window.getSelection();
      if (selection.rangeCount === 0 || selection.isCollapsed) return;

      const range = selection.getRangeAt(0);
      const blockElement = blockRef.current?.element;
      
      if (blockElement && blockElement.contains(range.startContainer)) {
        const startOffset = range.startOffset;
        const endOffset = range.endOffset;
        
        if (startOffset !== endOffset) {
          collaborationTracking.trackSelection(block.id, startOffset, endOffset);
        }
      }
    } catch (err) {
      console.warn('Failed to track selection:', err);
    }
  }, [block.id, collaborationTracking, isActive, canEdit]);

  // Start editing with lock acquisition
  const startEditing = useCallback(async () => {
    if (isLocked || isCurrentlyEditing) return false;

    try {
      const success = await onStartEditingBlock?.(block.id);
      if (success) {
        setIsCurrentlyEditing(true);
        setEditAttemptBlocked(false);
        
        // Track typing when starting to edit
        if (collaborationTracking?.trackTyping) {
          collaborationTracking.trackTyping(block.id, true);
        }
        
        return true;
      } else {
        setEditAttemptBlocked(true);
        setTimeout(() => setEditAttemptBlocked(false), 2000);
        return false;
      }
    } catch (error) {
      console.error('Failed to acquire editing lock:', error);
      return false;
    }
  }, [block.id, isLocked, isCurrentlyEditing, onStartEditingBlock, collaborationTracking]);

  // Stop editing and release lock
  const stopEditing = useCallback(async () => {
    if (!isCurrentlyEditing) return;

    try {
      await onStopEditingBlock?.(block.id);
      setIsCurrentlyEditing(false);
      
      // Clear typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Stop tracking typing
      if (collaborationTracking?.trackTyping) {
        collaborationTracking.trackTyping(block.id, false);
      }
    } catch (error) {
      console.error('Failed to release editing lock:', error);
    }
  }, [block.id, isCurrentlyEditing, onStopEditingBlock, collaborationTracking]);

  // Track typing status with editing lock
  const trackTypingStatus = useCallback((isTyping) => {
    if (!collaborationTracking?.trackTyping || !canEdit) return;

    if (isTyping && !isCurrentlyEditing) {
      // Try to acquire editing lock when user starts typing
      startEditing();
    }

    if (isCurrentlyEditing) {
      collaborationTracking.trackTyping(block.id, isTyping);

      if (isTyping) {
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        // Set timeout to stop editing after inactivity
        typingTimeoutRef.current = setTimeout(() => {
          stopEditing();
        }, 2000); // Stop editing after 2 seconds of inactivity
      }
    }
  }, [block.id, collaborationTracking, canEdit, isCurrentlyEditing, startEditing, stopEditing]);

  // Enhanced onChange that handles editing locks and passes typing info
  const handleChange = useCallback(async (blockId, updates, isTyping = false) => {
    // Prevent changes if block is locked by someone else
    if (isLocked) {
      console.log(`Block ${blockId} is locked by ${lockInfo?.userName}, change blocked`);
      setEditAttemptBlocked(true);
      setTimeout(() => setEditAttemptBlocked(false), 2000);
      return;
    }

    // Try to acquire lock if not already editing
    if (!isCurrentlyEditing && updates.content !== undefined) {
      const acquired = await startEditing();
      if (!acquired) {
        console.log(`Could not acquire lock for block ${blockId}`);
        return;
      }
    }

    // Track typing when content changes
    if (updates.content !== undefined && collaborationTracking?.trackTyping) {
      trackTypingStatus(isTyping);
    }

    // Call original onChange with typing information
    if (onChange) {
      onChange(blockId, updates, isTyping);
    }
  }, [onChange, isLocked, lockInfo, isCurrentlyEditing, startEditing, trackTypingStatus, collaborationTracking]);

  // Enhanced onFocus with editing lock acquisition
  const handleFocus = useCallback(async (blockId) => {
    // Try to acquire editing lock on focus
    if (!isLocked && !isCurrentlyEditing) {
      await startEditing();
    }

    // Track active block for collaboration
    if (collaborationTracking?.trackActiveBlock) {
      collaborationTracking.trackActiveBlock(blockId);
    }

    // Call original onFocus
    if (onFocus) {
      onFocus(blockId);
    }
  }, [onFocus, isLocked, isCurrentlyEditing, startEditing, collaborationTracking]);

  // Enhanced onBlur to potentially release lock
  const handleBlur = useCallback(async () => {
    // Set a timeout to release the lock after blur (with delay for quick re-focus)
    if (editingTimeoutRef.current) {
      clearTimeout(editingTimeoutRef.current);
    }

    editingTimeoutRef.current = setTimeout(() => {
      stopEditing();
    }, 1000); // 1 second delay
  }, [stopEditing]);

  // Cancel blur timeout on focus
  const cancelBlurTimeout = useCallback(() => {
    if (editingTimeoutRef.current) {
      clearTimeout(editingTimeoutRef.current);
    }
  }, []);

  // Enhanced onKeyDown with lock validation
  const handleKeyDown = useCallback(async (e, blockId, options) => {
    // Block certain operations if locked
    if (isLocked && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter')) {
      e.preventDefault();
      setEditAttemptBlocked(true);
      setTimeout(() => setEditAttemptBlocked(false), 2000);
      return;
    }

    // Try to acquire lock for text input
    if (!isCurrentlyEditing && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter')) {
      const acquired = await startEditing();
      if (!acquired) {
        e.preventDefault();
        return;
      }
    }

    // Track cursor position after navigation keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      setTimeout(() => trackCursorPosition(), 0);
    }

    // Track typing for text input
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
      trackTypingStatus(true);
    }

    // Call original onKeyDown
    if (onKeyDown) {
      onKeyDown(e, blockId, options);
    }
  }, [onKeyDown, isLocked, isCurrentlyEditing, startEditing, trackCursorPosition, trackTypingStatus]);

  // Add event listeners for selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      if (isActive && canEdit) {
        trackCursorPosition();
        trackSelection();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [isActive, canEdit, trackCursorPosition, trackSelection]);

  // Cleanup timeouts and locks
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (editingTimeoutRef.current) {
        clearTimeout(editingTimeoutRef.current);
      }
      if (isCurrentlyEditing) {
        stopEditing();
      }
    };
  }, [isCurrentlyEditing, stopEditing]);

  // Auto-hide edit attempt blocked message
  useEffect(() => {
    if (editAttemptBlocked) {
      const timer = setTimeout(() => setEditAttemptBlocked(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [editAttemptBlocked]);

  return (
    <div className="relative">
      {/* Block presence indicators */}
      <BlockCollaborationIndicators
        blockId={block.id}
        collaborators={collaborators}
        blockRef={blockRef}
      />
      
      {/* Lock indicator */}
      {isLocked && lockInfo && (
        <div 
          className="absolute -left-8 top-2 z-10 flex items-center"
          title={`${lockInfo.userName} is editing this block`}
        >
          <div 
            className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm border-2 border-white"
            style={{ backgroundColor: lockInfo.color }}
          >
            <Lock className="w-3 h-3 text-white" />
          </div>
        </div>
      )}

      
      {/* Edit attempt blocked notification */}
      {editAttemptBlocked && (
        <div className="absolute -top-10 left-0 right-0 z-20 bg-red-100 dark:bg-red-900 midnight:bg-red-950 border border-red-200 dark:border-red-800 midnight:border-red-900 rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300 midnight:text-red-400 text-sm">
            <Lock className="w-4 h-4" />
            <span>
              {lockInfo 
                ? `${lockInfo.userName} is currently editing this block`
                : 'This block is currently being edited'
              }
            </span>
          </div>
        </div>
      )}
      
      {/* Main block component with conditional styling */}
      <div className={`transition-opacity duration-200 ${isLocked ? 'opacity-60' : ''}`}>
        <Block
          ref={blockRef}
          block={block}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onMouseDown={cancelBlurTimeout} // Cancel blur timeout when clicking
          onAction={onAction}
          onCopy={onCopy}
          onTypeChange={onTypeChange}
          isActive={isActive && canEdit}
          allBlocks={allBlocks}
          readOnly={isLocked} // Pass read-only state to Block component
          {...otherProps}
        />
      </div>

      {/* Overlay to prevent interaction when locked */}
      {isLocked && (
        <div 
          className="absolute inset-0 cursor-not-allowed bg-gray-100/20 dark:bg-gray-800/20 midnight:bg-gray-900/20"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditAttemptBlocked(true);
            setTimeout(() => setEditAttemptBlocked(false), 2000);
          }}
          title={lockInfo ? `${lockInfo.userName} is editing this block` : 'Block is locked'}
        />
      )}
    </div>
  );
});

export default CollaborativeBlock;
