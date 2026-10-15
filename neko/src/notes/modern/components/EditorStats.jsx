// Word, character and block counts for a note, in a small corner panel.

import { useMemo } from 'react';
import { FileText, Clock } from 'lucide-react';

// Statistics Component
const EditorStats = ({ blocks, isVisible }) => {
  const stats = useMemo(() => {
    const totalBlocks = blocks.length;
    
    // Count words across all blocks
    const words = blocks.reduce((count, block) => {
      if (!block.content) return count;
      // Strip HTML tags and count words
      const plainText = block.content.replace(/<[^>]*>/g, '');
      const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
      return count + wordCount;
    }, 0);
    
    // Count characters (without HTML tags)
    const characters = blocks.reduce((count, block) => {
      if (!block.content) return count;
      const plainText = block.content.replace(/<[^>]*>/g, '');
      return count + plainText.length;
    }, 0);
    
    // Estimate reading time (average 200 words per minute)
    const readingTime = Math.max(1, Math.ceil(words / 200));
    
    return {
      blocks: totalBlocks,
      words,
      characters,
      readingTime
    };
  }, [blocks]);

  if (!isVisible) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 rounded-xl border border-line bg-elevated px-3 py-2 text-[12px] tabular-nums text-fg-muted shadow-lg shadow-black/10 dark:shadow-black/40">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <FileText className="h-3 w-3 text-fg-subtle" />
          <span>{stats.blocks} blocks</span>
        </div>
        <div>{stats.words} words</div>
        <div>{stats.characters} characters</div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-fg-subtle" />
          <span>{stats.readingTime}m read</span>
        </div>
      </div>
    </div>
  );
};

export default EditorStats;
