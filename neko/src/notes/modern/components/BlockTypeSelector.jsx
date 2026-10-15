// "Change to": the block types a block can turn into, in the app's Menu,
// opened from the type button beside a block.

import PropTypes from "prop-types";
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
import { Menu, MenuItem, MenuLabel } from "../../../components/ui/Menu.jsx";

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
const TYPE_CHOICES = [
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
    label: "Numbered list",
    description: "Create a numbered list",
    type: BlockType.NUMBERED_LIST,
  },
  {
    icon: List,
    label: "Bullet list",
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
    label: "Link preview",
    description: "Add a rich link preview",
    type: BlockType.LINK_PREVIEW,
  },
  // Charts
  {
    icon: TrendingUp,
    label: "Line chart",
    description: "Display data as a line chart",
    type: BlockType.LINE_CHART,
  },
  {
    icon: BarChart3,
    label: "Bar chart",
    description: "Display data as a bar chart",
    type: BlockType.BAR_CHART,
  },
  {
    icon: PieChart,
    label: "Pie chart",
    description: "Display data as a pie chart",
    type: BlockType.PIE_CHART,
  },
  {
    icon: Activity,
    label: "Area chart",
    description: "Display data as an area chart",
    type: BlockType.AREA_CHART,
  },
  {
    icon: StampIcon,
    label: "Scatter chart",
    description: "Display data as a scatter plot",
    type: BlockType.SCATTER_CHART,
  },
  {
    icon: CircleDot,
    label: "Donut chart",
    description: "Display data as a donut chart",
    type: BlockType.DONUT_CHART,
  },
  // Layout
  // Advanced
  // { icon: BarChart, label: 'Progress Bar', description: 'Show progress with a bar', type: BlockType.PROGRESS_BAR },
  // { icon: Navigation, label: 'Breadcrumb', description: 'Navigation breadcrumb trail', type: BlockType.BREADCRUMB },
  // { icon: MousePointer, label: 'Button', description: 'Interactive button element', type: BlockType.BUTTON },
];

const BlockTypeSelector = ({ anchorRef, open, onClose, currentType, onSelect }) => (
  <Menu
    anchorRef={anchorRef}
    open={open}
    onClose={onClose}
    placement="bottom-end"
    width={220}
    label="Change to"
    className="max-h-80"
  >
    {/* Presses in here keep the editor's block selection: Change to applies to all of it. */}
    <div data-block-type-selector="true" data-block-selection-modal data-block-selection-disabled="true">
      <MenuLabel>Change to</MenuLabel>
      {TYPE_CHOICES.map((choice) => (
        <MenuItem
          key={choice.type}
          icon={choice.icon}
          label={choice.label}
          checked={choice.type === currentType}
          onSelect={() => onSelect(choice.type)}
        />
      ))}
    </div>
  </Menu>
);

BlockTypeSelector.propTypes = {
  anchorRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  currentType: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
};

export default BlockTypeSelector;
