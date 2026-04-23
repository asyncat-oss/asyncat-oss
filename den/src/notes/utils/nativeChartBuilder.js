// nativeChartBuilder.js - Build native Word charts using OOXML
import JSZip from 'jszip';

// XML namespaces for DrawingML charts
const NAMESPACES = {
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  c14: 'http://schemas.microsoft.com/office/drawing/2007/8/2/chart',
  spreadsheetml: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
};

// Default chart colors (matching Chart.js defaults)
const DEFAULT_COLORS = [
  '4472C4', // Blue
  'ED7D31', // Orange
  'A5A5A5', // Gray
  'FFC000', // Gold
  '5B9BD5', // Light Blue
  '70AD47', // Green
  '255E91', // Dark Blue
  '9E480E', // Dark Orange
  '636363', // Dark Gray
  '997300', // Dark Gold
  '264478', // Navy
  '43682B'  // Dark Green
];

/**
 * Generate a unique ID for chart elements
 */
function generateAxisId() {
  return Math.floor(Math.random() * 900000000) + 100000000;
}

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build the chart XML content
 */
function buildChartXml(chartType, properties, chartIndex) {
  const { data, title, colors, labels, config = {} } = properties;

  // Extract chart data
  const chartData = extractChartData(data, labels);
  const chartColors = colors || DEFAULT_COLORS;

  // Map chart type to OOXML chart element
  const ooXmlType = mapToOoxmlType(chartType);

  // Generate axis IDs
  const catAxisId = generateAxisId();
  const valAxisId = generateAxisId();

  // Build series XML based on chart type
  const seriesXml = buildSeriesXml(ooXmlType, chartData, chartColors, chartType);

  // Build the complete chart XML
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NAMESPACES.c}" xmlns:a="${NAMESPACES.a}" xmlns:r="${NAMESPACES.r}">
  <c:date1904 val="0"/>
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    ${title ? `<c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr>
              <a:defRPr sz="1400" b="0"/>
            </a:pPr>
            <a:r>
              <a:rPr lang="en-US" sz="1400" b="0"/>
              <a:t>${escapeXml(title)}</a:t>
            </a:r>
          </a:p>
        </c:rich>
      </c:tx>
      <c:overlay val="0"/>
    </c:title>` : ''}
    <c:autoTitleDeleted val="${title ? '0' : '1'}"/>
    <c:plotArea>
      <c:layout/>
      ${buildChartTypeXml(ooXmlType, seriesXml, catAxisId, valAxisId, chartType, config)}
      ${!isPieOrDonut(ooXmlType) ? buildAxesXml(catAxisId, valAxisId, chartData.labels, config) : ''}
    </c:plotArea>
    <c:legend>
      <c:legendPos val="${isPieOrDonut(ooXmlType) ? 'r' : 'b'}"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:externalData r:id="rId1">
    <c:autoUpdate val="0"/>
  </c:externalData>
</c:chartSpace>`;
}

/**
 * Map custom chart types to OOXML chart types
 */
function mapToOoxmlType(chartType) {
  const typeMap = {
    'lineChart': 'lineChart',
    'line_chart': 'lineChart',
    'barChart': 'barChart',
    'bar_chart': 'barChart',
    'pieChart': 'pieChart',
    'pie_chart': 'pieChart',
    'areaChart': 'areaChart',
    'area_chart': 'areaChart',
    'scatterChart': 'scatterChart',
    'scatter_chart': 'scatterChart',
    'donutChart': 'doughnutChart',
    'donut_chart': 'doughnutChart'
  };
  return typeMap[chartType] || 'barChart';
}

/**
 * Check if chart type is pie or donut
 */
function isPieOrDonut(ooXmlType) {
  return ooXmlType === 'pieChart' || ooXmlType === 'doughnutChart';
}

/**
 * Extract and normalize chart data
 */
function extractChartData(data, labels) {
  let datasets = [];
  let chartLabels = labels || [];

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object' && 'data' in data[0]) {
      // Array of dataset objects: [{ label, data, ... }]
      datasets = data;
      if (!chartLabels.length && data[0].data) {
        chartLabels = data[0].data.map((_, i) => `Category ${i + 1}`);
      }
    } else if (data.length > 0 && typeof data[0] === 'number') {
      // Simple array of numbers
      datasets = [{ label: 'Series 1', data: data }];
      if (!chartLabels.length) {
        chartLabels = data.map((_, i) => `Category ${i + 1}`);
      }
    }
  } else if (data && typeof data === 'object') {
    if (data.datasets) {
      datasets = data.datasets;
      chartLabels = data.labels || chartLabels;
    } else if (data.series) {
      datasets = data.series.map((s, i) => ({
        label: s.name || `Series ${i + 1}`,
        data: s.data || s.values || []
      }));
      chartLabels = data.categories || data.labels || chartLabels;
    }
  }

  // Ensure we have labels
  if (!chartLabels.length && datasets.length > 0 && datasets[0].data) {
    chartLabels = datasets[0].data.map((_, i) => `Category ${i + 1}`);
  }

  return { datasets, labels: chartLabels };
}

/**
 * Build series XML for the chart
 */
function buildSeriesXml(ooXmlType, chartData, colors, originalType) {
  const { datasets, labels } = chartData;

  return datasets.map((dataset, idx) => {
    const color = colors[idx % colors.length] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
    const colorHex = color.replace('#', '');
    const seriesName = dataset.label || `Series ${idx + 1}`;
    const values = dataset.data || [];

    // Build category (labels) reference
    const catXml = buildCategoryXml(labels, idx);

    // Build values reference
    const valXml = buildValuesXml(values, idx);

    // Build series-specific elements based on chart type
    let shapeProps = '';
    if (isPieOrDonut(ooXmlType)) {
      // For pie/donut, each data point gets a different color
      shapeProps = values.map((_, i) => {
        const pointColor = colors[i % colors.length] || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
        return `<c:dPt>
          <c:idx val="${i}"/>
          <c:bubble3D val="0"/>
          <c:spPr>
            <a:solidFill>
              <a:srgbClr val="${pointColor.replace('#', '')}"/>
            </a:solidFill>
          </c:spPr>
        </c:dPt>`;
      }).join('\n');
    } else {
      shapeProps = `<c:spPr>
        <a:solidFill>
          <a:srgbClr val="${colorHex}"/>
        </a:solidFill>
        ${ooXmlType === 'lineChart' || ooXmlType === 'scatterChart' ? `<a:ln w="28575">
          <a:solidFill>
            <a:srgbClr val="${colorHex}"/>
          </a:solidFill>
        </a:ln>` : ''}
      </c:spPr>`;
    }

    // Add marker for line and scatter charts
    let markerXml = '';
    if (ooXmlType === 'lineChart' || ooXmlType === 'scatterChart') {
      markerXml = `<c:marker>
        <c:symbol val="circle"/>
        <c:size val="5"/>
        <c:spPr>
          <a:solidFill>
            <a:srgbClr val="${colorHex}"/>
          </a:solidFill>
        </c:spPr>
      </c:marker>`;
    }

    return `<c:ser>
      <c:idx val="${idx}"/>
      <c:order val="${idx}"/>
      <c:tx>
        <c:v>${escapeXml(seriesName)}</c:v>
      </c:tx>
      ${shapeProps}
      ${markerXml}
      ${catXml}
      ${valXml}
    </c:ser>`;
  }).join('\n');
}

/**
 * Build category (X-axis labels) XML
 */
function buildCategoryXml(labels, seriesIdx) {
  const pointCount = labels.length;
  const points = labels.map((label, i) =>
    `<c:pt idx="${i}"><c:v>${escapeXml(String(label))}</c:v></c:pt>`
  ).join('\n');

  return `<c:cat>
    <c:strLit>
      <c:ptCount val="${pointCount}"/>
      ${points}
    </c:strLit>
  </c:cat>`;
}

/**
 * Build values (Y-axis data) XML
 */
function buildValuesXml(values, seriesIdx) {
  const pointCount = values.length;
  const points = values.map((val, i) =>
    `<c:pt idx="${i}"><c:v>${val}</c:v></c:pt>`
  ).join('\n');

  return `<c:val>
    <c:numLit>
      <c:formatCode>General</c:formatCode>
      <c:ptCount val="${pointCount}"/>
      ${points}
    </c:numLit>
  </c:val>`;
}

/**
 * Build the chart type-specific XML wrapper
 */
function buildChartTypeXml(ooXmlType, seriesXml, catAxisId, valAxisId, originalType, config) {
  const grouping = config.stacked ? 'stacked' : 'clustered';
  const isHorizontal = config.orientation === 'horizontal';

  switch (ooXmlType) {
    case 'barChart':
      return `<c:barChart>
        <c:barDir val="${isHorizontal ? 'bar' : 'col'}"/>
        <c:grouping val="${grouping}"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:gapWidth val="150"/>
        <c:axId val="${catAxisId}"/>
        <c:axId val="${valAxisId}"/>
      </c:barChart>`;

    case 'lineChart':
      return `<c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:marker val="1"/>
        <c:smooth val="0"/>
        <c:axId val="${catAxisId}"/>
        <c:axId val="${valAxisId}"/>
      </c:lineChart>`;

    case 'areaChart':
      return `<c:areaChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:axId val="${catAxisId}"/>
        <c:axId val="${valAxisId}"/>
      </c:areaChart>`;

    case 'pieChart':
      return `<c:pieChart>
        <c:varyColors val="1"/>
        ${seriesXml}
        <c:firstSliceAng val="0"/>
      </c:pieChart>`;

    case 'doughnutChart':
      return `<c:doughnutChart>
        <c:varyColors val="1"/>
        ${seriesXml}
        <c:firstSliceAng val="0"/>
        <c:holeSize val="50"/>
      </c:doughnutChart>`;

    case 'scatterChart':
      // Scatter charts need xVal and yVal instead of cat and val
      return `<c:scatterChart>
        <c:scatterStyle val="lineMarker"/>
        <c:varyColors val="0"/>
        ${seriesXml.replace(/<c:cat>/g, '<c:xVal>').replace(/<\/c:cat>/g, '</c:xVal>')
                   .replace(/<c:val>/g, '<c:yVal>').replace(/<\/c:val>/g, '</c:yVal>')}
        <c:axId val="${catAxisId}"/>
        <c:axId val="${valAxisId}"/>
      </c:scatterChart>`;

    default:
      return `<c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        ${seriesXml}
        <c:gapWidth val="150"/>
        <c:axId val="${catAxisId}"/>
        <c:axId val="${valAxisId}"/>
      </c:barChart>`;
  }
}

/**
 * Build axes XML (for non-pie charts)
 */
function buildAxesXml(catAxisId, valAxisId, labels, config) {
  return `<c:catAx>
    <c:axId val="${catAxisId}"/>
    <c:scaling>
      <c:orientation val="minMax"/>
    </c:scaling>
    <c:delete val="0"/>
    <c:axPos val="b"/>
    <c:numFmt formatCode="General" sourceLinked="1"/>
    <c:majorTickMark val="out"/>
    <c:minorTickMark val="none"/>
    <c:tickLblPos val="nextTo"/>
    <c:crossAx val="${valAxisId}"/>
    <c:crosses val="autoZero"/>
    <c:auto val="1"/>
    <c:lblAlgn val="ctr"/>
    <c:lblOffset val="100"/>
  </c:catAx>
  <c:valAx>
    <c:axId val="${valAxisId}"/>
    <c:scaling>
      <c:orientation val="minMax"/>
    </c:scaling>
    <c:delete val="0"/>
    <c:axPos val="l"/>
    <c:majorGridlines/>
    <c:numFmt formatCode="General" sourceLinked="1"/>
    <c:majorTickMark val="out"/>
    <c:minorTickMark val="none"/>
    <c:tickLblPos val="nextTo"/>
    <c:crossAx val="${catAxisId}"/>
    <c:crosses val="autoZero"/>
    <c:crossBetween val="between"/>
  </c:valAx>`;
}

/**
 * Build embedded Excel workbook for chart data
 */
function buildEmbeddedExcel(chartData) {
  const { datasets, labels } = chartData;

  // Build worksheet XML
  const sheetDataXml = buildSheetDataXml(datasets, labels);

  // Create the xlsx package
  return createXlsxPackage(sheetDataXml, datasets, labels);
}

/**
 * Build sheet data XML for embedded Excel
 */
function buildSheetDataXml(datasets, labels) {
  const rows = [];

  // Header row with series names
  let headerCells = '<c r="A1" t="s"><v>0</v></c>'; // Empty or "Category" label
  datasets.forEach((ds, i) => {
    const col = String.fromCharCode(66 + i); // B, C, D...
    headerCells += `<c r="${col}1" t="s"><v>${i + 1}</v></c>`;
  });
  rows.push(`<row r="1">${headerCells}</row>`);

  // Data rows
  labels.forEach((label, rowIdx) => {
    const rowNum = rowIdx + 2;
    let cells = `<c r="A${rowNum}" t="s"><v>${datasets.length + 1 + rowIdx}</v></c>`;
    datasets.forEach((ds, colIdx) => {
      const col = String.fromCharCode(66 + colIdx);
      const value = ds.data[rowIdx] || 0;
      cells += `<c r="${col}${rowNum}"><v>${value}</v></c>`;
    });
    rows.push(`<row r="${rowNum}">${cells}</row>`);
  });

  return rows.join('\n');
}

/**
 * Create xlsx package (ZIP with Excel XML files)
 */
async function createXlsxPackage(sheetDataXml, datasets, labels) {
  const zip = new JSZip();

  // Build shared strings
  const sharedStrings = ['Category', ...datasets.map(ds => ds.label || 'Series'), ...labels];
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="${NAMESPACES.spreadsheetml}" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings.map(s => `<si><t>${escapeXml(String(s))}</t></si>`).join('\n')}
</sst>`;

  // Content types
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  // Workbook
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NAMESPACES.spreadsheetml}" xmlns:r="${NAMESPACES.r}">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  // Worksheet
  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NAMESPACES.spreadsheetml}">
  <sheetData>
    ${sheetDataXml}
  </sheetData>
</worksheet>`;

  // Relationships
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  // Add files to zip
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('xl/worksheets/sheet1.xml', worksheetXml);
  zip.file('xl/sharedStrings.xml', sharedStringsXml);

  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Build the drawing XML that references the chart
 */
function buildDrawingXml(chartIndex, width = 5486400, height = 3200400) {
  // Width and height in EMUs (English Metric Units)
  // 914400 EMUs = 1 inch
  // Default: ~6 inches wide, ~3.5 inches tall

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:drawing xmlns:w="${NAMESPACES.w}" xmlns:wp="${NAMESPACES.wp}" xmlns:a="${NAMESPACES.a}" xmlns:c="${NAMESPACES.c}" xmlns:r="${NAMESPACES.r}">
  <wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="${width}" cy="${height}"/>
    <wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:docPr id="${chartIndex}" name="Chart ${chartIndex}"/>
    <wp:cNvGraphicFramePr/>
    <a:graphic>
      <a:graphicData uri="${NAMESPACES.c}">
        <c:chart r:id="rId${chartIndex}"/>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing>`;
}

/**
 * Inject native charts into a DOCX buffer
 * @param {Buffer} docxBuffer - The original DOCX buffer
 * @param {Array} charts - Array of { chartType, properties, placeholderText }
 * @returns {Promise<Buffer>} Modified DOCX buffer with native charts
 */
async function injectNativeCharts(docxBuffer, charts) {
  if (!charts || charts.length === 0) {
    return docxBuffer;
  }

  try {
    console.log(`[NativeChartBuilder] Starting chart injection for ${charts.length} chart(s)`);
    const zip = await JSZip.loadAsync(docxBuffer);

    // Get document.xml
    let documentXml = await zip.file('word/document.xml').async('string');
    console.log(`[NativeChartBuilder] Document XML length: ${documentXml.length}`);

    // Get or create content types
    let contentTypesXml = await zip.file('[Content_Types].xml').async('string');

    // Get or create document relationships
    let documentRelsXml = '';
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      documentRelsXml = await relsFile.async('string');
    } else {
      documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
    }

    // Find the highest existing relationship ID
    let maxRelId = 0;
    const relIdMatches = documentRelsXml.matchAll(/Id="rId(\d+)"/g);
    for (const match of relIdMatches) {
      maxRelId = Math.max(maxRelId, parseInt(match[1]));
    }

    // Collect all chart drawings to add at the end
    const chartDrawings = [];

    // Process each chart
    for (let i = 0; i < charts.length; i++) {
      const { chartType, properties, placeholderText } = charts[i];
      const chartIndex = i + 1;
      const relId = maxRelId + chartIndex;

      console.log(`[NativeChartBuilder] Processing chart ${chartIndex}: ${chartType}`);

      // Extract chart data for embedded Excel
      const chartData = extractChartData(properties.data, properties.labels);

      // Build chart XML
      const chartXml = buildChartXml(chartType, properties, chartIndex);

      // Build embedded Excel
      const excelBuffer = await buildEmbeddedExcel(chartData);

      // Build chart relationships
      const chartRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet${chartIndex}.xlsx"/>
</Relationships>`;

      // Add chart files to zip
      zip.file(`word/charts/chart${chartIndex}.xml`, chartXml);
      zip.file(`word/charts/_rels/chart${chartIndex}.xml.rels`, chartRelsXml);
      zip.file(`word/embeddings/Microsoft_Excel_Worksheet${chartIndex}.xlsx`, excelBuffer);

      // Add content type for chart
      if (!contentTypesXml.includes(`/word/charts/chart${chartIndex}.xml`)) {
        contentTypesXml = contentTypesXml.replace(
          '</Types>',
          `  <Override PartName="/word/charts/chart${chartIndex}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
  <Override PartName="/word/embeddings/Microsoft_Excel_Worksheet${chartIndex}.xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>
</Types>`
        );
      }

      // Add relationship to document.xml.rels
      documentRelsXml = documentRelsXml.replace(
        '</Relationships>',
        `  <Relationship Id="rId${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart${chartIndex}.xml"/>
</Relationships>`
      );

      // Build the inline drawing XML for the chart
      // Note: Don't include namespace declarations here - they're already in document root
      const drawingXml = `<w:p><w:r><w:drawing>
  <wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="5486400" cy="3200400"/>
    <wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:docPr id="${chartIndex}" name="Chart ${chartIndex}"/>
    <wp:cNvGraphicFramePr/>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart r:id="rId${relId}"/>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing></w:r></w:p>`;

      chartDrawings.push(drawingXml);

      // Remove placeholder text from document
      if (placeholderText) {
        const escapedPlaceholder = escapeXml(placeholderText).replace(/\[/g, '\\[').replace(/\]/g, '\\]');
        documentXml = documentXml.replace(new RegExp(escapedPlaceholder, 'g'), `Chart ${chartIndex}`);
      }
    }

    // Add all charts at the end of the document
    if (chartDrawings.length > 0) {
      const allCharts = chartDrawings.join('\n');
      documentXml = documentXml.replace(
        '</w:body>',
        `${allCharts}</w:body>`
      );
      console.log(`[NativeChartBuilder] Added ${chartDrawings.length} chart(s) to document`);
    }

    // Update files in zip
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('word/_rels/document.xml.rels', documentRelsXml);
    zip.file('word/document.xml', documentXml);

    // Debug: Write document.xml to file for inspection
    try {
      const fs = await import('fs');
      await fs.promises.writeFile('/tmp/debug_document.xml', documentXml);
      console.log('[NativeChartBuilder] Wrote debug document.xml to /tmp/debug_document.xml');
    } catch (e) {
      console.warn('[NativeChartBuilder] Could not write debug file:', e.message);
    }

    console.log('[NativeChartBuilder] Chart injection completed successfully');
    return zip.generateAsync({ type: 'nodebuffer' });
  } catch (error) {
    console.error('[NativeChartBuilder] Error during chart injection:', error);
    console.error('[NativeChartBuilder] Error stack:', error.stack);
    // Return original buffer if injection fails
    return docxBuffer;
  }
}

/**
 * Create a chart placeholder text that will be replaced later
 */
function createChartPlaceholder(chartIndex) {
  return `[CHART_PLACEHOLDER_${chartIndex}]`;
}

export {
  buildChartXml,
  buildEmbeddedExcel,
  injectNativeCharts,
  createChartPlaceholder,
  extractChartData
};
