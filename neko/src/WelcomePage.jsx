import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Loader2,
  Activity,
  Zap,
  ChevronRight,
  AlertCircle,
  GitBranch,
  HardDrive,
  Sun,
  Moon,
  Monitor,
  Layout as LayoutIcon,
  MousePointer,
  Eye,
  EyeOff,
  FolderOpen,
  Globe,
  Cpu,
  Mic,
  Star,
} from 'lucide-react';
import authService from './services/authService.js';

const API_URL = import.meta.env.VITE_USER_URL || 'http://localhost:8716';
const EMOJI_OPTIONS = ['🏠', '🧭', '⚙️', '🧪', '🚀', '🧠', '🗂️', '💼', '🎨', '🔒'];

const SYSTEM_STATUS = "Initializing core modules...";
const fieldClassName = "w-full px-1 py-2 bg-transparent border-b border-gray-200 dark:border-gray-700 midnight:border-slate-700 focus:border-blue-500 transition-all outline-none text-gray-900 dark:text-gray-100 midnight:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500 text-[13px]";
const primaryButtonClassName = "flex-1 py-3 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 midnight:bg-slate-100 midnight:hover:bg-slate-200 text-white dark:text-gray-900 midnight:text-slate-950 rounded-full font-bold text-[13px] transition-all disabled:opacity-30 disabled:hover:bg-gray-900 dark:disabled:hover:bg-gray-100 midnight:disabled:hover:bg-slate-100 shadow-sm";
const backButtonClassName = "text-[11px] font-bold text-gray-300 dark:text-gray-600 midnight:text-slate-600 hover:text-gray-900 dark:hover:text-gray-100 midnight:hover:text-slate-100 transition-colors uppercase tracking-widest";
const labelClassName = "text-[10px] font-bold text-gray-400 dark:text-gray-500 midnight:text-slate-500 uppercase tracking-widest ml-1";

const setupFetchJson = async (url) => {
  const response = await authService.authenticatedFetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed: ${response.status}`);
  return data;
};

const countMissing = (items = [], required) => (
  items.filter(item => Boolean(item.required) === required && !item.ok).length
);

const ConnectionRow = ({ label, status, detail, icon: Icon }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 last:border-0">
    <div className="flex items-center gap-4">
      <div className="text-gray-400 dark:text-gray-500 midnight:text-slate-500">
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-200">{label}</p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500 font-mono tracking-tighter uppercase mt-0.5">{detail}</p>
      </div>
    </div>
    <div className={`h-1.5 w-1.5 rounded-full ${status === 'online' ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700 midnight:bg-slate-700'}`} />
  </div>
);

const PreferenceToggle = ({ options, selected, onChange }) => (
  <div className="flex p-1 bg-gray-100 dark:bg-gray-800/70 midnight:bg-slate-900/80 rounded-lg border border-transparent dark:border-gray-700/60 midnight:border-slate-800">
    {options.map(opt => {
      const isSelected = selected === opt.value;
      const Icon = opt.icon;
      return (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${
            isSelected 
              ? 'bg-white dark:bg-gray-900 midnight:bg-slate-950 text-gray-900 dark:text-gray-100 midnight:text-slate-100 shadow-sm' 
              : 'text-gray-500 dark:text-gray-400 midnight:text-slate-400 hover:text-gray-700 dark:hover:text-gray-200 midnight:hover:text-slate-200'
          }`}
        >
          {Icon && <Icon size={14} strokeWidth={2} />}
          {opt.label}
        </button>
      );
    })}
  </div>
);

const PageWrapper = ({ children, title, subtitle }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -15 }}
    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    className="w-full max-w-sm mx-auto text-center"
  >
    <div className="mb-10">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100 mb-2 tracking-tight">
        {title}
      </h1>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 midnight:text-slate-400 font-normal leading-relaxed max-w-[280px] mx-auto">
        {subtitle}
      </p>
    </div>
    {children}
  </motion.div>
);

const WelcomePage = ({ session, onTeamCreated }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form State
  const [accountName, setAccountName] = useState(session?.user?.name || '');
  const [accountEmail, setAccountEmail] = useState(session?.user?.email || 'admin@local');
  const [accountPassword, setAccountPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const [emoji, setEmoji] = useState('🏠');
  
  // Preferences State
  const [themePref, setThemePref] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return ['light', 'dark', 'midnight'].includes(savedTheme) ? savedTheme : 'system';
  });
  const [dockVis, setDockVis] = useState('always');
  const [topMenuVis, setTopMenuVis] = useState('always');

  const [showPassword, setShowPassword] = useState(false);

  const [config, setConfig] = useState({});
  const [configStatus, setConfigStatus] = useState('loading');
  const [readiness, setReadiness] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [providerConfig, setProviderConfig] = useState(null);
  const [setupError, setSetupError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadSetupStatus = async () => {
      setSetupError('');
      try {
        const [configResult, readinessResult, updateResult, providerResult] = await Promise.allSettled([
          setupFetchJson(`${API_URL}/api/config`),
          setupFetchJson(`${API_URL}/api/install/readiness`),
          setupFetchJson(`${API_URL}/api/update/status`),
          setupFetchJson(`${API_URL}/api/ai/providers/config`),
        ]);

        if (cancelled) return;

        if (configResult.status === 'fulfilled') {
          setConfig(configResult.value.config || {});
          setTimeout(() => {
            if (!cancelled) setConfigStatus('online');
          }, 350);
        } else {
          setConfigStatus('error');
        }

        if (readinessResult.status === 'fulfilled') setReadiness(readinessResult.value);
        if (updateResult.status === 'fulfilled') setUpdateInfo(updateResult.value);
        if (providerResult.status === 'fulfilled') setProviderConfig(providerResult.value);

        const failed = [readinessResult, updateResult].find(result => result.status === 'rejected');
        if (failed) setSetupError(failed.reason?.message || 'Some setup checks could not be read.');
      } catch (err) {
        if (cancelled) return;
        setConfigStatus('error');
        setSetupError(err.message || 'Could not load setup checks.');
      }
    };
    loadSetupStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  // Validation
  const isAccountValid = accountName.trim().length > 0 && 
                         /^[^\s@]+@[^\s@]+\.[^\s@]+$|^[^\s@]+@local$/i.test(accountEmail.trim()) &&
                         accountPassword.length >= 8;
  
  const isWorkspaceValid = workspaceName.trim().length >= 2;
  const requiredMissing = readiness?.requiredMissing?.length ?? countMissing(readiness?.checks || [], true);
  const optionalMissing = readiness?.optionalMissing?.length ?? countMissing(readiness?.checks || [], false);
  const readinessLoaded = Boolean(readiness);
  const runtimeStatus = readinessLoaded && requiredMissing === 0 ? 'online' : configStatus;
  const providerReady = Boolean(providerConfig?.model || providerConfig?.base_url);
  const updateDetail = updateInfo
    ? `v${updateInfo.version || 'local'} · ${updateInfo.branch || 'source'} · ${updateInfo.currentHash || 'unknown'}`
    : 'Reading local repository';
  const runtimeDetail = readinessLoaded
    ? requiredMissing === 0
      ? `${optionalMissing} optional tool${optionalMissing === 1 ? '' : 's'} missing`
      : `${requiredMissing} required tool${requiredMissing === 1 ? '' : 's'} missing`
    : 'Checking Node, npm, git, and local runtimes';

  // Instant Theme Preview
  useEffect(() => {
    if (themePref === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
      document.documentElement.classList.remove('midnight');
    } else if (themePref === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('midnight');
    } else if (themePref === 'midnight') {
      document.documentElement.classList.add('midnight');
      document.documentElement.classList.remove('dark');
    } else if (themePref === 'light') {
      document.documentElement.classList.remove('dark', 'midnight');
    }
  }, [themePref]);

  const applyPreferences = () => {
    // Save Theme
    if (themePref === 'system') {
      localStorage.removeItem('theme');
    } else {
      localStorage.setItem('theme', themePref);
    }

    // Dock & Menu
    localStorage.setItem('dockVisibility', dockVis);
    localStorage.setItem('topMenuBarVisibility', topMenuVis);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      applyPreferences();

      await authService.updateLocalAccount({
        name: accountName.trim(),
        email: accountEmail.trim(),
        password: accountPassword,
      });

      const response = await authService.authenticatedFetch(`${API_URL}/api/teams`, {
        method: 'POST',
        body: JSON.stringify({
          name: workspaceName.trim(),
          emoji,
        }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create workspace');

      onTeamCreated?.(data.data);
    } catch (err) {
      setError(err.message || 'Setup failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-900 midnight:bg-slate-950 flex flex-col font-sora selection:bg-blue-50 dark:selection:bg-blue-900/30 midnight:selection:bg-blue-900/30">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <PageWrapper
              key="welcome"
              title="Asyncat OSS"
              subtitle="Your private AI agent that actually does things — not just chat."
            >
              <div className="flex flex-col items-center gap-10">
                <div className="grid grid-cols-2 gap-2.5 w-full max-w-[300px]">
                  {[
                    { icon: Cpu, label: 'Local or Cloud', detail: 'Any model, your choice' },
                    { icon: FolderOpen, label: 'Real Workspace', detail: 'Files, shell, git, code' },
                    { icon: Globe, label: 'Web & Search', detail: 'Browses and researches' },
                    { icon: Mic, label: 'Voice & Images', detail: 'STT, TTS, image gen' },
                  ].map(({ icon: Icon, label, detail }) => (
                    <div key={label} className="flex items-start gap-2.5 rounded-xl border border-gray-100 dark:border-gray-800 midnight:border-slate-800 bg-gray-50/50 dark:bg-gray-800/30 midnight:bg-slate-900/30 p-3 text-left">
                      <Icon size={13} strokeWidth={1.8} className="mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                      <div>
                        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 midnight:text-slate-300">{label}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500 mt-0.5">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleNext}
                  className="group flex items-center gap-2 px-8 py-3 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 midnight:bg-slate-100 midnight:hover:bg-slate-200 text-white dark:text-gray-900 midnight:text-slate-950 rounded-full text-[13px] font-bold transition-all active:scale-[0.97] shadow-sm"
                >
                  Get Started
                  <ChevronRight size={14} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </PageWrapper>
          )}

          {step === 1 && (
            <PageWrapper 
              key="account"
              title="Identity"
              subtitle="Your data never leaves this device. Create your local profile."
            >
              <div className="space-y-6">
                <div className="space-y-4 text-left">
                  <div className="space-y-1.5">
                    <label className={labelClassName}>Full Name</label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={e => setAccountName(e.target.value)}
                      placeholder="Jane Doe"
                      className={fieldClassName}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClassName}>Email Handle</label>
                    <input
                      type="email"
                      value={accountEmail}
                      onChange={e => setAccountEmail(e.target.value)}
                      placeholder="admin@local"
                      className={fieldClassName}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClassName}>Password</label>
                    <div className="relative flex items-center">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={accountPassword}
                        onChange={e => setAccountPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        className={`w-full px-1 py-2 pr-7 bg-transparent border-b ${accountPassword.length > 0 && accountPassword.length < 8 ? 'border-red-500' : 'border-gray-200 dark:border-gray-700 midnight:border-slate-700'} focus:border-blue-500 transition-all outline-none text-gray-900 dark:text-gray-100 midnight:text-slate-100 placeholder-gray-400 dark:placeholder-gray-500 text-[13px]`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-1 text-gray-400 dark:text-gray-500 midnight:text-slate-500 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-slate-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                      </button>
                    </div>
                    {accountPassword.length > 0 && accountPassword.length < 8 && (
                      <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider ml-1">Security too low (Min 8 chars)</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={handleBack} className={backButtonClassName}>Back</button>
                  <button 
                    onClick={handleNext}
                    disabled={!isAccountValid}
                    className={primaryButtonClassName}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </PageWrapper>
          )}

          {step === 2 && (
            <PageWrapper 
              key="workspace"
              title="Projects"
              subtitle="Choose a visual marker and title for your project space."
            >
              <div className="space-y-8">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800/70 midnight:bg-slate-900/80 border border-gray-100 dark:border-gray-700/60 midnight:border-slate-800 rounded-2xl flex items-center justify-center text-3xl">
                    {emoji}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-4 justify-items-center opacity-80">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={`text-xl transition-all hover:scale-125 ${emoji === e ? 'scale-125 opacity-100' : 'opacity-40'}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className={labelClassName}>Name</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={e => setWorkspaceName(e.target.value)}
                    placeholder="My Projects"
                    className={fieldClassName}
                    autoFocus
                  />
                </div>

                <div className="flex gap-4">
                  <button onClick={handleBack} className={backButtonClassName}>Back</button>
                  <button 
                    onClick={handleNext}
                    disabled={!isWorkspaceValid}
                    className={primaryButtonClassName}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </PageWrapper>
          )}

          {step === 3 && (
            <PageWrapper 
              key="preferences"
              title="Preferences"
              subtitle="Customize your interface. These can be adjusted later in Settings."
            >
              <div className="space-y-6 text-left">
                <div className="space-y-1.5">
                  <label className={labelClassName}>Theme</label>
                  <PreferenceToggle 
                    selected={themePref}
                    onChange={setThemePref}
                    options={[
                      { value: 'light', label: 'Light', icon: Sun },
                      { value: 'dark', label: 'Dark', icon: Moon },
                      { value: 'midnight', label: 'Midnight', icon: Star },
                      { value: 'system', label: 'Auto', icon: Monitor },
                    ]}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelClassName}>Dock Visibility</label>
                  <PreferenceToggle 
                    selected={dockVis}
                    onChange={setDockVis}
                    options={[
                      { value: 'always', label: 'Always', icon: LayoutIcon },
                      { value: 'hover', label: 'On Hover', icon: MousePointer },
                    ]}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelClassName}>Top Menu Bar</label>
                  <PreferenceToggle 
                    selected={topMenuVis}
                    onChange={setTopMenuVis}
                    options={[
                      { value: 'always', label: 'Visible' },
                      { value: 'hidden', label: 'Hidden' },
                    ]}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={handleBack} className={backButtonClassName}>Back</button>
                  <button 
                    onClick={handleNext}
                    className={primaryButtonClassName}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </PageWrapper>
          )}

          {step === 4 && (
            <PageWrapper
              key="connect"
              title="Release Setup"
              subtitle="Asyncat is local-first. These checks make sure this machine is ready."
            >
              <div className="space-y-4 text-left">
                <div className="py-2">
                  <ConnectionRow
                    label="Application Server"
                    status={configStatus}
                    detail={configStatus === 'online' ? `Port ${config.PORT || '8716'} · Node.js` : "Connecting..."}
                    icon={Zap}
                  />
                  <ConnectionRow
                    label="Install Source"
                    status={configStatus}
                    detail={updateDetail}
                    icon={GitBranch}
                  />
                  <ConnectionRow
                    label="Machine Readiness"
                    status={runtimeStatus}
                    detail={runtimeDetail}
                    icon={HardDrive}
                  />
                  <ConnectionRow
                    label="AI Provider"
                    status={providerReady ? 'online' : 'offline'}
                    detail={providerReady ? `${providerConfig.provider_id || 'provider'} · ${providerConfig.model || 'configured'}` : 'Choose local or cloud on Models after setup'}
                    icon={Activity}
                  />
                </div>
                {setupError && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/60 midnight:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 midnight:bg-amber-950/20 px-3 py-2">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-[10px] leading-5 text-amber-700 dark:text-amber-300 midnight:text-amber-300">
                      {setupError}
                    </p>
                  </div>
                )}
                {configStatus === 'online' && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500 text-center pt-1 leading-5">
                    Account and workspace finish here. Models, API keys, updates, and optional local engines stay in Settings.
                  </p>
                )}
                <div className="flex gap-4 pt-6">
                  <button onClick={handleBack} className={backButtonClassName}>Back</button>
                  <button
                    onClick={handleNext}
                    className={primaryButtonClassName}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </PageWrapper>
          )}

          {step === 5 && (
            <PageWrapper 
              key="finish"
              title="Initialization"
              subtitle="Review your parameters before finalizing the installation."
            >
              <div className="space-y-8">
                <div className="text-left space-y-4 py-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 midnight:text-slate-500 uppercase tracking-widest">Identity</span>
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">{accountName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 midnight:text-slate-500 uppercase tracking-widest">Projects</span>
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">{emoji} {workspaceName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 midnight:text-slate-500 uppercase tracking-widest">Theme</span>
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100 capitalize">{themePref}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 midnight:text-slate-500 uppercase tracking-widest">AI Engine</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${providerReady ? 'text-emerald-500' : 'text-blue-500'}`}>
                      {providerReady ? 'Ready' : 'Models page next'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 midnight:text-slate-500 uppercase tracking-widest">Install</span>
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">
                      {readinessLoaded && requiredMissing === 0 ? 'Ready' : 'Needs review'}
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="text-[11px] text-red-500 font-medium">{error}</div>
                )}

                <div className="flex gap-4 pt-4">
                  <button onClick={handleBack} disabled={loading} className={backButtonClassName}>Back</button>
                  <button 
                    onClick={handleSubmit}
                    disabled={loading}
                    className={`${primaryButtonClassName} py-4 flex items-center justify-center gap-2 active:scale-[0.97] shadow-xl`}
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                    Finalize Setup
                  </button>
                </div>
              </div>
            </PageWrapper>
          )}
        </AnimatePresence>
      </div>

      {/* Zen Progress */}
      <div className="h-24 flex flex-col items-center justify-center gap-4">
         <div className="flex gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === step ? 'w-6 bg-blue-500' : 'w-1 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800'}`} />
            ))}
         </div>
         <div className="h-4 overflow-hidden flex items-center justify-center">
            <span className="text-[9px] font-bold text-gray-300 dark:text-gray-600 midnight:text-slate-600 uppercase tracking-[0.4em]">
              {SYSTEM_STATUS}
            </span>
         </div>
      </div>
    </div>
  );
};

ConnectionRow.propTypes = {
  label: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  detail: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
};

PreferenceToggle.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.elementType,
  })).isRequired,
  selected: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

PageWrapper.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string.isRequired,
};

WelcomePage.propTypes = {
  session: PropTypes.shape({
    user: PropTypes.shape({
      name: PropTypes.string,
      email: PropTypes.string,
    }),
  }),
  onTeamCreated: PropTypes.func,
};

export default WelcomePage;
