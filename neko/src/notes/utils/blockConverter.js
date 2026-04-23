// Block-HTML Converter Utilities
// Converts between block format and HTML for backward compatibility

export const BlockType = {
  TEXT: 'text',
  HEADING1: 'heading1',
  HEADING2: 'heading2',
  HEADING3: 'heading3',
  NUMBERED_LIST: 'numberedList',
  BULLET_LIST: 'bulletList',
  TODO: 'todo',
  QUOTE: 'quote',
  TABLE: 'table',
  CODE: 'code',
  DIVIDER: 'divider',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
  CALLOUT: 'callout',
  TOGGLE: 'toggle',
  EMBED: 'embed',
  MATH: 'math',
  LINK_PREVIEW: 'linkPreview',
  // Chart blocks
  LINE_CHART: 'lineChart',
  BAR_CHART: 'barChart',
  PIE_CHART: 'pieChart',
  AREA_CHART: 'areaChart',
  SCATTER_CHART: 'scatterChart',
  DONUT_CHART: 'donutChart',
  // Advanced blocks
  PROGRESS_BAR: 'progressBar',
  BREADCRUMB: 'breadcrumb',
  BUTTON: 'button'
};

// Convert blocks to HTML for storage
export const blocksToHtml = (blocks) => {
  let html = '';
  let currentList = null;
  let listItems = [];
  
  const closeList = () => {
    if (currentList && listItems.length > 0) {
      const tag = currentList === 'NUMBERED_LIST' ? 'ol' : 'ul';
      html += `<${tag}>`;
      listItems.forEach(item => {
        html += `<li>${item}</li>`;
      });
      html += `</${tag}>`;
      listItems = [];
      currentList = null;
    }
  };
  
  if (!blocks || blocks.length === 0) {
    return '<p><br></p>';
  }
  
  blocks.forEach((block) => {
    switch (block.type) {
      case BlockType.TEXT:
        closeList();
        html += `<p>${block.content || '<br>'}</p>`;
        break;
        
      case BlockType.HEADING1:
        closeList();
        html += `<h1>${block.content || ''}</h1>`;
        break;
        
      case BlockType.HEADING2:
        closeList();
        html += `<h2>${block.content || ''}</h2>`;
        break;
        
      case BlockType.HEADING3:
        closeList();
        html += `<h3>${block.content || ''}</h3>`;
        break;
        
      case BlockType.NUMBERED_LIST:
        if (currentList !== 'NUMBERED_LIST') {
          closeList();
          currentList = 'NUMBERED_LIST';
        }
        listItems.push(block.content || '');
        break;

      case BlockType.BULLET_LIST:
        if (currentList !== 'BULLET_LIST') {
          closeList();
          currentList = 'BULLET_LIST';
        }
        listItems.push(block.content || '');
        break;

      case BlockType.TODO:
        closeList();
        const checked = block.properties?.checked ? 'checked' : '';
        const checkedClass = block.properties?.checked ? ' todo-checked' : '';
        html += `<div class="todo-item${checkedClass}" data-checked="${block.properties?.checked || false}">`;
        html += `<input type="checkbox" ${checked} disabled> `;
        html += `<span class="todo-content">${block.content || ''}</span>`;
        html += `</div>`;
        break;
          case BlockType.QUOTE:
        closeList();
        html += `<blockquote>${block.content || ''}</blockquote>`;
        break;
        
      case BlockType.TABLE:
        closeList();
        const tableData = block.properties?.tableData || [[]];
        const hasHeader = block.properties?.hasHeader || false;
        
        html += '<table class="table-block">';
        tableData.forEach((row, rowIndex) => {
          const isHeaderRow = hasHeader && rowIndex === 0;
          const tag = isHeaderRow ? 'th' : 'td';
          html += '<tr>';
          row.forEach(cell => {
            html += `<${tag}>${cell || ''}</${tag}>`;
          });
          html += '</tr>';
        });
        html += '</table>';
        break;

      case BlockType.CODE:
        closeList();
        const language = block.properties?.language || 'text';
        const showLineNumbers = block.properties?.showLineNumbers || false;
        const lineNumbersClass = showLineNumbers ? ' show-line-numbers' : '';
        html += `<div class="code-block${lineNumbersClass}" data-language="${language}">`;
        html += `<div class="code-header">`;
        html += `<span class="code-language">${language}</span>`;
        html += `</div>`;
        html += `<pre><code class="language-${language}">${block.content || ''}</code></pre>`;
        html += `</div>`;
        break;

      case BlockType.DIVIDER:
        closeList();
        const dividerStyle = block.properties?.style || 'line';
        html += `<div class="divider-block divider-${dividerStyle}">`;
        if (dividerStyle === 'line') {
          html += '<hr>';
        } else if (dividerStyle === 'dots') {
          html += '<div class="divider-dots">• • •</div>';
        } else if (dividerStyle === 'wave') {
          html += '<div class="divider-wave">~~~</div>';
        }
        html += `</div>`;
        break;

      case BlockType.IMAGE:
        closeList();
        const imageUrl = block.properties?.url || '';
        const caption = block.properties?.caption || '';
        const alt = block.properties?.alt || caption || 'Image';
        const width = block.properties?.width || 'auto';
        const height = block.properties?.height || 'auto';
        const alignment = block.properties?.alignment || 'left';

        html += `<div class="image-block image-align-${alignment}">`;
        if (imageUrl) {
          html += `<img src="${imageUrl}" alt="${alt}" style="width: ${width}; height: ${height};">`;
        } else {
          html += `<div class="image-placeholder" style="width: ${width}; height: ${height};">`;
          html += `<div class="image-placeholder-content">`;
          html += `<span>📷 Image placeholder</span>`;
          html += `</div>`;
          html += `</div>`;
        }
        if (caption) {
          html += `<div class="image-caption">${caption}</div>`;
        }
        html += `</div>`;
        break;

      case BlockType.VIDEO:
        closeList();
        const videoUrl = block.properties?.url || '';
        const videoCaption = block.properties?.caption || '';
        const videoWidth = block.properties?.width || 'auto';
        const videoHeight = block.properties?.height || 'auto';
        const videoAlignment = block.properties?.alignment || 'left';

        html += `<div class="video-block video-align-${videoAlignment}">`;
        if (videoUrl) {
          html += `<video src="${videoUrl}" controls style="width: ${videoWidth}; height: ${videoHeight};"></video>`;
        } else {
          html += `<div class="video-placeholder" style="width: ${videoWidth}; height: ${videoHeight};">`;
          html += `<div class="video-placeholder-content">`;
          html += `<span>🎥 Video placeholder</span>`;
          html += `</div>`;
          html += `</div>`;
        }
        if (videoCaption) {
          html += `<div class="video-caption">${videoCaption}</div>`;
        }
        html += `</div>`;
        break;

      case BlockType.AUDIO:
        closeList();
        const audioUrl = block.properties?.url || '';
        const audioCaption = block.properties?.caption || '';
        const audioFilename = block.properties?.filename || '';

        html += `<div class="audio-block">`;
        if (audioUrl) {
          html += `<audio src="${audioUrl}" controls style="max-width: 100%;"></audio>`;
          if (audioFilename) {
            html += `<div class="audio-filename">${audioFilename}</div>`;
          }
        } else {
          html += `<div class="audio-placeholder">`;
          html += `<span>🎵 Audio placeholder</span>`;
          html += `</div>`;
        }
        if (audioCaption) {
          html += `<div class="audio-caption">${audioCaption}</div>`;
        }
        html += `</div>`;
        break;

      case BlockType.FILE:
        closeList();
        const fileUrl = block.properties?.url || '';
        const filename = block.properties?.filename || '';
        const originalName = block.properties?.originalName || '';
        const fileSize = block.properties?.size || 0;
        const contentType = block.properties?.contentType || '';
        const description = block.properties?.description || '';
        
        html += `<div class="file-block">`;
        if (fileUrl && (originalName || filename)) {
          html += `<div class="file-attachment">`;
          html += `<a href="${fileUrl}" target="_blank" class="file-link">`;
          html += `<span class="file-icon">📄</span>`;
          html += `<span class="file-name">${originalName || filename}</span>`;
          if (fileSize > 0) {
            const formattedSize = fileSize < 1024 ? `${fileSize} B` : 
                                fileSize < 1024 * 1024 ? `${(fileSize / 1024).toFixed(1)} KB` : 
                                `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
            html += `<span class="file-size">(${formattedSize})</span>`;
          }
          html += `</a>`;
          if (description) {
            html += `<div class="file-description">${description}</div>`;
          }
          html += `</div>`;
        } else {
          html += `<div class="file-placeholder">📎 File attachment</div>`;
        }
        html += `</div>`;
        break;

      case BlockType.CALLOUT:
        closeList();
        const calloutType = block.properties?.type || 'info';
        const calloutIcon = block.properties?.icon || getCalloutIcon(calloutType);
        const isCollapsible = block.properties?.collapsible || false;
        const isCollapsed = block.properties?.collapsed || false;
        
        html += `<div class="callout-block callout-${calloutType}${isCollapsible ? ' callout-collapsible' : ''}${isCollapsed ? ' callout-collapsed' : ''}">`;
        html += `<div class="callout-header">`;
        html += `<span class="callout-icon">${calloutIcon}</span>`;
        html += `<span class="callout-title">${block.properties?.title || calloutType.toUpperCase()}</span>`;
        if (isCollapsible) {
          html += `<span class="callout-toggle">▼</span>`;
        }
        html += `</div>`;
        html += `<div class="callout-content">${block.content || ''}</div>`;
        html += `</div>`;
        break;

      case BlockType.TOGGLE:
        closeList();
        const isOpen = block.properties?.isOpen || false;
        const toggleTitle = block.properties?.title || 'Toggle';
        
        html += `<div class="toggle-block${isOpen ? ' toggle-open' : ''}">`;
        html += `<div class="toggle-header">`;
        html += `<span class="toggle-arrow">${isOpen ? '▼' : '▶'}</span>`;
        html += `<span class="toggle-title">${toggleTitle}</span>`;
        html += `</div>`;
        html += `<div class="toggle-content">${block.content || ''}</div>`;
        html += `</div>`;
        break;

      case BlockType.EMBED:
        closeList();
        const embedUrl = block.properties?.url || '';
        const embedType = block.properties?.type || 'generic';
        const embedTitle = block.properties?.title || 'Embedded content';
        
        html += `<div class="embed-block embed-${embedType}">`;
        html += `<div class="embed-header">`;
        html += `<span class="embed-icon">🔗</span>`;
        html += `<span class="embed-title">${embedTitle}</span>`;
        html += `</div>`;
        html += `<div class="embed-content">`;
        if (embedUrl) {
          if (embedType === 'youtube' || embedType === 'video') {
            html += `<div class="embed-video-placeholder">📹 Video: ${embedUrl}</div>`;
          } else {
            html += `<div class="embed-link-placeholder">🔗 Link: ${embedUrl}</div>`;
          }
        } else {
          html += `<div class="embed-placeholder">No embed URL provided</div>`;
        }
        html += `</div>`;
        html += `</div>`;
        break;

      case BlockType.MATH:
        closeList();
        const isInline = block.properties?.inline || false;
        const mathContent = block.content || '';
        
        if (isInline) {
          html += `<span class="math-inline" data-math="${mathContent}">$${mathContent}$</span>`;
        } else {
          html += `<div class="math-block" data-math="${mathContent}">$$${mathContent}$$</div>`;
        }
        break;

      case BlockType.LINK_PREVIEW:
        closeList();
        const linkUrl = block.properties?.url || '';
        const linkTitle = block.properties?.title || linkUrl;
        const linkDescription = block.properties?.description || '';
        const linkImage = block.properties?.image || '';
        const linkDomain = block.properties?.domain || '';
        
        html += `<div class="link-preview-block">`;
        html += `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="link-preview-content">`;
        if (linkImage) {
          html += `<div class="link-preview-image"><img src="${linkImage}" alt="${linkTitle}"></div>`;
        }
        html += `<div class="link-preview-text">`;
        html += `<div class="link-preview-title">${linkTitle}</div>`;
        if (linkDescription) {
          html += `<div class="link-preview-description">${linkDescription}</div>`;
        }
        if (linkDomain) {
          html += `<div class="link-preview-domain">${linkDomain}</div>`;
        }
        html += `</div>`;
        html += `</a>`;
        html += `</div>`;
        break;

      // Chart blocks - store as lightweight data structure
      case BlockType.LINE_CHART:
      case BlockType.BAR_CHART:
      case BlockType.PIE_CHART:
      case BlockType.AREA_CHART:
      case BlockType.SCATTER_CHART:
      case BlockType.DONUT_CHART:
        closeList();
        const chartType = block.type;
        const chartTitle = block.properties?.config?.title || 'Chart';
        const chartData = JSON.stringify(block.properties?.data || {});
        const chartConfig = JSON.stringify(block.properties?.config || {});
        
        // Store chart as a simple div with data attributes for reconstruction
        html += `<div class="chart-block" data-chart-type="${chartType}" data-chart-data='${chartData}' data-chart-config='${chartConfig}'>`;
        html += `<p>📊 ${chartTitle}</p>`;
        html += `</div>`;
        break;
        
      default:
        closeList();
        html += `<p>${block.content || '<br>'}</p>`;
    }
  });
  
  // Close any remaining lists
  closeList();
  
  return html || '<p><br></p>';
};

// Convert HTML to blocks for editing
export const htmlToBlocks = (html) => {
  if (!html || html === '<p><br></p>') {
    return [{ id: generateId(), type: BlockType.TEXT, content: '', properties: {} }];
  }
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = [];
  
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        blocks.push({
          id: generateId(),
          type: BlockType.TEXT,
          content: text,
          properties: {}
        });
      }
      return;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    
    const tagName = node.tagName.toLowerCase();
    
    switch (tagName) {
      case 'h1':
        blocks.push({
          id: generateId(),
          type: BlockType.HEADING1,
          content: node.innerHTML,
          properties: {}
        });
        break;
        
      case 'h2':
        blocks.push({
          id: generateId(),
          type: BlockType.HEADING2,
          content: node.innerHTML,
          properties: {}
        });
        break;
        
      case 'h3':
        blocks.push({
          id: generateId(),
          type: BlockType.HEADING3,
          content: node.innerHTML,
          properties: {}
        });
        break;
        
      case 'ul':
        node.querySelectorAll('li').forEach(li => {
          blocks.push({
            id: generateId(),
            type: BlockType.BULLET_LIST,
            content: li.innerHTML,
            properties: {}
          });
        });
        break;

      case 'ol':
        node.querySelectorAll('li').forEach(li => {
          blocks.push({
            id: generateId(),
            type: BlockType.NUMBERED_LIST,
            content: li.innerHTML,
            properties: {}
          });
        });
        break;

      case 'div':
        if (node.classList.contains('todo-item')) {
          const checkbox = node.querySelector('input[type="checkbox"]');
          const contentSpan = node.querySelector('.todo-content');
          const isChecked = checkbox ? checkbox.checked : false;
          const content = contentSpan ? contentSpan.innerHTML : node.innerHTML;
          
          blocks.push({
            id: generateId(),
            type: BlockType.TODO,
            content: content,
            properties: { checked: isChecked }
          });
        } else if (node.classList.contains('code-block')) {
          const language = node.getAttribute('data-language') || 'text';
          const showLineNumbers = node.classList.contains('show-line-numbers');
          const codeElement = node.querySelector('code');
          const content = codeElement ? codeElement.textContent : '';
          
          blocks.push({
            id: generateId(),
            type: BlockType.CODE,
            content: content,
            properties: { 
              language,
              showLineNumbers
            }
          });
        } else if (node.classList.contains('divider-block')) {
          let style = 'line';
          if (node.classList.contains('divider-dots')) style = 'dots';
          else if (node.classList.contains('divider-wave')) style = 'wave';
          
          blocks.push({
            id: generateId(),
            type: BlockType.DIVIDER,
            content: '',
            properties: { style }
          });
        } else if (node.classList.contains('image-block')) {
          const img = node.querySelector('img');
          const placeholder = node.querySelector('.image-placeholder');
          const caption = node.querySelector('.image-caption');
          const alignment = node.className.match(/image-align-(\w+)/)?.[1] || 'left';

          const properties = { alignment };

          if (img) {
            properties.url = img.src;
            properties.alt = img.alt;
            properties.width = img.style.width || 'auto';
            properties.height = img.style.height || 'auto';
          } else if (placeholder) {
            properties.width = placeholder.style.width || '400px';
            properties.height = placeholder.style.height || '300px';
          }

          if (caption) {
            properties.caption = caption.innerHTML;
          }

          blocks.push({
            id: generateId(),
            type: BlockType.IMAGE,
            content: '',
            properties
          });
        } else if (node.classList.contains('video-block')) {
          const video = node.querySelector('video');
          const videoPlaceholder = node.querySelector('.video-placeholder');
          const videoCaption = node.querySelector('.video-caption');
          const videoAlignment = node.className.match(/video-align-(\w+)/)?.[1] || 'left';

          const properties = { alignment: videoAlignment };

          if (video) {
            properties.url = video.src;
            properties.width = video.style.width || 'auto';
            properties.height = video.style.height || 'auto';
          } else if (videoPlaceholder) {
            properties.width = videoPlaceholder.style.width || '640px';
            properties.height = videoPlaceholder.style.height || '360px';
          }

          if (videoCaption) {
            properties.caption = videoCaption.innerHTML;
          }

          blocks.push({
            id: generateId(),
            type: BlockType.VIDEO,
            content: '',
            properties
          });
        } else if (node.classList.contains('audio-block')) {
          const audio = node.querySelector('audio');
          const audioPlaceholder = node.querySelector('.audio-placeholder');
          const audioCaption = node.querySelector('.audio-caption');
          const audioFilename = node.querySelector('.audio-filename');

          const properties = {};

          if (audio) {
            properties.url = audio.src;
          }

          if (audioFilename) {
            properties.filename = audioFilename.innerHTML;
          }

          if (audioCaption) {
            properties.caption = audioCaption.innerHTML;
          }

          blocks.push({
            id: generateId(),
            type: BlockType.AUDIO,
            content: '',
            properties
          });
        } else if (node.classList.contains('file-block')) {
          const fileLink = node.querySelector('.file-link');
          const fileName = node.querySelector('.file-name');
          const fileSize = node.querySelector('.file-size');
          const description = node.querySelector('.file-description');
          const placeholder = node.querySelector('.file-placeholder');
          
          const properties = {};
          
          if (fileLink && fileName) {
            properties.url = fileLink.href;
            properties.filename = fileName.textContent;
            properties.originalName = fileName.textContent;
            
            if (fileSize) {
              // Extract size from text like "(1.2 MB)"
              const sizeText = fileSize.textContent.replace(/[()]/g, '');
              const sizeMatch = sizeText.match(/(\d+\.?\d*)\s*(B|KB|MB)/);
              if (sizeMatch) {
                const [, value, unit] = sizeMatch;
                const multiplier = unit === 'MB' ? 1024 * 1024 : unit === 'KB' ? 1024 : 1;
                properties.size = Math.round(parseFloat(value) * multiplier);
              }
            }
          }
          
          if (description) {
            properties.description = description.innerHTML;
          }
          
          blocks.push({
            id: generateId(),
            type: BlockType.FILE,
            content: '',
            properties
          });
        } else if (node.classList.contains('callout-block')) {
          const type = node.className.match(/callout-(\w+)/)?.[1] || 'info';
          const isCollapsible = node.classList.contains('callout-collapsible');
          const isCollapsed = node.classList.contains('callout-collapsed');
          const titleElement = node.querySelector('.callout-title');
          const iconElement = node.querySelector('.callout-icon');
          const contentElement = node.querySelector('.callout-content');
          
          blocks.push({
            id: generateId(),
            type: BlockType.CALLOUT,
            content: contentElement ? contentElement.innerHTML : '',
            properties: {
              type,
              title: titleElement ? titleElement.textContent : type.toUpperCase(),
              icon: iconElement ? iconElement.textContent : getCalloutIcon(type),
              collapsible: isCollapsible,
              collapsed: isCollapsed
            }
          });
        } else if (node.classList.contains('toggle-block')) {
          const isOpen = node.classList.contains('toggle-open');
          const titleElement = node.querySelector('.toggle-title');
          const contentElement = node.querySelector('.toggle-content');
          
          blocks.push({
            id: generateId(),
            type: BlockType.TOGGLE,
            content: contentElement ? contentElement.innerHTML : '',
            properties: {
              title: titleElement ? titleElement.textContent : 'Toggle',
              isOpen
            }
          });
        } else if (node.classList.contains('embed-block')) {
          const type = node.className.match(/embed-(\w+)/)?.[1] || 'generic';
          const titleElement = node.querySelector('.embed-title');
          const videoPlaceholder = node.querySelector('.embed-video-placeholder');
          const linkPlaceholder = node.querySelector('.embed-link-placeholder');
          
          let url = '';
          if (videoPlaceholder) {
            url = videoPlaceholder.textContent.replace('📹 Video: ', '');
          } else if (linkPlaceholder) {
            url = linkPlaceholder.textContent.replace('🔗 Link: ', '');
          }
          
          blocks.push({
            id: generateId(),
            type: BlockType.EMBED,
            content: '',
            properties: {
              type,
              url,
              title: titleElement ? titleElement.textContent : 'Embedded content'
            }
          });
        } else if (node.classList.contains('math-block')) {
          const mathContent = node.getAttribute('data-math') || '';
          
          blocks.push({
            id: generateId(),
            type: BlockType.MATH,
            content: mathContent,
            properties: { inline: false }
          });
        } else if (node.classList.contains('link-preview-block')) {
          const linkElement = node.querySelector('.link-preview-content');
          const titleElement = node.querySelector('.link-preview-title');
          const descriptionElement = node.querySelector('.link-preview-description');
          const domainElement = node.querySelector('.link-preview-domain');
          const imageElement = node.querySelector('.link-preview-image img');
          
          blocks.push({
            id: generateId(),
            type: BlockType.LINK_PREVIEW,
            content: '',
            properties: {
              url: linkElement ? linkElement.href : '',
              title: titleElement ? titleElement.textContent : '',
              description: descriptionElement ? descriptionElement.textContent : '',
              domain: domainElement ? domainElement.textContent : '',
              image: imageElement ? imageElement.src : ''
            }
          });
        } else if (node.classList.contains('chart-block')) {
          // Parse chart blocks back from HTML
          const chartType = node.getAttribute('data-chart-type');
          const chartDataStr = node.getAttribute('data-chart-data');
          const chartConfigStr = node.getAttribute('data-chart-config');
          
          try {
            const chartData = chartDataStr ? JSON.parse(chartDataStr) : {};
            const chartConfig = chartConfigStr ? JSON.parse(chartConfigStr) : {};
            
            blocks.push({
              id: generateId(),
              type: chartType,
              content: '',
              properties: {
                data: chartData,
                config: chartConfig
              }
            });
          } catch (error) {
            console.error('Error parsing chart data:', error);
            // Fallback: create a text block with error message
            blocks.push({
              id: generateId(),
              type: BlockType.TEXT,
              content: '📊 Chart data could not be loaded',
              properties: {}
            });
          }
        } else {
          // Process as regular div content
          Array.from(node.childNodes).forEach(processNode);
        }
        break;

      case 'span':
        if (node.classList.contains('math-inline')) {
          const mathContent = node.getAttribute('data-math') || '';
          
          blocks.push({
            id: generateId(),
            type: BlockType.MATH,
            content: mathContent,
            properties: { inline: true }
          });
        } else {
          // Process as regular span content
          Array.from(node.childNodes).forEach(processNode);
        }
        break;

      case 'pre':
        // Handle code blocks that might not have the wrapper div
        const codeElement = node.querySelector('code');
        if (codeElement) {
          const language = codeElement.className.match(/language-(\w+)/)?.[1] || 'text';
          
          blocks.push({
            id: generateId(),
            type: BlockType.CODE,
            content: codeElement.textContent || '',
            properties: { 
              language,
              showLineNumbers: false
            }
          });
        } else {
          blocks.push({
            id: generateId(),
            type: BlockType.CODE,
            content: node.textContent || '',
            properties: { 
              language: 'text',
              showLineNumbers: false
            }
          });
        }
        break;

      case 'hr':
        blocks.push({
          id: generateId(),
          type: BlockType.DIVIDER,
          content: '',
          properties: { style: 'line' }
        });
        break;
          case 'blockquote':
        blocks.push({
          id: generateId(),
          type: BlockType.QUOTE,
          content: node.innerHTML,
          properties: {}
        });
        break;
        
      case 'table':
        if (node.classList.contains('table-block')) {
          const rows = node.querySelectorAll('tr');
          const tableData = [];
          let hasHeader = false;
          
          rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td, th');
            const rowData = [];
            
            // Check if first row has th elements
            if (rowIndex === 0 && row.querySelector('th')) {
              hasHeader = true;
            }
            
            cells.forEach(cell => {
              rowData.push(cell.innerHTML || '');
            });
            
            if (rowData.length > 0) {
              tableData.push(rowData);
            }
          });
          
          if (tableData.length > 0) {
            blocks.push({
              id: generateId(),
              type: BlockType.TABLE,
              content: '',
              properties: { 
                tableData,
                hasHeader
              }
            });
          }
        } else {
          // Process as regular table content
          Array.from(node.childNodes).forEach(processNode);
        }
        break;
        
      case 'p':
        const content = node.innerHTML;
        if (content && content !== '<br>') {
          blocks.push({
            id: generateId(),
            type: BlockType.TEXT,
            content: content,
            properties: {}
          });
        } else {
          // Add empty text block for empty paragraphs to maintain cursor position
          blocks.push({
            id: generateId(),
            type: BlockType.TEXT,
            content: '',
            properties: {}
          });
        }
        break;
        
      default:
        // For other elements, process their children
        Array.from(node.childNodes).forEach(processNode);
    }
  };
  
  // Process all child nodes of body
  Array.from(doc.body.childNodes).forEach(processNode);
  
  // If no blocks were created, add an empty text block
  if (blocks.length === 0) {
    blocks.push({
      id: generateId(),
      type: BlockType.TEXT,
      content: '',
      properties: {}
    });
  }
  
  return blocks;
};

// Helper functions
function generateId() {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getCalloutIcon(type) {
  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅',
    note: '📝',
    tip: '💡',
    question: '❓'
  };
  return icons[type] || 'ℹ️';
}

// Extract plain text from blocks (for preview)
export const blocksToPlainText = (blocks) => {
  return blocks
    .map(block => {
      if (block.type === BlockType.TODO) {
        const checkbox = block.properties?.checked ? '☑' : '☐';
        const content = block.content || '';
        // Strip HTML tags for plain text
        const plainContent = content.replace(/<[^>]*>/g, '');
        return `${checkbox} ${plainContent}`;
      } else if (block.type === BlockType.TABLE) {
        const tableData = block.properties?.tableData || [];
        return tableData
          .map(row => row.join(' | '))
          .join('\n');
      } else if (block.type === BlockType.CODE) {
        const language = block.properties?.language || '';
        const content = block.content || '';
        return `\`\`\`${language}\n${content}\n\`\`\``;
      } else if (block.type === BlockType.DIVIDER) {
        const style = block.properties?.style || 'line';
        if (style === 'dots') return '• • •';
        if (style === 'wave') return '~~~';
        return '---';
      } else if (block.type === BlockType.IMAGE) {
        const caption = block.properties?.caption || '';
        const alt = block.properties?.alt || 'Image';
        return caption ? `[${alt}]: ${caption}` : `[${alt}]`;
      } else if (block.type === BlockType.VIDEO) {
        const videoCaption = block.properties?.caption || '';
        return videoCaption ? `[Video]: ${videoCaption}` : '[Video]';
      } else if (block.type === BlockType.AUDIO) {
        const audioCaption = block.properties?.caption || '';
        const audioFilename = block.properties?.filename || '';
        if (audioCaption) return `[Audio]: ${audioCaption}`;
        if (audioFilename) return `[Audio]: ${audioFilename}`;
        return '[Audio]';
      } else if (block.type === BlockType.CALLOUT) {
        const type = block.properties?.type || 'info';
        const title = block.properties?.title || type.toUpperCase();
        const content = block.content || '';
        const plainContent = content.replace(/<[^>]*>/g, '');
        return `[${title.toUpperCase()}] ${plainContent}`;
      } else if (block.type === BlockType.TOGGLE) {
        const title = block.properties?.title || 'Toggle';
        const content = block.content || '';
        const plainContent = content.replace(/<[^>]*>/g, '');
        const arrow = block.properties?.isOpen ? '▼' : '▶';
        return `${arrow} ${title}\n${plainContent}`;
      } else if (block.type === BlockType.EMBED) {
        const title = block.properties?.title || 'Embedded content';
        const url = block.properties?.url || '';
        return `[EMBED: ${title}]${url ? ` ${url}` : ''}`;
      } else if (block.type === BlockType.MATH) {
        const content = block.content || '';
        const isInline = block.properties?.inline || false;
        return isInline ? `$${content}$` : `$$${content}$$`;
      } else if (block.type === BlockType.LINK_PREVIEW) {
        const title = block.properties?.title || '';
        const url = block.properties?.url || '';
        const description = block.properties?.description || '';
        return `[${title}](${url})${description ? ` - ${description}` : ''}`;
      }
      
      // Strip HTML tags for plain text
      const content = block.content || '';
      return content.replace(/<[^>]*>/g, '');
    })
    .filter(text => text.trim())
    .join('\n');
};

// Migrate old HTML content to blocks
export const migrateHtmlContent = (htmlContent) => {
  try {
    const blocks = htmlToBlocks(htmlContent);
    return {
      blocks,
      html: htmlContent, // Keep original HTML as backup
      version: 2 // Mark as new format
    };
  } catch (error) {
    console.error('Error migrating content:', error);
    // Return a safe default
    return {
      blocks: [{ id: generateId(), type: BlockType.TEXT, content: htmlContent, properties: {} }],
      html: htmlContent,
      version: 2
    };
  }
};