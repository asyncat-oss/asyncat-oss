import PropTypes from 'prop-types';
import {
  AppWindow,
  Check,
  Cookie,
  DatabaseZap,
  ExternalLink,
  FolderOpen,
  Ghost,
  Globe2,
  History,
  PanelBottom,
  PanelRight,
  RotateCcw,
  Search,
  ShieldCheck,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx';

const card = 'overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950';
const row = 'flex items-center justify-between gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03] midnight:hover:bg-white/[0.03]';

function SectionCard({ icon: Icon, title, description, children }) {
  return (
    <section className={card}>
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800 midnight:border-slate-800">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400 midnight:text-slate-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">{title}</h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{description}</p>
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

function ChoiceRow({ icon: Icon, label, description, value, onChange, options, compact = false }) {
  return (
    <div className="rounded-lg px-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03] midnight:hover:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-200">{label}</p>
          {description && <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{description}</p>}
          <div className={`mt-2 grid gap-1.5 ${compact ? 'grid-cols-3 sm:grid-cols-6' : 'sm:grid-cols-2'}`} role="radiogroup" aria-label={label}>
            {options.map((option) => {
              const selected = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange(option.value)}
                  className={`relative rounded-lg border px-3 py-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900/60 ${
                    selected
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm dark:border-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-200 midnight:border-indigo-700 midnight:bg-indigo-950/30 midnight:text-indigo-200'
                      : 'border-gray-200 bg-white text-gray-650 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-950/50 midnight:text-slate-300 midnight:hover:bg-slate-800'
                  }`}
                >
                  <span className={`block text-xs font-semibold ${compact ? 'text-center' : ''}`}>{option.label}</span>
                  {option.description && <span className="mt-0.5 block text-[11px] leading-4 opacity-70">{option.description}</span>}
                  {selected && !compact && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-indigo-500" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ icon: Icon, label, description, checked, onChange, disabled = false }) {
  return (
    <div className={`${row} ${disabled ? 'opacity-55' : ''}`}>
      <span className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <span>
          <span className="block text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-200">{label}</span>
          {description && <span className="block text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{description}</span>}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2 disabled:cursor-not-allowed dark:focus:ring-indigo-900/60 dark:focus:ring-offset-gray-900 ${checked ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-500 dark:bg-indigo-500' : 'border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-700 midnight:border-slate-600 midnight:bg-slate-700'}`}
      >
        <span className={`pointer-events-none absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

export default function WorkbenchSection() {
  const { workbenchPreferences: prefs, setWorkbenchPreference: setPreference, resetWorkbenchLayout } = useUiPreferences();
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState('');

  const clearBrowserData = async () => {
    setClearing(true);
    setClearMessage('');
    try {
      if (window.electronAPI?.clearBrowserData) {
        await window.electronAPI.clearBrowserData({ profile: prefs.browserProfile });
      }
      sessionStorage.removeItem('asyncat_web_tabs');
      sessionStorage.removeItem('asyncat_web_recently_closed');
      const mainUrl = import.meta.env.VITE_MAIN_URL || 'http://127.0.0.1:8716';
      const response = await fetch(`${mainUrl}/api/browser/history`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error('Could not clear browser history');
      setClearMessage('Browsing data cleared. Open pages may need to be reloaded.');
    } catch (error) {
      setClearMessage(error.message || 'Could not clear browsing data.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionCard icon={AppWindow} title="Layout" description="Choose where work tools open. Resize either dock directly in the workspace; Asyncat remembers its size.">
        <ChoiceRow
          icon={prefs.terminalPosition === 'bottom' ? PanelBottom : PanelRight}
          label="Terminal position"
          description="Bottom gives commands and logs more horizontal room. On small windows the terminal always uses the bottom dock."
          value={prefs.terminalPosition}
          onChange={(value) => setPreference('terminalPosition', value)}
          options={[
            { value: 'bottom', label: 'Bottom dock', description: 'Recommended for readable output' },
            { value: 'right', label: 'Right dock', description: 'Keep every tool in one column' },
          ]}
        />
        <ToggleRow icon={RotateCcw} label="Restore open panels" description="Reopen the last browser and terminal docks when returning to Work mode." checked={prefs.restoreOpenPanels} onChange={(value) => setPreference('restoreOpenPanels', value)} />
        <div className={row}>
          <span className="flex items-start gap-3"><PanelRight className="mt-0.5 h-4 w-4 text-gray-400" /><span><span className="block text-sm font-medium text-gray-800 dark:text-gray-200">Panel sizes</span><span className="block text-xs text-gray-500 dark:text-gray-400">Reset the right and bottom docks to their defaults.</span></span></span>
          <button type="button" onClick={resetWorkbenchLayout} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800">Reset</button>
        </div>
      </SectionCard>

      <SectionCard icon={SquareTerminal} title="Terminal" description="Defaults for new interactive shells. Existing terminal tabs keep the values they started with.">
        <ChoiceRow icon={SquareTerminal} label="Default shell" value={prefs.terminalShell} onChange={(value) => setPreference('terminalShell', value)} compact options={[
          { value: 'auto', label: 'Auto' }, { value: 'pwsh', label: 'PS 7' }, { value: 'powershell', label: 'PS 5' }, { value: 'cmd', label: 'CMD' }, { value: 'zsh', label: 'zsh' }, { value: 'bash', label: 'bash' },
        ]} />
        <ChoiceRow icon={FolderOpen} label="Starting folder" value={prefs.terminalStartDirectory} onChange={(value) => setPreference('terminalStartDirectory', value)} options={[
          { value: 'working', label: 'Current working folder', description: 'Match the workspace shown in the composer' },
          { value: 'home', label: 'Home folder', description: 'Start from your operating-system home' },
        ]} />
        <ChoiceRow icon={Wrench} label="Font size" value={String(prefs.terminalFontSize)} onChange={(value) => setPreference('terminalFontSize', Number(value))} compact options={[11, 12, 13, 14, 15, 16].map((size) => ({ value: String(size), label: `${size}` }))} />
        <ToggleRow icon={ShieldCheck} label="Confirm before stopping" description="Ask before closing an interactive terminal that may still be running." checked={prefs.terminalConfirmClose} onChange={(value) => setPreference('terminalConfirmClose', value)} />
      </SectionCard>

      <SectionCard icon={Globe2} title="Browser" description="The embedded browser is isolated from the Asyncat app and your system browser.">
        <ChoiceRow icon={Ghost} label="Default browsing mode" description="You can also switch modes from the browser toolbar. Incognito pages never enter local history or restored tabs." value={prefs.browserProfile} onChange={(value) => setPreference('browserProfile', value)} options={[
          { value: 'incognito', label: 'Incognito', description: 'Ephemeral cookies and no browsing history' },
          { value: 'persistent', label: 'Standard', description: 'Remember Asyncat-only site logins and cookies' },
        ]} />
        <ChoiceRow icon={Search} label="Search engine" value={prefs.browserSearchEngine} onChange={(value) => setPreference('browserSearchEngine', value)} compact options={[
          { value: 'brave', label: 'Brave' }, { value: 'google', label: 'Google' }, { value: 'duckduckgo', label: 'DuckDuckGo' }, { value: 'bing', label: 'Bing' },
        ]} />
        <ChoiceRow icon={ExternalLink} label="Where web links open" description="Applies to links in chats, source cards, and pages inside the embedded browser." value={prefs.browserOpenLinks} onChange={(value) => setPreference('browserOpenLinks', value)} options={[
          { value: 'internal', label: 'Asyncat browser', description: 'Open links in the built-in browser panel' },
          { value: 'system', label: 'System browser', description: 'Use your operating system’s default browser' },
        ]} />
        <ToggleRow icon={RotateCcw} label="Restore browser tabs" description="Available in Standard mode. Incognito tabs are always discarded." checked={prefs.browserRestoreTabs} onChange={(value) => setPreference('browserRestoreTabs', value)} />
        <ToggleRow icon={History} label="Save browsing history" description="Standard-mode page titles and URLs are stored locally. Incognito overrides this setting." checked={prefs.browserHistoryEnabled} onChange={(value) => setPreference('browserHistoryEnabled', value)} />
        <ToggleRow icon={Wrench} label="Developer tools" description="Show page inspection actions in the compact browser menu." checked={prefs.browserDeveloperTools} onChange={(value) => setPreference('browserDeveloperTools', value)} />
        <div className={row}>
          <span className="flex min-w-0 items-start gap-3"><DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" /><span><span className="block text-sm font-medium text-gray-800 dark:text-gray-200">Browsing data</span><span className="block text-xs leading-5 text-gray-500 dark:text-gray-400">Clear history, cache, saved tabs, cookies, and site storage. Incognito data is also cleared whenever its browser closes.</span>{clearMessage && <span className="mt-1 block text-xs text-indigo-500">{clearMessage}</span>}</span></span>
          <button type="button" onClick={clearBrowserData} disabled={clearing} className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:bg-gray-950 dark:text-red-400 dark:hover:bg-red-950/20">{clearing ? 'Clearing…' : 'Clear data'}</button>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-500 dark:bg-gray-950/50 dark:text-gray-400 midnight:bg-slate-950/60 midnight:text-slate-400">
          <Cookie className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Site permission prompts are blocked by default and shown only when a page explicitly asks. Files downloaded in Incognito still remain in your Downloads folder.
        </div>
      </SectionCard>
    </div>
  );
}

SectionCard.propTypes = { icon: PropTypes.elementType.isRequired, title: PropTypes.string.isRequired, description: PropTypes.string.isRequired, children: PropTypes.node };
ChoiceRow.propTypes = { icon: PropTypes.elementType.isRequired, label: PropTypes.string.isRequired, description: PropTypes.string, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, onChange: PropTypes.func.isRequired, options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired, description: PropTypes.string })).isRequired, compact: PropTypes.bool };
ToggleRow.propTypes = { icon: PropTypes.elementType.isRequired, label: PropTypes.string.isRequired, description: PropTypes.string, checked: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired, disabled: PropTypes.bool };
