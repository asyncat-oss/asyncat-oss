import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { habitApi } from './habitApi';

// Constants
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MIN_TARGET_VALUE = 1;
const MAX_TARGET_VALUE = 10000;

const CreateHabitModal = ({ isOpen, onClose, onHabitCreated, selectedProject }) => {
  const initialFormData = {
    name: '',
    description: '',
    frequency: 'daily',
    tracking_type: 'boolean',
    target_value: 1,
    unit: '',
    category: 'general',
    color: '#6366f1',
    icon: '🎯',
    is_private: true
  };

  const [formData, setFormData] = useState(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState('activities');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');

  // Extremely sarcastic and brutally honest taglines
  const taglines = [
    "Here we go again... this time will definitely be different 🙄",
    "Adding another habit you'll definitely stick to this time 💀",
    "Because last month's abandoned habits weren't enough ✨",
    "Track your descent into madness, one checkbox at a time 📉",
    "Your 47th attempt at being a morning person starts here 🌅",
    "Pretending you're not just gonna do this for 3 days 🤡",
    "Another habit to feel guilty about not doing 🎭",
    "Optimism: 100. Success rate: TBD (probably 2%) 📊",
    "From 'I got this' to 'I forgot' in under 72 hours ⏰",
    "Your annual 'New Year, New Me' energy in May 🗓️",
    "Adding to your collection of things you meant to do 💼",
    "Because shame-driven productivity is totally healthy 🏃",
    "One more habit before your inevitable burnout 🔥",
    "Manifesting consistency through sheer delusion ✨",
    "Your therapist suggested this, probably 🛋️",
    "When you're too organized to admit you're a mess 📋",
    "Nothing screams 'stable' like micro-managing your life 🎯",
    "For when self-help books become too easy to ignore 📚",
    "Your anxiety: 'Let's gamify this!' You: 'Great idea!' 🎮",
    "Welcome to the habit graveyard. Population: All of them ⚰️",
    "Tracking habits because therapy is expensive 💸",
    "Another checkbox to ignore with style 💅",
    "Breaking news: Local person thinks THIS time is different 📰",
    "Your commitment issues, now with data visualization! 📈",
    "When 'winging it' needs structure ✈️",
    "Discipline? Never heard of her. But here's a tracker! 🎪",
    "For people who color-code their existential crises 🌈",
    "Your 'I'll start tomorrow' energy, but make it official 📅",
    "Because adulting wasn't hard enough already 👔",
    "Turning basic human functions into achievements since 2024 🏆"
  ];

  // Pick a random tagline when component mounts
  const [randomTagline] = useState(() => taglines[Math.floor(Math.random() * taglines.length)]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData);
      setShowCustomCategory(false);
      setCustomCategory('');
      setSuccess(false);
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  // Validate form data
  const validateForm = () => {
    if (!selectedProject?.id) {
      return 'No project selected';
    }

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      return 'Habit name is required';
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      return `Habit name must be ${MAX_NAME_LENGTH} characters or less`;
    }

    if (formData.description && formData.description.length > MAX_DESCRIPTION_LENGTH) {
      return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`;
    }

    if (formData.target_value < MIN_TARGET_VALUE || formData.target_value > MAX_TARGET_VALUE) {
      return `Target value must be between ${MIN_TARGET_VALUE} and ${MAX_TARGET_VALUE}`;
    }

    if (showCustomCategory && !customCategory.trim()) {
      return 'Please enter a custom category or select a predefined one';
    }

    return null;
  };

  const handleSubmit = async () => {
    // Validate
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    try {
      setLoading(true);
      setError('');

      // Use project_id instead of workspace_id
      await habitApi.createHabit({
        ...formData,
        project_id: selectedProject.id
      });

      // Show success feedback
      setSuccess(true);
      
      // Reset form and close modal after a brief delay
      setTimeout(() => {
        setFormData(initialFormData);
        setShowCustomCategory(false);
        setCustomCategory('');
        setSuccess(false);
        setError('');
        onHabitCreated();
      }, 1000);
    } catch (err) {
      console.error('Error creating habit:', err);
      setError(err.message || 'Failed to create habit');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    // Enforce max lengths
    if (field === 'name' && value.length > MAX_NAME_LENGTH) {
      return;
    }
    if (field === 'description' && value.length > MAX_DESCRIPTION_LENGTH) {
      return;
    }
    if (field === 'target_value') {
      // Allow empty string while typing
      if (value === '' || value === null || value === undefined) {
        setFormData(prev => ({ ...prev, [field]: '' }));
        if (error) setError('');
        return;
      }
      // Validate number
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < MIN_TARGET_VALUE || numValue > MAX_TARGET_VALUE) {
        return;
      }
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(''); // Clear error when user starts typing
  };

  const handleCategoryChange = (value) => {
    if (value === 'custom') {
      setShowCustomCategory(true);
      setCustomCategory('');
      setFormData(prev => ({ ...prev, category: '' }));
    } else {
      setShowCustomCategory(false);
      setCustomCategory('');
      handleInputChange('category', value);
    }
  };

  const handleCustomCategoryChange = (value) => {
    setCustomCategory(value);
    handleInputChange('category', value);
  };

  // Curated useful emoji categories for habits
  const emojiCategories = {
    activities: {
      name: 'Activities',
      emojis: ['🎯', '💪', '🏃', '🏋️', '🧘', '🚴', '⚽', '🏀', '🎾', '🏊', '🎮', '🎨', '🎭', '🎬', '🎤', '🎵', '🎸', '🎹', '📷', '🎪', '🏃‍♀️', '⛹️', '🤸', '🧗', '🏄', '⛷️', '🎿', '🏇']
    },
    work: {
      name: 'Work & Study',
      emojis: ['💼', '💻', '📊', '📈', '📝', '✍️', '📚', '📖', '🎓', '🖊️', '✏️', '📎', '📌', '🔖', '📋', '📄', '🗂️', '⚙️', '🖥️', '⌨️', '🖱️', '📱', '📞', '📧', '✉️', '📬', '📮', '🗳️']
    },
    health: {
      name: 'Health & Food',
      emojis: ['❤️', '💚', '🧠', '🍎', '🍊', '🍋', '🍌', '🥗', '🥑', '🥦', '🥕', '🍅', '☕', '🍵', '🥛', '💊', '🩺', '😴', '🥤', '🍇', '🍓', '🥒', '🌽', '🥜', '🍞', '🥐', '💧', '🥤']
    },
    goals: {
      name: 'Goals & Success',
      emojis: ['⭐', '✨', '💫', '⚡', '🔥', '💥', '🌟', '✅', '💡', '🔔', '🎁', '🎉', '🏆', '🥇', '🥈', '🥉', '💎', '💰', '🎖️', '🏅', '👑', '💪', '🚀', '🎊', '🎈', '🌠', '💯', '🔝']
    },
    nature: {
      name: 'Nature',
      emojis: ['🌱', '🌿', '🍀', '🌳', '🌸', '🌺', '🌻', '🌼', '🌞', '🌙', '⭐', '🌟', '💧', '🔥', '🌈', '⚡', '❄️', '☀️', '🌵', '🌴', '🌾', '🌷', '🌹', '🥀', '🍁', '🍂', '☁️', '🌤️']
    },
    time: {
      name: 'Time & Tools',
      emojis: ['⏰', '⏱️', '⌚', '📱', '🔧', '🔨', '⚙️', '💡', '🔦', '🛠️', '⚒️', '🔑', '🎯', '📍', '🧭', '🗓️', '📅', '⏳', '⌛', '🕐', '🕑', '🕒', '🕓', '🕔', '📲', '💻', '🖥️', '⚡']
    }
  };

  // Get current category emojis
  const getCurrentEmojis = () => {
    return emojiCategories[emojiCategory].emojis;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 midnight:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 rounded-xl shadow-xl w-full max-w-5xl mx-auto max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
        {/* Header - Clean & Professional */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 midnight:bg-gray-900 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 px-6 py-5">
          <div className="flex items-center justify-between gap-6">
            {/* Left Section - Title & Context */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-4">
                {/* Title */}
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white midnight:text-white tracking-tight">
                    Create New Habit
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-1 italic">
                    {randomTagline}
                  </p>
                </div>
                
                {/* Project Badge - Right aligned in header */}
                {selectedProject && (
                  <div className="flex-shrink-0">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 midnight:bg-gray-800/50 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg">
                      <span className="text-base">{selectedProject.emoji || '📁'}</span>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-100 midnight:text-white">
                        {selectedProject.name}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right Section - Close Button */}
            <button
              onClick={onClose}
              className="flex-shrink-0 p-2 text-gray-400 dark:text-gray-500 midnight:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>        
        {/* Two-Column Content Layout with Scroll Support */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
        
        {error && (
          <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800 midnight:border-red-800/50 rounded-lg flex items-start space-x-2">
            <span className="text-red-500 flex-shrink-0 mt-0.5">⚠️</span>
            <p className="text-red-600 dark:text-red-400 midnight:text-red-400 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-5 p-3 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 border border-green-200 dark:border-green-800 midnight:border-green-800/50 rounded-lg flex items-start space-x-2">
            <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
            <p className="text-green-600 dark:text-green-400 midnight:text-green-400 text-sm font-medium">Habit created successfully!</p>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                Habit Name <span className="text-red-500">*</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 ml-2">
                  ({formData.name.length}/{MAX_NAME_LENGTH})
                </span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors"
                placeholder="e.g., Daily standup attendance"
                maxLength={MAX_NAME_LENGTH}
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                Description <span className="text-xs text-gray-500">(Optional)</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 ml-2">
                  ({formData.description.length}/{MAX_DESCRIPTION_LENGTH})
                </span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors resize-none"
                rows="3"
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder="Add a description to help your team understand this habit..."
              />
            </div>

            {/* Frequency and Tracking Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="relative z-10">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                  Frequency
                </label>
                <div className="relative">
                  <select
                    value={formData.frequency}
                    onChange={(e) => handleInputChange('frequency', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 pr-10 border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white rounded-lg shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 midnight:hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all duration-200 cursor-pointer font-medium"
                  >
                    <option value="daily">📅 Daily</option>
                    <option value="weekly">📆 Weekly</option>
                    <option value="monthly">🗓️ Monthly</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="relative z-10">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                  Tracking Type
                </label>
                <div className="relative">
                  <select
                    value={formData.tracking_type}
                    onChange={(e) => handleInputChange('tracking_type', e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 pr-10 border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white rounded-lg shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 midnight:hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all duration-200 cursor-pointer font-medium"
                  >
                    <option value="boolean">✓ Yes/No</option>
                    <option value="numeric">🔢 Number</option>
                    <option value="duration">⏱️ Duration</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Target Value and Unit (show only for numeric/duration) */}
            {(formData.tracking_type === 'numeric' || formData.tracking_type === 'duration') && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                    Target Value
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      value={formData.target_value}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string for clearing, otherwise parse and validate
                        if (value === '') {
                          handleInputChange('target_value', '');
                        } else {
                          const numValue = parseInt(value);
                          if (!isNaN(numValue) && numValue >= MIN_TARGET_VALUE && numValue <= MAX_TARGET_VALUE) {
                            handleInputChange('target_value', numValue);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        // On blur, if empty or invalid, set to minimum value
                        if (e.target.value === '' || parseInt(e.target.value) < MIN_TARGET_VALUE) {
                          handleInputChange('target_value', MIN_TARGET_VALUE);
                        }
                      }}
                      className="w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="1"
                      placeholder="e.g., 8"
                    />
                    <div className="absolute right-1 flex flex-col">
                      <button
                        type="button"
                        onClick={() => handleInputChange('target_value', (formData.target_value || 1) + 1)}
                        className="px-2 py-0.5 text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-700 rounded transition-colors"
                        title="Increase"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInputChange('target_value', Math.max(1, (formData.target_value || 1) - 1))}
                        className="px-2 py-0.5 text-gray-500 dark:text-gray-400 midnight:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-600 midnight:hover:bg-gray-700 rounded transition-colors"
                        title="Decrease"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => handleInputChange('unit', e.target.value)}
                    placeholder={formData.tracking_type === 'duration' ? 'minutes, hours' : 'commits, reviews'}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Category */}
            <div className="relative z-10">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                Category
              </label>
              {!showCustomCategory ? (
                <div className="relative">
                  <select
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full appearance-none px-3 py-2.5 pr-10 border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white rounded-lg shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 midnight:hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all duration-200 cursor-pointer font-medium"
                  >
                    <option value="general">⚡ General</option>
                    <option value="development">💻 Development</option>
                    <option value="communication">💬 Communication</option>
                    <option value="productivity">📈 Productivity</option>
                    <option value="quality">✨ Quality</option>
                    <option value="learning">📚 Learning</option>
                    <option value="collaboration">🤝 Collaboration</option>
                    <option value="health">❤️ Health & Wellness</option>
                    <option value="custom">✏️ Custom...</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 midnight:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => handleCustomCategoryChange(e.target.value)}
                    placeholder="Enter custom category"
                    className="flex-1 px-3 py-2.5 border-2 border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-700 midnight:bg-gray-800 text-gray-900 dark:text-gray-100 midnight:text-white rounded-lg shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 midnight:hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all duration-200 font-medium"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomCategory(false);
                      setCustomCategory('');
                      handleInputChange('category', 'general');
                    }}
                    className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 rounded-lg transition-colors"
                    title="Cancel custom category"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Privacy Toggle - NEW */}
            <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-800/50 dark:to-gray-700/50 midnight:from-gray-800/30 midnight:to-gray-700/30 rounded-lg border border-indigo-200 dark:border-gray-600 midnight:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-700 midnight:bg-gray-800 border-2 border-indigo-300 dark:border-indigo-500 midnight:border-indigo-600 flex items-center justify-center text-xl">
                    {formData.is_private ? '🔒' : '👥'}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-white">
                      {formData.is_private ? 'Private Habit' : 'Team Habit'}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleInputChange('is_private', !formData.is_private)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        formData.is_private 
                          ? 'bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600' 
                          : 'bg-indigo-600 dark:bg-indigo-500 midnight:bg-indigo-600'
                      }`}
                      role="switch"
                      aria-checked={!formData.is_private}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formData.is_private ? 'translate-x-1' : 'translate-x-6'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 midnight:text-gray-300 leading-relaxed">
                    {formData.is_private ? (
                      <>
                        <strong>Private:</strong> Only you can complete and edit this habit. 
                        Great for personal goals and individual accountability.
                      </>
                    ) : (
                      <>
                        <strong>Team:</strong> All project members can complete this habit and contribute to shared progress. 
                        Perfect for collaborative goals and team challenges.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Icon Picker & Live Preview */}
          <div className="space-y-4">
            {/* Choose Icon Section - Compact & Professional */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                Choose Icon
              </label>
              {/* Emoji Picker Panel - Improved */}
              <div className="border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg bg-white dark:bg-gray-800 midnight:bg-gray-900 overflow-hidden shadow-sm">
                {/* Category Tabs - Standard Size */}
                <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/30 scrollbar-hide">
                    {Object.entries(emojiCategories).map(([key, category]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setEmojiCategory(key)}
                        className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-all duration-200 ${
                          emojiCategory === key
                            ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 midnight:text-indigo-400 bg-white dark:bg-gray-800 midnight:bg-gray-900'
                            : 'border-transparent text-gray-500 dark:text-gray-500 midnight:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 midnight:hover:bg-gray-800/50'
                        }`}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                  
                  {/* Emoji Grid - Optimized Spacing */}
                  <div className="p-1.5 overflow-y-auto" style={{ maxHeight: '200px' }}>
                    <div className="grid grid-cols-7 gap-0">
                      {getCurrentEmojis().map((emoji, index) => (
                        <button
                          key={`${emoji}-${index}`}
                          type="button"
                          onClick={() => handleInputChange('icon', emoji)}
                          className={`w-8 h-8 text-lg rounded transition-all duration-150 flex items-center justify-center ${
                            formData.icon === emoji 
                              ? 'bg-indigo-100 dark:bg-indigo-900/40 midnight:bg-indigo-900/30 ring-1 ring-indigo-500 scale-105' 
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 hover:scale-110'
                          }`}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
            </div>

            {/* Live Preview Section - Clean & Professional */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                Live Preview
              </label>
              <div className="p-4 bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 rounded-lg">
                {/* Preview Card */}
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div 
                    className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl shadow-sm"
                    style={{ backgroundColor: `${formData.color}15`, border: `2px solid ${formData.color}40` }}
                  >
                    {formData.icon || '🎯'}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-white truncate">
                      {formData.name || 'Habit name will appear here'}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">
                      {formData.frequency.charAt(0).toUpperCase() + formData.frequency.slice(1)} • {formData.category.charAt(0).toUpperCase() + formData.category.slice(1)}
                    </p>
                    {formData.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400 mt-1.5 line-clamp-2">
                        {formData.description}
                      </p>
                    )}
                  </div>
                  
                  {/* Color Indicator */}
                  <div 
                    className="flex-shrink-0 w-1 h-12 rounded-full"
                    style={{ backgroundColor: formData.color }}
                  />
                </div>
              </div>
            </div>

            {/* Theme Color Section - Moved Here */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 mb-2">
                Theme Color
              </label>
              
              {/* Professional Color Selector */}
              <div className="p-4 rounded-lg bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  {/* Preset Colors */}
                  <div className="flex items-center gap-2">
                    {[
                      { color: '#6366f1', name: 'Indigo' },
                      { color: '#ef4444', name: 'Red' },
                      { color: '#22c55e', name: 'Green' },
                      { color: '#f59e0b', name: 'Amber' },
                      { color: '#8b5cf6', name: 'Purple' }
                    ].map(({ color, name }) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleInputChange('color', color)}
                        className={`relative w-10 h-10 rounded-lg transition-all duration-200 hover:scale-110 flex-shrink-0 ${
                          formData.color === color 
                            ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 scale-105' 
                            : 'hover:shadow-md'
                        }`}
                        style={{ 
                          backgroundColor: color,
                          ringColor: formData.color === color ? color : 'transparent',
                          boxShadow: formData.color === color 
                            ? `0 0 0 2px white, 0 4px 16px ${color}50` 
                            : `0 2px 8px ${color}30`
                        }}
                        title={name}
                      >
                        {formData.color === color && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="h-10 w-px bg-gray-200 dark:bg-gray-700 midnight:bg-gray-700"></div>

                  {/* Custom Color Picker */}
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <input
                        type="color"
                        value={formData.color}
                        onChange={(e) => handleInputChange('color', e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer opacity-0 absolute inset-0"
                        title="Pick custom color"
                      />
                      <div 
                        className="w-10 h-10 rounded-lg pointer-events-none border-2 border-gray-200 dark:border-gray-600 midnight:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 transition-all duration-200 relative overflow-hidden"
                        style={{ 
                          boxShadow: `0 2px 8px ${formData.color}30`
                        }}
                      >
                        <div 
                          className="absolute inset-0"
                          style={{ backgroundColor: formData.color }}
                        ></div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                        {/* Color Picker Icon */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-5 h-5 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                          </svg>
                        </div>
                      </div>
                      <div className="absolute -bottom-7 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                        Custom
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 uppercase tracking-wider">
                        Current
                      </p>
                      <p className="text-xs font-mono font-semibold text-gray-900 dark:text-white midnight:text-white">
                        {formData.color}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* Actions - Fixed at bottom */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800 px-6 py-4 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 bg-white dark:bg-gray-700 midnight:bg-gray-800 border border-gray-300 dark:border-gray-600 midnight:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 midnight:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !formData.name.trim() || !selectedProject?.id || success}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-600 midnight:hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {loading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>
                {success ? '✓ Created!' : loading ? 'Creating...' : 'Create Habit'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateHabitModal;