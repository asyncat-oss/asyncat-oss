// Settings: a column of pages on the left (a row of them on a phone), with a
// search box that finds a setting by name, and the page on the right. The
// pages and where old addresses lead are in settingsTabs.js.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AppWindow,
  ArrowLeft,
  Bell,
  Cpu,
  Folder,
  Info,
  Keyboard,
  Monitor,
  Palette,
  Plug,
  Settings2,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { useUiPreferences } from '../contexts/UiPreferencesContext';
import GeneralSection from './GeneralSection';
import AppearanceSection from './AppearanceSection';
import ServerSection from './ServerSection';
import UpdateSection from './UpdateSection';
import IntegrationsSection from './IntegrationsSection';
import WorkbenchSection from './WorkbenchSection';
import BackgroundSection from './BackgroundSection';
import KeyboardShortcutsSection from './KeyboardShortcutsSection.jsx';
import GlobalShortcutsSection from './GlobalShortcutsSection.jsx';
import DesktopSection from './DesktopSection.jsx';
import NewChatsSection from './NewChatsSection.jsx';
import ConnectorsSection from '../Connectors/ConnectorsSection.jsx';
import PrivacySection from './PrivacySection.jsx';
import NotificationsSection from './NotificationsSection.jsx';
import RunSetupAgain from '../welcome/RunSetupAgain.jsx';
import { SettingsSearchBox, SettingsSearchResults } from './SettingsSearchBox.jsx';
import { resultRoute, searchSettings } from './settingsSearch.js';
import { SETTINGS_TABS, resolveTab } from './settingsTabs.js';
import { Segmented } from '../components/ui/Tabs.jsx';
import Switch from '../components/ui/Switch.jsx';
import Button from '../components/ui/Button.jsx';
import { RowGroup, SettingsRow, SettingsSection } from '../components/ui/Rows.jsx';

const ICONS = {
  general: Settings2,
  appearance: Palette,
  shortcuts: Keyboard,
  notifications: Bell,
  connections: Plug,
  privacy: ShieldCheck,
  workbench: AppWindow,
  desktop: Monitor,
  about: Info,
  // Search results that live outside Settings.
  files: Folder,
  models: Cpu,
};

const DEV_OPTIONS_KEY = 'asyncat_developer_options';

function readDevOptions() {
  try { return localStorage.getItem(DEV_OPTIONS_KEY) === 'true'; } catch { return false; }
}

const SettingsPage = () => {
  const { tab } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useUiPreferences();
  const where = resolveTab(tab);
  const [connectionsView, setConnectionsView] = useState(where.view || 'services');
  const [devOptions, setDevOptions] = useState(readDevOptions);
  const [query, setQuery] = useState('');
  const mainRef = useRef(null);

  const tabs = SETTINGS_TABS;
  const activeTab = where.tab || 'general';
  const activeTabInfo = tabs.find((item) => item.id === activeTab) || tabs[0];
  const section = location.hash ? decodeURIComponent(location.hash.slice(1)) : where.section;
  const groups = [...new Set(tabs.map((item) => item.group))];
  const results = useMemo(() => searchSettings(query, tabs), [query, tabs]);

  const openResult = (result) => {
    if (!result) return;
    setQuery('');
    navigate(resultRoute(result));
  };

  const changeDevOptions = (value) => {
    setDevOptions(value);
    try { localStorage.setItem(DEV_OPTIONS_KEY, String(value)); } catch { /* localStorage may be unavailable */ }
  };

  useEffect(() => {
    // Engines went to Models, Storage & logs to Files, Projects to their own pages.
    if (where.redirect) navigate(where.redirect, { replace: true });
    if (where.view) setConnectionsView(where.view);
  }, [navigate, where.redirect, where.view]);

  // A new page starts at its top; a link to a section (#window) scrolls to
  // it. Sections above it may still be loading and grow, so for a moment it
  // keeps the section in place, until the person scrolls themselves.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return undefined;
    if (!section) {
      main.scrollTop = 0;
      return undefined;
    }
    let tries = 0;
    let timer = null;
    let observer = null;
    const stop = () => {
      clearTimeout(timer);
      observer?.disconnect();
      for (const type of ['wheel', 'touchstart', 'keydown']) main.removeEventListener(type, stop);
    };
    // Only this page scrolls: scrollIntoView would also shift the app's frame
    // when the section is too near the bottom to reach the top.
    const reveal = (target) => {
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      main.scrollTop += target.getBoundingClientRect().top - main.getBoundingClientRect().top - margin;
    };
    const find = () => {
      const target = main.querySelector(`[data-settings-section="${CSS.escape(section)}"]`);
      if (!target) {
        if (tries++ < 20) timer = setTimeout(find, 100);
        return;
      }
      reveal(target);
      if (typeof ResizeObserver === 'undefined' || !main.firstElementChild) return;
      observer = new ResizeObserver(() => reveal(target));
      observer.observe(main.firstElementChild);
      for (const type of ['wheel', 'touchstart', 'keydown']) main.addEventListener(type, stop, { passive: true });
      timer = setTimeout(stop, 1500);
    };
    find();
    return stop;
  }, [activeTab, section, location.key]);

  const renderGeneral = () => (
    <div className="space-y-8">
      <GeneralSection />
      <div data-settings-section="new-chats" className="scroll-mt-6">
        <NewChatsSection />
      </div>
      <div data-settings-section="window" className="scroll-mt-6">
        <BackgroundSection />
      </div>
      <div data-settings-section="setup" className="scroll-mt-6">
        <RunSetupAgain />
      </div>
    </div>
  );

  const renderShortcuts = () => (
    <div className="space-y-8">
      <KeyboardShortcutsSection />
      <GlobalShortcutsSection />
    </div>
  );

  const renderAbout = () => (
    <div className="space-y-8">
      <UpdateSection />
      <SettingsSection icon={Wrench} title="Advanced" data-settings-section="developer" className="scroll-mt-6">
        <RowGroup>
          <SettingsRow label="Storage and logs" hint="In Files, with everything else Asyncat keeps on this computer.">
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
      </SettingsSection>
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
    if (where.redirect) return null;
    switch (activeTab) {
      case 'appearance':
        return <AppearanceSection theme={theme} setThemeMode={setTheme} />;
      case 'shortcuts':
        return renderShortcuts();
      case 'notifications':
        return <NotificationsSection />;
      case 'connections':
        return renderConnections();
      case 'privacy':
        return <PrivacySection />;
      case 'workbench':
        return <WorkbenchSection />;
      case 'desktop':
        return <DesktopSection />;
      case 'about':
        return renderAbout();
      default:
        return renderGeneral();
    }
  };

  const renderNavButton = (item, mobile = false) => {
    const Icon = ICONS[item.id];
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

        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Settings pages">
          {query.trim() ? (
            <div className="pt-2">
              <SettingsSearchResults results={results} icons={ICONS} onPick={openResult} />
            </div>
          ) : groups.map((group) => (
            <div key={group}>
              <div className="px-2.5 pb-1 pt-4 text-[11px] font-medium text-fg-subtle">{group}</div>
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-label="Back to Asyncat"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-[15px] font-semibold">Settings</h1>
            <div className="h-8 w-8" />
          </div>
          <div className="pb-2">
            <SettingsSearchBox value={query} onChange={setQuery} onSubmit={() => openResult(results[0])} />
          </div>
          {query.trim() ? (
            <div className="max-h-64 overflow-y-auto pb-3">
              <SettingsSearchResults results={results} icons={ICONS} onPick={openResult} />
            </div>
          ) : (
            <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-3" aria-label="Settings pages">
              {tabs.map((item) => <div key={item.id}>{renderNavButton(item, true)}</div>)}
            </nav>
          )}
        </div>

        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto" data-settings-page={activeTab}>
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
