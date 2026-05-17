import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Layout,
  Moon,
  MousePointer,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Palette,
  Sparkles,
  Sun,
} from 'lucide-react';
import KeyboardShortcutsSection from './KeyboardShortcutsSection.jsx';

const cardClasses =
  'bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-200/70 dark:border-gray-800';
const insetClasses =
  'bg-gray-50/80 dark:bg-gray-800/80 p-4 rounded-lg border border-gray-200/60 dark:border-gray-700/70';
const textClasses = 'text-gray-700 dark:text-gray-200';
const mutedClasses = 'text-sm text-gray-500 dark:text-gray-400 mt-4';

const dispatchPreferenceChange = (eventName) => {
  window.dispatchEvent(new Event(eventName));
};

const PreferenceCard = ({ icon: Icon, title, description, children }) => (
  <section className={cardClasses}>
    <div className="flex items-center gap-2 mb-4">
      <Icon size={20} className="text-gray-700 dark:text-gray-200" />
      <h3 className="text-base font-medium text-gray-800 dark:text-gray-100">{title}</h3>
    </div>
    <div className={insetClasses}>
      <div className="flex flex-col gap-3">{children}</div>
      {description ? <p className={mutedClasses}>{description}</p> : null}
    </div>
  </section>
);

const RadioRow = ({ name, checked, onChange, icon: Icon, label }) => (
  <label className="flex items-center justify-between gap-4 p-3 rounded-lg border border-transparent hover:border-gray-300/70 dark:hover:border-gray-600/70 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 cursor-pointer transition-colors">
    <span className="flex min-w-0 items-center gap-3">
      {Icon ? <Icon className="w-5 h-5 flex-shrink-0 text-gray-500 dark:text-gray-400" /> : null}
      <span className={`${textClasses} truncate`}>{label}</span>
    </span>
    <input
      type="radio"
      name={name}
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:text-blue-500 dark:focus:ring-blue-400"
    />
  </label>
);

const AppearanceSection = ({ theme, setThemeMode }) => {
  const [navigationStyle, setNavigationStyle] = useState(() => {
    return localStorage.getItem('navigationStyle') || 'dock';
  });
  const [dockVisibility, setDockVisibility] = useState(() => {
    return localStorage.getItem('dockVisibility') || 'always';
  });
  const [dockPosition, setDockPosition] = useState(() => {
    return localStorage.getItem('dockPosition') || 'bottom';
  });
  const [sidebarPosition, setSidebarPosition] = useState(() => {
    return localStorage.getItem('sidebarPosition') || 'left';
  });
  const [sidebarState, setSidebarState] = useState(() => {
    return localStorage.getItem('sidebarState') || 'expanded';
  });
  const [sidebarVisibility, setSidebarVisibility] = useState(() => {
    return localStorage.getItem('sidebarVisibility') || 'always';
  });
  const [topMenuBarVisibility, setTopMenuBarVisibility] = useState(() => {
    return localStorage.getItem('topMenuBarVisibility') || 'always';
  });
  const [pageTransitions, setPageTransitions] = useState(() => {
    return localStorage.getItem('pageTransitions') || 'on';
  });

  const handleNavigationStyleChange = (value) => {
    setNavigationStyle(value);
    localStorage.setItem('navigationStyle', value);
    dispatchPreferenceChange('navigation-style-changed');
  };

  const handleDockVisibilityChange = (value) => {
    setDockVisibility(value);
    localStorage.setItem('dockVisibility', value);
    dispatchPreferenceChange('dock-visibility-changed');
  };

  const handleDockPositionChange = (value) => {
    setDockPosition(value);
    localStorage.setItem('dockPosition', value);
    dispatchPreferenceChange('dock-position-changed');
  };

  const handleSidebarPositionChange = (value) => {
    setSidebarPosition(value);
    localStorage.setItem('sidebarPosition', value);
    dispatchPreferenceChange('sidebar-position-changed');
  };

  const handleSidebarStateChange = (value) => {
    setSidebarState(value);
    localStorage.setItem('sidebarState', value);
    dispatchPreferenceChange('sidebar-state-changed');
  };

  const handleSidebarVisibilityChange = (value) => {
    setSidebarVisibility(value);
    localStorage.setItem('sidebarVisibility', value);
    dispatchPreferenceChange('sidebar-visibility-changed');
  };

  const handleTopMenuBarVisibilityChange = (value) => {
    setTopMenuBarVisibility(value);
    localStorage.setItem('topMenuBarVisibility', value);
    dispatchPreferenceChange('top-menu-bar-visibility-changed');
  };

  const handlePageTransitionsChange = (value) => {
    setPageTransitions(value);
    localStorage.setItem('pageTransitions', value);
    dispatchPreferenceChange('page-transitions-changed');
  };

  return (
    <div className="space-y-6 font-sora">
      <PreferenceCard
        icon={Palette}
        title="Theme"
        description="Use a fixed theme or follow your operating system preference."
      >
        <RadioRow
          name="theme"
          icon={Sun}
          label="Light Mode"
          checked={theme === 'light'}
          onChange={() => setThemeMode('light')}
        />
        <RadioRow
          name="theme"
          icon={Moon}
          label="Dark Mode"
          checked={theme === 'dark'}
          onChange={() => setThemeMode('dark')}
        />
        <RadioRow
          name="theme"
          icon={Sun}
          label="System Preference"
          checked={theme === 'system'}
          onChange={() => setThemeMode('system')}
        />
      </PreferenceCard>

      <PreferenceCard
        icon={Layout}
        title="Navigation"
        description="Choose a floating dock or a persistent sidebar."
      >
        <RadioRow
          name="navigationStyle"
          icon={PanelBottom}
          label="Floating Dock"
          checked={navigationStyle === 'dock'}
          onChange={() => handleNavigationStyleChange('dock')}
        />
        <RadioRow
          name="navigationStyle"
          icon={PanelLeft}
          label="Sidebar"
          checked={navigationStyle === 'sidebar'}
          onChange={() => handleNavigationStyleChange('sidebar')}
        />
      </PreferenceCard>

      {navigationStyle === 'sidebar' && (
        <>
          <PreferenceCard
            icon={Layout}
            title="Sidebar Position"
            description="Choose which edge the persistent sidebar uses."
          >
            <RadioRow
              name="sidebarPosition"
              icon={PanelLeft}
              label="Left"
              checked={sidebarPosition === 'left'}
              onChange={() => handleSidebarPositionChange('left')}
            />
            <RadioRow
              name="sidebarPosition"
              icon={PanelRight}
              label="Right"
              checked={sidebarPosition === 'right'}
              onChange={() => handleSidebarPositionChange('right')}
            />
          </PreferenceCard>

          <PreferenceCard
            icon={PanelLeft}
            title="Sidebar Size"
            description="Keep labels visible or collapse the sidebar to icons."
          >
            <RadioRow
              name="sidebarState"
              label="Expanded"
              checked={sidebarState === 'expanded'}
              onChange={() => handleSidebarStateChange('expanded')}
            />
            <RadioRow
              name="sidebarState"
              label="Collapsed"
              checked={sidebarState === 'collapsed'}
              onChange={() => handleSidebarStateChange('collapsed')}
            />
          </PreferenceCard>

          <PreferenceCard
            icon={MousePointer}
            title="Sidebar Visibility"
            description="Choose whether the sidebar stays open or appears near the screen edge."
          >
            <RadioRow
              name="sidebarVisibility"
              label="Always Visible"
              checked={sidebarVisibility === 'always'}
              onChange={() => handleSidebarVisibilityChange('always')}
            />
            <RadioRow
              name="sidebarVisibility"
              label="Show on Hover"
              checked={sidebarVisibility === 'hover'}
              onChange={() => handleSidebarVisibilityChange('hover')}
            />
          </PreferenceCard>
        </>
      )}

      <PreferenceCard
        icon={Sparkles}
        title="Page Motion"
        description="Add a light fade when moving between main sections."
      >
        <RadioRow
          name="pageTransitions"
          label="Subtle Transitions"
          checked={pageTransitions === 'on'}
          onChange={() => handlePageTransitionsChange('on')}
        />
        <RadioRow
          name="pageTransitions"
          label="No Page Motion"
          checked={pageTransitions === 'off'}
          onChange={() => handlePageTransitionsChange('off')}
        />
      </PreferenceCard>

      {navigationStyle === 'dock' && (
        <>
          <PreferenceCard
            icon={MousePointer}
            title="Dock Visibility"
            description="Choose whether the floating dock is always visible or appears near the screen edge."
          >
            <RadioRow
              name="dockVisibility"
              label="Always Visible"
              checked={dockVisibility === 'always'}
              onChange={() => handleDockVisibilityChange('always')}
            />
            <RadioRow
              name="dockVisibility"
              label="Show on Hover"
              checked={dockVisibility === 'hover'}
              onChange={() => handleDockVisibilityChange('hover')}
            />
          </PreferenceCard>

          <PreferenceCard
            icon={Layout}
            title="Dock Position"
            description="Choose where the floating dock appears on your screen."
          >
            <RadioRow
              name="dockPosition"
              icon={PanelBottom}
              label="Bottom"
              checked={dockPosition === 'bottom'}
              onChange={() => handleDockPositionChange('bottom')}
            />
            <RadioRow
              name="dockPosition"
              icon={PanelLeft}
              label="Left"
              checked={dockPosition === 'left'}
              onChange={() => handleDockPositionChange('left')}
            />
            <RadioRow
              name="dockPosition"
              icon={PanelRight}
              label="Right"
              checked={dockPosition === 'right'}
              onChange={() => handleDockPositionChange('right')}
            />
          </PreferenceCard>
        </>
      )}

      <PreferenceCard
        icon={Layout}
        title="Top Menu Bar"
        description="Toggle the top menu bar that displays app status and quick actions."
      >
        <RadioRow
          name="topMenuBarVisibility"
          label="Always Show"
          checked={topMenuBarVisibility === 'always'}
          onChange={() => handleTopMenuBarVisibilityChange('always')}
        />
        <RadioRow
          name="topMenuBarVisibility"
          label="Hide"
          checked={topMenuBarVisibility === 'hidden'}
          onChange={() => handleTopMenuBarVisibilityChange('hidden')}
        />
      </PreferenceCard>

      <KeyboardShortcutsSection />
    </div>
  );
};

PreferenceCard.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  children: PropTypes.node,
};

RadioRow.propTypes = {
  name: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  icon: PropTypes.elementType,
  label: PropTypes.string.isRequired,
};

AppearanceSection.propTypes = {
  theme: PropTypes.oneOf(['light', 'dark', 'system']).isRequired,
  setThemeMode: PropTypes.func.isRequired,
};

export default AppearanceSection;
