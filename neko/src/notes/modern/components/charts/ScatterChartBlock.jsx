import { useState, useEffect, useRef } from "react";
import {
  ChartScatter,
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

/* eslint-disable react-hooks/exhaustive-deps */
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
    <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg shadow-xl z-50 w-80">
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

const ScatterChartBlock = ({ block, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeColorPalette, setActiveColorPalette] = useState(null);
  const [theme, setTheme] = useState(() => {
    const isDark = document.documentElement.classList.contains("dark");
    const isMidnight = document.documentElement.classList.contains("midnight");
    return isMidnight ? "midnight" : isDark ? "dark" : "light";
  });
  const [chartData, setChartData] = useState(
    block.properties?.data || {
      datasets: [
        {
          label: "Dataset 1",
          data: [
            { x: 10, y: 20 },
            { x: 15, y: 10 },
            { x: 25, y: 25 },
            { x: 30, y: 15 },
          ],
          backgroundColor: "#3b82f6",
          borderColor: "#3b82f6",
        },
        {
          label: "Dataset 2",
          data: [
            { x: 5, y: 15 },
            { x: 20, y: 30 },
            { x: 35, y: 5 },
            { x: 40, y: 20 },
          ],
          backgroundColor: "#ef4444",
          borderColor: "#ef4444",
        },
      ],
    }
  );
  const [chartConfig, setChartConfig] = useState(
    block.properties?.config || {
      title: "Scatter Chart",
      showGrid: true,
      showLegend: true,
      showTrendline: false,
      animation: true,
      heightSize: "medium",
      pointSize: 6,
    }
  );

  // Temporary editing state (only applied on save)
  const [tempChartData, setTempChartData] = useState(chartData);
  const [tempChartConfig, setTempChartConfig] = useState(chartConfig);
  const [heightDropdownOpen, setHeightDropdownOpen] = useState(false);
  const canvasRef = useRef(null);

  // Linear regression calculation for trendline
  const calculateLinearRegression = (points) => {
    if (points.length < 2) return null;

    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    if (isNaN(slope) || isNaN(intercept)) return null;

    return { slope, intercept };
  };

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

    // Set up chart area with more left padding for y-axis labels
    const leftPadding = 60;
    const rightPadding = 40;
    const topPadding = 40;
    const bottomPadding = 60;
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

    // Get all points across datasets to find global min/max
    const allPoints = chartData.datasets.flatMap(
      (dataset) => dataset.data || []
    );
    if (allPoints.length === 0) return;

    const allX = allPoints.map((p) => p.x);
    const allY = allPoints.map((p) => p.y);
    const minX = Math.min(...allX, 0);
    const maxX = Math.max(...allX, 1);
    const minY = Math.min(...allY, 0);
    const maxY = Math.max(...allY, 1);

    const xRange = maxX - minX || 1;
    const yRange = maxY - minY || 1;

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

      // Vertical grid lines
      for (let i = 0; i <= 10; i++) {
        const x = leftPadding + (i * chartWidth) / 10;
        ctx.beginPath();
        ctx.moveTo(x, topPadding);
        ctx.lineTo(x, height - bottomPadding);
        ctx.stroke();
      }

      // Horizontal grid lines
      for (let i = 0; i <= 8; i++) {
        const y = topPadding + (i * chartHeight) / 8;
        ctx.beginPath();
        ctx.moveTo(leftPadding, y);
        ctx.lineTo(width - rightPadding, y);
        ctx.stroke();
      }
    }

    // Draw axes
    if (isMidnight) {
      ctx.strokeStyle = "#64748b"; // slate-500
    } else if (isDark) {
      ctx.strokeStyle = "#6b7280"; // gray-500
    } else {
      ctx.strokeStyle = "#9ca3af"; // gray-400
    }
    ctx.lineWidth = 2;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(leftPadding, height - bottomPadding);
    ctx.lineTo(width - rightPadding, height - bottomPadding);
    ctx.stroke();

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(leftPadding, topPadding);
    ctx.lineTo(leftPadding, height - bottomPadding);
    ctx.stroke();

    // Draw axis labels
    if (isMidnight) {
      ctx.fillStyle = "#cbd5e1"; // slate-300
    } else if (isDark) {
      ctx.fillStyle = "#d1d5db"; // gray-300
    } else {
      ctx.fillStyle = "#374151"; // gray-700
    }
    ctx.font =
      "500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // X-axis labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 10; i++) {
      const value = minX + (i * xRange) / 10;
      const x = leftPadding + (i * chartWidth) / 10;
      ctx.fillText(Math.round(value * 10) / 10, x, height - bottomPadding + 8);
    }

    // Y-axis labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 8; i++) {
      const value = minY + ((8 - i) * yRange) / 8;
      const y = topPadding + (i * chartHeight) / 8;
      ctx.fillText(Math.round(value * 10) / 10, leftPadding - 8, y);
    }

    // Draw data points for all datasets
    chartData.datasets.forEach((dataset) => {
      if (!dataset.data || dataset.data.length === 0) return;

      const pointRadius = chartConfig.pointSize || 6;
      ctx.fillStyle = dataset.backgroundColor || "#3b82f6";
      ctx.strokeStyle =
        dataset.borderColor || dataset.backgroundColor || "#3b82f6";
      ctx.lineWidth = 2;

      dataset.data.forEach((point) => {
        const x = leftPadding + ((point.x - minX) / xRange) * chartWidth;
        const y =
          height - bottomPadding - ((point.y - minY) / yRange) * chartHeight;

        // Draw point shadow/outline
        ctx.beginPath();
        ctx.arc(x, y, pointRadius + 1, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.stroke();

        // Draw inner point
        ctx.beginPath();
        ctx.arc(x, y, pointRadius - 1, 0, 2 * Math.PI);
        ctx.fillStyle = dataset.backgroundColor || "#3b82f6";
        ctx.fill();
      });

      // Draw trendline if enabled
      if (chartConfig.showTrendline && dataset.data.length >= 2) {
        const regression = calculateLinearRegression(dataset.data);
        if (regression) {
          const { slope, intercept } = regression;

          // Calculate start and end points for the trendline
          const startX = minX;
          const endX = maxX;
          const startY = slope * startX + intercept;
          const endY = slope * endX + intercept;

          // Convert to canvas coordinates
          const canvasStartX =
            leftPadding + ((startX - minX) / xRange) * chartWidth;
          const canvasStartY =
            height - bottomPadding - ((startY - minY) / yRange) * chartHeight;
          const canvasEndX =
            leftPadding + ((endX - minX) / xRange) * chartWidth;
          const canvasEndY =
            height - bottomPadding - ((endY - minY) / yRange) * chartHeight;

          // Draw trendline
          ctx.beginPath();
          ctx.moveTo(canvasStartX, canvasStartY);
          ctx.lineTo(canvasEndX, canvasEndY);

          // Style the trendline
          ctx.strokeStyle = dataset.backgroundColor || "#3b82f6";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]); // Dashed line
          ctx.globalAlpha = 0.8; // Slightly transparent
          ctx.stroke();

          // Reset line dash and alpha
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
    });
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

  const addDataPoint = (datasetIndex) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, index) => {
        if (index === datasetIndex) {
          return {
            ...dataset,
            data: [
              ...dataset.data,
              {
                x: Math.floor(Math.random() * 50),
                y: Math.floor(Math.random() * 50),
              },
            ],
          };
        }
        return dataset;
      }),
    };
    setTempChartData(newData);
  };

  const addDataset = () => {
    const newDatasetIndex = tempChartData.datasets.length;
    const newColor = CHART_COLORS[newDatasetIndex % CHART_COLORS.length];

    const newDataset = {
      label: `Dataset ${newDatasetIndex + 1}`,
      data: [
        {
          x: Math.floor(Math.random() * 50),
          y: Math.floor(Math.random() * 50),
        },
        {
          x: Math.floor(Math.random() * 50),
          y: Math.floor(Math.random() * 50),
        },
        {
          x: Math.floor(Math.random() * 50),
          y: Math.floor(Math.random() * 50),
        },
      ],
      backgroundColor: newColor,
      borderColor: newColor,
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
      datasets: tempChartData.datasets.filter((_, index) => index !== datasetIndex),
    };
    setTempChartData(newData);
  };

  const updateDatasetLabel = (datasetIndex, newLabel) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, index) =>
        index === datasetIndex ? { ...dataset, label: newLabel } : dataset
      ),
    };
    setTempChartData(newData);
  };

  const updateDatasetColor = (datasetIndex, newColor) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, index) =>
        index === datasetIndex
          ? {
              ...dataset,
              backgroundColor: newColor,
              borderColor: newColor,
            }
          : dataset
      ),
    };
    setTempChartData(newData);
  };

  const removeDataPoint = (datasetIndex, pointIndex) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, index) => {
        if (index === datasetIndex && dataset.data.length > 1) {
          return {
            ...dataset,
            data: dataset.data.filter((_, i) => i !== pointIndex),
          };
        }
        return dataset;
      }),
    };
    setTempChartData(newData);
  };

  const updateDataPointValue = (datasetIndex, pointIndex, axis, newValue) => {
    const newData = {
      ...tempChartData,
      datasets: tempChartData.datasets.map((dataset, dsIndex) =>
        dsIndex === datasetIndex
          ? {
              ...dataset,
              data: dataset.data.map((point, i) =>
                i === pointIndex
                  ? { ...point, [axis]: parseFloat(newValue) || 0 }
                  : point
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
              <ChartScatter className="w-4 h-4 text-blue-600 dark:text-blue-400 midnight:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
                Scatter Chart Editor
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
                  Chart Height
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
                            {option.label}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
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
                      <div className="w-2.5 h-0.5 bg-emerald-500 dark:bg-emerald-400 midnight:bg-green-400 rounded-full border-dashed"></div>
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                      Trendline
                    </span>
                  </div>
                  <label className="relative inline-flex cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tempChartConfig.showTrendline}
                      onChange={(e) =>
                        setTempChartConfig((prev) => ({
                          ...prev,
                          showTrendline: e.target.checked,
                        }))
                      }
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                  Point Size
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={tempChartConfig.pointSize}
                    onChange={(e) =>
                      setTempChartConfig((prev) => ({
                        ...prev,
                        pointSize: parseInt(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 pr-8 border border-gray-200/50 dark:border-gray-700/50 midnight:border-gray-600/50 rounded text-sm bg-gray-50/50 dark:bg-gray-800/50 midnight:bg-slate-800/50 text-gray-900 dark:text-white midnight:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min="2"
                    max="20"
                    placeholder="6"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                    <button
                      type="button"
                      onClick={() =>
                        setTempChartConfig((prev) => ({
                          ...prev,
                          pointSize: Math.min(20, prev.pointSize + 1),
                        }))
                      }
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTempChartConfig((prev) => ({
                          ...prev,
                          pointSize: Math.max(2, prev.pointSize - 1),
                        }))
                      }
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Datasets Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white midnight:text-slate-100">
                  Data Sets
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
                Add Dataset
              </button>
            </div>
            <div
              className="space-y-2.5 max-h-56 overflow-y-auto pr-1"
              style={{ overflowX: "visible", overflowY: "auto" }}
            >
              {tempChartData.datasets.map((dataset, datasetIndex) => (
                <div
                  key={datasetIndex}
                  className={`bg-white/60 dark:bg-gray-800/40 midnight:bg-slate-800/40 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/40 midnight:border-gray-600/40 rounded-lg p-3 hover:bg-white/70 dark:hover:bg-gray-800/50 midnight:hover:bg-slate-800/50 ${
                    activeColorPalette === datasetIndex ? "relative z-40" : ""
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
                        style={{ backgroundColor: dataset.backgroundColor }}
                        title="Choose point color"
                      />
                      {activeColorPalette === datasetIndex && (
                        <ColorPicker
                          selectedColor={dataset.backgroundColor}
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
                      placeholder="Enter dataset name..."
                    />
                    <button
                      onClick={() => removeDataset(datasetIndex)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 rounded"
                      title="Remove this dataset"
                      disabled={tempChartData.datasets.length <= 1}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: dataset.backgroundColor }}
                        ></div>
                        <span>Data Points ({dataset.data.length})</span>
                      </div>
                      <button
                        onClick={() => addDataPoint(datasetIndex)}
                        className="px-2 py-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Point
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                      {dataset.data.map((point, pointIndex) => (
                        <div
                          key={pointIndex}
                          className="flex items-center gap-2 p-2 bg-gray-50/50 dark:bg-gray-700/30 midnight:bg-slate-700/30 rounded border border-gray-200/30 dark:border-gray-600/30 midnight:border-gray-500/30"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                                X:
                              </span>
                              <input
                                type="number"
                                value={point.x}
                                onChange={(e) =>
                                  updateDataPointValue(
                                    datasetIndex,
                                    pointIndex,
                                    "x",
                                    e.target.value
                                  )
                                }
                                className="w-16 px-2 py-1 text-xs border border-gray-200/50 dark:border-gray-600/50 midnight:border-gray-500/50 rounded bg-white/70 dark:bg-gray-600/50 midnight:bg-slate-600/50 text-gray-900 dark:text-white midnight:text-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                                Y:
                              </span>
                              <input
                                type="number"
                                value={point.y}
                                onChange={(e) =>
                                  updateDataPointValue(
                                    datasetIndex,
                                    pointIndex,
                                    "y",
                                    e.target.value
                                  )
                                }
                                className="w-16 px-2 py-1 text-xs border border-gray-200/50 dark:border-gray-600/50 midnight:border-gray-500/50 rounded bg-white/70 dark:bg-gray-600/50 midnight:bg-slate-600/50 text-gray-900 dark:text-white midnight:text-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              removeDataPoint(datasetIndex, pointIndex)
                            }
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 midnight:hover:bg-red-900/20 rounded"
                            title="Remove this point"
                            disabled={dataset.data.length <= 1}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
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
    <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800 midnight:bg-gray-900 select-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2 text-gray-900 dark:text-white midnight:text-slate-100">
          <ChartScatter className="w-4 h-4" />
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

      {chartData.datasets && chartConfig.showLegend && (
        <div className="mt-2 flex items-center gap-4 text-sm">
          {chartData.datasets.map((dataset, index) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: dataset.backgroundColor }}
              />
              <span className="text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                {dataset.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScatterChartBlock;
