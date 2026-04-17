// Utility functions for the ListView component with clean design support
import catDP from '../../assets/dp/CAT.webp';
import dogDP from '../../assets/dp/DOG.webp';
import dolphinDP from '../../assets/dp/DOLPHIN.webp';
import dragonDP from '../../assets/dp/DRAGON.webp';
import elephantDP from '../../assets/dp/ELEPHANT.webp';
import foxDP from '../../assets/dp/FOX.webp';
import lionDP from '../../assets/dp/LION.webp';
import owlDP from '../../assets/dp/OWL.webp';
import penguinDP from '../../assets/dp/PENGUIN.webp';
import wolfDP from '../../assets/dp/WOLF.webp';

// Mapping for profile pictures
export const profilePictureMap = {
  'CAT': catDP,
  'DOG': dogDP,
  'DOLPHIN': dolphinDP,
  'DRAGON': dragonDP,
  'ELEPHANT': elephantDP,
  'FOX': foxDP,
  'LION': lionDP,
  'OWL': owlDP,
  'PENGUIN': penguinDP,
  'WOLF': wolfDP
};

// Format date for display with clean styling
export const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

// Format time duration in human-readable format
export const formatDuration = (seconds) => {
  if (!seconds) return "0m";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Calculate due status for filtering and display
export const getDueStatus = (dueDate) => {
  if (!dueDate) return "none";
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  if (due < today) return "overdue";
  
  if (due.getTime() === today.getTime()) return "today";
  
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  if (due <= nextWeek) return "thisWeek";
  
  return "later";
};

// Enhanced style for due date with modern colors
export const getDueDateStyle = (dueDate) => {
  const status = getDueStatus(dueDate);
  
  switch (status) {
    case "overdue":
      return "text-red-600 dark:text-red-400 midnight:text-red-400 font-semibold";
    case "today":
      return "text-amber-600 dark:text-amber-400 midnight:text-amber-400 font-semibold";
    case "thisWeek":
      return "text-blue-600 dark:text-blue-400 midnight:text-blue-400 font-medium";
    default:
      return "text-gray-600 dark:text-gray-400 midnight:text-gray-500";
  }
};

// Enhanced progress bar colors with gradients
export const getProgressColor = (progress) => {
  if (progress === 100) {
    return "bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 midnight:from-emerald-600 midnight:to-emerald-700";
  }
  if (progress < 25) {
    return "bg-gradient-to-r from-red-400 to-red-500 dark:from-red-500 dark:to-red-600 midnight:from-red-600 midnight:to-red-700";
  }
  if (progress < 50) {
    return "bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 midnight:from-amber-600 midnight:to-amber-700";
  }
  if (progress < 75) {
    return "bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-500 dark:to-blue-600 midnight:from-blue-600 midnight:to-blue-700";
  }
  return "bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 midnight:from-emerald-600 midnight:to-emerald-700";
};

// Get user profile picture from profile picture ID
export const getProfilePicture = (profilePicId) => {
  if (!profilePicId) return null;
  
  // Check if it's a custom uploaded image (URL starts with https://)
  if (profilePicId.startsWith('https://')) {
    return profilePicId;
  }
  
  // Handle predefined avatars
  if (profilePictureMap[profilePicId]) {
    return profilePictureMap[profilePicId];
  }
  return null;
};

// Get initial for member with better fallbacks
export const getMemberInitial = (member) => {
  if (!member) return 'U';
  
  // Try all possible locations for the name or email
  const name = member.name || '';
  if (name) return name.charAt(0).toUpperCase();
  
  const email = member.email || '';
  if (email) return email.charAt(0).toUpperCase();
  
  return 'U'; // Default fallback
};

// Get display name for tooltip with enhanced formatting
export const getMemberDisplayName = (member) => {
  if (!member) return 'Member';
  return member.name || member.email || 'Member';
};

// Enhanced priority styling for modern look
export const getPriorityStyle = (priority) => {
  switch (priority) {
    case "High":
      return {
        bg: "bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/5",
        text: "text-red-700 dark:text-red-400 midnight:text-red-300",
        border: "border-red-200 dark:border-red-800 midnight:border-red-900",
        icon: "text-red-500"
      };
    case "Medium":
      return {
        bg: "bg-amber-50 dark:bg-amber-900/10 midnight:bg-amber-900/5",
        text: "text-amber-700 dark:text-amber-400 midnight:text-amber-300",
        border: "border-amber-200 dark:border-amber-800 midnight:border-amber-900",
        icon: "text-amber-500"
      };
    case "Low":
      return {
        bg: "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5",
        text: "text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300",
        border: "border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900",
        icon: "text-emerald-500"
      };
    default:
      return {
        bg: "bg-gray-50 dark:bg-gray-900/10 midnight:bg-gray-900/5",
        text: "text-gray-700 dark:text-gray-400 midnight:text-gray-500",
        border: "border-gray-200 dark:border-gray-800 midnight:border-gray-900",
        icon: "text-gray-500"
      };
  }
};

// Enhanced status styling for completion states
export const getStatusStyle = (isCompletionColumn) => {
  if (isCompletionColumn) {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-900/10 midnight:bg-emerald-900/5",
      text: "text-emerald-700 dark:text-emerald-400 midnight:text-emerald-300",
      border: "border-emerald-200 dark:border-emerald-800 midnight:border-emerald-900"
    };
  }
  return {
    bg: "bg-blue-50 dark:bg-blue-900/10 midnight:bg-blue-900/5",
    text: "text-blue-700 dark:text-blue-400 midnight:text-blue-300",
    border: "border-blue-200 dark:border-blue-800 midnight:border-blue-900"
  };
};

// Helper function to generate consistent hover states
export const getHoverStyle = (baseStyle) => {
  return `${baseStyle} transition-all duration-200 hover:shadow-sm hover:scale-[1.02]`;
};

// Helper function for card state backgrounds
export const getCardStateBackground = (isCompleted, isBlocked, hasActiveTimer) => {
  if (isCompleted) {
    return "bg-emerald-50/50 dark:bg-emerald-900/10 midnight:bg-emerald-950/5 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 midnight:hover:bg-emerald-950/10";
  }
  if (isBlocked) {
    return "bg-red-50/50 dark:bg-red-900/10 midnight:bg-red-950/5 hover:bg-red-100/50 dark:hover:bg-red-900/20 midnight:hover:bg-red-950/10";
  }
  if (hasActiveTimer) {
    return "bg-blue-50/50 dark:bg-blue-900/10 midnight:bg-blue-950/5 hover:bg-blue-100/50 dark:hover:bg-blue-900/20 midnight:hover:bg-blue-950/10";
  }
  return "hover:bg-gray-50/50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-900/50";
};

// Helper function for clean button styles
export const getButtonStyle = (variant = "primary", size = "medium") => {
  const base = "inline-flex items-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";
  
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 shadow-sm hover:shadow-md",
    secondary: "bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 focus:ring-gray-500",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500 shadow-sm hover:shadow-md",
    danger: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-sm hover:shadow-md",
    outline: "border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700 focus:ring-blue-500"
  };
  
  const sizes = {
    small: "px-2.5 py-1.5 text-xs",
    medium: "px-4 py-2.5 text-sm",
    large: "px-6 py-3 text-base"
  };
  
  return `${base} ${variants[variant]} ${sizes[size]}`;
};

// Helper function for consistent spacing
export const getSpacing = (size = "medium") => {
  const spacing = {
    tiny: "p-1",
    small: "p-2",
    medium: "p-4",
    large: "p-6",
    xlarge: "p-8"
  };
  
  return spacing[size] || spacing.medium;
};