// pdfConverter.js - Convert note blocks to PDF using Puppeteer
import puppeteer from 'puppeteer';
import { renderChartToImage } from './chartRenderer.js';
import { sanitizeTableCell } from './sanitizer.js';
const PUBLIC_ATTACHMENT_BASE_URL = process.env.PUBLIC_ATTACHMENT_BASE_URL
  ? process.env.PUBLIC_ATTACHMENT_BASE_URL.replace(/\/$/, '')
  : '';

/**
 * Convert blocks to PDF document
 * @param {object} options - { title, blocks, noteId, blobServiceClient }
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function convertBlocksToPdf({
  title,
  blocks,
  noteId,
  projectId,
  blobServiceClient,
  attachmentBaseUrl = ""
}) {
  let browser = null;

  try {
    console.log('[PdfConverter] Starting PDF generation for note:', noteId);

    // Generate HTML content
    const htmlContent = await convertBlocksToHtml(
      title,
      blocks,
      noteId,
      projectId,
      blobServiceClient,
      attachmentBaseUrl
    );
    console.log('[PdfConverter] HTML generated, length:', htmlContent.length);

    // Debug: Save HTML to temp file for inspection
    if (process.env.NODE_ENV === 'development') {
      const fs = await import('fs');
      const path = await import('path');
      const tempPath = path.join('/tmp', `pdf-debug-${noteId}.html`);
      fs.writeFileSync(tempPath, htmlContent, 'utf8');
      console.log('[PdfConverter] DEBUG: HTML saved to:', tempPath);
    }

    // Launch headless browser
    console.log('[PdfConverter] Launching Puppeteer...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    console.log('[PdfConverter] Puppeteer launched successfully');

    const page = await browser.newPage();

    // Set content
    console.log('[PdfConverter] Setting page content...');
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    console.log('[PdfConverter] Page content set successfully');

    // Generate PDF
    console.log('[PdfConverter] Generating PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1in',
        right: '1in',
        bottom: '1in',
        left: '1in'
      },
      preferCSSPageSize: false
    });

    console.log('[PdfConverter] PDF generated, size:', pdfBuffer.length, 'bytes');

    await browser.close();
    console.log('[PdfConverter] Browser closed, returning buffer');

    // Ensure it's a proper Node.js Buffer (Puppeteer might return Uint8Array)
    const buffer = Buffer.from(pdfBuffer);
    console.log('[PdfConverter] Converted to Buffer, size:', buffer.length, 'bytes');

    // Verify PDF magic bytes
    const magicBytes = buffer.slice(0, 5).toString('ascii');
    console.log('[PdfConverter] PDF magic bytes:', magicBytes);

    if (!magicBytes.startsWith('%PDF-')) {
      console.error('[PdfConverter] WARNING: Invalid PDF magic bytes! Expected "%PDF-", got:', magicBytes);
      console.error('[PdfConverter] First 100 bytes:', buffer.slice(0, 100).toString('ascii'));
    }

    return buffer;
  } catch (error) {
    console.error('[PdfConverter] Error generating PDF:', error);

    if (browser) {
      await browser.close();
    }

    throw error;
  }
}

/**
 * Convert blocks to HTML with styling
 */
async function convertBlocksToHtml(
  title,
  blocks,
  noteId,
  projectId,
  blobServiceClient,
  attachmentBaseUrl
) {
  const blockHtmlArray = [];

  console.log('[PdfConverter] ===== PROCESSING BLOCKS =====');
  console.log('[PdfConverter] Total blocks to process:', blocks.length);

  // Log all chart blocks
  const chartBlocks = blocks.filter(b => b.type.includes('chart'));
  console.log('[PdfConverter] Chart blocks found:', chartBlocks.length);
  chartBlocks.forEach((block, index) => {
    console.log(`[PdfConverter] Chart ${index + 1}:`, {
      id: block.id,
      type: block.type,
      hasProperties: !!block.properties,
      propertyKeys: block.properties ? Object.keys(block.properties) : []
    });
  });

  // Process blocks with list grouping
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const normalizedType = block.type.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

    // Check if this is a list block
    if (normalizedType === 'bullet_list' || normalizedType === 'numbered_list') {
      // Group consecutive list items
      const listBlocks = [];
      const listType = normalizedType;

      while (i < blocks.length) {
        const currentBlock = blocks[i];
        const currentType = currentBlock.type.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

        if (currentType === listType) {
          listBlocks.push(currentBlock);
          i++;
        } else {
          break;
        }
      }

      // Convert grouped list to HTML
      try {
        const listHtml = await convertListBlocksToHtml(
          listBlocks,
          listType,
          blobServiceClient,
          noteId,
          projectId,
          attachmentBaseUrl
        );
        blockHtmlArray.push(listHtml);
      } catch (error) {
        console.error(`[PdfConverter] Error converting list blocks:`, error);
        blockHtmlArray.push(`<p><em>[Error rendering list]</em></p>`);
      }
    } else {
      // Regular block - convert individually
      try {
        const html = await convertBlockToHtml(
          block,
          blobServiceClient,
          noteId,
          projectId,
          attachmentBaseUrl
        );
        blockHtmlArray.push(html);
      } catch (error) {
        console.error(`[PdfConverter] Error converting block ${block.id}:`, error);
        blockHtmlArray.push(`<p><em>[Error rendering block: ${block.type}]</em></p>`);
      }
      i++;
    }
  }

  const bodyContent = blockHtmlArray.join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      max-width: 100%;
      padding: 0;
    }

    .document-title {
      font-size: 3em;
      font-weight: 700;
      margin-bottom: 1em;
      color: #1a1a1a;
    }

    h1 {
      font-size: 2.2em;
      font-weight: 700;
      margin-top: 1em;
      margin-bottom: 0.5em;
      color: #1a1a1a;
    }

    h2 {
      font-size: 1.8em;
      font-weight: 600;
      margin-top: 1em;
      margin-bottom: 0.5em;
      color: #1a1a1a;
    }

    h3 {
      font-size: 1.4em;
      font-weight: 600;
      margin-top: 0.8em;
      margin-bottom: 0.4em;
      color: #1a1a1a;
    }

    p {
      margin-bottom: 0.8em;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    ul, ol {
      margin-left: 0;
      margin-bottom: 0.8em;
      padding-left: 2em;
      list-style-position: outside;
    }

    /* Nested lists should have proper indentation */
    ul ul, ol ol, ul ol, ol ul {
      margin-top: 0.3em;
      margin-bottom: 0.3em;
      padding-left: 1.5em;
    }

    /* Level 3 and deeper bullet lists use custom bullet character (▫) */
    ul ul ul ul {
      list-style-type: none;
    }

    ul ul ul ul > li::before {
      content: '▫';
      position: absolute;
      margin-left: -1.5em;
      color: currentColor;
      font-size: 1.2em;
      font-weight: bold;
    }

    ul ul ul ul > li {
      position: relative;
    }

    li {
      margin-bottom: 0.3em;
      display: list-item !important;
      margin-left: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    blockquote {
      border-left: 4px solid #ccc;
      padding-left: 1em;
      margin: 1em 0;
      font-style: italic;
      color: #666;
    }

    code {
      background: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }

    pre {
      background: #f5f5f5;
      padding: 1em;
      border-radius: 5px;
      overflow-x: auto;
      margin: 1em 0;
    }

    pre code {
      background: none;
      padding: 0;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
      table-layout: fixed;
    }

    th, td {
      border: 1px solid #ddd;
      padding: 0.5em;
      text-align: left;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    th {
      background: #f5f5f5;
      font-weight: 600;
    }

    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.5em auto;
    }

    /* Ensure image blocks have spacing */
    div:has(> img) {
      margin: 1.5em 0;
    }

    .caption {
      text-align: center;
      font-style: italic;
      color: #666;
      margin-top: 0.3em;
      margin-bottom: 1em;
    }

    .divider {
      border: none;
      color: #333; /* ensure currentColor resolves to text color */
      border-top: 1px solid #333; /* explicitly match text color */
      margin: 1.5em 0;
    }

    .divider-thick {
      border-top: 3px solid #333; /* explicitly match text color */
    }

    .divider-dashed {
      border-top: 2px dashed #333; /* explicitly match text color */
    }

    .divider-dotted {
      border-top: 2px dotted #333; /* explicitly match text color */
    }

    .divider-wavy {
      border: none;
      text-align: center;
      margin: 1.5em 0;
      color: currentColor; /* match text color */
      font-size: 1.2em;
      font-weight: bold;
      letter-spacing: 0.3em;
    }

    .divider-dots {
      border: none;
      text-align: center;
      margin: 1.5em 0;
      height: 8px;
      line-height: 8px;
    }

    .divider-dots::before {
      content: '• • •';
      color: currentColor; /* match text color */
      font-size: 1.5em;
      letter-spacing: 0.5em;
    }

    .callout {
      padding: 1em;
      border-radius: 5px;
      margin: 1em 0;
      border-left: 4px solid;
      page-break-inside: avoid;
    }

    .callout-info {
      background: #e3f2fd;
      border-color: #2196f3;
    }

    .callout-warning {
      background: #fff3e0;
      border-color: #ff9800;
    }

    .callout-error {
      background: #ffebee;
      border-color: #f44336;
    }

    .callout-success {
      background: #e8f5e9;
      border-color: #4caf50;
    }

    .callout-question {
      background: #f3e5f5;
      border-color: #9c27b0;
    }

    .callout-tip {
      background: #fff9c4;
      border-color: #fdd835;
    }

    .callout-note {
      background: #e0f2f1;
      border-color: #009688;
    }

    .callout-title {
      font-weight: 600;
      margin-bottom: 0.5em;
    }

    .media-link {
      display: inline-block;
      padding: 0.5em 1em;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 5px;
      text-decoration: none;
      color: #333;
      margin: 0.5em 0;
    }

    .media-link:hover {
      background: #e0e0e0;
    }

    .progress-bar {
      background: #f5f5f5;
      height: 24px;
      border-radius: 12px;
      overflow: hidden;
      margin: 0.5em 0;
    }

    .progress-fill {
      background: #4caf50;
      height: 100%;
      transition: width 0.3s ease;
    }

    .breadcrumb {
      color: #666;
      margin-bottom: 0.5em;
    }

    .button {
      display: inline-block;
      padding: 0.5em 1em;
      background: #2196f3;
      color: white;
      border-radius: 5px;
      text-decoration: none;
      margin: 0.5em 0;
    }

    .todo-item {
      margin-bottom: 0.3em;
      display: flex;
      align-items: flex-start;
    }

    .todo-checkbox {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border: 2px solid #d1d5db;
      border-radius: 3px;
      margin-right: 0.5em;
      flex-shrink: 0;
      background: white;
      font-size: 12px;
      line-height: 1;
    }

    .todo-checkbox.checked {
      background: #14b8a6;
      border-color: #14b8a6;
      color: white;
    }

    .todo-checked {
      text-decoration: line-through;
      text-decoration-color: #14b8a6;
      color: #9ca3af;
    }

    .link-preview-block {
      border: 1px solid #ddd;
      padding: 1em;
      border-radius: 5px;
      margin: 1em 0;
      background: #fafafa;
      page-break-inside: avoid;
      display: flex;
      gap: 1em;
    }

    .link-preview-image {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 5px;
      background: #f5f5f5;
      flex-shrink: 0;
    }

    .link-preview-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .link-preview-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .link-preview-title {
      font-weight: 600;
      font-size: 1.1em;
      margin-bottom: 0.25em;
      color: #1a1a1a;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .link-preview-description {
      color: #666;
      font-size: 0.9em;
      margin-top: 0.25em;
      margin-bottom: 0.25em;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .link-preview-url {
      color: #888;
      font-size: 0.75em;
      margin-top: 0.4em;
      line-height: 1.5;
    }

    .link-preview-favicon {
      width: 12px;
      height: 12px;
      vertical-align: middle;
      display: inline-block;
      margin-right: 4px;
    }

    .link-preview-globe-icon {
      width: 12px;
      height: 12px;
      vertical-align: middle;
      display: inline-block;
      margin-right: 4px;
      color: #888;
    }

    .link-preview-block:hover {
      background: #f0f0f0;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h1 class="document-title">${escapeHtml(title)}</h1>
  ${bodyContent}
</body>
</html>
  `.trim();
}

/**
 * Convert grouped list blocks to properly nested HTML lists
 */
async function convertListBlocksToHtml(
  listBlocks,
  listType,
  blobServiceClient,
  noteId,
  projectId,
  attachmentBaseUrl
) { // eslint-disable-line no-unused-vars
  if (listBlocks.length === 0) return '';

  const listTag = listType === 'bullet_list' ? 'ul' : 'ol';
  const getListStyle = (level) => {
    if (listType === 'bullet_list') {
      // Levels: 0=disc(•), 1=circle(◦), 2=square(▪), 3=square(▫)
      switch (level) {
        case 0: return 'disc';
        case 1: return 'circle';
        case 2: return 'square';
        case 3: return 'square'; // Using square for level 3
        default: return 'disc';
      }
    } else {
      // Levels: 0=decimal(1,2,3), 1=lower-alpha(a,b,c), 2=lower-roman(i,ii,iii), 3=upper-alpha(A,B,C)
      switch (level) {
        case 0: return 'decimal';
        case 1: return 'lower-alpha';
        case 2: return 'lower-roman';
        case 3: return 'upper-alpha';
        default: return 'decimal';
      }
    }
  };

  let html = '';
  let stackDepth = 0; // Current nesting depth (number of open lists)
  let liOpen = false; // Track if current li is open

  for (let i = 0; i < listBlocks.length; i++) {
    const block = listBlocks[i];
    // NOTE: Frontend uses 'indentLevel', not 'indent'
    const indent = block.properties?.indentLevel || block.properties?.indent || 0;
    const targetDepth = indent + 1; // +1 because we need at least one list
    const content = block.content || '';
    const nextBlock = listBlocks[i + 1];
    const nextIndent = nextBlock
      ? nextBlock.properties?.indentLevel || nextBlock.properties?.indent || 0
      : -1;

    // Close lists and li if we need to go to a shallower depth
    while (stackDepth > targetDepth) {
      if (liOpen) {
        html += '</li>';
        liOpen = false;
      }
      html += `</${listTag}>`;
      stackDepth--;
    }

    // If we're going back up after nesting, close parent li
    if (stackDepth === targetDepth && liOpen) {
      html += '</li>';
      liOpen = false;
    }

    // Open lists if we need to go to a deeper depth
    while (stackDepth < targetDepth) {
      // Open new list with the appropriate style for this depth level
      const listStyle = getListStyle(stackDepth);
      // For level 3 bullets, don't apply inline style - let CSS handle it
      if (listType === 'bullet_list' && stackDepth >= 3) {
        html += `<${listTag}>`;
      } else {
        html += `<${listTag} style="list-style-type: ${listStyle};">`;
      }
      stackDepth++;
    }

    // Add current list item
    html += `<li>${content || '<br>'}`;
    liOpen = true;

    // Close this li if next item is at same level or shallower
    if (nextIndent >= 0 && nextIndent <= indent) {
      html += '</li>';
      liOpen = false;
    }
  }

  // Close any remaining open li
  if (liOpen) {
    html += '</li>';
  }

  // Close all remaining open lists
  while (stackDepth > 0) {
    html += `</${listTag}>`;
    stackDepth--;
  }

  return html;
}

/**
 * Convert a single block to HTML
 */
async function convertBlockToHtml(
  block,
  blobServiceClient,
  noteId,
  projectId,
  attachmentBaseUrl
) {
  const { type, content, properties } = block;

  // Normalize block type to handle both camelCase and snake_case
  // Convert camelCase to snake_case: bulletList -> bullet_list
  const normalizedType = type.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

  // Debug: Log block type conversion
  if (type !== normalizedType) {
    console.log(`[PdfConverter] Block type normalized: "${type}" -> "${normalizedType}"`);
  }

  switch (normalizedType) {
    case 'text':
      // If content is empty, render as empty line
      if (!content || content.trim() === '') {
        return '<p><br></p>';
      }
      return `<p>${content}</p>`;

    case 'heading1':
      return `<h1>${stripHtml(content)}</h1>`;

    case 'heading2':
      return `<h2>${stripHtml(content)}</h2>`;

    case 'heading3':
      return `<h3>${stripHtml(content)}</h3>`;

    case 'bullet_list':
    case 'numbered_list':
      // These are now handled by convertListBlocksToHtml in the grouping logic
      // This case should not be reached, but just in case:
      console.warn('[PdfConverter] Individual list block encountered - should be grouped');
      return `<li>${content || '<br>'}</li>`;

    case 'todo':
      return convertTodoToHtml(content, properties);

    case 'quote':
      return `<blockquote>${content || ''}</blockquote>`;

    case 'code':
      return convertCodeToHtml(content, properties);

    case 'table':
      return convertTableToHtml(properties);

    case 'image':
      return await convertImageToHtml(properties, blobServiceClient, noteId);

    case 'video':
      return convertVideoToHtml(properties, { noteId, projectId, attachmentBaseUrl });

    case 'audio':
      return convertAudioToHtml(properties, { noteId, projectId, attachmentBaseUrl });

    case 'file':
      return convertFileToHtml(properties);

    case 'divider':
      const dividerStyle = properties?.style || 'solid';
      console.log('[PdfConverter] Divider style:', dividerStyle);
      let dividerClass = 'divider';

      if (dividerStyle === 'thick') {
        dividerClass = 'divider divider-thick';
      } else if (dividerStyle === 'dashed') {
        dividerClass = 'divider divider-dashed';
      } else if (dividerStyle === 'dotted') {
        dividerClass = 'divider divider-dotted';
      } else if (dividerStyle === 'wavy' || dividerStyle === 'wave') {
        return `<div class="divider-wavy">~~~</div>`;
      } else if (dividerStyle === 'dots' || dividerStyle === 'three-dots' || dividerStyle === 'threeDots') {
        return `<div class="divider divider-dots"></div>`;
      }

      return `<hr class="${dividerClass}">`;

    case 'callout':
      return convertCalloutToHtml(content, properties);

    case 'toggle':
      return `<details><summary>${stripHtml(content)}</summary></details>`;

    case 'link_preview':
      return convertLinkPreviewToHtml(properties);

    case 'embed':
      return convertEmbedToHtml(properties);

    case 'progress_bar':
      return convertProgressBarToHtml(properties);

    case 'breadcrumb':
      return convertBreadcrumbToHtml(properties);

    case 'button':
      return convertButtonToHtml(properties);

    case 'math':
      return `<p><code>${escapeHtml(content || '')}</code></p>`;

    // Chart blocks
    case 'line_chart':
    case 'bar_chart':
    case 'pie_chart':
    case 'area_chart':
    case 'scatter_chart':
    case 'donut_chart':
      return await convertChartToHtml(normalizedType, properties);

    default:
      console.warn(`[PdfConverter] Unhandled block type: "${type}" (normalized: "${normalizedType}")`);
      console.warn('[PdfConverter] Block details:', { type, normalizedType, content: content?.substring(0, 50), properties });
      return `<p><em>[Unhandled block type: ${type}]</em></p>`;
  }
}

/**
 * Helper functions for specific block types
 */

function convertTodoToHtml(content, properties) {
  const checked = properties?.checked || false;
  const checkboxClass = checked ? 'todo-checkbox checked' : 'todo-checkbox';
  const checkmark = checked ? '✓' : '';
  const textClass = checked ? 'todo-checked' : '';

  return `<div class="todo-item"><span class="${checkboxClass}">${checkmark}</span><span class="${textClass}">${content || ''}</span></div>`;
}

function convertCodeToHtml(content, properties) {
  const language = properties?.language || 'plaintext';
  return `<pre><code class="language-${language}">${escapeHtml(content || '')}</code></pre>`;
}

function convertTableToHtml(properties) {
  const tableData = properties?.tableData || [[]];
  const hasHeader = properties?.hasHeader || false;

  let html = '<table>';

  tableData.forEach((row, index) => {
    const tag = hasHeader && index === 0 ? 'th' : 'td';
    const cells = row.map(cell => {
      const cellText = typeof cell === 'object' ? cell.content || '' : cell;
      // Preserve safe inline formatting within table cells
      const safeHtml = sanitizeTableCell(cellText);
      return `<${tag}>${safeHtml || ''}</${tag}>`;
    }).join('');

    html += `<tr>${cells}</tr>`;
  });

  html += '</table>';
  return html;
}

async function convertImageToHtml(properties, blobServiceClient, noteId) {
  const { url, alt, caption, filename } = properties;

  if (!url) {
    console.error('[PdfConverter] Image has no URL:', properties);
    return '<p><em>[Image: No URL provided]</em></p>';
  }

  console.log('[PdfConverter] Converting image:', { url, filename, alt, caption });

  // For PDF, embed image as base64 if possible
  try {
    let imageBuffer = null;

    // Try to download from blob storage
    if (blobServiceClient && noteId) {
      imageBuffer = await downloadAttachment(url, blobServiceClient, noteId);
    }

    // If blob storage failed and URL is a direct HTTP(S) URL, try to fetch it
    if (!imageBuffer && (url.startsWith('http://') || url.startsWith('https://'))) {
      console.log('[PdfConverter] Trying to fetch image from URL:', url);
      const response = await fetch(url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
        console.log('[PdfConverter] Fetched image successfully, size:', imageBuffer.length);
      } else {
        console.error('[PdfConverter] Failed to fetch image:', response.status, response.statusText);
      }
    }

    if (imageBuffer && imageBuffer.length > 0) {
      const base64 = imageBuffer.toString('base64');
      // Detect image type from URL or default to png
      const imageType = url.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1]?.toLowerCase() || 'png';
      const mimeType = imageType === 'jpg' || imageType === 'jpeg' ? 'image/jpeg' : `image/${imageType}`;

      // Apply width/height from properties if available
      let sizeStyle = 'max-width: 100%; height: auto; display: block; margin: 0 auto;';
      if (properties.width) {
        const width = typeof properties.width === 'number' ? `${properties.width}px` : properties.width;
        sizeStyle = `width: ${width}; height: auto; display: block; margin: 0 auto;`;
      } else if (properties.size === 'small') {
        sizeStyle = 'width: 300px; height: auto; display: block; margin: 0 auto;';
      } else if (properties.size === 'medium') {
        sizeStyle = 'width: 500px; height: auto; display: block; margin: 0 auto;';
      } else if (properties.size === 'large') {
        sizeStyle = 'width: 100%; max-width: 800px; height: auto; display: block; margin: 0 auto;';
      }

      const imgTag = `<img src="data:${mimeType};base64,${base64}" alt="${escapeHtml(alt || filename || '')}" style="${sizeStyle}" />`;
      const captionTag = caption ? `<p class="caption">${escapeHtml(caption)}</p>` : '';
      console.log('[PdfConverter] Image converted successfully with size:', properties.width || properties.size || 'default');
      return `<div>${imgTag}${captionTag}</div>`;
    } else {
      console.error('[PdfConverter] Image buffer is empty or null');
    }
  } catch (error) {
    console.error('[PdfConverter] Image conversion error:', error);
  }

  console.log('[PdfConverter] Using image placeholder fallback');
  return `<p><em>[Image: ${escapeHtml(filename || alt || caption || 'Untitled')}]</em></p>`;
}

const resolveMediaUrl = (type, properties, noteId, attachmentBaseUrl) => {
  const fallbackUrl = properties.url;
  const filename = properties.filename;

  if (!noteId || !filename) return fallbackUrl || '#';

  const base = (attachmentBaseUrl || PUBLIC_ATTACHMENT_BASE_URL || '').replace(/\/$/, '');
  return `${base}/api/attachments/notes/${noteId}/${encodeURIComponent(filename)}`;
};

function convertVideoToHtml(properties, { noteId, projectId, attachmentBaseUrl }) {
  const { filename, caption } = properties;
  const displayName = filename || 'Untitled Video';
  const sharedUrl = resolveMediaUrl('video', properties, noteId, attachmentBaseUrl);

  return `
    <div>
      <a href="${escapeHtml(sharedUrl)}" class="media-link" target="_blank" rel="noopener noreferrer">
        🎥 Video: ${escapeHtml(displayName)} (Click to open in browser)
      </a>
      ${caption ? `<p class="caption">${escapeHtml(caption)}</p>` : ''}
    </div>
  `;
}

function convertAudioToHtml(properties, { noteId, projectId, attachmentBaseUrl }) {
  const { filename, caption } = properties;
  const displayName = filename || 'Untitled Audio';
  const sharedUrl = resolveMediaUrl('audio', properties, noteId, attachmentBaseUrl);

  return `
    <div>
      <a href="${escapeHtml(sharedUrl)}" class="media-link" target="_blank" rel="noopener noreferrer">
        🎵 Audio: ${escapeHtml(displayName)} (Click to open in browser)
      </a>
      ${caption ? `<p class="caption">${escapeHtml(caption)}</p>` : ''}
    </div>
  `;
}

function convertFileToHtml(properties) {
  const { url, filename } = properties;
  const displayName = filename || 'Untitled File';

  return `
    <a href="${escapeHtml(url || '#')}" class="media-link" target="_blank">
      📎 File: ${escapeHtml(displayName)}
    </a>
  `;
}

function convertCalloutToHtml(content, properties) {
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

  return `
    <div class="callout callout-${type}">
      <div class="callout-title">${emoji} ${escapeHtml(title || type.toUpperCase())}</div>
      <div>${content || ''}</div>
    </div>
  `;
}

function convertLinkPreviewToHtml(properties) {
  const { title, description, url, favicon, image, domain } = properties;

  console.log('[PdfConverter] Link preview:', { title, url, favicon, image, domain });

  // Build favicon URL from the base domain if not provided
  let faviconUrl = favicon;
  if (!faviconUrl && url) {
    try {
      const urlObj = new URL(url);
      // Only try HTTPS for favicon
      if (urlObj.protocol === 'https:') {
        faviconUrl = `${urlObj.origin}/favicon.ico`;
        console.log('[PdfConverter] Generated favicon URL:', faviconUrl);
      }
    } catch (e) {
      console.log('[PdfConverter] Failed to parse URL for favicon');
    }
  }

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

  // Build icon HTML - show favicon with globe as fallback
  const globeIconSvg = `<svg class="link-preview-globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
  </svg>`;

  let iconHtml;
  if (faviconUrl) {
    // Show favicon, with globe icon as inline fallback
    // Create unique ID for this instance to target the specific globe icon
    const iconId = `globe-${Math.random().toString(36).substr(2, 9)}`;
    iconHtml = `<img src="${escapeHtml(faviconUrl)}" class="link-preview-favicon" alt="" onerror="this.style.display='none';document.getElementById('${iconId}').style.display='inline-block';"><svg id="${iconId}" class="link-preview-globe-icon" style="display:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
    </svg>`;
  } else {
    // No favicon URL, just show globe icon
    iconHtml = globeIconSvg;
  }

  // Preview image (80x80 on left side, like in the component)
  const imageHtml = image
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title || 'Preview')}" class="link-preview-image" onerror="this.style.display='none'" />`
    : '';

  return `
    <a href="${escapeHtml(url || '#')}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: inherit; display: block;">
      <div class="link-preview-block">
        ${imageHtml}
        <div class="link-preview-content">
          <div class="link-preview-text">
            <div class="link-preview-title">${escapeHtml(title || url || 'Link')}</div>${description ? `
            <div class="link-preview-description">${escapeHtml(description)}</div>` : ''}
            <div class="link-preview-url">${iconHtml}${escapeHtml(domainText || 'External link')}</div>
          </div>
        </div>
      </div>
    </a>
  `;
}

function convertEmbedToHtml(properties) {
  const { url, type } = properties;
  return `<p>🔗 Embedded ${type || 'content'}: <a href="${escapeHtml(url || '')}" target="_blank">${escapeHtml(url || '')}</a></p>`;
}

function convertProgressBarToHtml(properties) {
  const { progress = 0, label } = properties;

  return `
    <div>
      <div>${escapeHtml(label || 'Progress')}: ${progress}%</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress}%"></div>
      </div>
    </div>
  `;
}

function convertBreadcrumbToHtml(properties) {
  const { items = [] } = properties;
  const breadcrumb = items.map(item => escapeHtml(item.label || item)).join(' > ');

  return `<div class="breadcrumb">${breadcrumb}</div>`;
}

function convertButtonToHtml(properties) {
  const { label, link } = properties;

  return `<a href="${escapeHtml(link || '#')}" class="button" target="_blank">${escapeHtml(label || 'Click here')}</a>`;
}

async function convertChartToHtml(type, properties) {
  console.log('[PdfConverter] ===== CHART CONVERSION START =====');
  console.log('[PdfConverter] Chart type:', type);
  console.log('[PdfConverter] Properties received:', JSON.stringify(properties, null, 2));
  console.log('[PdfConverter] Properties keys:', Object.keys(properties));

  // Check if properties are empty
  if (!properties || Object.keys(properties).length === 0 || (!properties.data && !properties.chartData)) {
    console.error('[PdfConverter] Chart has no data - this chart block was not properly saved in the note');
    console.error('[PdfConverter] Please edit this chart in the note editor and save it again');
    return `<div style="border: 2px dashed #ef4444; padding: 1em; margin: 1em 0; background: #fef2f2; color: #dc2626;">
      <strong>⚠️ Chart Error: ${type.replace('_', ' ').toUpperCase()}</strong>
      <p style="margin: 0.5em 0 0 0; font-size: 0.9em;">This chart block has no data. Please edit and re-save this chart in your note.</p>
    </div>`;
  }

  try {
    const imageBuffer = await renderChartToImage(type, properties);
    console.log('[PdfConverter] Chart rendered, buffer size:', imageBuffer?.length);

    if (!imageBuffer || imageBuffer.length === 0) {
      console.error('[PdfConverter] Chart rendering returned empty buffer');
      return `<p><em>[Chart: ${type}]</em></p>`;
    }

    const base64 = imageBuffer.toString('base64');
    console.log('[PdfConverter] Chart converted to base64 successfully');
    return `<img src="data:image/png;base64,${base64}" alt="Chart: ${type}" style="max-width: 100%; height: auto; display: block; margin: 1em auto;" />`;
  } catch (error) {
    console.error('[PdfConverter] Chart conversion error:', error);
    console.error('[PdfConverter] Chart type:', type);
    console.error('[PdfConverter] Chart properties:', properties);
    return `<p><em>[Chart: ${type} - Failed to render: ${error.message}]</em></p>`;
  }
}

/**
 * Download attachment from blob storage
 */
async function downloadAttachment(url, blobServiceClient, noteId) {
  try {
    const filename = url.split('/').pop();

    if (!filename || !blobServiceClient) {
      return null;
    }

    const containerClient = blobServiceClient.getContainerClient('note-attachments');
    const projectId = noteId.split('-')[0];
    const blobPath = `project-${projectId}/note-${noteId}/${filename}`;

    const blobClient = containerClient.getBlobClient(blobPath);
    const downloadResponse = await blobClient.download();
    const chunks = [];

    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error('[PdfConverter] Download attachment error:', error);
    return null;
  }
}

/**
 * Strip HTML tags
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';

  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return text.replace(/[&<>"']/g, m => map[m]);
}

export {
  convertBlocksToPdf
};
