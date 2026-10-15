// A toggle block: a title that opens and closes the text under it.

import { useState } from 'react';
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
    <div className="toggle-block rounded-xl border border-line">
      {/* Toggle header */}
      <div 
        className={`flex cursor-pointer items-center gap-2 p-3 transition-colors hover:bg-hover ${isOpen ? 'rounded-t-xl' : 'rounded-xl'}`}
        onClick={toggleOpen}
      >
        <div className="text-fg-subtle">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="flex-1 border-none bg-transparent font-medium text-fg outline-none placeholder:text-fg-subtle"
          placeholder="Toggle title"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Toggle content */}
      {isOpen && (
        <div className="border-t border-line p-3">
          <div
            ref={contentRef}
            contentEditable
            className="text-fg outline-none"
            style={{ minHeight: '1.5em', overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'none' }}
            placeholder="Type what it hides…"
            {...commonProps}
          />
        </div>
      )}
    </div>
  );
};

export default ToggleBlock;
