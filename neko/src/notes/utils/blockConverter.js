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

      case 'pre': {
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
      }

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
        
      case 'p': {
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
      }
        
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
