// docxConverter.js - Convert note blocks to DOCX format
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  convertInchesToTwip,
  CheckBox
} from 'docx';
import { injectNativeCharts } from './nativeChartBuilder.js';
import localStorageService from '../../storage/localStorageService.js';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';

/**
 * Convert blocks to DOCX document
 * @param {object} options - { title, blocks, noteId, db }
 * @returns {Promise<Buffer>} DOCX file buffer
 */
async function convertBlocksToDocx({ title, blocks, noteId, db }) {
  // Track charts for native OOXML injection
  const chartsToInject = [];

  // Add title as large, bold, black text (not a heading style to avoid blue color)
  const titleParagraph = new Paragraph({
    children: [
      new TextRun({
        text: title,
        size: 48, // 24pt (PDF uses 3em ≈ 42px ≈ 32pt, but 24pt is a good readable size)
        bold: true,
        color: '000000' // Black color
      })
    ],
    spacing: { after: 400 }
  });

  // Convert blocks with list grouping
  const blockElements = [];
  blockElements.push(titleParagraph);

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];

    // Normalize block type to handle both camelCase and snake_case
    // Convert camelCase to snake_case: bulletList -> bullet_list
    const normalizedType = block.type.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

    // Check if this is a list block
    if (normalizedType === 'bullet_list' || normalizedType === 'numbered_list') {
      // Group consecutive list items of the same type
      const listBlocks = [];
      const listType = normalizedType;

      while (i < blocks.length) {
        const currentNormalizedType = blocks[i].type.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        if (currentNormalizedType === listType) {
          listBlocks.push(blocks[i]);
          i++;
        } else {
          break;
        }
      }

      // Convert grouped list to DOCX
      try {
        const elements = convertListBlocksToDocx(listBlocks, listType);
        blockElements.push(...elements);
      } catch (error) {
        console.error(`[DocxConverter] Error converting list blocks:`, error);
        blockElements.push(new Paragraph({
          text: `[Error rendering list]`,
          italics: true
        }));
      }
    } else {
      // Regular block - convert individually
      try {
        const elements = await convertBlockToDocx(block, noteId, chartsToInject);

        // Validate elements before adding
        if (Array.isArray(elements) && elements.length > 0) {
          // Filter out any null, undefined, or invalid elements
          const validElements = elements.filter(el => el != null);
          if (validElements.length > 0) {
            blockElements.push(...validElements);
          } else {
            console.warn(`[DocxConverter] Block ${block.id} (${block.type}) returned no valid elements`);
          }
        } else {
          console.warn(`[DocxConverter] Block ${block.id} (${block.type}) returned empty or invalid result`);
        }
      } catch (error) {
        console.error(`[DocxConverter] Error converting block ${block.id}:`, error);
        console.error(`[DocxConverter] Block type: ${block.type}`);
        console.error(`[DocxConverter] Block content:`, block.content?.substring(0, 100));
        blockElements.push(new Paragraph({
          text: `[Error rendering block: ${block.type}]`,
          italics: true,
          color: '999999'
        }));
      }
      i++;
    }
  }

  // Final validation: ensure all elements are valid DOCX objects
  const validBlockElements = blockElements.filter(el => {
    if (el == null) {
      console.warn('[DocxConverter] Found null/undefined element in blockElements');
      return false;
    }
    return true;
  });

  console.log(`[DocxConverter] Total elements: ${blockElements.length}, Valid elements: ${validBlockElements.length}`);

  if (validBlockElements.length === 0) {
    console.error('[DocxConverter] No valid elements to add to document!');
    // Add at least the title
    validBlockElements.push(titleParagraph);
  }

  // Create document with numbering definitions
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) }
                }
              }
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: '%2.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(1.0), hanging: convertInchesToTwip(0.25) }
                }
              }
            },
            {
              level: 2,
              format: LevelFormat.LOWER_ROMAN,
              text: '%3.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(0.25) }
                }
              }
            },
            {
              level: 3,
              format: LevelFormat.UPPER_LETTER,
              text: '%4.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(2.0), hanging: convertInchesToTwip(0.25) }
                }
              }
            }
          ]
        }
      ]
    },
    sections: [{
      properties: {},
      children: validBlockElements
    }]
  });

  // Generate buffer
  try {
    console.log('[DocxConverter] Generating DOCX buffer...');
    let buffer = await Packer.toBuffer(doc);
    console.log('[DocxConverter] DOCX buffer generated successfully, size:', buffer.length);

    // Inject native charts if any
    const ENABLE_NATIVE_CHARTS = true;

    if (ENABLE_NATIVE_CHARTS && chartsToInject.length > 0) {
      console.log(`[DocxConverter] Injecting ${chartsToInject.length} native chart(s)...`);
      buffer = await injectNativeCharts(buffer, chartsToInject);
      console.log('[DocxConverter] Native charts injected successfully, new size:', buffer.length);
    } else if (chartsToInject.length > 0) {
      console.log(`[DocxConverter] Chart injection DISABLED - ${chartsToInject.length} chart(s) skipped`);
    }

    return buffer;
  } catch (packError) {
    console.error('[DocxConverter] Error generating DOCX buffer:', packError);
    console.error('[DocxConverter] Error stack:', packError.stack);
    throw new Error(`Failed to generate DOCX: ${packError.message}`);
  }
}

/**
 * Convert grouped list blocks to DOCX paragraphs with proper numbering
 * @param {Array} listBlocks - Array of list blocks
 * @param {string} listType - 'bullet_list' or 'numbered_list'
 * @returns {Array} Array of DOCX Paragraph elements
 */
function convertListBlocksToDocx(listBlocks, listType) {
  if (listBlocks.length === 0) return [];

  const isBullet = listType === 'bullet_list';
  const paragraphs = [];

  for (const block of listBlocks) {
    // Parse HTML to preserve formatting like highlights, bold, italic, etc.
    const textRuns = parseHtmlToTextRuns(block.content || '');
    // NOTE: Frontend uses 'indentLevel', not 'indent'
    const indent = block.properties?.indentLevel || block.properties?.indent || 0;

    if (isBullet) {
      paragraphs.push(new Paragraph({
        children: textRuns,
        bullet: { level: indent },
        spacing: { after: 50 }
      }));
    } else {
      paragraphs.push(new Paragraph({
        children: textRuns,
        numbering: { reference: 'default-numbering', level: indent },
        spacing: { after: 50 }
      }));
    }
  }

  return paragraphs;
}

/**
 * Convert a single block to DOCX elements
 * @param {object} block - Block object
 * @param {string} noteId - Note ID for fetching attachments
 * @returns {Promise<Array>} Array of DOCX elements
 */
async function convertBlockToDocx(block, noteId, chartsToInject = []) {
  const { type, content, properties } = block;

  switch (type) {
    case 'text':
      return convertTextBlock(content, properties);

    case 'heading1':
      return convertHeading(content, 1);

    case 'heading2':
      return convertHeading(content, 2);

    case 'heading3':
      return convertHeading(content, 3);

    case 'bullet_list':
    case 'numbered_list':
      // These are now handled by convertListBlocksToDocx in the grouping logic
      // This case should not be reached, but just in case:
      console.warn('[DocxConverter] Individual list block encountered - should be grouped');
      return [new Paragraph({
        text: stripHtml(content),
        bullet: type === 'bullet_list' ? { level: 0 } : undefined,
        numbering: type === 'numbered_list' ? { reference: 'default-numbering', level: 0 } : undefined,
        spacing: { after: 50 }
      })];

    case 'todo':
      return convertTodoBlock(content, properties);

    case 'quote':
      return convertQuoteBlock(content);

    case 'code':
      return convertCodeBlock(content, properties);

    case 'table':
      return convertTableBlock(properties);

    case 'image':
      return await convertImageBlock(properties, noteId);

    case 'video':
      return await convertVideoBlock(properties, noteId);

    case 'audio':
      return convertAudioBlock(properties);

    case 'file':
      return convertFileBlock(properties);

    case 'divider':
      return [new Paragraph({
        text: '─'.repeat(60),
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 }
      })];

    case 'callout':
      return convertCalloutBlock(content, properties);

    case 'toggle':
      return convertToggleBlock(content, properties);

    case 'link_preview':
      return convertLinkPreviewBlock(properties);

    case 'embed':
      return convertEmbedBlock(properties);

    case 'progress_bar':
      return convertProgressBarBlock(properties);

    case 'breadcrumb':
      return convertBreadcrumbBlock(properties);

    case 'button':
      return convertButtonBlock(properties);

    case 'math':
      return convertMathBlock(content, properties);

    // Chart blocks (snake_case)
    case 'line_chart':
    case 'bar_chart':
    case 'pie_chart':
    case 'area_chart':
    case 'scatter_chart':
    case 'donut_chart':
    // Chart blocks (camelCase - frontend format)
    case 'lineChart':
    case 'barChart':
    case 'pieChart':
    case 'areaChart':
    case 'scatterChart':
    case 'donutChart':
      return await convertChartBlock(type, properties, chartsToInject);

    default:
      return [new Paragraph({
        text: stripHtml(content) || `[${type} block]`,
        spacing: { after: 100 }
      })];
  }
}

/**
 * Convert heading with formatting preserved
 */
function convertHeading(content, level) {
  // Define heading sizes
  const sizes = {
    1: 32, // 16pt
    2: 28, // 14pt
    3: 24  // 12pt
  };

  const spacings = {
    1: { before: 200, after: 200 },
    2: { before: 200, after: 150 },
    3: { before: 150, after: 100 }
  };

  // Parse HTML to preserve formatting like highlights
  const textRuns = parseHtmlToTextRuns(content || '', {
    size: sizes[level],
    bold: true,
    color: '000000'
  });

  return [new Paragraph({
    children: textRuns,
    spacing: spacings[level]
  })];
}

/**
 * Convert text block with inline formatting
 */
function convertTextBlock(content, properties) {
  if (!content) {
    return [new Paragraph({ text: '' })];
  }

  // Parse HTML to extract formatting
  const textRuns = parseHtmlToTextRuns(content);

  return [new Paragraph({
    children: textRuns,
    spacing: { after: 100 }
  })];
}

/**
 * Parse HTML content to TextRuns with formatting
 * @param {string} html - HTML content to parse
 * @param {object} baseFormatting - Base formatting to apply to all runs (e.g., for headings)
 */
function parseHtmlToTextRuns(html, baseFormatting = {}) {
  if (!html) {
    return [new TextRun({ text: '', ...baseFormatting })];
  }

  // Convert literal newline characters (\n) to <br> tags
  // This handles content that uses \n for line breaks instead of <br>
  html = html.replace(/\n/g, '<br>');

  const textRuns = [];

  // Stack to track active formatting (includes tag name and attributes)
  const formatStack = [];

  // Split content by tags while preserving text
  let remaining = html;
  const segments = [];

  // Debug: Check if there are any highlights or breaks in the HTML
  const hasHighlights = /style\s*=\s*["'][^"']*background-color[^"']*["']/i.test(html);
  const hasBreaks = /<br[\s/>]/i.test(html);
  if (hasHighlights) {
    console.log('[DocxConverter] HTML contains highlights, parsing:', html.substring(0, 200));
  }
  if (hasBreaks) {
    console.log('[DocxConverter] HTML contains <br> tags (or converted from \\n), parsing:', html.substring(0, 200));
  }

  // Extract all text segments with their formatting context
  while (remaining.length > 0) {
    const match = /<(\/?)([a-z]+)([^>]*)>/i.exec(remaining);

    if (!match) {
      // No more tags, add remaining text (including whitespace-only text)
      if (remaining.length > 0) {
        segments.push({ text: remaining, format: [...formatStack] });
      }
      break;
    }

    const [fullMatch, isClosing, tagName, attributes] = match;
    const beforeTag = remaining.substring(0, match.index);

    // Add text before the tag (preserve all text, even if empty or whitespace)
    if (beforeTag.length > 0) {
      segments.push({ text: beforeTag, format: [...formatStack] });
    }

    // Handle <br>, <br/>, and <br /> tags as line breaks (self-closing, no closing tag needed)
    if (tagName.toLowerCase() === 'br' && isClosing !== '/') {
      console.log('[DocxConverter] Found <br> tag, adding line break');
      segments.push({ text: '', format: [...formatStack], isBreak: true });
      remaining = remaining.substring(match.index + fullMatch.length);
      continue;
    }

    // Update format stack
    if (isClosing === '/') {
      // Remove the last occurrence of this tag from stack
      const index = formatStack.map(f => f.tag).lastIndexOf(tagName.toLowerCase());
      if (index !== -1) {
        formatStack.splice(index, 1);
      }
    } else {
      // Parse style attribute for background-color (highlights)
      // Highlights can be on ANY tag (span, b, i, u, strike, etc.)
      let bgColor = null;
      if (attributes) {
        const styleMatch = /style\s*=\s*["']([^"']*)["']/i.exec(attributes);
        if (styleMatch) {
          const styleStr = styleMatch[1];
          const bgColorMatch = /background-color\s*:\s*([^;]+)/i.exec(styleStr);
          if (bgColorMatch) {
            bgColor = bgColorMatch[1].trim();
            console.log('[DocxConverter] Found highlight color on', tagName, ':', bgColor);
          }
        }
      }
      formatStack.push({ tag: tagName.toLowerCase(), bgColor });
    }

    remaining = remaining.substring(match.index + fullMatch.length);
  }

  console.log('[DocxConverter] Total segments parsed:', segments.length);

  // Convert segments to TextRuns
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Handle line breaks - check if the NEXT segment is a break
    // If so, we'll add break property to the current text run
    const nextSegment = i < segments.length - 1 ? segments[i + 1] : null;
    const hasBreakAfter = nextSegment && nextSegment.isBreak;

    // Skip break segments themselves as we handle them via hasBreakAfter
    if (segment.isBreak) {
      // If this is a break and there's no text before it, add an explicit break TextRun
      if (textRuns.length === 0 || (i > 0 && segments[i - 1].isBreak)) {
        textRuns.push(new TextRun({
          text: '',
          break: 1,
          ...baseFormatting
        }));
      }
      continue;
    }

    // Skip only completely empty segments, but preserve whitespace
    if (segment.text.length === 0) continue;

    const runOptions = {
      text: segment.text
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
    };

    // Check if there's a highlight (for priority handling)
    const hasHighlight = segment.format.some(fmt => fmt.tag === 'span' && fmt.bgColor);

    // Apply formatting based on tags
    for (const fmt of segment.format) {
      const tag = fmt.tag;

      if (tag === 'strong' || tag === 'b') {
        runOptions.bold = true;
      }
      if (tag === 'em' || tag === 'i') {
        runOptions.italics = true;
      }
      if (tag === 'u') {
        runOptions.underline = {};
      }
      if (tag === 's' || tag === 'strike' || tag === 'del') {
        runOptions.strike = true;
      }
      if (tag === 'code') {
        runOptions.font = 'Courier New';
        // Only apply code background if there's no highlight
        if (!hasHighlight) {
          runOptions.shading = { fill: 'F5F5F5' };
        }
      }
      if (tag === 'a') {
        runOptions.color = '0563C1'; // Blue color for links
        runOptions.underline = {};
      }

      // Handle highlights (background-color on any tag) - takes priority over code background
      if (fmt.bgColor) {
        const hexColor = convertColorToHex(fmt.bgColor);
        console.log('[DocxConverter] Converting color from', tag, ':', fmt.bgColor, '→', hexColor);
        if (hexColor && hexColor !== '000000' && hexColor !== 'transparent') {
          runOptions.shading = { fill: hexColor };
          console.log('[DocxConverter] Applied shading to text:', segment.text.substring(0, 50));
        }
      }
    }

    // Merge base formatting with run-specific options
    // Base formatting (like heading size) should not override inline formatting (like highlights)
    const finalOptions = {
      ...baseFormatting,
      ...runOptions
    };

    // Special handling: if baseFormatting has shading but runOptions also has shading,
    // prioritize runOptions.shading (inline highlights over base)
    if (baseFormatting.shading && runOptions.shading) {
      finalOptions.shading = runOptions.shading;
    }

    // Add break after this text run if the next segment is a break
    if (hasBreakAfter) {
      finalOptions.break = 1;
      console.log('[DocxConverter] Adding break after text:', segment.text.substring(0, 50));
    }

    textRuns.push(new TextRun(finalOptions));
  }

  // If no text runs were created, return empty text run
  if (textRuns.length === 0) {
    return [new TextRun({ text: '', ...baseFormatting })];
  }

  return textRuns;
}

/**
 * Convert CSS color to hex format for Word
 */
function convertColorToHex(color) {
  if (!color) return null;

  // Already hex
  if (/^#[0-9A-F]{6}$/i.test(color)) {
    return color.substring(1).toUpperCase();
  }

  // RGB/RGBA format
  const rgbMatch = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // Common color names used in the app
  const colorMap = {
    'yellow': 'FFFF00',
    'lightyellow': 'FFFFE0',
    'transparent': null,
    // App-specific highlight colors (from ModernBlockEditor.jsx)
    '#fff3b0': 'FFF3B0',  // Light theme highlight
    '#facc15': 'FACC15'   // Dark theme highlight
  };

  const lower = color.toLowerCase();
  return colorMap[lower] || null;
}

/**
 * Strip HTML tags
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Convert quote block
 */
function convertQuoteBlock(content) {
  // For quotes, we'll apply italic formatting by wrapping content in <em> tags
  // This preserves other formatting while adding italics
  const wrappedContent = content ? `<em>${content}</em>` : '';
  const textRuns = parseHtmlToTextRuns(wrappedContent);

  return [new Paragraph({
    children: textRuns,
    indent: { left: 720 }, // 0.5 inch
    spacing: { before: 100, after: 100 }
  })];
}

/**
 * Convert TODO block with native checkbox
 */
function convertTodoBlock(content, properties) {
  const checked = properties?.checked || false;

  // Parse content to preserve formatting
  const contentRuns = parseHtmlToTextRuns(content || '');

  try {
    // Create checkbox using CheckBox class for native support
    const checkbox = new CheckBox({
      checked: checked,
      checkedState: {
        value: '2611', // ☑ Unicode
        font: 'MS Gothic'
      },
      uncheckedState: {
        value: '2610', // ☐ Unicode
        font: 'MS Gothic'
      }
    });

    return [new Paragraph({
      children: [
        checkbox,
        new TextRun(' '), // Space after checkbox
        ...contentRuns
      ],
      spacing: { after: 50 }
    })];
  } catch (error) {
    // Fallback to unicode characters if CheckBox is not available
    console.warn('[DocxConverter] CheckBox not supported, using unicode fallback:', error);
    const fallbackCheckbox = checked ? '☑' : '☐';
    return [new Paragraph({
      children: [
        new TextRun({ text: `${fallbackCheckbox} ` }),
        ...contentRuns
      ],
      spacing: { after: 50 }
    })];
  }
}

/**
 * Convert code block
 */
function convertCodeBlock(content, properties) {
  const language = properties?.language || 'plaintext';

  return [
    new Paragraph({
      text: `Code (${language}):`,
      bold: true,
      spacing: { before: 100, after: 50 }
    }),
    new Paragraph({
      text: stripHtml(content),
      font: 'Courier New',
      shading: { fill: 'F5F5F5' },
      spacing: { after: 100 }
    })
  ];
}

/**
 * Convert table block with formatting preservation
 * Uses minimal styling to allow native table appearance in Word/Google Docs
 */
function convertTableBlock(properties) {
  const tableData = properties?.tableData || [[]];
  const hasHeader = properties?.hasHeader || false;

  // Calculate column count from first row
  const columnCount = tableData.length > 0 ? tableData[0].length : 1;

  // Calculate equal column widths that sum to 100%
  const columnWidth = Math.floor(10000 / columnCount); // Width in DXA units (1/20 of a point)

  const rows = tableData.map((rowData, rowIndex) => {
    const cells = rowData.map((cellData, cellIndex) => {
      // Extract cell content - handle both string and object formats
      const cellText = typeof cellData === 'object' ? cellData.content || '' : cellData;

      // Parse HTML to preserve formatting (bold, italic, underline, highlights, etc.)
      const cellTextRuns = parseHtmlToTextRuns(cellText);

      // Create table cell with proper width and word wrapping
      const cellOptions = {
        children: [new Paragraph({
          children: cellTextRuns
        })],
        width: {
          size: columnWidth,
          type: 'dxa' // DXA units (twentieths of a point)
        },
        margins: {
          top: 100,
          bottom: 100,
          left: 100,
          right: 100
        }
      };

      // Only add header shading if it's the first row and hasHeader is true
      if (hasHeader && rowIndex === 0) {
        cellOptions.shading = { fill: 'E0E0E0' };
      }

      return new TableCell(cellOptions);
    });

    return new TableRow({
      children: cells,
      cantSplit: false // Allow row to break across pages if needed
    });
  });

  // Create table with fixed layout for manual column resizing
  const table = new Table({
    rows: rows,
    width: {
      size: 100,
      type: 'pct' // 100% of page width
    },
    layout: 'fixed', // Fixed layout allows manual column resizing
    columnWidths: Array(columnCount).fill(columnWidth) // Set initial equal column widths
    // No custom borders - applications will apply their default table style
  });

  return [table, new Paragraph({ text: '', spacing: { after: 100 } })];
}

/**
 * Convert image block
 */
async function convertImageBlock(properties, noteId) {
  try {
    const { url, alt, caption, width, height } = properties;

    console.log('[DocxConverter] Image block properties:', { url: url?.substring(0, 100), alt, caption, width, height });

    if (!url) {
      return [new Paragraph({ text: '[Image: No URL provided]' })];
    }

    let imageBuffer = null;

    // Try local storage first
    const localPath = localStorageService.getLocalPathFromUrl(url);
    if (localPath) {
      try {
        imageBuffer = await fsp.readFile(localPath);
        console.log('[DocxConverter] Loaded image from local storage, size:', imageBuffer.length);
      } catch (err) {
        console.log('[DocxConverter] Local file not found, trying URL fetch');
      }
    }

    // If local storage failed and URL is a direct HTTP(S) URL, try to fetch it
    if (!imageBuffer && (url.startsWith('http://') || url.startsWith('https://'))) {
      console.log('[DocxConverter] Trying to fetch image from URL:', url.substring(0, 100));
      try {
        const response = await fetch(url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
          console.log('[DocxConverter] Fetched image successfully, size:', imageBuffer.length);
        } else {
          console.error('[DocxConverter] Failed to fetch image, status:', response.status);
        }
      } catch (fetchError) {
        console.error('[DocxConverter] Fetch error:', fetchError);
      }
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      console.error('[DocxConverter] Image buffer is empty or null');
      return [new Paragraph({
        children: [
          new TextRun({
            text: `[Image: ${alt || caption || filename || 'Failed to load'}]`,
            italics: true,
            color: '999999'
          })
        ],
        spacing: { before: 100, after: 100 }
      })];
    }

    // Verify buffer is valid
    if (!Buffer.isBuffer(imageBuffer)) {
      console.error('[DocxConverter] Image data is not a valid Buffer');
      return [new Paragraph({
        children: [
          new TextRun({
            text: `[Image: Invalid data format]`,
            italics: true,
            color: '999999'
          })
        ],
        spacing: { before: 100, after: 100 }
      })];
    }

    // Parse dimensions - convert strings like '600px' or 'auto' to numbers
    const parseSize = (size, defaultValue) => {
      if (!size || size === 'auto') return defaultValue;
      if (typeof size === 'number') return size;
      if (typeof size === 'string') {
        // Remove 'px' suffix and parse as number
        const num = parseInt(size.replace('px', ''), 10);
        return isNaN(num) ? defaultValue : num;
      }
      return defaultValue;
    };

    // Calculate dimensions - respect the actual width/height from the note
    let imgWidth = parseSize(width, 600);
    let imgHeight = parseSize(height, 400);

    // If we have both dimensions, maintain aspect ratio when scaling down
    const maxWidth = 600; // Maximum width in pixels for page layout
    if (imgWidth > maxWidth) {
      // Scale down proportionally
      const scale = maxWidth / imgWidth;
      imgHeight = Math.round(imgHeight * scale);
      imgWidth = maxWidth;
    }

    console.log('[DocxConverter] Image dimensions:', {
      original: { width, height },
      parsed: { imgWidth, imgHeight }
    });

    try {
      const elements = [
        new Paragraph({
          children: [
            new ImageRun({
              data: imageBuffer,
              transformation: {
                width: imgWidth,
                height: imgHeight
              }
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 50 }
        })
      ];

      // Add caption if present
      if (caption) {
        elements.push(new Paragraph({
          text: stripHtml(caption),
          alignment: AlignmentType.CENTER,
          italics: true,
          spacing: { after: 100 }
        }));
      }

      return elements;
    } catch (imageRunError) {
      console.error('[DocxConverter] Failed to create ImageRun:', imageRunError);
      return [new Paragraph({
        children: [
          new TextRun({
            text: `[Image: ${alt || caption || filename || 'Error creating image'}]`,
            italics: true,
            color: '999999'
          })
        ],
        spacing: { before: 100, after: 100 }
      })];
    }
  } catch (error) {
    console.error('[DocxConverter] Image conversion error:', error);
    return [new Paragraph({
      children: [
        new TextRun({
          text: `[Image: ${properties.alt || properties.caption || properties.filename || 'Failed to load'}]`,
          italics: true,
          color: '999999'
        })
      ],
      spacing: { before: 100, after: 100 }
    })];
  }
}

/**
 * Download attachment from local storage
 */
async function downloadAttachment(url, noteId) {
  try {
    if (!url) {
      console.log('[DocxConverter] Missing URL');
      return null;
    }

    let urlPath = url.split('?')[0];
    urlPath = urlPath.split('%3F')[0];
    const filename = urlPath.split('/').pop();

    console.log('[DocxConverter] Extracted filename from URL:', filename);

    if (!filename) {
      console.log('[DocxConverter] Could not extract filename from URL:', url);
      return null;
    }

    // Try local storage first
    const localPath = localStorageService.getLocalPathFromUrl(url);
    if (localPath) {
      try {
        const buffer = await fsp.readFile(localPath);
        console.log('[DocxConverter] Successfully downloaded from local, size:', buffer.length);
        return buffer;
      } catch (err) {
        console.log('[DocxConverter] Local file not found:', localPath);
      }
    }

    // Try fetching from URL if it's HTTP(S)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          console.log('[DocxConverter] Successfully fetched from URL, size:', buffer.length);
          return Buffer.from(buffer);
        }
      } catch (fetchErr) {
        console.error('[DocxConverter] URL fetch failed:', fetchErr.message);
      }
    }

    console.log('[DocxConverter] Could not find file for:', filename);
    return null;
  } catch (error) {
    console.error('[DocxConverter] Download attachment error:', error);
    return null;
  }
}

/**
 * Convert video block
 */
async function convertVideoBlock(properties, noteId) {
  try {
    const { url, filename, caption, thumbnail, width, height } = properties;

    console.log('[DocxConverter] Video block properties:', { url: url?.substring(0, 100), filename, caption, thumbnail, width, height });

    const elements = [];

    // If we have a thumbnail, try to embed it as a clickable image
    if (thumbnail) {
      let thumbnailBuffer = null;

      // Try to download thumbnail from local storage
      thumbnailBuffer = await downloadAttachment(thumbnail, noteId);

      // If local storage failed and thumbnail is a direct HTTP(S) URL, try to fetch it
      if (!thumbnailBuffer && (thumbnail.startsWith('http://') || thumbnail.startsWith('https://'))) {
        console.log('[DocxConverter] Trying to fetch video thumbnail from URL:', thumbnail.substring(0, 100));
        try {
          const response = await fetch(thumbnail);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            thumbnailBuffer = Buffer.from(arrayBuffer);
            console.log('[DocxConverter] Fetched thumbnail successfully, size:', thumbnailBuffer.length);
          }
        } catch (fetchError) {
          console.error('[DocxConverter] Thumbnail fetch error:', fetchError);
        }
      }

      if (thumbnailBuffer && thumbnailBuffer.length > 0 && Buffer.isBuffer(thumbnailBuffer)) {
        // Parse dimensions - convert strings like '600px' or 'auto' to numbers
        const parseSize = (size, defaultValue) => {
          if (!size || size === 'auto') return defaultValue;
          if (typeof size === 'number') return size;
          if (typeof size === 'string') {
            const num = parseInt(size.replace('px', ''), 10);
            return isNaN(num) ? defaultValue : num;
          }
          return defaultValue;
        };

        // Calculate thumbnail dimensions
        let imgWidth = parseSize(width, 600);
        let imgHeight = parseSize(height, 400);

        // Scale down if too large
        const maxWidth = 600;
        if (imgWidth > maxWidth) {
          const scale = maxWidth / imgWidth;
          imgHeight = Math.round(imgHeight * scale);
          imgWidth = maxWidth;
        }

        // Add thumbnail image (embedded video preview)
        try {
          elements.push(new Paragraph({
            children: [
              new ImageRun({
                data: thumbnailBuffer,
                transformation: {
                  width: imgWidth,
                  height: imgHeight
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 10 }
          }));

          // Add small video indicator below thumbnail
          elements.push(new Paragraph({
            children: [
              new TextRun({
                text: '🎥 Video',
                size: 20,
                italics: true,
                color: '666666'
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: caption ? 10 : 100 }
          }));
        } catch (thumbnailError) {
          console.error('[DocxConverter] Failed to create video thumbnail ImageRun:', thumbnailError);
          // Fallback to text if thumbnail fails
          elements.push(new Paragraph({
            children: [
              new TextRun({
                text: `🎥 Video: ${filename || 'Untitled Video'}`,
                bold: true,
                size: 24
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: caption ? 10 : 100 }
          }));
        }
      } else {
        // Fallback: No thumbnail available
        elements.push(new Paragraph({
          children: [
            new TextRun({
              text: `🎥 Video: ${filename || 'Untitled Video'}`,
              bold: true,
              size: 24
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: caption ? 10 : 100 }
        }));
      }
    } else {
      // No thumbnail, show video icon and filename
      elements.push(new Paragraph({
        children: [
          new TextRun({
            text: `🎥 Video: ${filename || 'Untitled Video'}`,
            bold: true,
            size: 24
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: caption ? 10 : 100 }
      }));
    }

    // Add caption if present
    if (caption) {
      elements.push(new Paragraph({
        text: stripHtml(caption),
        alignment: AlignmentType.CENTER,
        italics: true,
        spacing: { after: 100 }
      }));
    }

    return elements;
  } catch (error) {
    console.error('[DocxConverter] Video conversion error:', error);
    return [new Paragraph({
      text: `🎥 Video: ${properties.filename || 'Failed to load'}`,
      spacing: { after: 100 }
    })];
  }
}

/**
 * Convert audio block
 */
function convertAudioBlock(properties) {
  try {
    const { filename, caption } = properties;

    console.log('[DocxConverter] Audio block properties:', { filename, caption });

    const elements = [];

    // Add audio icon and filename
    // Note: Word doesn't support embedded audio playback, so we just show the audio file info
    elements.push(new Paragraph({
      children: [
        new TextRun({
          text: `🎵 Audio: ${filename || 'Untitled Audio'}`,
          bold: true,
          size: 24
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: caption ? 10 : 100 }
    }));

    // Add caption if present
    if (caption) {
      elements.push(new Paragraph({
        text: stripHtml(caption),
        alignment: AlignmentType.CENTER,
        italics: true,
        spacing: { after: 100 }
      }));
    }

    return elements;
  } catch (error) {
    console.error('[DocxConverter] Audio conversion error:', error);
    return [new Paragraph({
      text: `🎵 Audio: ${properties.filename || 'Failed to load'}`,
      spacing: { after: 100 }
    })];
  }
}

/**
 * Convert file block
 */
function convertFileBlock(properties) {
  const { filename, size } = properties;

  return [new Paragraph({
    text: `📎 File: ${filename || 'Untitled File'}`,
    bold: true,
    spacing: { after: 100 }
  })];
}

/**
 * Convert callout block
 */
function convertCalloutBlock(content, properties) {
  const { type = 'info', title } = properties;

  const emoji = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅',
    question: '❓',
    tip: '💡',
    note: '📝'
  }[type] || 'ℹ️';

  // Parse content to preserve formatting
  const contentRuns = parseHtmlToTextRuns(content || '');

  return [
    new Paragraph({
      children: [
        new TextRun({ text: `${emoji} ${title || type.toUpperCase()}`, bold: true })
      ],
      spacing: { before: 100, after: 50 }
    }),
    new Paragraph({
      children: contentRuns,
      indent: { left: 360 },
      spacing: { after: 100 }
    })
  ];
}

/**
 * Convert toggle block
 */
function convertToggleBlock(content, properties) {
  // Parse content to preserve formatting
  const contentRuns = parseHtmlToTextRuns(content || '');

  return [new Paragraph({
    children: [
      new TextRun({ text: '▶ ' }),
      ...contentRuns
    ],
    spacing: { after: 100 }
  })];
}

/**
 * Convert link preview block
 */
function convertLinkPreviewBlock(properties) {
  const { title, description, url, domain } = properties;

  // Extract domain name from URL if not provided
  let domainText = domain;
  if (!domainText && url) {
    try {
      const urlObj = new URL(url);
      domainText = urlObj.hostname.replace('www.', '');
    } catch (e) {
      domainText = 'External link';
    }
  }

  const elements = [];

  // Title (bold and larger)
  elements.push(new Paragraph({
    children: [
      new TextRun({
        text: title || url || 'Link',
        bold: true,
        size: 24 // 12pt
      })
    ],
    spacing: { before: 100, after: 50 }
  }));

  // Description (if available)
  if (description) {
    elements.push(new Paragraph({
      text: description,
      italics: true,
      spacing: { after: 50 }
    }));
  }

  // Domain/URL info
  elements.push(new Paragraph({
    children: [
      new TextRun({
        text: '🌐 ',
        size: 18 // 9pt
      }),
      new TextRun({
        text: domainText || 'External link',
        size: 18, // 9pt
        color: '888888'
      })
    ],
    spacing: { after: 100 }
  }));

  return elements;
}

/**
 * Convert embed block
 */
function convertEmbedBlock(properties) {
  const { url, type } = properties;

  return [new Paragraph({
    text: `🔗 Embedded ${type || 'content'}: ${url}`,
    spacing: { after: 100 }
  })];
}

/**
 * Convert progress bar block
 */
function convertProgressBarBlock(properties) {
  const { progress = 0, label } = properties;

  const barLength = 20;
  const filled = Math.round((progress / 100) * barLength);
  const empty = barLength - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return [new Paragraph({
    text: `${label || 'Progress'}: ${bar} ${progress}%`,
    spacing: { after: 100 }
  })];
}

/**
 * Convert breadcrumb block
 */
function convertBreadcrumbBlock(properties) {
  const { items = [] } = properties;
  const breadcrumb = items.map(item => item.label || item).join(' > ');

  return [new Paragraph({
    text: breadcrumb,
    spacing: { after: 100 }
  })];
}

/**
 * Convert button block
 */
function convertButtonBlock(properties) {
  const { label, link } = properties;

  return [new Paragraph({
    text: `[Button: ${label || 'Click here'}] → ${link || ''}`,
    bold: true,
    spacing: { after: 100 }
  })];
}

/**
 * Convert math block
 */
function convertMathBlock(content, properties) {
  return [new Paragraph({
    text: `Math: ${stripHtml(content)}`,
    font: 'Cambria Math',
    spacing: { after: 100 }
  })];
}

/**
 * Convert chart block to native Word chart
 */
async function convertChartBlock(type, properties, chartsToInject = []) {
  try {
    // Create a unique placeholder for this chart
    const chartIndex = chartsToInject.length + 1;
    const placeholderText = `[CHART_PLACEHOLDER_${chartIndex}]`;

    // Add chart data to injection queue
    chartsToInject.push({
      chartType: type,
      properties: properties,
      placeholderText: placeholderText
    });

    console.log(`[DocxConverter] Queued native chart ${chartIndex} of type ${type}`);

    // Return a placeholder paragraph that will be replaced with the actual chart
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: placeholderText
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 100 }
      })
    ];
  } catch (error) {
    console.error('[DocxConverter] Chart conversion error:', error);
    return [new Paragraph({ text: `[Chart: ${type} - Failed to render]` })];
  }
}

export {
  convertBlocksToDocx
};
