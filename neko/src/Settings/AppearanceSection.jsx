// Settings → Appearance: the theme, page motion, and what the sidebar shows.

import PropTypes from 'prop-types';
import {
  BrainCircuit,
  Cat as CatIcon,
  Cpu,
  Folder,
  FolderKanban,
  Palette,
  PanelLeft,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Segmented } from '../components/ui/Tabs.jsx';
import Switch from '../components/ui/Switch.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx';

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'system', label: 'System' },
];

const THEME_HINTS = {
  light: 'Dark text on a light background.',
  dark: 'Light text on a dark grey background.',
  midnight: 'Darker than Dark, for dim rooms.',
  system: "Follows your computer's light or dark setting.",
};

// The sidebar's optional destinations (contexts/navItems.js has the keys).
const DESTINATIONS = [
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'cats', label: 'Cats', icon: CatIcon, hint: 'Agents that work on their own.' },
  { key: 'files', label: 'Files', icon: Folder },
  { key: 'models', label: 'Models', icon: Cpu },
  { key: 'tools', label: 'Tools & Skills', icon: Wrench },
  { key: 'agent', label: 'Agents', icon: BrainCircuit },
  { key: 'trash', label: 'Trash', icon: Trash2 },
];

const AppearanceSection = ({ theme, setThemeMode }) => {
  const {
    sidebarState,
    setSidebarState,
    pageTransitionsEnabled,
    setPageTransitionsEnabled,
    navItemsVisibility,
    toggleNavItem,
  } = useUiPreferences();

  return (
    <div className="space-y-8" data-appearance>
      <SettingsSection icon={Palette} title="Theme and motion">
        <RowGroup>
          <SettingsRow label="Theme" hint={THEME_HINTS[theme]}>
            <Segmented value={theme} onChange={setThemeMode} items={THEMES} label="Theme" role="radiogroup" />
          </SettingsRow>
          <SettingsRow label="Fade between pages" hint="A light fade when you move between main sections." stack={false}>
            <Switch checked={pageTransitionsEnabled} onChange={setPageTransitionsEnabled} label="Fade between pages" />
          </SettingsRow>
        </RowGroup>
      </SettingsSection>

      <SettingsSection icon={PanelLeft} title="Sidebar" hint="New chat, Search, your chats and Settings are always there.">
        <div className="space-y-3">
          <RowGroup>
            <SettingsRow label="Show" hint={sidebarState === 'collapsed' ? 'A narrow column of icons; hover one for its name.' : 'Icons with their names.'}>
              <Segmented
                value={sidebarState === 'collapsed' ? 'collapsed' : 'expanded'}
                onChange={setSidebarState}
                items={[{ value: 'expanded', label: 'Icons and names' }, { value: 'collapsed', label: 'Icons only' }]}
                label="Sidebar shows"
                role="radiogroup"
              />
            </SettingsRow>
          </RowGroup>
          <RowGroup aria-label="Pages in the sidebar">
            {DESTINATIONS.map(({ key, label, icon: Icon, hint }) => (
              <SettingsRow
                key={key}
                label={(
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={1.75} />
                    {label}
                  </span>
                )}
                hint={hint ? <span className="block pl-[26px]">{hint}</span> : null}
                stack={false}
              >
                <Switch checked={navItemsVisibility[key] !== false} onChange={() => toggleNavItem(key)} label={`Show ${label} in the sidebar`} />
              </SettingsRow>
            ))}
          </RowGroup>
        </div>
      </SettingsSection>
    </div>
  );
};

AppearanceSection.propTypes = {
  theme: PropTypes.oneOf(['light', 'dark', 'midnight', 'system']).isRequired,
  setThemeMode: PropTypes.func.isRequired,
};

export default AppearanceSection;
