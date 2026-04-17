// chartDiff.js - Utilities for comparing and displaying chart changes

/**
 * Compare two chart blocks and generate a detailed diff
 * Returns an object describing what changed in the chart
 */
export function compareChartBlocks(oldBlock, newBlock) {
  if (!oldBlock || !newBlock) return null;

  const oldProps = oldBlock.properties || {};
  const newProps = newBlock.properties || {};

  const changes = [];

  // Chart type specific comparisons
  const chartType = newBlock.type;

  switch (chartType) {
    case 'barChart':
    case 'lineChart':
    case 'areaChart':
    case 'scatterChart':
      changes.push(...compareDatasetCharts(oldProps, newProps, chartType));
      break;
    case 'pieChart':
    case 'donutChart':
      changes.push(...compareSegmentCharts(oldProps, newProps, chartType));
      break;
    default:
      return null;
  }

  // Compare common chart properties
  changes.push(...compareCommonChartProperties(oldProps, newProps));

  return changes.length > 0 ? { type: chartType, changes } : null;
}

/**
 * Compare dataset-based charts (bar, line, area, scatter)
 */
function compareDatasetCharts(oldProps, newProps, chartType) {
  const changes = [];
  const oldData = oldProps.data || { datasets: [] };
  const newData = newProps.data || { datasets: [] };

  // Check if labels changed
  if (JSON.stringify(oldData.labels) !== JSON.stringify(newData.labels)) {
    changes.push({
      property: 'labels',
      type: 'modified',
      from: oldData.labels || [],
      to: newData.labels || [],
      description: `Chart labels changed from [${(oldData.labels || []).join(', ')}] to [${(newData.labels || []).join(', ')}]`
    });
  }

  // Compare datasets
  const oldDatasets = oldData.datasets || [];
  const newDatasets = newData.datasets || [];

  // Detect added datasets
  if (newDatasets.length > oldDatasets.length) {
    for (let i = oldDatasets.length; i < newDatasets.length; i++) {
      changes.push({
        property: 'datasets',
        type: 'added',
        dataset: newDatasets[i],
        index: i,
        description: `Added dataset "${newDatasets[i].label || `Dataset ${i + 1}`}"`
      });
    }
  }

  // Detect removed datasets
  if (oldDatasets.length > newDatasets.length) {
    for (let i = newDatasets.length; i < oldDatasets.length; i++) {
      changes.push({
        property: 'datasets',
        type: 'deleted',
        dataset: oldDatasets[i],
        index: i,
        description: `Removed dataset "${oldDatasets[i].label || `Dataset ${i + 1}`}"`
      });
    }
  }

  // Compare existing datasets
  const minLength = Math.min(oldDatasets.length, newDatasets.length);
  for (let i = 0; i < minLength; i++) {
    const oldDataset = oldDatasets[i];
    const newDataset = newDatasets[i];

    // Dataset label changed
    if (oldDataset.label !== newDataset.label) {
      changes.push({
        property: 'dataset.label',
        type: 'modified',
        index: i,
        from: oldDataset.label,
        to: newDataset.label,
        description: `Dataset ${i + 1} label changed from "${oldDataset.label}" to "${newDataset.label}"`
      });
    }

    // Dataset color changed
    if (oldDataset.backgroundColor !== newDataset.backgroundColor) {
      changes.push({
        property: 'dataset.backgroundColor',
        type: 'modified',
        index: i,
        from: oldDataset.backgroundColor,
        to: newDataset.backgroundColor,
        description: `Dataset "${newDataset.label || i + 1}" background color changed`
      });
    }

    if (oldDataset.borderColor !== newDataset.borderColor) {
      changes.push({
        property: 'dataset.borderColor',
        type: 'modified',
        index: i,
        from: oldDataset.borderColor,
        to: newDataset.borderColor,
        description: `Dataset "${newDataset.label || i + 1}" border color changed`
      });
    }

    // Data points changed
    const oldDataPoints = oldDataset.data || [];
    const newDataPoints = newDataset.data || [];

    if (JSON.stringify(oldDataPoints) !== JSON.stringify(newDataPoints)) {
      // For scatter charts, compare x,y coordinates
      if (chartType === 'scatterChart') {
        changes.push(...compareScatterDataPoints(oldDataPoints, newDataPoints, i, newDataset.label));
      } else {
        changes.push(...compareSimpleDataPoints(oldDataPoints, newDataPoints, i, newDataset.label));
      }
    }

    // Individual data point colors changed (for bar charts)
    if (newDataset.dataPointColors || oldDataset.dataPointColors) {
      const oldColors = oldDataset.dataPointColors || [];
      const newColors = newDataset.dataPointColors || [];

      if (JSON.stringify(oldColors) !== JSON.stringify(newColors)) {
        changes.push({
          property: 'dataset.dataPointColors',
          type: 'modified',
          index: i,
          from: oldColors,
          to: newColors,
          description: `Dataset "${newDataset.label || i + 1}" individual data point colors changed`
        });
      }
    }
  }

  return changes;
}

/**
 * Compare simple data points (numbers)
 */
function compareSimpleDataPoints(oldData, newData, datasetIndex, datasetLabel) {
  const changes = [];

  // Added data points
  if (newData.length > oldData.length) {
    for (let i = oldData.length; i < newData.length; i++) {
      changes.push({
        property: 'dataset.data',
        type: 'added',
        datasetIndex,
        pointIndex: i,
        value: newData[i],
        description: `Added data point ${i + 1} with value ${newData[i]} to "${datasetLabel || `Dataset ${datasetIndex + 1}`}"`
      });
    }
  }

  // Removed data points
  if (oldData.length > newData.length) {
    for (let i = newData.length; i < oldData.length; i++) {
      changes.push({
        property: 'dataset.data',
        type: 'deleted',
        datasetIndex,
        pointIndex: i,
        value: oldData[i],
        description: `Removed data point ${i + 1} (value: ${oldData[i]}) from "${datasetLabel || `Dataset ${datasetIndex + 1}`}"`
      });
    }
  }

  // Modified data points
  const minLength = Math.min(oldData.length, newData.length);
  for (let i = 0; i < minLength; i++) {
    if (oldData[i] !== newData[i]) {
      changes.push({
        property: 'dataset.data',
        type: 'modified',
        datasetIndex,
        pointIndex: i,
        from: oldData[i],
        to: newData[i],
        description: `Data point ${i + 1} in "${datasetLabel || `Dataset ${datasetIndex + 1}`}" changed from ${oldData[i]} to ${newData[i]}`
      });
    }
  }

  return changes;
}

/**
 * Compare scatter chart data points (objects with x, y)
 */
function compareScatterDataPoints(oldData, newData, datasetIndex, datasetLabel) {
  const changes = [];

  // Added points
  if (newData.length > oldData.length) {
    for (let i = oldData.length; i < newData.length; i++) {
      changes.push({
        property: 'dataset.data',
        type: 'added',
        datasetIndex,
        pointIndex: i,
        value: newData[i],
        description: `Added scatter point (${newData[i].x}, ${newData[i].y}) to "${datasetLabel || `Dataset ${datasetIndex + 1}`}"`
      });
    }
  }

  // Removed points
  if (oldData.length > newData.length) {
    for (let i = newData.length; i < oldData.length; i++) {
      changes.push({
        property: 'dataset.data',
        type: 'deleted',
        datasetIndex,
        pointIndex: i,
        value: oldData[i],
        description: `Removed scatter point (${oldData[i].x}, ${oldData[i].y}) from "${datasetLabel || `Dataset ${datasetIndex + 1}`}"`
      });
    }
  }

  // Modified points
  const minLength = Math.min(oldData.length, newData.length);
  for (let i = 0; i < minLength; i++) {
    if (oldData[i].x !== newData[i].x || oldData[i].y !== newData[i].y) {
      changes.push({
        property: 'dataset.data',
        type: 'modified',
        datasetIndex,
        pointIndex: i,
        from: oldData[i],
        to: newData[i],
        description: `Scatter point ${i + 1} in "${datasetLabel || `Dataset ${datasetIndex + 1}`}" changed from (${oldData[i].x}, ${oldData[i].y}) to (${newData[i].x}, ${newData[i].y})`
      });
    }
  }

  return changes;
}

/**
 * Compare segment-based charts (pie, donut)
 */
function compareSegmentCharts(oldProps, newProps, chartType) {
  const changes = [];
  const oldData = oldProps.data || { datasets: [{ data: [], backgroundColor: [] }] };
  const newData = newProps.data || { datasets: [{ data: [], backgroundColor: [] }] };

  const oldDataset = oldData.datasets?.[0] || { data: [], backgroundColor: [] };
  const newDataset = newData.datasets?.[0] || { data: [], backgroundColor: [] };

  // Check if labels changed
  if (JSON.stringify(oldData.labels) !== JSON.stringify(newData.labels)) {
    changes.push({
      property: 'labels',
      type: 'modified',
      from: oldData.labels || [],
      to: newData.labels || [],
      description: `Segment labels changed from [${(oldData.labels || []).join(', ')}] to [${(newData.labels || []).join(', ')}]`
    });
  }

  const oldValues = oldDataset.data || [];
  const newValues = newDataset.data || [];
  const oldColors = oldDataset.backgroundColor || [];
  const newColors = newDataset.backgroundColor || [];
  const oldLabels = oldData.labels || [];
  const newLabels = newData.labels || [];

  // Added segments
  if (newValues.length > oldValues.length) {
    for (let i = oldValues.length; i < newValues.length; i++) {
      changes.push({
        property: 'segments',
        type: 'added',
        index: i,
        label: newLabels[i],
        value: newValues[i],
        color: newColors[i],
        description: `Added segment "${newLabels[i] || `Segment ${i + 1}`}" with value ${newValues[i]}`
      });
    }
  }

  // Removed segments
  if (oldValues.length > newValues.length) {
    for (let i = newValues.length; i < oldValues.length; i++) {
      changes.push({
        property: 'segments',
        type: 'deleted',
        index: i,
        label: oldLabels[i],
        value: oldValues[i],
        color: oldColors[i],
        description: `Removed segment "${oldLabels[i] || `Segment ${i + 1}`}" (value: ${oldValues[i]})`
      });
    }
  }

  // Modified segments
  const minLength = Math.min(oldValues.length, newValues.length);
  for (let i = 0; i < minLength; i++) {
    // Label changed
    if (oldLabels[i] !== newLabels[i]) {
      changes.push({
        property: 'segment.label',
        type: 'modified',
        index: i,
        from: oldLabels[i],
        to: newLabels[i],
        description: `Segment ${i + 1} label changed from "${oldLabels[i]}" to "${newLabels[i]}"`
      });
    }

    // Value changed
    if (oldValues[i] !== newValues[i]) {
      changes.push({
        property: 'segment.value',
        type: 'modified',
        index: i,
        label: newLabels[i],
        from: oldValues[i],
        to: newValues[i],
        description: `Segment "${newLabels[i] || i + 1}" value changed from ${oldValues[i]} to ${newValues[i]}`
      });
    }

    // Color changed
    if (oldColors[i] !== newColors[i]) {
      changes.push({
        property: 'segment.color',
        type: 'modified',
        index: i,
        label: newLabels[i],
        from: oldColors[i],
        to: newColors[i],
        description: `Segment "${newLabels[i] || i + 1}" color changed`
      });
    }
  }

  return changes;
}

/**
 * Compare common chart properties (size, axes, etc.)
 */
function compareCommonChartProperties(oldProps, newProps) {
  const changes = [];
  const oldConfig = oldProps.config || {};
  const newConfig = newProps.config || {};

  // Height changed
  if (oldConfig.height !== newConfig.height) {
    changes.push({
      property: 'config.height',
      type: 'modified',
      from: oldConfig.height,
      to: newConfig.height,
      description: `Chart height changed from ${oldConfig.height || 'default'} to ${newConfig.height || 'default'}`
    });
  }

  // Show legend changed
  if (oldConfig.showLegend !== newConfig.showLegend) {
    changes.push({
      property: 'config.showLegend',
      type: 'modified',
      from: oldConfig.showLegend,
      to: newConfig.showLegend,
      description: `Legend ${newConfig.showLegend ? 'enabled' : 'disabled'}`
    });
  }

  // Show grid changed
  if (oldConfig.showGrid !== newConfig.showGrid) {
    changes.push({
      property: 'config.showGrid',
      type: 'modified',
      from: oldConfig.showGrid,
      to: newConfig.showGrid,
      description: `Grid ${newConfig.showGrid ? 'enabled' : 'disabled'}`
    });
  }

  // Axes labels changed
  if (oldConfig.xAxisLabel !== newConfig.xAxisLabel) {
    changes.push({
      property: 'config.xAxisLabel',
      type: 'modified',
      from: oldConfig.xAxisLabel,
      to: newConfig.xAxisLabel,
      description: `X-axis label changed from "${oldConfig.xAxisLabel || 'none'}" to "${newConfig.xAxisLabel || 'none'}"`
    });
  }

  if (oldConfig.yAxisLabel !== newConfig.yAxisLabel) {
    changes.push({
      property: 'config.yAxisLabel',
      type: 'modified',
      from: oldConfig.yAxisLabel,
      to: newConfig.yAxisLabel,
      description: `Y-axis label changed from "${oldConfig.yAxisLabel || 'none'}" to "${newConfig.yAxisLabel || 'none'}"`
    });
  }

  // Curve style for line/area charts
  if (oldConfig.curveStyle !== newConfig.curveStyle) {
    changes.push({
      property: 'config.curveStyle',
      type: 'modified',
      from: oldConfig.curveStyle,
      to: newConfig.curveStyle,
      description: `Curve style changed from "${oldConfig.curveStyle || 'linear'}" to "${newConfig.curveStyle || 'linear'}"`
    });
  }

  // Fill style for area charts
  if (oldConfig.fillStyle !== newConfig.fillStyle) {
    changes.push({
      property: 'config.fillStyle',
      type: 'modified',
      from: oldConfig.fillStyle,
      to: newConfig.fillStyle,
      description: `Fill style changed from "${oldConfig.fillStyle || 'solid'}" to "${newConfig.fillStyle || 'solid'}"`
    });
  }

  return changes;
}

/**
 * Format chart changes as human-readable text
 */
export function formatChartChanges(chartDiff) {
  if (!chartDiff || !chartDiff.changes || chartDiff.changes.length === 0) {
    return 'No changes detected';
  }

  return chartDiff.changes.map(change => change.description).join('\n');
}

/**
 * Group chart changes by category
 */
export function groupChartChanges(chartDiff) {
  if (!chartDiff || !chartDiff.changes) return {};

  const grouped = {
    data: [],
    colors: [],
    labels: [],
    config: [],
    other: []
  };

  chartDiff.changes.forEach(change => {
    if (change.property.includes('data') || change.property.includes('value')) {
      grouped.data.push(change);
    } else if (change.property.includes('color') || change.property.includes('backgroundColor') || change.property.includes('borderColor')) {
      grouped.colors.push(change);
    } else if (change.property.includes('label')) {
      grouped.labels.push(change);
    } else if (change.property.startsWith('config.')) {
      grouped.config.push(change);
    } else {
      grouped.other.push(change);
    }
  });

  return grouped;
}
