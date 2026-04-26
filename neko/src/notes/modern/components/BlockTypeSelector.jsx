import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Hash,
  Type,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Table,
  Minus,
  Image,
  Video,
  Music,
  AlertTriangle,
  FileText,
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
  StampIcon,
  CircleDot,
} from "lucide-react";

const BlockType = {
  TEXT: "text",
  HEADING1: "heading1",
  HEADING2: "heading2",
  HEADING3: "heading3",
  NUMBERED_LIST: "numberedList",
  BULLET_LIST: "bulletList",
  TODO: "todo",
  QUOTE: "quote",
  TABLE: "table",
  CODE: "code",
  DIVIDER: "divider",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  FILE: "file",
  CALLOUT: "callout",
  TOGGLE: "toggle",
  EMBED: "embed",
  MATH: "math",
  LINK_PREVIEW: "linkPreview",
  // Chart blocks
  LINE_CHART: "lineChart",
  BAR_CHART: "barChart",
  PIE_CHART: "pieChart",
  AREA_CHART: "areaChart",
  SCATTER_CHART: "scatterChart",
  DONUT_CHART: "donutChart",
  // Advanced blocks
  PROGRESS_BAR: "progressBar",
  BREADCRUMB: "breadcrumb",
  BUTTON: "button",
};
const slashCommands = [
  {
    icon: Type,
    label: "Text",
    description: "Just start writing with plain text",
    type: BlockType.TEXT,
  },
  {
    icon: Hash,
    label: "Heading 1",
    description: "Large section heading",
    type: BlockType.HEADING1,
  },
  {
    icon: Hash,
    label: "Heading 2",
    description: "Medium section heading",
    type: BlockType.HEADING2,
  },
  {
    icon: Hash,
    label: "Heading 3",
    description: "Small section heading",
    type: BlockType.HEADING3,
  },
  {
    icon: ListOrdered,
    label: "Numbered List",
    description: "Create a numbered list",
    type: BlockType.NUMBERED_LIST,
  },
  {
    icon: List,
    label: "Bullet List",
    description: "Create a bulleted list",
    type: BlockType.BULLET_LIST,
  },
  {
    icon: CheckSquare,
    label: "Todo",
    description: "Track tasks with checkboxes",
    type: BlockType.TODO,
  },
  {
    icon: Quote,
    label: "Quote",
    description: "Capture a quote",
    type: BlockType.QUOTE,
  },
  {
    icon: Table,
    label: "Table",
    description: "Create a table with rows and columns",
    type: BlockType.TABLE,
  },
  // {
  //   icon: Code,
  //   label: "Code",
  //   description: "Add a code block with syntax highlighting",
  //   type: BlockType.CODE,
  // },
  {
    icon: Minus,
    label: "Divider",
    description: "Add a visual divider line",
    type: BlockType.DIVIDER,
  },
  {
    icon: Image,
    label: "Image",
    description: "Upload or embed an image",
    type: BlockType.IMAGE,
  },
  {
    icon: Video,
    label: "Video",
    description: "Upload or embed a video",
    type: BlockType.VIDEO,
  },
  {
    icon: Music,
    label: "Audio",
    description: "Upload an audio file",
    type: BlockType.AUDIO,
  },
  // { icon: File, label: 'File', description: 'Upload and attach files to your note', type: BlockType.FILE },
  {
    icon: AlertTriangle,
    label: "Callout",
    description: "Create an info, warning, or note callout",
    type: BlockType.CALLOUT,
  },
  // { icon: ChevronRight, label: 'Toggle', description: 'Create a collapsible section', type: BlockType.TOGGLE },
  // { icon: Link, label: 'Embed', description: 'Embed external content', type: BlockType.EMBED },
  // { icon: Calculator, label: 'Math', description: 'Add mathematical equations', type: BlockType.MATH },
  {
    icon: FileText,
    label: "Link Preview",
    description: "Add a rich link preview",
    type: BlockType.LINK_PREVIEW,
  },
  // Charts
  {
    icon: TrendingUp,
    label: "Line Chart",
    description: "Display data as a line chart",
    type: BlockType.LINE_CHART,
  },
  {
    icon: BarChart3,
    label: "Bar Chart",
    description: "Display data as a bar chart",
    type: BlockType.BAR_CHART,
  },
  {
    icon: PieChart,
    label: "Pie Chart",
    description: "Display data as a pie chart",
    type: BlockType.PIE_CHART,
  },
  {
    icon: Activity,
    label: "Area Chart",
    description: "Display data as an area chart",
    type: BlockType.AREA_CHART,
  },
  {
    icon: StampIcon,
    label: "Scatter Chart",
    description: "Display data as a scatter plot",
    type: BlockType.SCATTER_CHART,
  },
  {
    icon: CircleDot,
    label: "Donut Chart",
    description: "Display data as a donut chart",
    type: BlockType.DONUT_CHART,
  },
  // Layout
  // Advanced
  // { icon: BarChart, label: 'Progress Bar', description: 'Show progress with a bar', type: BlockType.PROGRESS_BAR },
  // { icon: Navigation, label: 'Breadcrumb', description: 'Navigation breadcrumb trail', type: BlockType.BREADCRUMB },
  // { icon: MousePointer, label: 'Button', description: 'Interactive button element', type: BlockType.BUTTON },
];

const BlockTypeSelector = ({
  currentType,
  onSelect,
  onClose,
  searchTerm,
  position,
  buttonRef,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);

  // Filtering logic (optional, for future extensibility)
  const filteredCommands = useMemo(() => {
    if (!searchTerm) return slashCommands;
    return slashCommands.filter(
      (command) =>
        command.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        command.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  // Keyboard navigation (copied from SlashCommandMenu)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (filteredCommands.length === 0) return;
      let nextIndex = selectedIndex;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          nextIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
          setSelectedIndex(nextIndex);
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          nextIndex = Math.max(selectedIndex - 1, 0);
          setSelectedIndex(nextIndex);
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          onSelect(filteredCommands[selectedIndex].type);
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [selectedIndex, filteredCommands, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex].scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex, filteredCommands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  if (filteredCommands.length === 0) return null;

  const dropdown = (
    <div
      ref={menuRef}
      data-block-type-selector="true"
      data-block-selection-modal
      data-block-selection-disabled="true"
      className="fixed z-[9999] bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 select-none"
      style={{
        top: position?.top || 0,
        left: position?.left || 0,
        animation: "fadeIn 0.1s ease-out",
        width: "240px",
        maxHeight: "320px",
        overflowY: "auto",
        overflowX: "hidden",
        padding: 0,
        pointerEvents: "auto",
      }}
      onWheel={(e) => e.stopPropagation()}
      onMouseLeave={(e) => {
        // Check if mouse moved to the toggle button
        const relatedTarget = e.relatedTarget;
        if (buttonRef?.current && buttonRef.current.contains(relatedTarget)) {
          return; // Don't close if hovering over the toggle button
        }
        onClose();
      }}
    >
      <div className="p-2 select-none">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 uppercase tracking-wide mb-1 select-none">
          Change to
        </div>
        <div className="space-y-[1px]">
          {filteredCommands.map((command, index) => {
            const Icon = command.icon;
            const isSelected = index === selectedIndex;
            return (
              <button
                key={command.type}
                ref={(el) => (itemRefs.current[index] = el)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors select-none ${
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-950/60 text-blue-700 dark:text-blue-300 midnight:text-blue-300"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-400 midnight:text-gray-300"
                }`}
                style={{ minHeight: "32px" }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(command.type);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <Icon className="w-4 h-4 flex-shrink-0 select-none" />
                <div className="flex-1 min-w-0 font-medium text-xs select-none">
                  {command.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(dropdown, document.body);
};

export default BlockTypeSelector;
