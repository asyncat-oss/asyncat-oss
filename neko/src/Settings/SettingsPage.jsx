import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Cpu,
  Info,
  Palette,
  AppWindow,
  Plug,
  Power,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useUiPreferences } from '../contexts/UiPreferencesContext';
import GeneralSection from './GeneralSection';
import AppearanceSection from './AppearanceSection';
import ServerSection from './ServerSection';
import UpdateSection from './UpdateSection';
import IntegrationsSection from './IntegrationsSection';
import RuntimeSection from './RuntimeSection';
import WorkbenchSection from './WorkbenchSection';
import BackgroundSection from './BackgroundSection';
import ConnectorsSection from '../Connectors/ConnectorsSection.jsx';
import PrivacySection from './PrivacySection.jsx';
import NotificationsSection from './NotificationsSection.jsx';
import RunSetupAgain from '../welcome/RunSetupAgain.jsx';
import { SettingsSearchBox, SettingsSearchResults } from './SettingsSearchBox.jsx';
import { resultRoute, searchSettings } from './settingsSearch.js';
import { Segmented } from '../components/ui/Tabs.jsx';
import Switch from '../components/ui/Switch.jsx';
import Button from '../components/ui/Button.jsx';
import { RowGroup, SettingsRow } from '../components/ui/Rows.jsx';

const TAB_ALIASES = {
  general: 'profile',
  account: 'profile',
  security: 'profile',
  integrations: 'connections',
  connectors: 'connections',
  mcp: 'connections',
  server: 'advanced',
  storage: 'advanced',
  updates: 'about',
  engines: 'runtime',
  safety: 'privacy',
  data: 'privacy',
  notify: 'notifications',
};

const DEV_OPTIONS_KEY = 'asyncat_developer_options';

function readDevOptions() {
  try { return localStorage.getItem(DEV_OPTIONS_KEY) === 'true'; } catch { return false; }
}

const SettingsPage = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { theme, setTheme } = useUiPreferences();
  const [connectionsView, setConnectionsView] = useState(tab === 'connectors' || tab === 'mcp' ? 'connectors' : 'services');
  const [devOptions, setDevOptions] = useState(readDevOptions);
  const [query, setQuery] = useState('');

  const tabs = useMemo(() => [
    {
      id: 'profile',
      group: 'Personal',
      label: 'Profile',
      description: 'Your local display name and avatar.',
      icon: UserRound,
    },
    {
      id: 'appearance',
      group: 'App',
      label: 'Appearance',
      description: 'Theme, navigation, motion, and keyboard preferences.',
      icon: Palette,
    },
    {
      id: 'notifications',
      group: 'App',
      label: 'Notifications',
      description: 'What shows a notification, for chats and Cats, and quiet hours.',
      icon: Bell,
    },
    {
      id: 'connections',
      group: 'App',
      label: 'Connections',
      description: 'Connectors that give agents tools from other apps, and the services Asyncat uses.',
      icon: Plug,
    },
    {
      id: 'privacy',
      group: 'App',
      label: 'Privacy & safety',
      description: 'What agents may do and where they may go, your saved keys, and your data: where it lives, export it, delete it.',
      icon: ShieldCheck,
    },
    {
      id: 'workbench',
      group: 'App',
      label: 'Workbench',
      description: 'Browser, terminal, panel layout, and local browsing data.',
      icon: AppWindow,
    },
    {
      id: 'background',
      group: 'System',
      label: 'Background',
      description: 'Keep Asyncat running for your Cats after you close the window, and start it when you log in.',
      icon: Power,
    },
    {
      id: 'runtime',
      group: 'System',
      label: 'Engines',
      description: 'The local engines Asyncat uses, their versions and the disk space they take.',
      icon: Cpu,
    },
    {
      id: 'advanced',
      group: 'System',
      label: 'Advanced',
      description: 'Developer options and the local server.',
      icon: Wrench,
    },
    {
      id: 'about',
      group: 'System',
      label: 'About',
      description: 'Version information and application updates.',
      icon: Info,
    },
  ], []);

  const requestedTab = TAB_ALIASES[tab] || tab || 'profile';
  const activeTab = tabs.some((item) => item.id === requestedTab) ? requestedTab : 'profile';
  const activeTabInfo = tabs.find((item) => item.id === activeTab) || tabs[0];
  const groups = [...new Set(tabs.map((item) => item.group))];
  const icons = useMemo(() => Object.fromEntries(tabs.map((item) => [item.id, item.icon])), [tabs]);
  const results = useMemo(() => searchSettings(query, tabs), [query, tabs]);

  const openResult = (result) => {
    if (!result) return;
    setQuery('');
    navigate(`/settings/${resultRoute(result)}`);
  };

  const changeDevOptions = (value) => {
    setDevOptions(value);
    try { localStorage.setItem(DEV_OPTIONS_KEY, String(value)); } catch { /* localStorage may be unavailable */ }
  };

  useEffect(() => {
    // Storage & logs moved to Files.
    if (tab === 'storage') navigate('/files/logs', { replace: true });
    if (tab === 'connectors' || tab === 'mcp') setConnectionsView('connectors');
    if (tab === 'integrations') setConnectionsView('services');
    // Projects moved out of Settings to their own pages.
    if (tab === 'projects' || tab === 'workspace') navigate('/projects', { replace: true });
  }, [navigate, tab]);

  const renderProfile = () => (
    <div className="space-y-5">
      <GeneralSection />
      <RunSetupAgain />
    </div>
  );

  const renderAdvanced = () => (
    <div className="space-y-6">
      <RowGroup>
        <SettingsRow label="Storage and logs" hint="Moved to Files, with everything else Asyncat keeps on this computer.">
          <Button onClick={() => navigate('/files/logs')}>Open Files</Button>
        </SettingsRow>
        <SettingsRow
          label="Developer options"
          hint="Show the server's ports and paths, its service addresses, its database and its restart button. Most people never need these."
          stack={false}
          data-developer-options
        >
          <Switch checked={devOptions} onChange={changeDevOptions} label="Developer options" />
        </SettingsRow>
      </RowGroup>
      {devOptions ? <ServerSection /> : null}
    </div>
  );

  const renderConnections = () => (
    <div className="space-y-5">
      <Segmented
        value={connectionsView}
        onChange={setConnectionsView}
        items={[
          { value: 'services', label: 'Services' },
          { value: 'connectors', label: 'Connectors' },
        ]}
        label="Connections"
      />
      {connectionsView === 'connectors' ? <ConnectorsSection /> : <IntegrationsSection />}
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfile();
      case 'appearance':
        return <AppearanceSection theme={theme} setThemeMode={setTheme} />;
      case 'notifications':
        return <NotificationsSection />;
      case 'connections':
        return renderConnections();
      case 'privacy':
        return <PrivacySection />;
      case 'workbench':
        return <WorkbenchSection />;
      case 'background':
        return <BackgroundSection />;
      case 'runtime':
        return <RuntimeSection />;
      case 'advanced':
        return renderAdvanced();
      case 'about':
        return <UpdateSection />;
      default:
        return renderProfile();
    }
  };

  const renderNavButton = (item, mobile = false) => {
    const Icon = item.icon;
    const selected = item.id === activeTab;
    return (
      <button
        type="button"
        onClick={() => navigate(`/settings/${item.id}`)}
        aria-current={selected ? 'page' : undefined}
        className={`${mobile ? 'shrink-0' : 'w-full'} group relative flex h-8 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 text-left text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/40 ${
          selected ? 'bg-selected font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
        }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </span>
        {item.label}
      </button>
    );
  };

  return (
    <div className="flex h-full w-full bg-canvas text-fg">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sidebar lg:flex">
        <div className="px-3 pb-2 pt-3">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Asyncat
          </button>
          <h1 className="mt-3 px-2.5 text-[17px] font-semibold tracking-[-0.015em]">Settings</h1>
          <div className="mt-3">
            <SettingsSearchBox value={query} onChange={setQuery} onSubmit={() => openResult(results[0])} />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {query.trim() ? (
            <div className="pt-2">
              <SettingsSearchResults results={results} icons={icons} onPick={openResult} />
            </div>
          ) : groups.map((group) => (
            <div key={group}>
              <div className="px-2.5 pb-1 pt-4 text-[11px] font-medium capitalize text-fg-subtle">
                {group.toLowerCase()}
              </div>
              <div className="space-y-px">
                {tabs.filter((item) => item.group === group).map((item) => (
                  <div key={item.id}>{renderNavButton(item)}</div>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-line bg-canvas px-4 pt-3 lg:hidden">
          <div className="flex items-center justify-between pb-3">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-hover"
              aria-label="Back to Asyncat"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold">Settings</div>
            <div className="h-8 w-8" />
          </div>
          <div className="pb-2">
            <SettingsSearchBox value={query} onChange={setQuery} onSubmit={() => openResult(results[0])} />
          </div>
          {query.trim() ? (
            <div className="max-h-64 overflow-y-auto pb-3">
              <SettingsSearchResults results={results} icons={icons} onPick={openResult} />
            </div>
          ) : (
            <nav className="flex gap-1 overflow-x-auto pb-3">
              {tabs.map((item) => <div key={item.id}>{renderNavButton(item, true)}</div>)}
            </nav>
          )}
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
            <header className="mb-7 border-b border-line pb-5">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{activeTabInfo.label}</h2>
              <p className="mt-1 text-[13px] text-fg-muted">
                {activeTabInfo.description}
              </p>
            </header>
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
