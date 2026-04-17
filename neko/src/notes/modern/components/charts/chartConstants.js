// Predefined chart height options
export const CHART_HEIGHT_OPTIONS = {
  small: { label: "Small", value: 250 },
  medium: { label: "Medium", value: 350 },
  large: { label: "Large", value: 450 },
  extraLarge: { label: "Extra Large", value: 550 }
};

// Helper function to get height value from key
export const getHeightValue = (heightKey) => {
  return CHART_HEIGHT_OPTIONS[heightKey]?.value || CHART_HEIGHT_OPTIONS.medium.value;
};

// Helper function to get height key from value (for backward compatibility)
export const getHeightKey = (heightValue) => {
  for (const [key, option] of Object.entries(CHART_HEIGHT_OPTIONS)) {
    if (option.value === heightValue) {
      return key;
    }
  }
  // Default to closest match
  if (heightValue <= 250) return 'small';
  if (heightValue <= 350) return 'medium';
  if (heightValue <= 450) return 'large';
  return 'extraLarge';
};