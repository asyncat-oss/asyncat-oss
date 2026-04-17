import { useState, useEffect, useRef } from "react";
import {
  BarChart3,
  Edit3,
  Download,
  X,
  Plus,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  CHART_HEIGHT_OPTIONS,
  getHeightValue,
  getHeightKey,
} from "./chartConstants";

// Predefined colors for datasets
const CHART_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // yellow
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#ec4899", // pink
  "#6b7280", // gray
  "#f43f5e", // rose
  "#8b5a2b", // brown
  "#1e293b", // slate
  "#0ea5e9", // sky
  "#22c55e", // emerald
  "#a855f7", // violet
];

// Advanced Color Picker Component with Spectrum
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
    // Handle null, undefined, or non-string values
    if (!hex || typeof hex !== "string") {
      return { r: 0, g: 0, b: 0 };
    }

    const cleanHex = hex.replace("#", "");
    if (cleanHex.length === 6) {
      const r = parseInt(cleanHex.substring(0, 2), 16);
      const g = parseInt(cleanHex.substring(2, 4), 16);
      const b = parseInt(cleanHex.substring(4, 6), 16);
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
    <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg shadow-xl z-20 backdrop-blur-sm w-80">
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

      <style>
        {`.hue-slider::-webkit-slider-thumb {
          appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3),
            inset 0 0 0 1px rgba(0, 0, 0, 0.2);
        }
        .hue-slider::-moz-range-thumb {
          height: 14px;
          width: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3),
            inset 0 0 0 1px rgba(0, 0, 0, 0.2);
        }`}
      </style>
    </div>
  );
};

const BarChartBlock = ({ block, onChange, contentRef, commonProps }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeColorPalette, setActiveColorPalette] = useState(null);
  const [activeDataPointColor, setActiveDataPointColor] = useState(null); // { datasetIndex, pointIndex }
  const [orientationDropdownOpen, setOrientationDropdownOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const isMidnight = document.documentElement.classList.contains("midnight");
    return isMidnight ? "midnight" : isDark ? "dark" : "light";
  });

  // Saved data (shown in the chart)
  const [chartData, setChartData] = useState(
    block.properties?.data || {
      labels: ["01", "02", "03", "04"],
      datasets: [
        {
          label: "Dataset One",
          data: [65, 59, 80, 81],
          backgroundColor: "#3b82f6",
          dataPointColors: [], // Individual colors for each datapoint
        },
        {
          label: "Dataset Two",
          data: [45, 78, 65, 92],
          backgroundColor: "#ef4444",
          dataPointColors: [],
        },
        {
          label: "Dataset Three",
          data: [35, 48, 55, 71],
          backgroundColor: "#10b981",
          dataPointColors: [],
        },
      ],
    }
  );
  const [chartConfig, setChartConfig] = useState(
    block.properties?.config || {
      title: "Bar Chart",
      showGrid: true,
      showLegend: true,
      orientation: "vertical", // vertical or horizontal
      heightSize: "medium",
    }
  );

  // Temporary editing state (only applied on save)
  const [tempChartData, setTempChartData] = useState(chartData);
  const [tempChartConfig, setTempChartConfig] = useState(chartConfig);

  const [heightDropdownOpen, setHeightDropdownOpen] = useState(false);
  const canvasRef = useRef(null);

  // High-quality chart drawing function with DPI scaling
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

    // Set up chart area
    const leftPadding = 60;
    const rightPadding = 40;
    const topPadding = 40;
    const bottomPadding = 40;
    const chartWidth = width - leftPadding - rightPadding;
    const chartHeight = height - topPadding - bottomPadding;

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

    // Draw grid if enabled
    if (chartConfig.showGrid) {
      if (isMidnight) {
        ctx.strokeStyle = "#334155"; // slate-700
      } else if (isDark) {
        ctx.strokeStyle = "#374151"; // gray-700
      } else {
        ctx.strokeStyle = "#e5e7eb"; // gray-200
      }
      ctx.lineWidth = 1;

      if (chartConfig.orientation === "vertical") {
        // Vertical bars - horizontal grid lines
        for (let i = 0; i <= 5; i++) {
          const y = topPadding + (i * chartHeight) / 5;
          ctx.beginPath();
          ctx.moveTo(leftPadding, y);
          ctx.lineTo(width - rightPadding, y);
          ctx.stroke();
        }
      } else {
        // Horizontal bars - vertical grid lines
        for (let i = 0; i <= 5; i++) {
          const x = leftPadding + (i * chartWidth) / 5;
          ctx.beginPath();
          ctx.moveTo(x, topPadding);
          ctx.lineTo(x, height - bottomPadding);
          ctx.stroke();
        }
      }
    }

    // Draw bars
    if (chartData.datasets && chartData.datasets.length > 0) {
      // Calculate max value across all datasets
      const allValues = chartData.datasets.flatMap((dataset) => dataset.data);
      const maxValue = Math.max(...allValues, 1);
      const datasetCount = chartData.datasets.length;
      const labelCount = chartData.labels.length;

      if (chartConfig.orientation === "vertical") {
        const groupWidth = chartWidth / labelCount;
        const barWidth = (groupWidth * 0.8) / datasetCount;
        const groupSpacing = groupWidth * 0.2;

        chartData.datasets.forEach((dataset, datasetIndex) => {
          dataset.data.forEach((value, labelIndex) => {
            const stepSize = Math.ceil(maxValue / 4) || 1;
            const topValue = stepSize * 5;
            const barHeight = (value / topValue) * chartHeight;
            const groupX = labelIndex * groupWidth;
            const x =
              leftPadding + groupX + groupSpacing / 2 + datasetIndex * barWidth;
            const y = height - bottomPadding - barHeight;

            // Use individual datapoint color if available, otherwise use dataset color
            ctx.fillStyle =
              dataset.dataPointColors?.[labelIndex] ||
              dataset.backgroundColor ||
              CHART_COLORS[datasetIndex % CHART_COLORS.length];
            ctx.fillRect(x, y, barWidth, barHeight);
          });
        });

        // Y-axis value scale for vertical bars
        if (isMidnight) {
          ctx.fillStyle = "#cbd5e1"; // slate-300
        } else if (isDark) {
          ctx.fillStyle = "#d1d5db"; // gray-300
        } else {
          ctx.fillStyle = "#374151"; // gray-700
        }
        ctx.font =
          "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";

        // Calculate nice round numbers for y-axis
        const stepSize = Math.ceil(maxValue / 4) || 1;
        const topValue = stepSize * 5;
        for (let i = 0; i <= 5; i++) {
          const value = Math.round(i * stepSize);
          const y = height - bottomPadding - (i * chartHeight) / 5;

          ctx.fillText(value.toString(), leftPadding - 8, y);
        }

        // X-axis labels with theme-aware colors
        ctx.font =
          "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        chartData.labels.forEach((label, index) => {
          const x = leftPadding + index * groupWidth + groupWidth / 2;
          ctx.fillText(label, x, height - 10);
        });
      } else {
        // Horizontal bars
        const groupHeight = chartHeight / labelCount;
        const barHeight = (groupHeight * 0.8) / datasetCount;
        const groupSpacing = groupHeight * 0.2;

        chartData.datasets.forEach((dataset, datasetIndex) => {
          dataset.data.forEach((value, labelIndex) => {
            const stepSize = Math.ceil(maxValue / 4) || 1;
            const topValue = stepSize * 5;
            const barWidth = (value / topValue) * chartWidth;
            const x = leftPadding;
            const groupY = labelIndex * groupHeight;
            const y =
              topPadding + groupY + groupSpacing / 2 + datasetIndex * barHeight;

            // Use individual datapoint color if available, otherwise use dataset color
            ctx.fillStyle =
              dataset.dataPointColors?.[labelIndex] ||
              dataset.backgroundColor ||
              CHART_COLORS[datasetIndex % CHART_COLORS.length];
            ctx.fillRect(x, y, barWidth, barHeight);
          });
        });

        // X-axis value scale for horizontal bars
        if (isMidnight) {
          ctx.fillStyle = "#cbd5e1"; // slate-300
        } else if (isDark) {
          ctx.fillStyle = "#d1d5db"; // gray-300
        } else {
          ctx.fillStyle = "#374151"; // gray-700
        }
        ctx.font =
          "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";

        // Calculate nice round numbers for x-axis
        const stepSize = Math.ceil(maxValue / 4) || 1;
        const topValue = stepSize * 5;
        for (let i = 0; i <= 5; i++) {
          const value = Math.round(i * stepSize);
          const x = leftPadding + (i * chartWidth) / 5;

          ctx.fillText(value.toString(), x, height - bottomPadding + 15);
        }

        // Y-axis labels with theme-aware colors
        ctx.font =
          "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        chartData.labels.forEach((label, index) => {
          const y = topPadding + index * groupHeight + groupHeight / 2;
          ctx.fillText(label, leftPadding - 10, y);
        });
      }

      // Draw legend for multiple datasets
      if (chartData.datasets.length > 1 && chartConfig.showLegend) {
        const legendY = 15;
        const legendItemWidth = 120;
        const legendStartX =
          (width - chartData.datasets.length * legendItemWidth) / 2;

        chartData.datasets.forEach((dataset, index) => {
          const x = legendStartX + index * legendItemWidth;

          // Draw legend color box
          ctx.fillStyle =
            dataset.backgroundColor ||
            CHART_COLORS[index % CHART_COLORS.length];
          ctx.fillRect(x, legendY, 12, 12);

          // Draw legend text
          ctx.fillStyle =
            theme === "dark" || theme === "midnight" ? "#e5e7eb" : "#374151";
          ctx.font =
            "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(dataset.label, x + 18, legendY + 8);
        });
      }
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (orientationDropdownOpen) {
        const orientationDropdown = event.target.closest(
          '[data-dropdown="orientation"]'
        );
        if (!orientationDropdown) {
          setOrientationDropdownOpen(false);
        }
      }
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
  }, [orientationDropdownOpen, heightDropdownOpen]);

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
    const newData = {
      ...tempChartData,
      labels: [...tempChartData.labels, `Item ${tempChartData.labels.length + 1}`],
      datasets: tempChartData.datasets.map((dataset) => ({
        ...dataset,
        data: [...dataset.data, Math.floor(Math.random() * 100)],
        // Don't add a color to dataPointColors, let it inherit from backgroundColor
      })),
    };
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
        dataPointColors: (dataset.dataPointColors || []).filter((_, i) => i !== index),
      })),
    };
    setTempChartData(newData);
  };

  const updateDatasetColor = (datasetIndex, newColor) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, i) =>
        i === datasetIndex ? { ...dataset, backgroundColor: newColor } : dataset
      ),
    };
    setTempChartData(newData);
  };

  const updateDataPointColor = (datasetIndex, pointIndex, newColor) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, i) => {
        if (i === datasetIndex) {
          const dataPointColors = [...(dataset.dataPointColors || [])];
          dataPointColors[pointIndex] = newColor;
          return { ...dataset, dataPointColors };
        }
        return dataset;
      }),
    };
    setTempChartData(newData);
  };

  const addDataset = () => {
    const newDataset = {
      label: `Series ${tempChartData.datasets.length + 1}`,
      data: tempChartData.labels.map(() => Math.floor(Math.random() * 100)),
      backgroundColor:
        CHART_COLORS[tempChartData.datasets.length % CHART_COLORS.length],
      dataPointColors: [],
    };

    const newData = {
      ...tempChartData,
      datasets: [...tempChartData.datasets, newDataset],
    };
    setTempChartData(newData);
  };

  const removeDataset = (datasetIndex) => {
    if (tempChartData.datasets.length <= 1) return; // Don't allow removing the last dataset

    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.filter((_, i) => i !== datasetIndex),
    };
    setTempChartData(newData);
  };

  const updateDatasetLabel = (datasetIndex, newLabel) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, i) =>
        i === datasetIndex ? { ...dataset, label: newLabel } : dataset
      ),
    };
    setTempChartData(newData);
  };

  const updateDataPointValue = (datasetIndex, pointIndex, newValue) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, dsIndex) =>
        dsIndex === datasetIndex
          ? {
              ...dataset,
              data: dataset.data.map((value, i) =>
                i === pointIndex ? parseFloat(newValue) || 0 : value
              ),
            }
          : dataset
      ),
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
              <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400 midnight:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
                Bar Chart Editor
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
                  Chart Size
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
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                Orientation
              </label>
              <div className="relative" data-dropdown="orientation">
                <button
                  type="button"
                  onClick={() =>
                    setOrientationDropdownOpen(!orientationDropdownOpen)
                  }
                  className="w-full px-3 py-2 pr-8 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-800/50 text-gray-900 dark:text-white midnight:text-slate-100 focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 text-left"
                >
                  {tempChartConfig.orientation === "vertical"
                    ? "Vertical"
                    : "Horizontal"}
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform ${
                      orientationDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
                {orientationDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded shadow-lg z-[100] backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setTempChartConfig((prev) => ({
                          ...prev,
                          orientation: "vertical",
                        }));
                        setOrientationDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 ${
                        tempChartConfig.orientation === "vertical"
                          ? "bg-blue-50 dark:bg-blue-950/50 midnight:bg-indigo-950/50 text-blue-600 dark:text-blue-400 midnight:text-indigo-400"
                          : "text-gray-900 dark:text-white midnight:text-slate-100"
                      }`}
                    >
                      Vertical
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempChartConfig((prev) => ({
                          ...prev,
                          orientation: "horizontal",
                        }));
                        setOrientationDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-slate-700 ${
                        tempChartConfig.orientation === "horizontal"
                          ? "bg-blue-50 dark:bg-blue-950/50 midnight:bg-indigo-950/50 text-blue-600 dark:text-blue-400 midnight:text-indigo-400"
                          : "text-gray-900 dark:text-white midnight:text-slate-100"
                      }`}
                    >
                      Horizontal
                    </button>
                  </div>
                )}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-2.5 bg-gray-50/50 dark:bg-gray-800/30 midnight:bg-slate-800/30 rounded-lg border border-gray-100/50 dark:border-gray-700/30 midnight:border-gray-600/30">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-blue-100/80 dark:bg-blue-900/30 midnight:bg-indigo-900/30">
                    <div className="w-2.5 h-2.5 border border-blue-500 dark:border-blue-400 midnight:border-indigo-400 rounded-sm opacity-70"></div>
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                    Grid
                  </span>
                </div>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempChartConfig.showGrid}
                    onChange={(e) =>
                      setTempChartConfig((prev) => ({
                        ...prev,
                        showGrid: e.target.checked,
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
                    <div className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 midnight:bg-green-400 rounded-full"></div>
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
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
                  <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Data Series Management */}
          <div className="space-y-4">
            {/* Series List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                    Data Series
                  </h4>
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100/80 dark:bg-purple-900/30 midnight:bg-violet-900/30 text-purple-700 dark:text-purple-300 midnight:text-violet-300 rounded">
                    {tempChartData.datasets.length}
                  </span>
                </div>
                <button
                  onClick={addDataset}
                  className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 midnight:bg-violet-600 midnight:hover:bg-violet-700 text-white rounded text-sm flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  Add Series
                </button>
              </div>

              {/* Dataset Management */}
              <div
                className="space-y-2.5 max-h-56 overflow-y-auto pr-1"
                style={{ overflowX: "visible", overflowY: "auto" }}
              >
                {tempChartData.datasets.map((dataset, datasetIndex) => (
                  <div
                    key={datasetIndex}
                    className={`bg-white/60 dark:bg-gray-800/40 midnight:bg-slate-800/40 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/40 midnight:border-gray-600/40 rounded-lg p-3 hover:bg-white/70 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50 ${
                      activeColorPalette === datasetIndex ||
                      activeDataPointColor?.datasetIndex === datasetIndex
                        ? "relative z-40"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="relative z-30">
                        <button
                          onClick={() =>
                            setActiveColorPalette(
                              activeColorPalette === datasetIndex
                                ? null
                                : datasetIndex
                            )
                          }
                          className="w-8 h-8 border border-gray-300 dark:border-gray-600 midnight:border-gray-500 rounded cursor-pointer"
                          style={{
                            backgroundColor:
                              dataset.backgroundColor ||
                              CHART_COLORS[datasetIndex % CHART_COLORS.length],
                          }}
                          title="Choose series color"
                        />
                        {activeColorPalette === datasetIndex && (
                          <ColorPicker
                            selectedColor={
                              dataset.backgroundColor ||
                              CHART_COLORS[datasetIndex % CHART_COLORS.length]
                            }
                            onColorSelect={(color) =>
                              updateDatasetColor(datasetIndex, color)
                            }
                            onClose={() => setActiveColorPalette(null)}
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        value={dataset.label}
                        onChange={(e) =>
                          updateDatasetLabel(datasetIndex, e.target.value)
                        }
                        className="flex-1 px-3 py-2 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-800/50 text-gray-900 dark:text-white midnight:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-purple-500/30 focus:border-purple-400"
                        placeholder="Enter series name..."
                      />
                      <button
                        onClick={() => removeDataset(datasetIndex)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 rounded"
                        title="Remove this series"
                        disabled={tempChartData.datasets.length <= 1}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                        <div
                          className="w-2.5 h-0.5 rounded-full"
                          style={{
                            backgroundColor:
                              dataset.backgroundColor ||
                              CHART_COLORS[datasetIndex % CHART_COLORS.length],
                          }}
                        ></div>
                        <span>Data Points</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {tempChartData.labels.map((label, pointIndex) => (
                          <div key={pointIndex} className="space-y-1">
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400 truncate block">
                              {label}
                            </label>
                            <div className="flex gap-1">
                              <div
                                className={`relative ${
                                  activeDataPointColor?.datasetIndex === datasetIndex &&
                                  activeDataPointColor?.pointIndex === pointIndex
                                    ? "z-50"
                                    : "z-10"
                                }`}
                              >
                                <button
                                  onClick={() =>
                                    setActiveDataPointColor(
                                      activeDataPointColor?.datasetIndex === datasetIndex &&
                                      activeDataPointColor?.pointIndex === pointIndex
                                        ? null
                                        : { datasetIndex, pointIndex }
                                    )
                                  }
                                  className="w-6 h-9 border border-gray-300 dark:border-gray-600 midnight:border-gray-500 rounded cursor-pointer flex-shrink-0"
                                  style={{
                                    backgroundColor:
                                      dataset.dataPointColors?.[pointIndex] ||
                                      dataset.backgroundColor ||
                                      CHART_COLORS[datasetIndex % CHART_COLORS.length],
                                  }}
                                  title="Choose datapoint color"
                                />
                                {activeDataPointColor?.datasetIndex === datasetIndex &&
                                  activeDataPointColor?.pointIndex === pointIndex && (
                                    <ColorPicker
                                      selectedColor={
                                        dataset.dataPointColors?.[pointIndex] ||
                                        dataset.backgroundColor ||
                                        CHART_COLORS[datasetIndex % CHART_COLORS.length]
                                      }
                                      onColorSelect={(color) =>
                                        updateDataPointColor(datasetIndex, pointIndex, color)
                                      }
                                      onClose={() => setActiveDataPointColor(null)}
                                    />
                                  )}
                              </div>
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  value={dataset.data[pointIndex] || 0}
                                  onChange={(e) =>
                                    updateDataPointValue(
                                      datasetIndex,
                                      pointIndex,
                                      e.target.value
                                    )
                                  }
                                  className="w-full px-3 py-2 pr-8 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-white/70 dark:bg-gray-700/50 midnight:bg-slate-700/50 text-gray-900 dark:text-white midnight:text-slate-100 focus:ring-1 focus:ring-purple-500/30 focus:border-purple-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  placeholder="0"
                                  min="0"
                                />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDataPointValue(
                                        datasetIndex,
                                        pointIndex,
                                        (dataset.data[pointIndex] || 0) + 1
                                      )
                                    }
                                    className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDataPointValue(
                                        datasetIndex,
                                        pointIndex,
                                        Math.max(
                                          0,
                                          (dataset.data[pointIndex] || 0) - 1
                                        )
                                      )
                                    }
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
                ))}
              </div>
            </div>

            {/* X-axis Labels Management */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                    X-axis Labels
                  </h4>
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100/80 dark:bg-blue-900/30 midnight:bg-blue-900/30 text-blue-700 dark:text-blue-300 midnight:text-blue-300 rounded">
                    {tempChartData.labels.length}
                  </span>
                </div>
                <button
                  onClick={addDataPoint}
                  className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 midnight:bg-blue-600 midnight:hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  Add Label
                </button>
              </div>
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {tempChartData.labels.map((label, index) => (
                  <div
                    key={index}
                    className="bg-white/60 dark:bg-gray-800/40 midnight:bg-slate-800/40 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/40 midnight:border-gray-600/40 rounded-lg p-3 hover:bg-white/70 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/50 midnight:bg-indigo-900/50 rounded flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 midnight:text-indigo-400">
                          {index + 1}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => {
                          const newData = {
                            ...tempChartData,
                            labels: tempChartData.labels.map((l, i) =>
                              i === index ? e.target.value : l
                            ),
                          };
                          setTempChartData(newData);
                        }}
                        className="flex-1 px-3 py-2 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-800/50 text-gray-900 dark:text-white midnight:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400"
                        placeholder="Enter label name..."
                      />
                      <button
                        onClick={() => removeDataPoint(index)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 rounded"
                        title="Remove this label"
                        disabled={tempChartData.labels.length <= 1}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800 midnight:bg-gray-900 select-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2 text-gray-900 dark:text-white midnight:text-slate-100">
          <BarChart3 className="w-4 h-4" />
          {chartConfig.title}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={handleExport}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-gray-400 midnight:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700"
            title="Export as PNG"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleStartEditing}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-gray-400 midnight:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-700"
            title="Edit chart"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full border border-gray-200 dark:border-gray-600 midnight:border-gray-600 rounded"
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

export default BarChartBlock;
