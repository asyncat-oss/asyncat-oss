import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import {
  Hash, Type, List, ListOrdered, CheckSquare, Quote, Table, Minus, Image, Video, File,
  AlertTriangle, ChevronRight, Link, Calculator, FileText, TrendingUp, BarChart3,
  PieChart, Activity, StampIcon, CircleDot, Navigation, MousePointer, BarChart,
  Clock, Star, Music
} from 'lucide-react';

const BlockType = {
  TEXT: 'text',
  HEADING1: 'heading1',
  HEADING2: 'heading2',
  HEADING3: 'heading3',
  NUMBERED_LIST: 'numberedList',
  BULLET_LIST: 'bulletList',
  TODO: 'todo',
  QUOTE: 'quote',
  TABLE: 'table',
  CODE: 'code',
  DIVIDER: 'divider',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
  CALLOUT: 'callout',
  TOGGLE: 'toggle',
  EMBED: 'embed',
  MATH: 'math',
  LINK_PREVIEW: 'linkPreview',
  // Chart blocks
  LINE_CHART: 'lineChart',
  BAR_CHART: 'barChart',
  PIE_CHART: 'pieChart',
  AREA_CHART: 'areaChart',
  SCATTER_CHART: 'scatterChart',
  DONUT_CHART: 'donutChart',
  // Advanced blocks
  PROGRESS_BAR: 'progressBar',
  BREADCRUMB: 'breadcrumb',
  BUTTON: 'button'
};

const slashCommands = [
  // Basic text blocks
  { icon: Type, label: 'Text', description: 'Just start writing with plain text', type: BlockType.TEXT, category: 'basic' },
  { icon: Hash, label: 'Heading 1', description: 'Large section heading', type: BlockType.HEADING1, category: 'basic' },
  { icon: Hash, label: 'Heading 2', description: 'Medium section heading', type: BlockType.HEADING2, category: 'basic' },
  { icon: Hash, label: 'Heading 3', description: 'Small section heading', type: BlockType.HEADING3, category: 'basic' },
  
  // Lists and tasks
  { icon: ListOrdered, label: 'Numbered List', description: 'Create a numbered list', type: BlockType.NUMBERED_LIST, category: 'basic' },
  { icon: List, label: 'Bullet List', description: 'Create a bulleted list', type: BlockType.BULLET_LIST, category: 'basic' },
  { icon: CheckSquare, label: 'Todo', description: 'Track tasks with checkboxes', type: BlockType.TODO, category: 'basic' },
  
  // Content blocks
  { icon: Quote, label: 'Quote', description: 'Capture a quote', type: BlockType.QUOTE, category: 'basic' },
  { icon: Table, label: 'Table', description: 'Create a table with rows and columns', type: BlockType.TABLE, category: 'basic' },
  
  // Charts
  { icon: TrendingUp, label: 'Line Chart', description: 'Display data as a line chart', type: BlockType.LINE_CHART, category: 'charts' },
  { icon: BarChart3, label: 'Bar Chart', description: 'Display data as a bar chart', type: BlockType.BAR_CHART, category: 'charts' },
  { icon: PieChart, label: 'Pie Chart', description: 'Display data as a pie chart', type: BlockType.PIE_CHART, category: 'charts' },
  { icon: Activity, label: 'Area Chart', description: 'Display data as an area chart', type: BlockType.AREA_CHART, category: 'charts' },
  { icon: StampIcon, label: 'Scatter Chart', description: 'Display data as a scatter plot', type: BlockType.SCATTER_CHART, category: 'charts' },
  { icon: CircleDot, label: 'Donut Chart', description: 'Display data as a donut chart', type: BlockType.DONUT_CHART, category: 'charts' },
  
  // Layout blocks
  { icon: Minus, label: 'Divider', description: 'Add a visual divider line', type: BlockType.DIVIDER, category: 'layout' },
  { icon: AlertTriangle, label: 'Callout', description: 'Create an info, warning, or note callout', type: BlockType.CALLOUT, category: 'layout' },
  // { icon: ChevronRight, label: 'Toggle', description: 'Create a collapsible section', type: BlockType.TOGGLE, category: 'layout' },
  
  // Advanced blocks
  // { icon: Code, label: 'Code', description: 'Add a code block with syntax highlighting', type: BlockType.CODE, category: 'advanced' },
  // { icon: Calculator, label: 'Math', description: 'Add mathematical equations', type: BlockType.MATH, category: 'advanced' },
  // { icon: BarChart, label: 'Progress Bar', description: 'Show progress with a bar', type: BlockType.PROGRESS_BAR, category: 'advanced' },
  // { icon: Navigation, label: 'Breadcrumb', description: 'Navigation breadcrumb trail', type: BlockType.BREADCRUMB, category: 'advanced' },
  // { icon: MousePointer, label: 'Button', description: 'Interactive button element', type: BlockType.BUTTON, category: 'advanced' },
  
  // Media blocks
  { icon: Image, label: 'Image', description: 'Upload or embed an image', type: BlockType.IMAGE, category: 'media' },
  { icon: Video, label: 'Video', description: 'Upload or embed a video', type: BlockType.VIDEO, category: 'media' },
  { icon: Music, label: 'Audio', description: 'Upload an audio file', type: BlockType.AUDIO, category: 'media' },
  // { icon: File, label: 'File', description: 'Upload and attach files to your note', type: BlockType.FILE, category: 'media' },
  // { icon: Link, label: 'Embed', description: 'Embed external content', type: BlockType.EMBED, category: 'media' },
  { icon: FileText, label: 'Link Preview', description: 'Add a rich link preview', type: BlockType.LINK_PREVIEW, category: 'media' },
];

const MENU_WIDTH = 360;
const MENU_HEIGHT = 400;
const MENU_MARGIN = 8;
const VIEWPORT_PADDING = 20;

// Helper function for keyboard shortcuts hints
const getShortcutHint = (type) => {
  switch (type) {
    case BlockType.HEADING1:
      return '#';
    case BlockType.HEADING2:
      return '##';
    case BlockType.HEADING3:
      return '###';
    case BlockType.BULLET_LIST:
      return '-';
    case BlockType.NUMBERED_LIST:
      return '1.';
    case BlockType.TODO:
      return '[]';
    case BlockType.QUOTE:
      return '>';
    case BlockType.CODE:
      return '```';
    case BlockType.DIVIDER:
      return '---';
    default:
      return '';
  }
};

// Group commands by category
const groupCommandsByCategory = (commands) => {
  const categories = {
    basic: { title: 'Basic blocks', commands: [] },
    charts: { title: 'Charts & Data', commands: [] },
    layout: { title: 'Layout', commands: [] },
    advanced: { title: 'Advanced', commands: [] },
    media: { title: 'Media', commands: [] }
  };
  
  commands.forEach(command => {
    const category = command.category || 'basic';
    if (categories[category]) {
      categories[category].commands.push(command);
    }
  });
  
  // Filter out empty categories
  return Object.entries(categories).filter(([_, cat]) => cat.commands.length > 0);
};

const SlashCommandMenu = ({ position, onSelect, onClose, searchTerm, blockId }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [adjustedPosition, setAdjustedPosition] = useState(() => position || { top: 0, left: 0 });
  const [recentlyUsed, setRecentlyUsed] = useState([]);
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const menuRef = useRef(null);
  const keyboardTimeoutRef = useRef(null);
  const searchModeTimeoutRef = useRef(null);
  // Refs for each command item
  const itemRefs = useRef([]);

  // Load recently used commands from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentSlashCommands');
    if (stored) {
      try {
        setRecentlyUsed(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load recent commands:', e);
      }
    }
  }, []);

  // Save recently used command
  const saveRecentCommand = (type) => {
    const newRecent = [type, ...recentlyUsed.filter(t => t !== type)].slice(0, 5);
    setRecentlyUsed(newRecent);
    localStorage.setItem('recentSlashCommands', JSON.stringify(newRecent));
  };

  // Enhanced search with fuzzy matching
  const filteredCommands = useMemo(() => {
    const term = searchTerm || '';
    if (!term) return slashCommands;

    const lowerTerm = term.toLowerCase();

    // Score each command based on match quality
    const scored = slashCommands.map(command => {
      let score = 0;
      const label = command.label.toLowerCase();
      const desc = command.description.toLowerCase();

      // Exact match gets highest score
      if (label === lowerTerm) score += 100;
      else if (label.startsWith(lowerTerm)) score += 50;
      else if (label.includes(lowerTerm)) score += 30;

      // Description matches get lower scores
      if (desc.includes(lowerTerm)) score += 10;

      // Fuzzy match - check if all characters appear in order
      let fuzzyIndex = 0;
      for (let char of lowerTerm) {
        const idx = label.indexOf(char, fuzzyIndex);
        if (idx !== -1) {
          score += 5;
          fuzzyIndex = idx + 1;
        }
      }

      return { command, score };
    });

    // Filter and sort by score
    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.command);
  }, [searchTerm]);

  const groupedCommands = useMemo(() => {
    return groupCommandsByCategory(filteredCommands);
  }, [filteredCommands]);

  // Flatten grouped commands for keyboard navigation
  const flatCommands = useMemo(() => {
    return filteredCommands;
  }, [filteredCommands]);

  const computePositionFromRect = useCallback((rect) => {
    if (typeof window === 'undefined') {
      return { top: rect.bottom + MENU_MARGIN, left: rect.left };
    }

    const viewportWidth = window.innerWidth;
    const minLeft = VIEWPORT_PADDING;
    const maxLeft = Math.max(minLeft, viewportWidth - VIEWPORT_PADDING - MENU_WIDTH);

    const clampedLeft = Math.min(Math.max(rect.left, minLeft), maxLeft);

    return {
      top: Math.round(rect.bottom + MENU_MARGIN),
      left: Math.round(clampedLeft),
    };
  }, []);

  const clampFallbackPosition = useCallback((top, left) => {
    if (typeof window === 'undefined') {
      return { top, left };
    }

    const viewportWidth = window.innerWidth;

    const minLeft = VIEWPORT_PADDING;
    const maxLeft = Math.max(minLeft, viewportWidth - VIEWPORT_PADDING - MENU_WIDTH);
    const clampedLeft = Math.min(Math.max(left, minLeft), maxLeft);

    return { top, left: clampedLeft };
  }, []);

  const getDesiredPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return position || null;
    }

    if (blockId) {
      const selectorId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(blockId) : blockId;
      const blockElement = document.querySelector(`[data-block-id="${selectorId}"]`);
      if (blockElement) {
        const rect = blockElement.getBoundingClientRect();
        return computePositionFromRect(rect);
      }
    }

    if (position) {
      const fallbackTop = Math.round((position.top ?? 0) + MENU_MARGIN);
      const fallbackLeft = Math.round(position.left ?? 0);
      return clampFallbackPosition(fallbackTop, fallbackLeft);
    }

    return null;
  }, [blockId, position, computePositionFromRect, clampFallbackPosition]);

  const applyPosition = useCallback(() => {
    const nextPosition = getDesiredPosition();
    if (!nextPosition) {
      return;
    }

    setAdjustedPosition((prev) => {
      if (!prev) {
        return nextPosition;
      }

      const topDiff = Math.abs((prev.top ?? 0) - (nextPosition.top ?? 0));
      const leftDiff = Math.abs((prev.left ?? 0) - (nextPosition.left ?? 0));

      if (topDiff <= 1 && leftDiff <= 1) {
        return prev;
      }

      return nextPosition;
    });
  }, [getDesiredPosition]);

  useLayoutEffect(() => {
    applyPosition();
  }, [applyPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let rafId = null;

    const scheduleApply = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        applyPosition();
      });
    };

    const handleScrollOrResize = () => {
      scheduleApply();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [applyPosition]);

  // Better keyboard navigation that doesn't interfere with page scrolling
  useEffect(() => {

    const handleKeyDown = (e) => {
      // Only handle keys if the slash menu is open
      if (flatCommands.length === 0) return;

      let nextIndex = selectedIndex;
      let keyboardUsed = false;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          nextIndex = Math.min(selectedIndex + 1, flatCommands.length - 1);
          setSelectedIndex(nextIndex);
          keyboardUsed = true;
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          nextIndex = Math.max(selectedIndex - 1, 0);
          setSelectedIndex(nextIndex);
          keyboardUsed = true;
          break;
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          // Tab cycles through items
          if (e.shiftKey) {
            nextIndex = selectedIndex > 0 ? selectedIndex - 1 : flatCommands.length - 1;
          } else {
            nextIndex = selectedIndex < flatCommands.length - 1 ? selectedIndex + 1 : 0;
          }
          setSelectedIndex(nextIndex);
          keyboardUsed = true;
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          const selectedCommand = flatCommands[selectedIndex];
          if (selectedCommand) {
            saveRecentCommand(selectedCommand.type);
            onSelect(selectedCommand.type);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }

      // If keyboard was used for navigation, set flag and clear after delay
      if (keyboardUsed) {
        setKeyboardNavigation(true);
        if (keyboardTimeoutRef.current) {
          clearTimeout(keyboardTimeoutRef.current);
        }
        keyboardTimeoutRef.current = setTimeout(() => {
          setKeyboardNavigation(false);
        }, 500); // Reset after 500ms of no keyboard activity
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (keyboardTimeoutRef.current) {
        clearTimeout(keyboardTimeoutRef.current);
      }
      if (searchModeTimeoutRef.current) {
        clearTimeout(searchModeTimeoutRef.current);
      }
    };
  }, [selectedIndex, flatCommands, onSelect, onClose]);

  // Scroll selected item into view when selectedIndex changes
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex, flatCommands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // Reset selection when search term changes and enable search mode
  useEffect(() => {
    setSelectedIndex(0);
    if (searchTerm) {
      setSearchMode(true);
      // Clear existing timeout
      if (searchModeTimeoutRef.current) {
        clearTimeout(searchModeTimeoutRef.current);
      }
      // Set search mode to false after 1 second of no typing
      searchModeTimeoutRef.current = setTimeout(() => {
        setSearchMode(false);
      }, 1000);
    } else {
      setSearchMode(false);
      if (searchModeTimeoutRef.current) {
        clearTimeout(searchModeTimeoutRef.current);
      }
    }
  }, [searchTerm]);

  // Handle click selection properly
  const handleCommandClick = (command, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    saveRecentCommand(command.type);
    onSelect(command.type);
  };

  // Get recently used commands that match current search
  const recentCommands = useMemo(() => {
    if (!recentlyUsed.length) return [];
    return recentlyUsed
      .map(type => slashCommands.find(cmd => cmd.type === type))
      .filter(cmd => cmd && (!searchTerm ||
        cmd.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cmd.description.toLowerCase().includes(searchTerm.toLowerCase())
      ));
  }, [recentlyUsed, searchTerm]);

  const resolvedPosition = adjustedPosition || { top: 0, left: 0 };

  return (
    <div
      ref={menuRef}
      data-slash-menu="true"
      className="fixed z-10 bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800"
      style={{
        top: `${resolvedPosition.top}px`,
        left: `${resolvedPosition.left}px`,
        animation: 'fadeIn 0.15s ease-out',
        width: `${MENU_WIDTH}px`,
        height: `${MENU_HEIGHT}px`,
        maxHeight: `${MENU_HEIGHT}px`,
        minHeight: `${MENU_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column'
      }}
      onWheel={(e) => {
        // Only stop propagation, don't prevent default
        // This allows background scrolling while keeping menu scroll contained
        e.stopPropagation();
      }}
      onMouseMove={() => {
        // Reset keyboard navigation and search mode when mouse moves
        if (keyboardNavigation) {
          setKeyboardNavigation(false);
          if (keyboardTimeoutRef.current) {
            clearTimeout(keyboardTimeoutRef.current);
          }
        }
        if (searchMode) {
          setSearchMode(false);
          if (searchModeTimeoutRef.current) {
            clearTimeout(searchModeTimeoutRef.current);
          }
        }
      }}
    >
      {/* Keyboard hints */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800">
        <div className="flex gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 rounded">↑↓</kbd> Navigate
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 rounded">Enter</kbd> Select
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 rounded">Esc</kbd> Close
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {/* Recently Used Section */}
        {!searchTerm && recentCommands.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 uppercase tracking-wide mb-2">
              <Clock className="w-3 h-3" />
              Recently Used
            </div>
            <div className="space-y-[2px]">
              {recentCommands.slice(0, 3).map((command) => {
                const Icon = command.icon;
                const commandIndex = flatCommands.findIndex(cmd => cmd.type === command.type);
                const isSelected = commandIndex === selectedIndex;
                return (
                  <button
                    key={command.type}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all duration-150 ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-300 midnight:text-blue-300 shadow-sm'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300'
                    }`}
                    onClick={(e) => handleCommandClick(command, e)}
                    onMouseEnter={() => !keyboardNavigation && !searchMode && setSelectedIndex(commandIndex)}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs">{command.label}</div>
                    </div>
                    <Star className="w-3 h-3 text-yellow-500" />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-700"></div>
          </div>
        )}

        {searchTerm ? (
          // Show flat list when searching
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 uppercase tracking-wide mb-2">
              Search results
            </div>
            <div className="space-y-[2px]">
              {flatCommands.map((command, index) => {
                const Icon = command.icon;
                const isSelected = index === selectedIndex;
                const shortcut = getShortcutHint(command.type);
                return (
                  <button
                    key={command.type}
                    ref={el => itemRefs.current[index] = el}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-300 midnight:text-blue-300'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300'
                    }`}
                    style={{ minHeight: '32px' }}
                    onClick={(e) => handleCommandClick(command, e)}
                    onMouseEnter={() => !keyboardNavigation && !searchMode && setSelectedIndex(index)}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs">{command.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 truncate">{command.description}</div>
                    </div>
                    {shortcut && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500 font-mono bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 px-1 rounded">
                        {shortcut}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          // Show categorized list when not searching
          <div className="space-y-4">
            {groupedCommands.map(([categoryKey, category]) => (
              <div key={categoryKey}>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 uppercase tracking-wide mb-2">
                  {category.title}
                </div>
                <div className="space-y-[2px]">
                  {category.commands.map((command) => {
                    const commandIndex = flatCommands.findIndex(cmd => cmd.type === command.type);
                    const Icon = command.icon;
                    const isSelected = commandIndex === selectedIndex;
                    const shortcut = getShortcutHint(command.type);
                    return (
                      <button
                        key={command.type}
                        ref={el => itemRefs.current[commandIndex] = el}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/20 text-blue-700 dark:text-blue-300 midnight:text-blue-300'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300'
                        }`}
                        style={{ minHeight: '32px' }}
                        onClick={(e) => handleCommandClick(command, e)}
                        onMouseEnter={() => !keyboardNavigation && !searchMode && setSelectedIndex(commandIndex)}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs">{command.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 truncate">{command.description}</div>
                        </div>
                        {shortcut && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 midnight:text-gray-500 font-mono bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 px-1 rounded">
                            {shortcut}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Tips Footer */}
      {flatCommands.length === 0 && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-700 bg-gray-50 dark:bg-gray-900/50 midnight:bg-gray-950/50">
          <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 text-center">
            No results found. Try a different search term.
          </div>
        </div>
      )}
    </div>
  );
};

export default SlashCommandMenu;
