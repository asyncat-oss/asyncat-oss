// ChartDiffSummary.jsx - Visual summary of chart changes in version history
import React from "react";
import {
  Palette,
  Tag,
  ArrowRightLeft,
  BarChart3,
  PieChart,
  LineChart,
  AreaChart,
  ChartScatter,
  SquarePen,
  CirclePlus,
  CircleMinus,
  ChartNoAxesCombined,
  Cog,
  LifeBuoy,
  ChevronDown,
  ChevronRight,
  CircleChevronDown,
} from "lucide-react";
import { compareChartBlocks, groupChartChanges } from "./utils/chartDiff";
import { getUserColor } from "./utils/userColors";

const ChartDiffSummary = ({ oldBlock, newBlock, changeInfo }) => {
  const [expandedSections, setExpandedSections] = React.useState({
    data: true,
    colors: true,
    labels: true,
    config: true,
    other: true,
  });

  const [showScrollIndicator, setShowScrollIndicator] = React.useState(false);
  const scrollContainerRef = React.useRef(null);

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const checkScrollIndicator = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      const hasScroll = container.scrollHeight > container.clientHeight;
      const isAtBottom =
        container.scrollHeight - container.scrollTop <=
        container.clientHeight + 5;
      setShowScrollIndicator(hasScroll && !isAtBottom);
    }
  }, []);

  React.useEffect(() => {
    checkScrollIndicator();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollIndicator);
      return () =>
        container.removeEventListener("scroll", checkScrollIndicator);
    }
  }, [checkScrollIndicator, expandedSections]);

  if (!oldBlock || !newBlock) return null;

  // Get chart diff
  const chartDiff = compareChartBlocks(oldBlock, newBlock);

  if (!chartDiff || chartDiff.changes.length === 0) {
    return (
      <div className="chart-diff-summary p-3 text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-300 italic">
        No specific chart changes detected
      </div>
    );
  }

  // Group changes by category
  const grouped = groupChartChanges(chartDiff);

  const userColor = changeInfo ? getUserColor(changeInfo.user) : null;

  // Chart type icon
  const getChartIcon = (type) => {
    switch (type) {
      case "barChart":
        return BarChart3;
      case "lineChart":
        return LineChart;
      case "areaChart":
        return AreaChart;
      case "pieChart":
      case "donutChart":
        return PieChart;
      case "scatterChart":
        return ChartScatter;
      default:
        return BarChart3;
    }
  };

  const ChartIcon = getChartIcon(chartDiff.type);

  // Get chart type name
  const getChartTypeName = (type) => {
    switch (type) {
      case "barChart":
        return "Bar Chart";
      case "lineChart":
        return "Line Chart";
      case "areaChart":
        return "Area Chart";
      case "pieChart":
        return "Pie Chart";
      case "donutChart":
        return "Donut Chart";
      case "scatterChart":
        return "Scatter Chart";
      default:
        return "Chart";
    }
  };

  const chartTypeName = getChartTypeName(chartDiff.type);

  // Render change item with icon
  const renderChangeItem = (change) => {
    const getIcon = () => {
      if (change.type === "added")
        return (
          <CirclePlus className="w-4 h-4 text-green-600 dark:text-green-400 midnight:text-green-300" />
        );
      if (change.type === "deleted")
        return (
          <CircleMinus className="w-4 h-4 text-red-600 dark:text-red-400 midnight:text-red-300" />
        );
      return (
        <SquarePen className="w-4 h-4 text-blue-600 dark:text-blue-400 midnight:text-blue-300" />
      );
    };

    const getTextColor = () => {
      if (change.type === "added")
        return "text-green-700 dark:text-green-300 midnight:text-green-400";
      if (change.type === "deleted")
        return "text-red-700 dark:text-red-300 midnight:text-red-400";
      return "text-blue-700 dark:text-blue-300 midnight:text-blue-400";
    };

    // Render color swatches for color changes
    const renderColorChange = () => {
      if (
        !change.property.includes("color") &&
        !change.property.includes("backgroundColor") &&
        !change.property.includes("borderColor")
      ) {
        return null;
      }

      return (
        <div className="flex items-center gap-2 ml-6 mt-1">
          {change.from && (
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600 midnight:border-gray-500"
                style={{ backgroundColor: change.from }}
                title={change.from}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-300">
                {change.from}
              </span>
            </div>
          )}
          <ArrowRightLeft className="w-3 h-3 text-gray-500 dark:text-gray-400 midnight:text-gray-300" />
          {change.to && (
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600 midnight:border-gray-500"
                style={{ backgroundColor: change.to }}
                title={change.to}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-300">
                {change.to}
              </span>
            </div>
          )}
        </div>
      );
    };

    return (
      <li key={`${change.property}-${change.index || 0}`} className="mb-2">
        <div className="flex items-start gap-2">
          {getIcon()}
          <span className={`text-sm ${getTextColor()}`}>
            {change.description}
          </span>
        </div>
        {renderColorChange()}
      </li>
    );
  };

  // Render section
  const renderSection = (title, icon, changes, sectionKey) => {
    if (changes.length === 0) return null;

    const Icon = icon;
    const isExpanded = expandedSections[sectionKey];

    return (
      <div className="mb-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSection(sectionKey);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          className="flex items-center gap-2 mb-2 w-full rounded p-1 -ml-1 transition-colors cursor-pointer"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              userColor?.light || "rgba(99, 102, 241, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-300" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-300" />
          )}
          <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-300" />
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-300 midnight:text-gray-200">
            {title} ({changes.length})
          </h4>
        </button>
        {isExpanded && (
          <ul className="space-y-1 ml-1">{changes.map(renderChangeItem)}</ul>
        )}
      </div>
    );
  };

  return (
    <div
      className="chart-diff-summary rounded-lg border-2 mb-4 overflow-hidden"
      style={{
        borderColor: userColor?.main || "#6366f1",
        backgroundColor: userColor?.light || "rgba(99, 102, 241, 0.05)",
      }}
    >
      {/* Header - Fixed */}
      <div
        className="flex items-center gap-2 p-4 pb-3 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-600"
        style={{
          backgroundColor: userColor?.light || "rgba(99, 102, 241, 0.05)",
        }}
      >
        <ChartIcon
          className="w-5 h-5"
          style={{ color: userColor?.main || "#6366f1" }}
        />
        <h3 className="font-bold text-gray-900 dark:text-gray-200 midnight:text-gray-100">
          {chartTypeName} Changes ({chartDiff.changes.length})
        </h3>
      </div>

      {/* Scrollable Sections - Max height 400px */}
      <div style={{ position: "relative" }}>
        <div
          ref={scrollContainerRef}
          className="px-4 py-2 space-y-2 overflow-y-auto"
          style={{
            maxHeight: "400px",
            scrollbarWidth: "thin",
            scrollbarColor: `${userColor?.main || "#9ca3af"} transparent`,
          }}
          onMouseDown={(e) => {
            // Allow button clicks and their child elements (SVG icons) to work
            const isButtonOrChild =
              e.target.tagName === "BUTTON" ||
              e.target.closest("button") ||
              e.target.tagName === "svg" ||
              e.target.tagName === "path";
            if (!isButtonOrChild) {
              e.stopPropagation();
            }
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          {renderSection(
            "Data Changes",
            ChartNoAxesCombined,
            grouped.data,
            "data"
          )}
          {renderSection("Color Changes", Palette, grouped.colors, "colors")}
          {renderSection("Label Changes", Tag, grouped.labels, "labels")}
          {renderSection("Configuration", Cog, grouped.config, "config")}
          {grouped.other.length > 0 &&
            renderSection("Other Changes", LifeBuoy, grouped.other, "other")}
        </div>

        {/* Scroll indicator - bouncing chevron */}
        {showScrollIndicator && (
          <div
            style={{
              position: "absolute",
              bottom: "8px",
              left: "50%",
              transform: "translateX(-50%)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            <CircleChevronDown className="w-5 h-5 animate-bounce text-gray-600 dark:text-gray-300 midnight:text-gray-400" />
          </div>
        )}
      </div>

      {/* Footer note - Fixed */}
      <div className="px-4 pb-4 pt-3 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-600">
        <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-300 italic">
          Scroll down to see the visual comparison of the charts
        </p>
      </div>
    </div>
  );
};

export default ChartDiffSummary;
