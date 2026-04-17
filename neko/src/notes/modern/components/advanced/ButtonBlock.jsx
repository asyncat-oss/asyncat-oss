import React, { useState, useRef, useEffect } from 'react';
import { MousePointer, ChevronDown } from 'lucide-react';

const CustomDropdown = ({ value, onChange, options, placeholder = "Select option..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded dark:bg-gray-700 midnight:bg-gray-800 dark:text-white midnight:text-white bg-white text-left flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600 transition-colors"
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-700 midnight:bg-gray-800 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded shadow-lg max-h-60 overflow-auto">
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-700 ${
                value === option.value ? 'bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-950/20 text-blue-600 dark:text-blue-400 midnight:text-blue-300' : 'text-gray-900 dark:text-white midnight:text-white'
              }`}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ButtonBlock = ({ block, onChange }) => {
  const [config, setConfig] = useState(block.properties?.config || {
    text: 'Click me',
    style: 'primary',
    size: 'medium',
    action: 'none',
    url: '',
    fullWidth: false
  });

  const styleOptions = [
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'outline', label: 'Outline' },
    { value: 'ghost', label: 'Ghost' },
    { value: 'danger', label: 'Danger' },
    { value: 'success', label: 'Success' }
  ];

  const sizeOptions = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' }
  ];

  const actionOptions = [
    { value: 'none', label: 'No Action' },
    { value: 'url', label: 'Open URL' },
    { value: 'email', label: 'Send Email' }
  ];

  const updateConfig = (updates) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onChange(block.id, {
      properties: { ...block.properties, config: newConfig }
    });
  };

  const handleButtonClick = () => {
    switch (config.action) {
      case 'url':
        if (config.url) {
          window.open(config.url, '_blank');
        }
        break;
      case 'email':
        if (config.url) {
          window.location.href = `mailto:${config.url}`;
        }
        break;
      default:
        // No action
        break;
    }
  };

  const getButtonClass = () => {
    let baseClass = 'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
    
    // Size
    switch (config.size) {
      case 'small':
        baseClass += ' px-3 py-1.5 text-sm';
        break;
      case 'large':
        baseClass += ' px-6 py-3 text-lg';
        break;
      default: // medium
        baseClass += ' px-4 py-2 text-base';
    }
    
    // Style
    switch (config.style) {
      case 'secondary':
        baseClass += ' bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500';
        break;
      case 'outline':
        baseClass += ' border-2 border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white dark:border-blue-400 dark:text-blue-400';
        break;
      case 'ghost':
        baseClass += ' text-blue-500 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20';
        break;
      case 'danger':
        baseClass += ' bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700';
        break;
      case 'success':
        baseClass += ' bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700';
        break;
      default: // primary
        baseClass += ' bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700';
    }
    
    if (config.fullWidth) {
      baseClass += ' w-full';
    }
    
    return baseClass;
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-800 midnight:bg-gray-900">
      <div className="flex items-center gap-2 mb-4">
        <MousePointer className="w-4 h-4" />
        <span className="font-medium">Button</span>
      </div>
      
      <div className="space-y-4">
        <div className="flex justify-center">
          <button
            onClick={handleButtonClick}
            className={getButtonClass()}
          >
            {config.text}
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Button Text</label>
            <input
              type="text"
              value={config.text}
              onChange={(e) => updateConfig({ text: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded dark:bg-gray-700 midnight:bg-gray-800 dark:text-white midnight:text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Style</label>
            <CustomDropdown
              value={config.style}
              onChange={(value) => updateConfig({ style: value })}
              options={styleOptions}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Size</label>
            <CustomDropdown
              value={config.size}
              onChange={(value) => updateConfig({ size: value })}
              options={sizeOptions}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Action</label>
            <CustomDropdown
              value={config.action}
              onChange={(value) => updateConfig({ action: value })}
              options={actionOptions}
            />
          </div>
        </div>
        
        {(config.action === 'url' || config.action === 'email') && (
          <div>
            <label className="block text-sm font-medium mb-1">
              {config.action === 'email' ? 'Email Address' : 'URL'}
            </label>
            <input
              type={config.action === 'email' ? 'email' : 'url'}
              value={config.url}
              onChange={(e) => updateConfig({ url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded dark:bg-gray-700 midnight:bg-gray-800 dark:text-white midnight:text-white"
              placeholder={config.action === 'email' ? 'example@email.com' : 'https://example.com'}
            />
          </div>
        )}
        
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.fullWidth}
              onChange={(e) => updateConfig({ fullWidth: e.target.checked })}
              className="rounded"
            />
            Full Width
          </label>
        </div>
      </div>
    </div>
  );
};

export default ButtonBlock;
