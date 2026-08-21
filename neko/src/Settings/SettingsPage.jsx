import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Cpu,
  Database,
  Info,
  Palette,
  AppWindow,
  Plug,
  Server,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useUiPreferences } from '../contexts/UiPreferencesContext';
import GeneralSection from './GeneralSection';
import AppearanceSection from './AppearanceSection';
import ServerSection from './ServerSection';
import UpdateSection from './UpdateSection';
import StorageSection from './StorageSection';
import IntegrationsSection from './IntegrationsSection';
import RuntimeSection from './RuntimeSection';
import WorkbenchSection from './WorkbenchSection';
import ProjectsSection from './ProjectsSection';

const TAB_ALIASES = {
  general: 'profile',
  account: 'profile',
  security: 'profile',
  integrations: 'connections',
  server: 'advanced',
  storage: 'advanced',
  updates: 'about',
  workspace: 'projects',
};

const SettingsPage = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { localUser } = useOutletContext() || {};
  const { currentWorkspace, updateCurrentWorkspace } = useWorkspace();
  const { theme, setTheme } = useUiPreferences();
  const [advancedView, setAdvancedView] = useState(tab === 'server' ? 'server' : 'storage');

  const tabs = useMemo(() => [
    {
      id: 'profile',
      group: 'Personal',
      label: 'Profile',
      description: 'Your local display name and avatar.',
      icon: UserRound,
    },
    {
      id: 'projects',
      group: 'Personal',
      label: 'Projects',
      description: 'Create Projects and control their local folder access.',
      icon: BriefcaseBusiness,
    },
    {
      id: 'appearance',
      group: 'App',
      label: 'Appearance',
      description: 'Theme, navigation, motion, and keyboard preferences.',
      icon: Palette,
    },
    {
      id: 'connections',
      group: 'App',
      label: 'Connections',
      description: 'External services available to Asyncat and its agents.',
      icon: Plug,
    },
    {
      id: 'workbench',
      group: 'App',
      label: 'Workbench',
      description: 'Browser, terminal, panel layout, and local browsing data.',
      icon: AppWindow,
    },
    {
      id: 'runtime',
      group: 'System',
      label: 'Runtime',
      description: 'Managed local inference engines, updates, cleanup, and installation readiness.',
      icon: Cpu,
    },
    {
      id: 'advanced',
      group: 'System',
      label: 'Advanced',
      description: 'Storage, logs, server configuration, and maintenance.',
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

  useEffect(() => {
    if (tab === 'server') setAdvancedView('server');
    if (tab === 'storage') setAdvancedView('storage');
  }, [tab]);

  const renderProfile = () => (
    <GeneralSection
      view="profile"
      localUser={localUser}
      workspace={currentWorkspace}
      onWorkspaceUpdated={updateCurrentWorkspace}
    />
  );

  const renderAdvanced = () => (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-950 midnight:border-slate-800 midnight:bg-slate-950">
        {[
          { id: 'storage', label: 'Storage & logs', icon: Database },
          { id: 'server', label: 'Server', icon: Server },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAdvancedView(id)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              advancedView === id
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100 midnight:bg-slate-800 midnight:text-slate-100'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:text-slate-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {advancedView === 'server' ? <ServerSection /> : <StorageSection />}
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfile();
      case 'projects':
        return <ProjectsSection />;
      case 'appearance':
        return <AppearanceSection theme={theme} setThemeMode={setTheme} />;
      case 'connections':
        return <IntegrationsSection />;
      case 'workbench':
        return <WorkbenchSection />;
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
        className={`${mobile ? 'shrink-0' : 'w-full'} group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-left text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gray-400/40 ${
          selected
            ? 'bg-gray-100 text-gray-950 dark:bg-white/[0.07] dark:text-gray-100 midnight:bg-white/[0.06] midnight:text-slate-100'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-100 midnight:text-slate-400 midnight:hover:bg-white/[0.05] midnight:hover:text-slate-100'
        }`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center transition-colors ${
          selected
            ? 'text-current'
            : 'text-gray-400 group-hover:text-gray-700 dark:text-gray-500 dark:group-hover:text-gray-300 midnight:text-slate-500 midnight:group-hover:text-slate-300'
        }`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {item.label}
      </button>
    );
  };

  return (
    <div className="flex h-full w-full bg-white font-sans text-gray-950 dark:bg-gray-900 dark:text-gray-100 midnight:bg-slate-950 midnight:text-slate-100">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200/70 bg-white lg:flex dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
        <div className="border-b border-gray-200/70 px-4 py-4 dark:border-gray-800 midnight:border-slate-800">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-100 midnight:text-slate-400 midnight:hover:bg-white/[0.05] midnight:hover:text-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Asyncat
          </button>
          <h1 className="mt-4 px-2 text-lg font-semibold tracking-tight">Settings</h1>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {groups.map((group, index) => (
            <div key={group} className={index === 0 ? '' : 'mt-5'}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-600 midnight:text-slate-600">
                {group}
              </div>
              <div className="space-y-1">
                {tabs.filter((item) => item.group === group).map((item) => (
                  <div key={item.id}>{renderNavButton(item)}</div>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-gray-200/80 bg-white/95 px-4 pt-3 backdrop-blur lg:hidden dark:border-gray-800 dark:bg-gray-900/95 midnight:border-slate-800 midnight:bg-slate-950/95">
          <div className="flex items-center justify-between pb-3">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 midnight:hover:bg-slate-900"
              aria-label="Back to Asyncat"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold">Settings</div>
            <div className="h-8 w-8" />
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-3">
            {tabs.map((item) => <div key={item.id}>{renderNavButton(item, true)}</div>)}
          </nav>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
            <header className="mb-7 border-b border-gray-100 pb-5 dark:border-gray-800 midnight:border-slate-800">
              <h2 className="text-xl font-semibold tracking-tight">{activeTabInfo.label}</h2>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
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
