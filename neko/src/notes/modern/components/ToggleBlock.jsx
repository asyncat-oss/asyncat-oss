import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const ToggleBlock = ({ block, onChange, contentRef, commonProps }) => {
  const [isOpen, setIsOpen] = useState(block.properties?.isOpen || false);
  const title = block.properties?.title || 'Toggle';

  const handleTitleChange = (newTitle) => {
    onChange(block.id, {
      properties: {
        ...block.properties,
        title: newTitle
      }
    });
  };

  const toggleOpen = () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    onChange(block.id, {
      properties: {
        ...block.properties,
        isOpen: newIsOpen
      }
    });
  };

  return (
    <div className="toggle-block border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg">
      {/* Toggle header */}
      <div 
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-900/50 transition-colors rounded-t-lg"
        onClick={toggleOpen}
      >
        <div className="text-gray-500 dark:text-gray-400 midnight:text-gray-500">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="flex-1 font-medium bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 midnight:text-gray-100"
          placeholder="Toggle title"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Toggle content */}
      {isOpen && (
        <div className="border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3">
          <div
            ref={contentRef}
            contentEditable
            className="outline-none text-gray-900 dark:text-gray-100 midnight:text-gray-100"
            style={{ minHeight: '1.5em', overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'none' }}
            placeholder="Type your toggle content..."
            {...commonProps}
          />
        </div>
      )}
    </div>
  );
};

export default ToggleBlock;
