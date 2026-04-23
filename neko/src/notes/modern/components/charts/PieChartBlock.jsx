import { useState, useEffect, useRef } from "react";
import {
  PieChart,
  Edit3,
  Download,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
} from "lucide-react";
import {
  CHART_HEIGHT_OPTIONS,
  getHeightValue,
  getHeightKey,
} from "./chartConstants";

// Helper functions for color conversion
const hexToRgb = (hex) => {
  const cleanHex = hex.replace("#", "");
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substr(0, 2), 16);
    const g = parseInt(cleanHex.substr(2, 2), 16);
    const b = parseInt(cleanHex.substr(4, 2), 16);
    return { r, g, b };
  }
  return { r: 0, g: 0, b: 0 };
};

const rgbToHsl = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
};

const hslToRgb = (h, s, l) => {
  h /= 360;
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / (1 / 12)) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
};

const rgbToHex = (r, g, b) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

// Advanced Color Picker Component with Spectrum (same as LineChartBlock)
const ColorPicker = ({ selectedColor, onColorSelect, onClose }) => {
  const [hsl, setHsl] = useState(() => {
    const rgb = hexToRgb(selectedColor);
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  });

  const [hexValue, setHexValue] = useState(selectedColor);

  // Convert HSL to RGB
  const hslToRgb = (h, s, l) => {
    h /= 360;
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / (1 / 12)) % 12;
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return {
      r: Math.round(f(0) * 255),
      g: Math.round(f(8) * 255),
      b: Math.round(f(4) * 255),
    };
  };

  // Convert RGB to HSL
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  // Convert RGB to Hex
  const rgbToHex = (r, g, b) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  // Convert Hex to RGB
  function hexToRgb(hex) {
    const cleanHex = hex.replace("#", "");
    if (cleanHex.length === 6) {
      const r = parseInt(cleanHex.substr(0, 2), 16);
      const g = parseInt(cleanHex.substr(2, 2), 16);
      const b = parseInt(cleanHex.substr(4, 2), 16);
      return { r, g, b };
    }
    return { r: 0, g: 0, b: 0 };
  }

  const updateColor = (newHsl) => {
    setHsl(newHsl);
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    setHexValue(hex);
    onColorSelect(hex);
  };

  const handleHexChange = (hex) => {
    setHexValue(hex);
    if (hex.length === 7 && hex.startsWith("#")) {
      const rgb = hexToRgb(hex);
      const newHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      setHsl(newHsl);
      onColorSelect(hex);
    }
  };

  const currentRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  const currentHex = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b);

  return (
    <div
      className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg shadow-xl backdrop-blur-sm w-80"
      style={{ zIndex: 99999, position: "absolute", isolation: "isolate" }}
    >
      {/* Main Layout: Spectrum + Controls Side by Side */}
      <div className="flex gap-2">
        {/* Left: Color Spectrum */}
        <div className="w-28">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400 mb-1">
            Spectrum
          </div>

          {/* Saturation/Lightness Square */}
          <div className="relative w-28 h-28 mb-1.5 rounded overflow-hidden border border-gray-200 dark:border-gray-600 midnight:border-gray-500">
            <div
              className="w-full h-full cursor-crosshair relative"
              style={{
                background: `linear-gradient(to right, white, hsl(${hsl.h}, 100%, 50%))`,
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const newS = (x / rect.width) * 100;
                const newL = 100 - (y / rect.height) * 100;
                updateColor({ ...hsl, s: newS, l: newL });
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to bottom, transparent, black)",
                }}
              />
              {/* Cursor */}
              <div
                className="absolute w-2 h-2 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${hsl.s}%`,
                  top: `${100 - hsl.l}%`,
                }}
              />
            </div>
          </div>

          {/* Hue Slider */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                Hue
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {Math.round(hsl.h)}°
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={hsl.h}
              onChange={(e) =>
                updateColor({ ...hsl, h: parseInt(e.target.value) })
              }
              className="w-full h-2.5 rounded appearance-none cursor-pointer hue-slider"
              style={{
                background:
                  "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
              }}
            />
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex-1">
          {/* Color Preview */}
          <div className="mb-2">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400 mb-1">
              Preview
            </div>
            <div
              className="w-full h-6 rounded border border-gray-200 dark:border-gray-600 midnight:border-gray-500"
              style={{ backgroundColor: currentHex }}
            />
          </div>

          {/* Values in compact grid */}
          <div className="grid grid-cols-2 gap-1.5 mb-2 text-xs">
            {/* HSL Values */}
            <div>
              <div className="text-gray-500 dark:text-gray-400 midnight:text-slate-400 font-medium mb-0.5">
                HSL
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                    H:
                  </span>
                  <span className="font-mono text-xs text-gray-900 dark:text-white midnight:text-slate-100">
                    {Math.round(hsl.h)}°
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                    S:
                  </span>
                  <span className="font-mono text-xs text-gray-900 dark:text-white midnight:text-slate-100">
                    {Math.round(hsl.s)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                    L:
                  </span>
                  <span className="font-mono text-xs text-gray-900 dark:text-white midnight:text-slate-100">
                    {Math.round(hsl.l)}%
                  </span>
                </div>
              </div>
            </div>

            {/* RGB Values */}
            <div>
              <div className="text-gray-500 dark:text-gray-400 midnight:text-slate-400 font-medium mb-0.5">
                RGB
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-red-600 dark:text-red-400 midnight:text-red-400">
                    R:
                  </span>
                  <span className="font-mono text-xs text-gray-900 dark:text-white midnight:text-slate-100">
                    {currentRgb.r}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600 dark:text-green-400 midnight:text-green-400">
                    G:
                  </span>
                  <span className="font-mono text-xs text-gray-900 dark:text-white midnight:text-slate-100">
                    {currentRgb.g}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 dark:text-blue-400 midnight:text-blue-400">
                    B:
                  </span>
                  <span className="font-mono text-xs text-gray-900 dark:text-white midnight:text-slate-100">
                    {currentRgb.b}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Hex Input */}
          <div className="mb-1">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400 mb-0.5">
              Hex
            </div>
            <input
              type="text"
              value={hexValue}
              onChange={(e) => handleHexChange(e.target.value)}
              className="w-full px-2 py-1 border border-gray-200 dark:border-gray-600 midnight:border-gray-500 rounded text-xs bg-gray-50 dark:bg-gray-700 midnight:bg-slate-700 text-gray-900 dark:text-white midnight:text-slate-100 font-mono focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400"
              placeholder="#000000"
              maxLength={7}
            />
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-2 py-1 text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 rounded text-xs border border-gray-200 dark:border-gray-600 midnight:border-gray-500"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        .hue-slider::-webkit-slider-thumb {
          appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.2);
        }
        .hue-slider::-moz-range-thumb {
          height: 14px;
          width: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
};

const PieChartBlock = ({ block, onChange, contentRef, commonProps }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [chartData, setChartData] = useState(
    block.properties?.data || {
      labels: ["Desktop", "Mobile", "Tablet", "Other"],
      datasets: [
        {
          data: [45, 35, 15, 5],
          backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"],
        },
      ],
    }
  );
  const [chartConfig, setChartConfig] = useState(
    block.properties?.config || {
      title: "Pie Chart",
      showLegend: true,
      showPercentages: true,
      showValues: true,
      heightSize: "medium",
    }
  );

  // Temporary editing state (only applied on save)
  const [tempChartData, setTempChartData] = useState(chartData);
  const [tempChartConfig, setTempChartConfig] = useState(chartConfig);

  const [theme, setTheme] = useState(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const isMidnight = document.documentElement.classList.contains("midnight");
    return isMidnight ? "midnight" : isDark ? "dark" : "light";
  });
  const canvasRef = useRef(null);
  const [activeColorPalette, setActiveColorPalette] = useState(null);
  const [heightDropdownOpen, setHeightDropdownOpen] = useState(false);

  const drawChart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Ensure we have valid data
    if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
      return;
    }

    // Get device pixel ratio for high-DPI support
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Validate dimensions - if too small, the canvas might be hidden/not ready
    // Retry after a short delay
    if (rect.width < 10 || rect.height < 10) {
      requestAnimationFrame(() => {
        const retryRect = canvas.getBoundingClientRect();
        if (retryRect.width >= 10 && retryRect.height >= 10) {
          drawChart();
        }
      });
      return;
    }

    // Set actual canvas size in memory (scaled up for high-DPI)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Scale the canvas back down using CSS
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    // Scale the drawing context so everything draws at the correct size
    ctx.scale(dpr, dpr);

    // Use the CSS dimensions for calculations
    const width = rect.width;
    const height = rect.height;

    // Enable antialiasing and smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Dynamic background based on theme
    const isDark = document.documentElement.classList.contains("dark");
    const isMidnight = document.documentElement.classList.contains("midnight");

    if (isMidnight) {
      ctx.fillStyle = "#0f172a"; // slate-900
    } else if (isDark) {
      ctx.fillStyle = "#1f2937"; // gray-800
    } else {
      ctx.fillStyle = "#ffffff";
    }
    ctx.fillRect(0, 0, width, height);

    if (!chartData.datasets || chartData.datasets.length === 0) return;

    const dataset = chartData.datasets[0];
    const total = dataset.data.reduce((sum, value) => sum + value, 0);

    if (total === 0) return;

    // Chart area - position pie with adequate margins for labels
    const chartWidth = width * 0.6; // Use 60% of width for the pie
    const legendWidth = width * 0.4; // Use 40% of width for the legend
    const leftMargin = 60; // Add margin from left edge
    const topMargin = 80; // Add margin from top edge for labels
    const bottomMargin = 60; // Add margin from bottom edge for labels
    const centerX = leftMargin + (chartWidth - leftMargin) / 2;
    const centerY = topMargin + (height - topMargin - bottomMargin) / 2;
    const availableHeight = height - topMargin - bottomMargin;
    const availableWidth = chartWidth - leftMargin - 60;
    const radius = Math.min(availableWidth, availableHeight) / 2;

    let currentAngle = -Math.PI / 2; // Start from top

    // Draw pie slices
    dataset.data.forEach((value, index) => {
      const sliceAngle = (value / total) * 2 * Math.PI;
      const endAngle = currentAngle + sliceAngle;

      // Enhanced slice rendering with better visual quality
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = Array.isArray(dataset.backgroundColor)
        ? dataset.backgroundColor[index % dataset.backgroundColor.length]
        : dataset.backgroundColor || "#3b82f6";
      ctx.fill();

      // Enhanced slice border with theme-aware color and better quality
      if (isMidnight) {
        ctx.strokeStyle = "#0f172a"; // slate-900
      } else if (isDark) {
        ctx.strokeStyle = "#1f2937"; // gray-800
      } else {
        ctx.strokeStyle = "#ffffff";
      }
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      currentAngle = endAngle;
    });

    // Draw labels outside with connecting lines (for values/percentages)
    if (chartConfig.showPercentages || chartConfig.showValues) {
      currentAngle = -Math.PI / 2; // Reset angle for label drawing

      dataset.data.forEach((value, index) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        const labelAngle = currentAngle + sliceAngle / 2;

        // Points for the connecting line
        const innerRadius = radius * 0.6; // Start from inside the slice
        const outerRadius = radius + 40; // End point for the line

        const innerX = centerX + Math.cos(labelAngle) * innerRadius;
        const innerY = centerY + Math.sin(labelAngle) * innerRadius;
        const outerX = centerX + Math.cos(labelAngle) * outerRadius;
        const outerY = centerY + Math.sin(labelAngle) * outerRadius;

        // Determine text alignment based on angle
        const isRightSide =
          labelAngle > -Math.PI / 2 && labelAngle < Math.PI / 2;
        ctx.textAlign = isRightSide ? "left" : "right";

        // Draw connecting line
        ctx.beginPath();
        ctx.moveTo(innerX, innerY);
        ctx.lineTo(outerX, outerY);

        // Draw horizontal leader line
        const leaderLength = 15;
        const leaderEndX =
          outerX + (isRightSide ? leaderLength : -leaderLength);
        ctx.lineTo(leaderEndX, outerY);

        ctx.strokeStyle = isMidnight
          ? "#64748b"
          : isDark
          ? "#9ca3af"
          : "#6b7280";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw small dot at the end of the line from pie
        ctx.beginPath();
        ctx.arc(innerX, innerY, 2, 0, 2 * Math.PI);
        ctx.fillStyle = Array.isArray(dataset.backgroundColor)
          ? dataset.backgroundColor[index % dataset.backgroundColor.length]
          : dataset.backgroundColor || "#3b82f6";
        ctx.fill();

        // Prepare label text
        let labelText = "";
        let subLabelText = "";

        if (chartConfig.showPercentages) {
          const percentage = ((value / total) * 100).toFixed(1);
          labelText = `${percentage}%`;
        }
        if (chartConfig.showValues) {
          if (chartConfig.showPercentages) {
            subLabelText = `(${value})`;
          } else {
            labelText = value.toString();
          }
        }

        // Calculate text dimensions for background boxes
        ctx.font =
          'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const mainTextMetrics = ctx.measureText(labelText);
        const mainTextWidth = mainTextMetrics.width;
        const mainTextHeight = 16;

        let subTextWidth = 0;
        let subTextHeight = 0;
        if (subLabelText) {
          ctx.font =
            '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const subTextMetrics = ctx.measureText(subLabelText);
          subTextWidth = subTextMetrics.width;
          subTextHeight = 14;
        }

        // Calculate background box dimensions
        const padding = 6;
        const maxTextWidth = Math.max(mainTextWidth, subTextWidth);
        const totalTextHeight = subLabelText
          ? mainTextHeight + subTextHeight + 2
          : mainTextHeight;

        const boxWidth = maxTextWidth + padding * 2;
        const boxHeight = totalTextHeight + padding * 2;

        // Position background box
        const textStartX = leaderEndX + (isRightSide ? 8 : -8);
        const boxX = isRightSide
          ? textStartX - padding
          : textStartX - boxWidth + padding;
        const boxY = outerY - boxHeight / 2;

        // Draw background box with shadow
        ctx.save();

        // Draw shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
        ctx.beginPath();
        ctx.roundRect(boxX + 2, boxY + 2, boxWidth, boxHeight, 4);
        ctx.fill();

        // Draw main background with distinct colors
        if (isMidnight) {
          ctx.fillStyle = "rgba(51, 65, 85, 0.95)"; // slate-700
        } else if (isDark) {
          ctx.fillStyle = "rgba(55, 65, 81, 0.95)"; // gray-700
        } else {
          ctx.fillStyle = "rgba(249, 250, 251, 0.95)"; // gray-50
        }
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
        ctx.fill();

        // Draw border with complementary colors
        if (isMidnight) {
          ctx.strokeStyle = "rgba(148, 163, 184, 0.4)"; // slate-400
        } else if (isDark) {
          ctx.strokeStyle = "rgba(156, 163, 175, 0.4)"; // gray-400
        } else {
          ctx.strokeStyle = "rgba(156, 163, 175, 0.6)"; // gray-400
        }
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();

        // Draw main label text
        ctx.fillStyle = isMidnight ? "#e2e8f0" : isDark ? "#f3f4f6" : "#1f2937";
        ctx.font =
          'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textBaseline = "middle";
        const mainTextY = subLabelText ? outerY - 6 : outerY;
        ctx.fillText(labelText, textStartX, mainTextY);

        // Draw sub-label if exists
        if (subLabelText) {
          ctx.font =
            '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillStyle = isMidnight
            ? "#94a3b8"
            : isDark
            ? "#d1d5db"
            : "#6b7280";
          ctx.fillText(subLabelText, textStartX, outerY + 8);
        }

        currentAngle += sliceAngle;
      });
    }

    // Draw legend on the right side (segment names only)
    if (chartConfig.showLegend) {
      const legendStartX = chartWidth + 150; // Start legend after pie chart area with larger gap
      const legendStartY = 40;
      const legendItemHeight = 20;
      const legendItemSpacing = 8;

      dataset.data.forEach((value, index) => {
        const itemY =
          legendStartY + index * (legendItemHeight + legendItemSpacing);

        // Draw color indicator
        const colorBoxSize = 12;
        const colorBoxX = legendStartX;
        const colorBoxY = itemY + legendItemHeight / 2 - colorBoxSize / 2;

        ctx.fillStyle = Array.isArray(dataset.backgroundColor)
          ? dataset.backgroundColor[index % dataset.backgroundColor.length]
          : dataset.backgroundColor || "#3b82f6";

        ctx.beginPath();
        ctx.roundRect(colorBoxX, colorBoxY, colorBoxSize, colorBoxSize, 2);
        ctx.fill();

        // Draw border around color indicator
        ctx.strokeStyle = isMidnight
          ? "#475569"
          : isDark
          ? "#6b7280"
          : "#d1d5db";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw label text
        const textX = colorBoxX + colorBoxSize + 8;
        const labelText = chartData.labels[index] || `Segment ${index + 1}`;

        ctx.fillStyle = isMidnight ? "#e2e8f0" : isDark ? "#f3f4f6" : "#1f2937";
        ctx.font =
          '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, textX, itemY + legendItemHeight / 2);
      });
    }
  };

  // Sync local state with block properties when they change
  useEffect(() => {
    if (block.properties?.data) {
      setChartData(block.properties.data);
    }
    if (block.properties?.config) {
      const config = { ...block.properties.config };
      // Handle backward compatibility: convert old height to heightSize
      if (config.height && !config.heightSize) {
        config.heightSize = getHeightKey(config.height);
        delete config.height;
      }
      setChartConfig(config);
    }
  }, [block.properties?.data, block.properties?.config]);

  useEffect(() => {
    // Only add delay if editing, otherwise draw immediately
    if (isEditing) {
      const timer = setTimeout(() => {
        drawChart();
      }, 10);
      return () => clearTimeout(timer);
    } else {
      drawChart();
    }
  }, [chartData, chartConfig, isEditing]);

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (heightDropdownOpen) {
        const heightDropdown = event.target.closest('[data-dropdown="height"]');
        if (!heightDropdown) {
          setHeightDropdownOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [heightDropdownOpen]);

  // Monitor theme changes and redraw chart accordingly
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      const isMidnight =
        document.documentElement.classList.contains("midnight");
      const newTheme = isMidnight ? "midnight" : isDark ? "dark" : "light";

      if (newTheme !== theme) {
        setTheme(newTheme);
        // Redraw chart with new theme
        requestAnimationFrame(() => {
          drawChart();
        });
      }
    };

    // Create a MutationObserver to watch for class changes on html element
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, [theme]);

  // Force redraw when canvas ref changes and add resize observer
  useEffect(() => {
    if (canvasRef.current) {
      drawChart();

      // Add resize observer for responsive high-quality rendering
      const resizeObserver = new ResizeObserver(() => {
        drawChart();
      });

      resizeObserver.observe(canvasRef.current);

      // Listen for editor becoming visible (e.g., after closing diff view)
      const handleEditorVisible = () => {
        requestAnimationFrame(() => {
          drawChart();
        });
      };

      window.addEventListener("editor-visible", handleEditorVisible);

      return () => {
        resizeObserver.disconnect();
        window.removeEventListener("editor-visible", handleEditorVisible);
      };
    }
  }, [canvasRef.current]);

  const handleSaveData = () => {
    // Apply temp changes to actual chart data
    setChartData(tempChartData);
    setChartConfig(tempChartConfig);

    onChange(block.id, {
      properties: {
        ...block.properties,
        data: tempChartData,
        config: tempChartConfig,
      },
    });
    setIsEditing(false);
    // Force redraw after save
    setTimeout(() => {
      drawChart();
    }, 50);
  };

  const handleCancel = () => {
    // Discard temp changes, reset to saved data
    setTempChartData(chartData);
    setTempChartConfig(chartConfig);
    setIsEditing(false);
    // Immediately redraw chart to prevent delay
    requestAnimationFrame(() => {
      drawChart();
    });
  };

  // When entering edit mode, initialize temp state with current data
  const handleStartEditing = () => {
    setTempChartData(JSON.parse(JSON.stringify(chartData)));
    setTempChartConfig(JSON.parse(JSON.stringify(chartConfig)));
    setIsEditing(true);
  };

  const addDataPoint = () => {
    const newData = { ...tempChartData };
    newData.labels.push(`Segment ${newData.labels.length + 1}`);
    newData.datasets[0].data.push(Math.floor(Math.random() * 50) + 1);
    // Add a new color to the color array
    const colors = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#f97316",
      "#84cc16",
    ];
    const newColor = colors[newData.labels.length % colors.length];
    if (Array.isArray(newData.datasets[0].backgroundColor)) {
      newData.datasets[0].backgroundColor.push(newColor);
    }
    setTempChartData(newData);
  };

  const updateSegmentColor = (segmentIndex, newColor) => {
    const newData = { ...tempChartData };
    if (Array.isArray(newData.datasets[0].backgroundColor)) {
      newData.datasets[0].backgroundColor[segmentIndex] = newColor;
    }
    setTempChartData(newData);
  };

  const removeDataPoint = (index) => {
    if (tempChartData.labels.length <= 1) return; // Don't allow removing the last point

    const newData = {
      ...tempChartData,
      labels: tempChartData.labels.filter((_, i) => i !== index),
      datasets: tempChartData.datasets.map((dataset) => ({
        ...dataset,
        data: dataset.data.filter((_, i) => i !== index),
        backgroundColor: Array.isArray(dataset.backgroundColor)
          ? dataset.backgroundColor.filter((_, i) => i !== index)
          : dataset.backgroundColor,
      })),
    };
    setTempChartData(newData);
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = `${chartConfig.title.replace(/\s+/g, "_")}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  if (isEditing) {
    return (
      <div
        data-block-selection-disabled="true"
        className="border border-gray-200/30 dark:border-gray-700/50 midnight:border-gray-600/50 rounded-lg bg-white/95 dark:bg-gray-900/95 midnight:bg-slate-900/95 backdrop-blur-xl shadow-lg"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100/80 dark:border-gray-800/80 midnight:border-gray-700/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 midnight:bg-indigo-950/50">
              <PieChart className="w-4 h-4 text-blue-600 dark:text-blue-400 midnight:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
                Pie Chart Editor
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                Customize data and styling
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 rounded text-sm border border-gray-200 dark:border-gray-700 midnight:border-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveData}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 midnight:bg-indigo-600 midnight:hover:bg-indigo-700 text-white rounded text-sm"
            >
              Save Changes
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Chart Settings */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                Configuration
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                  Chart Title
                </label>
                <input
                  type="text"
                  value={tempChartConfig.title}
                  onChange={(e) =>
                    setTempChartConfig((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-800/50 text-gray-900 dark:text-white midnight:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400"
                  placeholder="Enter chart title..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                  Height
                </label>
                <div className="relative" data-dropdown="height">
                  <button
                    type="button"
                    onClick={() => setHeightDropdownOpen(!heightDropdownOpen)}
                    className="w-full px-3 py-2 pr-8 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-800/50 text-gray-900 dark:text-white midnight:text-slate-100 focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 text-left"
                  >
                    {
                      CHART_HEIGHT_OPTIONS[tempChartConfig.heightSize || "medium"]
                        .label
                    }
                  </button>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        heightDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                  {heightDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded shadow-lg z-[100] backdrop-blur-sm">
                      {Object.entries(CHART_HEIGHT_OPTIONS).map(
                        ([key, option]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setTempChartConfig((prev) => ({
                                ...prev,
                                heightSize: key,
                              }));
                              setHeightDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 ${
                              (tempChartConfig.heightSize || "medium") === key
                                ? "bg-blue-50 dark:bg-blue-950/50 midnight:bg-indigo-950/50 text-blue-600 dark:text-blue-400 midnight:text-indigo-400"
                                : "text-gray-900 dark:text-white midnight:text-slate-100"
                            }`}
                          >
                            {option.label} ({option.value}px)
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Display Options */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                Display Options
              </h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center justify-between p-2.5 bg-gray-50/50 dark:bg-gray-800/30 midnight:bg-slate-800/30 rounded-lg border border-gray-100/50 dark:border-gray-700/30 midnight:border-gray-600/30">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-blue-100/80 dark:bg-blue-900/30 midnight:bg-indigo-900/30">
                    <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 midnight:bg-indigo-400 rounded-full"></div>
                  </div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                    Percentage Value
                  </span>
                </div>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempChartConfig.showPercentages}
                    onChange={(e) =>
                      setTempChartConfig((prev) => ({
                        ...prev,
                        showPercentages: e.target.checked,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-gray-50/50 dark:bg-gray-800/30 midnight:bg-slate-800/30 rounded-lg border border-gray-100/50 dark:border-gray-700/30 midnight:border-gray-600/30">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-emerald-100/80 dark:bg-emerald-900/30 midnight:bg-green-900/30">
                    <div className="w-2 h-2 bg-emerald-500 dark:bg-emerald-400 midnight:bg-green-400 rounded"></div>
                  </div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                    Numerical Value
                  </span>
                </div>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempChartConfig.showValues}
                    onChange={(e) =>
                      setTempChartConfig((prev) => ({
                        ...prev,
                        showValues: e.target.checked,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-gray-50/50 dark:bg-gray-800/30 midnight:bg-slate-800/30 rounded-lg border border-gray-100/50 dark:border-gray-700/30 midnight:border-gray-600/30">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-purple-100/80 dark:bg-purple-900/30 midnight:bg-violet-900/30">
                    <div className="w-2 h-2 bg-purple-500 dark:bg-purple-400 midnight:bg-violet-400 rounded"></div>
                  </div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                    Legend
                  </span>
                </div>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempChartConfig.showLegend}
                    onChange={(e) =>
                      setTempChartConfig((prev) => ({
                        ...prev,
                        showLegend: e.target.checked,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-purple-500"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Data Segments Management */}
          <div className="space-y-3 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                  Data Segments
                </h4>
                <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100/80 dark:bg-purple-900/30 midnight:bg-violet-900/30 text-purple-700 dark:text-purple-300 midnight:text-violet-300 rounded">
                  {tempChartData.labels.length}
                </span>
              </div>
              <button
                onClick={addDataPoint}
                className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 midnight:bg-violet-600 midnight:hover:bg-violet-700 text-white rounded text-sm flex items-center gap-1 font-medium"
              >
                <Plus className="w-3 h-3" />
                Add Segment
              </button>
            </div>
            <div
              className="space-y-2.5 max-h-56 overflow-y-auto pr-1"
              style={{ overflowX: "visible", overflowY: "auto" }}
            >
              {tempChartData.labels.map((label, index) => (
                <div
                  key={index}
                  className={`bg-white/60 dark:bg-gray-800/40 midnight:bg-slate-800/40 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/40 midnight:border-gray-600/40 rounded-lg p-3 hover:bg-white/70 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50 ${
                    activeColorPalette === index ? "relative z-40" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative z-30">
                      <button
                        onClick={() =>
                          setActiveColorPalette(
                            activeColorPalette === index ? null : index
                          )
                        }
                        className="w-8 h-8 border border-gray-300 dark:border-gray-600 midnight:border-gray-500 rounded cursor-pointer"
                        style={{
                          backgroundColor:
                            tempChartData.datasets[0].backgroundColor[
                              index %
                                tempChartData.datasets[0].backgroundColor.length
                            ],
                        }}
                        title="Choose segment color"
                      />
                      {activeColorPalette === index && (
                        <ColorPicker
                          selectedColor={
                            tempChartData.datasets[0].backgroundColor[
                              activeColorPalette %
                                tempChartData.datasets[0].backgroundColor.length
                            ]
                          }
                          onColorSelect={(color) =>
                            updateSegmentColor(activeColorPalette, color)
                          }
                          onClose={() => setActiveColorPalette(null)}
                        />
                      )}
                    </div>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => {
                        const newData = { ...tempChartData };
                        newData.labels[index] = e.target.value;
                        setTempChartData(newData);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-800/50 text-gray-900 dark:text-white midnight:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-purple-500/30 focus:border-purple-400"
                      placeholder="Enter segment name..."
                    />
                    <button
                      onClick={() => removeDataPoint(index)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 rounded"
                      title="Remove this segment"
                      disabled={tempChartData.labels.length <= 1}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            tempChartData.datasets[0].backgroundColor[
                              index %
                                tempChartData.datasets[0].backgroundColor.length
                            ],
                        }}
                      ></div>
                      <span>Value</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={tempChartData.datasets[0].data[index]}
                        onChange={(e) => {
                          const newData = { ...tempChartData };
                          newData.datasets[0].data[index] =
                            parseFloat(e.target.value) || 0;
                          setTempChartData(newData);
                        }}
                        className="w-full px-3 py-2 pr-8 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-white/70 dark:bg-gray-700/50 midnight:bg-slate-700/50 text-gray-900 dark:text-white midnight:text-slate-100 focus:ring-1 focus:ring-purple-500/30 focus:border-purple-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0"
                        min="0"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                        <button
                          type="button"
                          onClick={() => {
                            const newData = { ...tempChartData };
                            newData.datasets[0].data[index] =
                              (newData.datasets[0].data[index] || 0) + 1;
                            setTempChartData(newData);
                          }}
                          className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newData = { ...tempChartData };
                            newData.datasets[0].data[index] = Math.max(
                              0,
                              (newData.datasets[0].data[index] || 0) - 1
                            );
                            setChartData(newData);
                          }}
                          className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800 midnight:bg-slate-800 select-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2 text-gray-900 dark:text-white midnight:text-slate-100">
          <PieChart className="w-4 h-4" />
          {chartConfig.title}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={handleExport}
            className="p-1.5 text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-slate-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-700"
            title="Export as PNG"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleStartEditing}
            className="p-1.5 text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-slate-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-700"
            title="Edit chart"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full border border-gray-200 dark:border-gray-600 midnight:border-slate-600 rounded"
          style={{
            maxHeight: `${getHeightValue(
              chartConfig.heightSize || "medium"
            )}px`,
            height: `${getHeightValue(chartConfig.heightSize || "medium")}px`,
            imageRendering: "auto",
          }}
        />
      </div>
    </div>
  );
};

export default PieChartBlock;
