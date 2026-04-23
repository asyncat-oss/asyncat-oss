// chartRenderer.js - Server-side chart rendering using Chart.js and Canvas
import { createCanvas } from 'canvas';
import { Chart, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

// Custom plugin for pie/donut chart labels with connecting lines
const pieLabelsPlugin = {
  id: 'pieLabelsPlugin',
  afterDraw: (chart) => {
    const { ctx, chartArea } = chart;
    const meta = chart.getDatasetMeta(0);

    if (!meta || chart.config.type !== 'pie' && chart.config.type !== 'doughnut') {
      return;
    }

    const config = chart.config.options.pieLabels || {};
    const showPercentages = config.showPercentages !== false;
    const showValues = config.showValues === true;

    if (!showPercentages && !showValues) {
      return;
    }

    const dataset = chart.config.data.datasets[0];
    const total = dataset.data.reduce((sum, val) => sum + val, 0);

    // First pass: Calculate all label positions and dimensions
    const labelData = [];

    meta.data.forEach((element, index) => {
      const { x: centerX, y: centerY, innerRadius, outerRadius } = element;
      const { startAngle, endAngle } = element;
      const labelAngle = (startAngle + endAngle) / 2;

      // Calculate positions for connecting line
      const innerRadius2 = outerRadius * 0.6; // Start from inside the slice
      const outerRadius2 = outerRadius + 40; // End point outside

      const innerX = centerX + Math.cos(labelAngle) * innerRadius2;
      const innerY = centerY + Math.sin(labelAngle) * innerRadius2;
      const outerX = centerX + Math.cos(labelAngle) * outerRadius2;
      let outerY = centerY + Math.sin(labelAngle) * outerRadius2;

      // Determine text alignment based on angle
      const isRightSide = labelAngle > -Math.PI / 2 && labelAngle < Math.PI / 2;

      // Prepare label text
      const value = dataset.data[index];
      const percentage = ((value / total) * 100).toFixed(1);

      let labelText = '';
      let subLabelText = '';

      if (showPercentages) {
        labelText = `${percentage}%`;
      }
      if (showValues) {
        if (showPercentages) {
          subLabelText = `(${value})`;
        } else {
          labelText = value.toString();
        }
      }

      // Calculate text dimensions
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const mainTextMetrics = ctx.measureText(labelText);
      const mainTextWidth = mainTextMetrics.width;
      const mainTextHeight = 16;

      let subTextWidth = 0;
      let subTextHeight = 0;
      if (subLabelText) {
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const subTextMetrics = ctx.measureText(subLabelText);
        subTextWidth = subTextMetrics.width;
        subTextHeight = 14;
      }

      // Calculate background box dimensions
      const padding = 6;
      const maxTextWidth = Math.max(mainTextWidth, subTextWidth);
      const totalTextHeight = subLabelText ? mainTextHeight + subTextHeight + 2 : mainTextHeight;

      const boxWidth = maxTextWidth + padding * 2;
      const boxHeight = totalTextHeight + padding * 2;

      const sliceColor = Array.isArray(dataset.backgroundColor)
        ? dataset.backgroundColor[index % dataset.backgroundColor.length]
        : dataset.backgroundColor || '#3b82f6';

      labelData.push({
        index,
        centerX,
        centerY,
        innerX,
        innerY,
        outerX,
        outerY,
        isRightSide,
        labelText,
        subLabelText,
        boxWidth,
        boxHeight,
        padding,
        sliceColor,
        labelAngle
      });
    });

    // Second pass: Adjust positions to prevent overlap
    // Separate left and right side labels
    const leftLabels = labelData.filter(l => !l.isRightSide).sort((a, b) => a.outerY - b.outerY);
    const rightLabels = labelData.filter(l => l.isRightSide).sort((a, b) => a.outerY - b.outerY);

    // Function to adjust overlapping labels
    const adjustOverlap = (labels) => {
      const minGap = 8; // Minimum gap between labels

      for (let i = 0; i < labels.length - 1; i++) {
        const current = labels[i];
        const next = labels[i + 1];

        const currentBottom = current.outerY + current.boxHeight / 2;
        const nextTop = next.outerY - next.boxHeight / 2;

        if (currentBottom + minGap > nextTop) {
          // Overlap detected - push next label down
          const overlap = (currentBottom + minGap) - nextTop;
          next.outerY += overlap;
        }
      }

      // Make a second pass going backwards to spread labels more evenly
      for (let i = labels.length - 1; i > 0; i--) {
        const current = labels[i];
        const previous = labels[i - 1];

        const previousBottom = previous.outerY + previous.boxHeight / 2;
        const currentTop = current.outerY - current.boxHeight / 2;

        if (previousBottom + minGap > currentTop) {
          // Overlap detected - push previous label up
          const overlap = (previousBottom + minGap) - currentTop;
          previous.outerY -= overlap / 2; // Only move half to balance
        }
      }
    };

    adjustOverlap(leftLabels);
    adjustOverlap(rightLabels);

    // Third pass: Draw all labels with adjusted positions
    labelData.forEach(label => {
      const {
        innerX,
        innerY,
        outerX,
        outerY,
        isRightSide,
        labelText,
        subLabelText,
        boxWidth,
        boxHeight,
        padding,
        sliceColor
      } = label;

      // Draw connecting line
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);

      // Draw horizontal leader line
      const leaderLength = 15;
      const leaderEndX = outerX + (isRightSide ? leaderLength : -leaderLength);
      ctx.lineTo(leaderEndX, outerY);

      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Draw small dot at the inner connection point
      ctx.beginPath();
      ctx.arc(innerX, innerY, 2, 0, 2 * Math.PI);
      ctx.fillStyle = sliceColor;
      ctx.fill();

      // Position background box
      const textStartX = leaderEndX + (isRightSide ? 8 : -8);
      const boxX = isRightSide ? textStartX - padding : textStartX - boxWidth + padding;
      const boxY = outerY - boxHeight / 2;

      // Draw shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.beginPath();
      ctx.roundRect(boxX + 2, boxY + 2, boxWidth, boxHeight, 4);
      ctx.fill();

      // Draw main background
      ctx.fillStyle = 'rgba(249, 250, 251, 0.95)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw main label text
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = isRightSide ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const mainTextY = subLabelText ? outerY - 6 : outerY;
      ctx.fillText(labelText, textStartX, mainTextY);

      // Draw sub-label if exists
      if (subLabelText) {
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(subLabelText, textStartX, outerY + 8);
      }
    });
  }
};

// Register the custom plugin
Chart.register(pieLabelsPlugin);

/**
 * Render a chart to an image buffer
 * @param {string} chartType - Type of chart (line_chart, bar_chart, etc.)
 * @param {object} properties - Chart properties (data, labels, colors, etc.)
 * @returns {Promise<Buffer>} Image buffer (PNG)
 */
async function renderChartToImage(chartType, properties) {
  try {
    console.log('[ChartRenderer] Rendering chart type:', chartType);
    console.log('[ChartRenderer] Properties:', JSON.stringify(properties, null, 2));

    // Handle both formats: { chartData: ... } and { data: ... }
    const chartData = properties.chartData || properties.data;
    const chartConfig = properties.config || {};
    const title = chartConfig.title || properties.title;
    const colors = properties.colors;
    const labels = chartData?.labels || properties.labels;

    if (!chartData) {
      console.warn('[ChartRenderer] No chart data provided');
      console.warn('[ChartRenderer] Available properties keys:', Object.keys(properties));
      return null;
    }

    console.log('[ChartRenderer] Chart data:', JSON.stringify(chartData, null, 2));

    // Map chart type to Chart.js type first
    const chartJsType = mapChartType(chartType);

    // Create canvas with dynamic sizing based on heightSize config
    const heightSize = chartConfig.heightSize || 'medium';
    // Pie/donut charts need extra width for labels sticking out on sides
    const dimensions = getChartDimensions(heightSize, chartJsType);
    const canvas = createCanvas(dimensions.width, dimensions.height);
    const ctx = canvas.getContext('2d');

    // Prepare chart configuration
    const config = buildChartConfig(chartJsType, chartData, title, colors, labels, chartConfig, chartType);

    console.log('[ChartRenderer] ===== FINAL CONFIG =====');
    console.log('[ChartRenderer] Chart.js type:', config.type);
    console.log('[ChartRenderer] Labels:', JSON.stringify(config.data.labels));
    console.log('[ChartRenderer] Number of datasets:', config.data.datasets.length);
    config.data.datasets.forEach((dataset, index) => {
      console.log(`[ChartRenderer] Dataset ${index + 1}:`, {
        label: dataset.label,
        dataLength: dataset.data?.length,
        data: JSON.stringify(dataset.data),
        type: dataset.type
      });
    });
    console.log('[ChartRenderer] IndexAxis:', config.options.indexAxis);
    console.log('[ChartRenderer] Scales:', JSON.stringify(config.options.scales, null, 2));
    console.log('[ChartRenderer] ===========================');

    // Render chart
    new Chart(ctx, config);

    // Convert canvas to buffer
    const buffer = canvas.toBuffer('image/png');

    return buffer;
  } catch (error) {
    console.error('[ChartRenderer] Error rendering chart:', error);
    return null;
  }
}

/**
 * Get chart dimensions based on heightSize config
 * Heights match frontend: small=250, medium=350, large=450, extraLarge=550
 * Pie/donut charts need extra width for labels sticking out on sides
 * Heights for pie/donut are proportionally sized to keep circles appropriately sized
 */
function getChartDimensions(heightSize, chartType) {
  const isPieOrDonut = chartType === 'pie' || chartType === 'doughnut';

  const dimensions = {
    small: { width: isPieOrDonut ? 1000 : 700, height: isPieOrDonut ? 350 : 250 },
    medium: { width: isPieOrDonut ? 1300 : 900, height: isPieOrDonut ? 450 : 350 },
    large: { width: isPieOrDonut ? 1600 : 1100, height: isPieOrDonut ? 550 : 450 },
    extraLarge: { width: isPieOrDonut ? 1900 : 1300, height: isPieOrDonut ? 650 : 550 }
  };

  return dimensions[heightSize] || dimensions.medium;
}

/**
 * Map custom chart type to Chart.js type
 */
function mapChartType(customType) {
  const typeMap = {
    // snake_case (legacy)
    'line_chart': 'line',
    'bar_chart': 'bar',
    'pie_chart': 'pie',
    'area_chart': 'line', // Area charts are line charts with fill
    'scatter_chart': 'scatter',
    'donut_chart': 'doughnut',
    // camelCase (frontend format)
    'lineChart': 'line',
    'barChart': 'bar',
    'pieChart': 'pie',
    'areaChart': 'line',
    'scatterChart': 'scatter',
    'donutChart': 'doughnut'
  };

  return typeMap[customType] || 'bar';
}

/**
 * Build Chart.js configuration
 */
function buildChartConfig(type, chartData, title, colors, labels, chartConfig = {}, chartType = '') {
  // Extract data based on structure
  let datasets = prepareDatasets(type, chartData, colors);
  const chartLabels = labels || chartData.labels || extractLabels(chartData);

  // Remove border from bar/pie/donut charts to prevent different outline colors
  if (type === 'bar' || type === 'pie' || type === 'doughnut') {
    datasets.forEach(dataset => {
      dataset.borderWidth = 0;
    });
  }

  // Configure point size for scatter charts
  if ((chartType === 'scatter_chart' || chartType === 'scatterChart') && chartConfig.pointSize) {
    datasets.forEach(dataset => {
      dataset.pointRadius = chartConfig.pointSize;
      dataset.pointHoverRadius = chartConfig.pointSize + 2;
    });
  }

  // Add trendlines for scatter charts (only if showTrendline is true)
  if ((chartType === 'scatter_chart' || chartType === 'scatterChart') && chartConfig.showTrendline === true) {
    console.log('[ChartRenderer] Adding trendlines to scatter chart');
    datasets = addTrendlineToScatter(datasets, chartData);
  }

  // Check for horizontal orientation (for bar charts)
  const orientation = chartConfig.orientation || 'vertical'; // Default to vertical
  const isHorizontal = orientation === 'horizontal';

  console.log('[ChartRenderer] Chart orientation:', { type, orientation, isHorizontal });

  const actualType = (type === 'bar' && isHorizontal) ? 'bar' : type;

  // Get size-dependent padding for pie/donut charts
  const getPieDonutPadding = (heightSize) => {
    const paddingMap = {
      small: { left: 80, right: 80, top: 50, bottom: 50 },
      medium: { left: 90, right: 90, top: 55, bottom: 55 },
      large: { left: 100, right: 100, top: 60, bottom: 60 },
      extraLarge: { left: 110, right: 110, top: 65, bottom: 65 }
    };
    return paddingMap[heightSize] || paddingMap.medium;
  };

  const heightSize = chartConfig.heightSize || 'medium';

  const config = {
    type: actualType,
    data: {
      labels: chartLabels,
      datasets: datasets
    },
    options: {
      responsive: false,
      indexAxis: isHorizontal ? 'y' : 'x', // This makes bar charts horizontal
      // Add layout padding for pie/donut charts to prevent label cutoff
      layout: {
        padding: (type === 'pie' || type === 'doughnut')
          ? getPieDonutPadding(heightSize)
          : {
              left: 10,
              right: 10,
              top: 10,
              bottom: 10
            }
      },
      plugins: {
        title: {
          display: !!title,
          text: title || '',
          font: {
            // Scale title font size with chart size
            size: heightSize === 'small' ? 16 : heightSize === 'medium' ? 18 : heightSize === 'large' ? 20 : 22,
            weight: 'bold'
          }
        },
        legend: {
          display: chartConfig.showLegend !== false,
          // Pie/donut charts have legend on right, others on bottom
          position: (type === 'pie' || type === 'doughnut') ? 'right' : 'bottom',
          // Add alignment for pie/donut to create gap from chart
          align: (type === 'pie' || type === 'doughnut') ? 'center' : 'center',
          labels: {
            // Scale box size with chart size
            boxWidth: heightSize === 'small' ? 12 : heightSize === 'medium' ? 14 : heightSize === 'large' ? 16 : 18,
            boxHeight: heightSize === 'small' ? 12 : heightSize === 'medium' ? 14 : heightSize === 'large' ? 16 : 18,
            // Scale padding with chart size
            padding: (type === 'pie' || type === 'doughnut')
              ? (heightSize === 'small' ? 15 : heightSize === 'medium' ? 18 : heightSize === 'large' ? 20 : 22)
              : (heightSize === 'small' ? 10 : heightSize === 'medium' ? 12 : heightSize === 'large' ? 14 : 16),
            font: {
              // Scale font size with chart size for readability
              size: heightSize === 'small' ? 13 : heightSize === 'medium' ? 14 : heightSize === 'large' ? 15 : 16
            },
            // Ensure legend boxes are filled properly
            usePointStyle: false,
            // Filter out trendline datasets from legend
            filter: function(item, chart) {
              const label = item.text || '';
              return !label.includes('Trendline');
            },
            // Generate proper legend box colors
            generateLabels: function(chart) {
              const datasets = chart.data.datasets;
              const labels = chart.data.labels || [];
              const chartType = chart.config.type;

              // For pie/donut charts, create one label per data point
              if (chartType === 'pie' || chartType === 'doughnut') {
                return labels.map((label, i) => {
                  const dataset = datasets[0];
                  const backgroundColor = Array.isArray(dataset.backgroundColor)
                    ? dataset.backgroundColor[i]
                    : dataset.backgroundColor;

                  // Make color fully opaque for legend
                  const opaqueColor = makeColorOpaque(backgroundColor);

                  return {
                    text: label,
                    fillStyle: opaqueColor,
                    strokeStyle: opaqueColor,
                    lineWidth: 0,
                    hidden: false,
                    index: i
                  };
                });
              }

              // For other charts, create one label per dataset
              return datasets.map((dataset, i) => {
                // Skip trendline datasets
                if (dataset.label && dataset.label.includes('Trendline')) {
                  return null;
                }

                // For line/area/scatter charts, use borderColor (the visible line/point color)
                // For bar charts, use backgroundColor (the fill color)
                let fillStyle;
                if (chartType === 'line' || chartType === 'scatter') {
                  fillStyle = dataset.borderColor || dataset.backgroundColor;
                } else if (chartType === 'bar') {
                  fillStyle = dataset.backgroundColor || dataset.borderColor;
                } else {
                  fillStyle = dataset.borderColor || dataset.backgroundColor;
                }

                // Make color fully opaque for legend
                const opaqueColor = makeColorOpaque(fillStyle);

                return {
                  text: dataset.label || `Series ${i + 1}`,
                  fillStyle: opaqueColor,
                  strokeStyle: opaqueColor,
                  lineWidth: 0,
                  hidden: false,
                  datasetIndex: i
                };
              }).filter(item => item !== null);
            }
          }
        }
      },
      animation: false // Disable animation for server-side rendering
    }
  };

  // Configure custom pie labels for pie and donut charts
  if (type === 'pie' || type === 'doughnut') {
    config.options.pieLabels = {
      showPercentages: chartConfig.showPercentages !== false,
      showValues: chartConfig.showValues === true
    };
  }

  // Add fill ONLY for area charts, NOT for line charts
  // IMPORTANT: Set tension to 0 for SHARP corners (no curves)
  if (type === 'line' && (chartType === 'area_chart' || chartType === 'areaChart')) {
    config.data.datasets.forEach(dataset => {
      dataset.fill = true;
      dataset.tension = 0; // Sharp corners, no curves
      // Configure point display
      if (chartConfig.showPoints === false) {
        dataset.pointRadius = 0;
        dataset.pointHoverRadius = 0;
      } else {
        dataset.pointRadius = 3;
        dataset.pointHoverRadius = 5;
      }
      if (!dataset.backgroundColor || typeof dataset.backgroundColor === 'string') {
        // Convert solid color to rgba for transparency
        const alpha = 0.3;
        dataset.backgroundColor = dataset.backgroundColor
          ? dataset.backgroundColor.replace(')', `, ${alpha})`)
          : `rgba(75, 192, 192, ${alpha})`;
      }
    });
  } else if (type === 'line' && (chartType === 'line_chart' || chartType === 'lineChart')) {
    // Line charts should NOT have fill, and should have SHARP corners
    config.data.datasets.forEach(dataset => {
      dataset.fill = false;
      dataset.tension = 0; // Sharp corners, no curves
      // Configure point display
      if (chartConfig.showPoints === false) {
        dataset.pointRadius = 0;
        dataset.pointHoverRadius = 0;
      } else {
        dataset.pointRadius = 3;
        dataset.pointHoverRadius = 5;
      }
    });
  }

  // Configure scales for non-pie charts
  if (type !== 'pie' && type !== 'doughnut') {
    // Calculate exact min/max to match frontend behavior
    const { min: yMin, max: yMax, stepSize: yStepSize, originalMax } = calculateAxisRange(datasets);

    const scaleConfig = {
      x: {
        grid: {
          display: chartConfig.showGrid !== false
        },
        ticks: {
          font: {
            size: heightSize === 'small' ? 11 : heightSize === 'medium' ? 12 : heightSize === 'large' ? 13 : 14
          }
        }
      },
      y: {
        min: yMin,
        max: yMax,
        grid: {
          display: chartConfig.showGrid !== false
        },
        ticks: {
          precision: 0,
          stepSize: yStepSize,
          font: {
            size: heightSize === 'small' ? 11 : heightSize === 'medium' ? 12 : heightSize === 'large' ? 13 : 14
          },
          // Round tick values to match frontend display
          callback: function(value) {
            return Math.round(value);
          }
        }
      }
    };

    // For scatter charts, calculate X-axis range too
    if (type === 'scatter') {
      const { min: xMin, max: xMax, stepSize: xStepSize } = calculateScatterXAxisRange(datasets);
      scaleConfig.x = {
        type: 'linear',
        min: xMin,
        max: xMax,
        grid: {
          display: chartConfig.showGrid !== false
        },
        ticks: {
          precision: 0,
          stepSize: xStepSize,
          font: {
            size: heightSize === 'small' ? 11 : heightSize === 'medium' ? 12 : heightSize === 'large' ? 13 : 14
          },
          // Round tick values to match frontend display
          callback: function(value) {
            return Math.round(value);
          }
        }
      };
    }

    config.options.scales = scaleConfig;
  }

  return config;
}

/**
 * Calculate axis range to match frontend canvas rendering
 * Frontend logic from LineChartBlock.jsx:577-603
 */
function calculateAxisRange(datasets) {
  if (!datasets || datasets.length === 0) {
    return { min: 0, max: 10, stepSize: 2 };
  }

  // Get all values from all datasets (handling both numeric arrays and scatter {x, y} objects)
  const allValues = datasets.flatMap(dataset => {
    if (!dataset.data || dataset.data.length === 0) return [];

    // For scatter charts with {x, y} format
    if (typeof dataset.data[0] === 'object' && dataset.data[0] !== null && 'y' in dataset.data[0]) {
      return dataset.data.map(point => point.y);
    }

    // For regular numeric data
    return dataset.data;
  }).filter(val => typeof val === 'number' && !isNaN(val));

  if (allValues.length === 0) {
    return { min: 0, max: 10, stepSize: 2 };
  }

  // Match frontend calculation exactly
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(...allValues, 0);
  const valueRange = maxValue - minValue;
  const stepSize = Math.ceil(valueRange / 5) || 1;

  // Calculate max by adding enough room for points to not be cut off
  // We want about 10% padding above the max value
  const padding = Math.max(1, stepSize * 0.2);
  const paddedMax = maxValue + padding;
  const paddedMin = Math.max(0, minValue - padding);

  return {
    min: paddedMin,
    max: paddedMax,
    stepSize: stepSize,
    originalMax: maxValue,
    originalMin: minValue
  };
}

/**
 * Calculate X-axis range for scatter charts
 */
function calculateScatterXAxisRange(datasets) {
  if (!datasets || datasets.length === 0) {
    return { min: 0, max: 10, stepSize: 2 };
  }

  // Get all X values from scatter datasets
  const allXValues = datasets.flatMap(dataset => {
    if (!dataset.data || dataset.data.length === 0) return [];
    if (typeof dataset.data[0] === 'object' && dataset.data[0] !== null && 'x' in dataset.data[0]) {
      return dataset.data.map(point => point.x);
    }
    return [];
  }).filter(val => typeof val === 'number' && !isNaN(val));

  if (allXValues.length === 0) {
    return { min: 0, max: 10, stepSize: 2 };
  }

  // Match frontend calculation
  const maxValue = Math.max(...allXValues, 1);
  const minValue = Math.min(...allXValues, 0);
  const valueRange = maxValue - minValue;
  const stepSize = Math.ceil(valueRange / 5) || 1;

  // Add padding to prevent edge points from being cut off
  const padding = Math.max(1, stepSize * 0.2);
  const paddedMax = maxValue + padding;
  const paddedMin = Math.max(0, minValue - padding);

  return {
    min: paddedMin,
    max: paddedMax,
    stepSize: stepSize
  };
}

/**
 * Prepare datasets from chart data
 */
function prepareDatasets(type, chartData, colors) {
  // Handle different data structures
  if (chartData.datasets && Array.isArray(chartData.datasets)) {
    // Already in datasets format
    return chartData.datasets.map((dataset, index) => ({
      label: dataset.label || `Series ${index + 1}`,
      data: dataset.data || [],
      backgroundColor: dataset.backgroundColor || colors?.[index] || getDefaultColor(index),
      borderColor: dataset.borderColor || colors?.[index] || getDefaultColor(index),
      borderWidth: dataset.borderWidth || 2,
      // IMPORTANT: Remove tension from frontend - we'll set it ourselves based on chart type
      tension: undefined
    }));
  }

  // Single dataset format
  if (chartData.data && Array.isArray(chartData.data)) {
    return [{
      label: chartData.label || 'Data',
      data: chartData.data,
      backgroundColor: colors || getDefaultColors(chartData.data.length),
      borderColor: colors || getDefaultColors(chartData.data.length),
      borderWidth: 2,
      tension: undefined
    }];
  }

  // Series format (multiple series)
  if (chartData.series && Array.isArray(chartData.series)) {
    return chartData.series.map((series, index) => ({
      label: series.name || `Series ${index + 1}`,
      data: series.data || [],
      backgroundColor: series.color || colors?.[index] || getDefaultColor(index),
      borderColor: series.color || colors?.[index] || getDefaultColor(index),
      borderWidth: 2,
      tension: undefined
    }));
  }

  // Default empty dataset
  return [{
    label: 'Data',
    data: [],
    backgroundColor: 'rgba(75, 192, 192, 0.6)',
    borderColor: 'rgba(75, 192, 192, 1)',
    borderWidth: 2
  }];
}

/**
 * Extract labels from chart data
 */
function extractLabels(chartData) {
  if (chartData.labels) {
    return chartData.labels;
  }

  if (chartData.data && Array.isArray(chartData.data)) {
    return chartData.data.map((_, index) => `Item ${index + 1}`);
  }

  if (chartData.datasets && chartData.datasets[0] && chartData.datasets[0].data) {
    return chartData.datasets[0].data.map((_, index) => `Item ${index + 1}`);
  }

  return [];
}

/**
 * Convert semi-transparent color to fully opaque for legend display
 */
function makeColorOpaque(color) {
  if (!color || typeof color !== 'string') {
    return color;
  }

  // Handle rgba format
  if (color.startsWith('rgba')) {
    // Replace the alpha value with 1
    return color.replace(/,\s*[\d.]+\s*\)/, ', 1)');
  }

  // Handle rgb format (already opaque)
  if (color.startsWith('rgb')) {
    return color;
  }

  // Handle hex format (already opaque)
  if (color.startsWith('#')) {
    return color;
  }

  // Return as-is for other formats
  return color;
}

/**
 * Get default color for a series index
 */
function getDefaultColor(index) {
  const colors = [
    'rgba(75, 192, 192, 0.6)',
    'rgba(255, 99, 132, 0.6)',
    'rgba(255, 206, 86, 0.6)',
    'rgba(54, 162, 235, 0.6)',
    'rgba(153, 102, 255, 0.6)',
    'rgba(255, 159, 64, 0.6)',
    'rgba(201, 203, 207, 0.6)'
  ];

  return colors[index % colors.length];
}

/**
 * Get default colors for multiple items
 */
function getDefaultColors(count) {
  return Array.from({ length: count }, (_, i) => getDefaultColor(i));
}

/**
 * Calculate linear regression trendline
 * Returns { slope, intercept, r2 }
 */
function calculateTrendline(data) {
  const n = data.length;
  if (n < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

  data.forEach(point => {
    const x = point.x;
    const y = point.y;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R² (coefficient of determination)
  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  data.forEach(point => {
    const predicted = slope * point.x + intercept;
    ssRes += Math.pow(point.y - predicted, 2);
    ssTot += Math.pow(point.y - meanY, 2);
  });
  const r2 = 1 - (ssRes / ssTot);

  return { slope, intercept, r2 };
}

/**
 * Add trendline to scatter chart datasets
 */
function addTrendlineToScatter(datasets, chartData) {
  if (!datasets || datasets.length === 0) return datasets;

  const updatedDatasets = [...datasets];

  datasets.forEach((dataset, index) => {
    if (!dataset.data || dataset.data.length < 2) return;

    // Calculate trendline
    const trendline = calculateTrendline(dataset.data);
    if (!trendline) return;

    // Find min and max x values
    const xValues = dataset.data.map(p => p.x);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);

    // Create trendline dataset
    const trendlineDataset = {
      label: `${dataset.label} - Trendline`,
      data: [
        { x: minX, y: trendline.slope * minX + trendline.intercept },
        { x: maxX, y: trendline.slope * maxX + trendline.intercept }
      ],
      type: 'line',
      borderColor: dataset.borderColor || dataset.backgroundColor || getDefaultColor(index),
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5], // Dashed line for trendline
      pointRadius: 0, // No points on trendline
      fill: false,
      tension: 0
    };

    updatedDatasets.push(trendlineDataset);
  });

  return updatedDatasets;
}

export {
  renderChartToImage
};
