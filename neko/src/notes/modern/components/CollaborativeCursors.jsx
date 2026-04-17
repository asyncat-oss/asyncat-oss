// CollaborativeCursors.jsx - Visual cursor indicators for collaborative editing
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Import stock profile pictures
import catDP from "../../../assets/dp/CAT.webp";
import dogDP from "../../../assets/dp/DOG.webp";
import dolphinDP from "../../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../../assets/dp/DRAGON.webp";
import elephantDP from "../../../assets/dp/ELEPHANT.webp";
import foxDP from "../../../assets/dp/FOX.webp";
import lionDP from "../../../assets/dp/LION.webp";
import owlDP from "../../../assets/dp/OWL.webp";
import penguinDP from "../../../assets/dp/PENGUIN.webp";
import wolfDP from "../../../assets/dp/WOLF.webp";

const profilePictureMap = {
  CAT: catDP,
  DOG: dogDP,
  DOLPHIN: dolphinDP,
  DRAGON: dragonDP,
  ELEPHANT: elephantDP,
  FOX: foxDP,
  LION: lionDP,
  OWL: owlDP,
  PENGUIN: penguinDP,
  WOLF: wolfDP,
};

// Helper function to get profile picture URL
const getProfilePicture = (profilePicId) => {
  if (!profilePicId) return null;
  if (profilePicId.startsWith("https://")) {
    return profilePicId;
  }
  if (profilePictureMap[profilePicId]) {
    return profilePictureMap[profilePicId];
  }
  return null;
};

// Individual cursor component
const CollaborativeCursor = ({ collaborator, blockElement }) => {
  const [position, setPosition] = useState({ x: 0, y: 0, visible: false });
  const cursorRef = useRef(null);

  // Calculate cursor position based on block and cursor data
  const updateCursorPosition = useCallback(() => {
    if (!collaborator.cursor || !blockElement || !collaborator.cursor.blockId) {
      setPosition(prev => ({ ...prev, visible: false }));
      return;
    }

    try {
      const blockRect = blockElement.getBoundingClientRect();
      const textContent = blockElement.textContent || '';
      const cursorPos = Math.min(collaborator.cursor.position || 0, textContent.length);

      // Create a range to find cursor position
      const range = document.createRange();
      const textNodes = [];
      
      // Collect all text nodes in the block
      const walker = document.createTreeWalker(
        blockElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let textNode;
      while (textNode = walker.nextNode()) {
        textNodes.push(textNode);
      }

      let currentOffset = 0;
      let targetNode = null;
      let targetOffset = 0;

      // Find the text node containing the cursor position
      for (const node of textNodes) {
        const nodeLength = node.textContent.length;
        if (currentOffset + nodeLength >= cursorPos) {
          targetNode = node;
          targetOffset = cursorPos - currentOffset;
          break;
        }
        currentOffset += nodeLength;
      }

      if (targetNode) {
        range.setStart(targetNode, targetOffset);
        range.collapse(true);
        
        const rangeRect = range.getBoundingClientRect();
        
        // Position relative to the viewport
        setPosition({
          x: rangeRect.left,
          y: rangeRect.top,
          visible: true
        });
      } else {
        // Fallback to block position
        setPosition({
          x: blockRect.left + 4,
          y: blockRect.top + 4,
          visible: true
        });
      }
    } catch (err) {
      console.warn('Failed to calculate cursor position:', err);
      setPosition(prev => ({ ...prev, visible: false }));
    }
  }, [collaborator.cursor, blockElement]);

  // Update position when cursor data changes
  useEffect(() => {
    updateCursorPosition();
  }, [updateCursorPosition]);

  // Update position on window resize/scroll
  useEffect(() => {
    const updateOnScroll = () => updateCursorPosition();
    
    window.addEventListener('scroll', updateOnScroll, true);
    window.addEventListener('resize', updateOnScroll);
    
    return () => {
      window.removeEventListener('scroll', updateOnScroll, true);
      window.removeEventListener('resize', updateOnScroll);
    };
  }, [updateCursorPosition]);

  if (!position.visible) return null;

  const profilePicUrl = getProfilePicture(collaborator.profilePicture);

  return (
    <div
      ref={cursorRef}
      className="fixed pointer-events-none z-50 transition-all duration-150 ease-out"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translateX(-1px)'
      }}
    >
      {/* Cursor line */}
      <div
        className="w-0.5 h-5 opacity-80"
        style={{ backgroundColor: collaborator.color }}
      />

      {/* User label with profile picture */}
      <div
        className="absolute top-0 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap transform -translate-y-full mb-1 opacity-90 shadow-md"
        style={{
          backgroundColor: collaborator.color,
          color: 'white',
          fontSize: '10px'
        }}
      >
        {profilePicUrl && (
          <img
            src={profilePicUrl}
            alt={collaborator.name}
            className="w-3 h-3 rounded-full object-cover"
          />
        )}
        <span>{collaborator.name}</span>
      </div>
    </div>
  );
};

// Selection highlight component
const CollaborativeSelection = ({ collaborator, blockElement }) => {
  const [highlights, setHighlights] = useState([]);

  const updateSelectionHighlight = useCallback(() => {
    if (!collaborator.selection || !blockElement || !collaborator.selection.blockId) {
      setHighlights([]);
      return;
    }

    try {
      const { startOffset, endOffset } = collaborator.selection;
      const textContent = blockElement.textContent || '';
      
      if (startOffset >= endOffset || startOffset >= textContent.length) {
        setHighlights([]);
        return;
      }

      // Create range for selection
      const range = document.createRange();
      const textNodes = [];
      
      const walker = document.createTreeWalker(
        blockElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let textNode;
      while (textNode = walker.nextNode()) {
        textNodes.push(textNode);
      }

      let currentOffset = 0;
      let startNode = null, endNode = null;
      let startPos = 0, endPos = 0;

      // Find start and end nodes
      for (const node of textNodes) {
        const nodeLength = node.textContent.length;
        
        if (!startNode && currentOffset + nodeLength > startOffset) {
          startNode = node;
          startPos = startOffset - currentOffset;
        }
        
        if (!endNode && currentOffset + nodeLength >= endOffset) {
          endNode = node;
          endPos = endOffset - currentOffset;
          break;
        }
        
        currentOffset += nodeLength;
      }

      if (startNode && endNode) {
        range.setStart(startNode, startPos);
        range.setEnd(endNode, endPos);
        
        const rects = Array.from(range.getClientRects());
        const highlightElements = rects.map((rect, index) => ({
          id: index,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }));
        
        setHighlights(highlightElements);
      } else {
        setHighlights([]);
      }
    } catch (err) {
      console.warn('Failed to create selection highlight:', err);
      setHighlights([]);
    }
  }, [collaborator.selection, blockElement]);

  useEffect(() => {
    updateSelectionHighlight();
  }, [updateSelectionHighlight]);

  // Update on scroll/resize
  useEffect(() => {
    const updateOnScroll = () => updateSelectionHighlight();
    
    window.addEventListener('scroll', updateOnScroll, true);
    window.addEventListener('resize', updateOnScroll);
    
    return () => {
      window.removeEventListener('scroll', updateOnScroll, true);
      window.removeEventListener('resize', updateOnScroll);
    };
  }, [updateSelectionHighlight]);

  return (
    <>
      {highlights.map(highlight => (
        <div
          key={highlight.id}
          className="fixed pointer-events-none z-40 opacity-20"
          style={{
            left: `${highlight.x}px`,
            top: `${highlight.y}px`,
            width: `${highlight.width}px`,
            height: `${highlight.height}px`,
            backgroundColor: collaborator.color
          }}
        />
      ))}
    </>
  );
};

// Block presence indicator
const BlockPresenceIndicator = ({ collaborator, isActive }) => {
  if (!isActive) return null;

  return (
    <div 
      className="absolute left-0 top-0 bottom-0 w-1 opacity-60 transition-opacity duration-200"
      style={{ backgroundColor: collaborator.color }}
      title={`${collaborator.name} is viewing this block`}
    >
      {collaborator.isTyping && (
        <div 
          className="absolute left-1 top-1/2 transform -translate-y-1/2 w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: collaborator.color }}
        />
      )}
    </div>
  );
};

// Main collaborative cursors component
const CollaborativeCursors = ({ collaborators = [], blockRefs }) => {
  const displayCollaborators = useMemo(
    () => collaborators.filter((collaborator) => !collaborator.isCurrentUser),
    [collaborators]
  );
  const [visibleCursors, setVisibleCursors] = useState([]);

  // Filter collaborators with valid cursor/selection data
  useEffect(() => {
    const cursorsToShow = displayCollaborators.filter(collaborator => {
      return (collaborator.cursor && collaborator.cursor.blockId) ||
             (collaborator.selection && collaborator.selection.blockId) ||
             (collaborator.activeBlock);
    });
    
    setVisibleCursors(cursorsToShow);
  }, [displayCollaborators]);

  if (displayCollaborators.length === 0) {
    return null;
  }

  return (
    <>
      {visibleCursors.map(collaborator => {
        // Find the block element for this collaborator
        let blockElement = null;
        
        if (collaborator.cursor?.blockId) {
          const blockRef = blockRefs?.current?.[collaborator.cursor.blockId];
          blockElement = blockRef?.element;
        } else if (collaborator.selection?.blockId) {
          const blockRef = blockRefs?.current?.[collaborator.selection.blockId];
          blockElement = blockRef?.element;
        } else if (collaborator.activeBlock) {
          const blockRef = blockRefs?.current?.[collaborator.activeBlock];
          blockElement = blockRef?.element;
        }

        if (!blockElement) return null;

        return (
          <React.Fragment key={collaborator.userId}>
            {/* Show cursor */}
            {collaborator.cursor && (
              <CollaborativeCursor
                collaborator={collaborator}
                blockElement={blockElement}
              />
            )}
            
            {/* Show selection highlight */}
            {collaborator.selection && (
              <CollaborativeSelection
                collaborator={collaborator}
                blockElement={blockElement}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

// Block-level presence indicators (shown in block margins)
export const BlockCollaborationIndicators = ({ blockId, collaborators, blockRef }) => {
  const otherCollaborators = (collaborators || []).filter((c) => !c.isCurrentUser);
  const activeCollaborators = otherCollaborators.filter(c => 
    c.activeBlock === blockId || 
    c.cursor?.blockId === blockId || 
    c.selection?.blockId === blockId
  );

  if (activeCollaborators.length === 0) return null;

  return (
    <div className="absolute -left-4 top-0 bottom-0 flex flex-col justify-start pt-2 space-y-1">
      {activeCollaborators.map(collaborator => (
        <BlockPresenceIndicator
          key={collaborator.userId}
          collaborator={collaborator}
          isActive={true}
        />
      ))}
    </div>
  );
};

export default CollaborativeCursors;
