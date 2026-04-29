// sidebar/CreateWorkSpaceModal.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Globe2,
  Loader2,
  MonitorCog,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import authService from '../services/authService.js';

const API_URL = import.meta.env.VITE_USER_URL || 'http://localhost:8716';

const steps = [
  { id: 'account', label: 'Account' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'environment', label: 'Environment' },
  { id: 'finish', label: 'Create' },
];

const emojiOptions = ['🏠', '🧭', '⚙️', '🧪', '🚀', '🧠', '🗂️', '💼'];

const inputClass =
  'h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-950 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:border-gray-500 dark:focus:ring-gray-800 midnight:border-white/10 midnight:bg-black midnight:text-white';

const labelClass = 'text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 midnight:text-gray-500';

const readValue = (value, fallback = 'Not set') => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return value;
};

const EnvRow = ({ icon: Icon, label, value, detail }) => (
  <div className="flex items-start gap-3 border-b border-gray-100 py-3 last:border-b-0 dark:border-white/10 midnight:border-white/10">
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300 midnight:bg-white/10 midnight:text-gray-300">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-sm font-medium text-gray-950 dark:text-white midnight:text-white">{label}</p>
        <code className="max-w-full truncate rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-white/10 dark:text-gray-300 midnight:bg-white/10 midnight:text-gray-300 sm:max-w-[58%]">
          {value}
        </code>
      </div>
      {detail && <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400 midnight:text-gray-500">{detail}</p>}
    </div>
  </div>
);

const StepRail = ({ stepIndex }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {steps.map((step, index) => {
      const active = index === stepIndex;
      const complete = index < stepIndex;
      return (
        <div
          key={step.id}
          className={`rounded-lg border px-3 py-2 ${
            active
              ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950 midnight:border-white midnight:bg-white midnight:text-gray-950'
              : complete
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300 midnight:border-emerald-900 midnight:bg-emerald-950/50 midnight:text-emerald-300'
                : 'border-gray-200 bg-white text-gray-500 dark:border-white/10 dark:bg-gray-900 dark:text-gray-400 midnight:border-white/10 midnight:bg-gray-950 midnight:text-gray-400'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/10 text-[11px]">
              {complete ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
            </span>
            <span className="truncate">{step.label}</span>
          </div>
        </div>
      );
    })}
  </div>
);

const CreateWorkspaceModal = ({ isOpen, onClose, canClose = true, onTeamCreated }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('admin@local');
  const [accountPassword, setAccountPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const [emoji, setEmoji] = useState('🏠');
  const [config, setConfig] = useState({});
  const [configLoading, setConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const loadSetupData = async () => {
      setConfigLoading(true);
      setMessage('');
      try {
        const [configResponse, session] = await Promise.all([
          authService.authenticatedFetch(`${API_URL}/api/config`),
          authService.getSession(),
        ]);
        const data = configResponse.ok ? await configResponse.json() : { config: {} };
        if (!cancelled) {
          setConfig(data.config || {});
          setAccountName(session?.user?.name || '');
          setAccountEmail(session?.user?.email || 'admin@local');
        }
      } catch {
        if (!cancelled) setMessage('Environment values could not be read. You can still create the workspace.');
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    };

    loadSetupData();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const frontendRows = useMemo(() => ([
    {
      icon: Globe2,
      label: 'Primary API',
      value: readValue(import.meta.env.VITE_API_URL, API_URL),
      detail: 'Fallback base URL used by auth services.',
    },
    {
      icon: Globe2,
      label: 'Workspace API',
      value: readValue(import.meta.env.VITE_USER_URL, API_URL),
      detail: 'Workspace, projects, settings, and profile calls.',
    },
    {
      icon: Globe2,
      label: 'AI and updates API',
      value: readValue(import.meta.env.VITE_MAIN_URL, API_URL),
      detail: 'Chat, providers, models, and update calls.',
    },
    {
      icon: Globe2,
      label: 'Auth and content APIs',
      value: readValue(import.meta.env.VITE_AUTH_URL, API_URL),
      detail: `Notes ${readValue(import.meta.env.VITE_NOTES_URL, API_URL)} · Calendar ${readValue(import.meta.env.VITE_CALENDAR_URL, API_URL)}`,
    },
    {
      icon: Globe2,
      label: 'Work module APIs',
      value: readValue(import.meta.env.VITE_KANBAN_URL, API_URL),
      detail: `Habits ${readValue(import.meta.env.VITE_HABIT_URL, API_URL)} · Storage ${readValue(import.meta.env.VITE_STORAGE_URL, API_URL)}`,
    },
  ]), []);

  const backendRows = useMemo(() => ([
    {
      icon: Server,
      label: 'Backend port',
      value: readValue(config.PORT, '8716'),
      detail: `Public URL: ${readValue(config.PUBLIC_URL, `http://localhost:${readValue(config.PORT, '8716')}`)} · ${readValue(config.NODE_ENV, 'development')}`,
    },
    {
      icon: Server,
      label: 'Frontend origin',
      value: readValue(config.FRONTEND_URL, 'http://localhost:8717'),
      detail: 'Used by CORS and browser requests.',
    },
    {
      icon: Database,
      label: 'SQLite database',
      value: readValue(config.DB_PATH, './data/asyncat.db'),
      detail: 'Relative paths are resolved from the backend working directory.',
    },
    {
      icon: ShieldCheck,
      label: 'First account default',
      value: readValue(config.LOCAL_EMAIL, 'admin@local'),
      detail: 'Used only when a fresh database creates the first account.',
    },
    {
      icon: ShieldCheck,
      label: 'Session settings',
      value: readValue(config.JWT_EXPIRES_IN, '7d'),
      detail: `JWT secret: ${readValue(config.JWT_SECRET, 'Not set')}`,
    },
    {
      icon: MonitorCog,
      label: 'Local model service',
      value: readValue(config.LLAMA_SERVER_PORT, '8765'),
      detail: `Models: ${readValue(config.MODELS_PATH, './data/models')}`,
    },
    {
      icon: MonitorCog,
      label: 'File storage',
      value: readValue(config.STORAGE_DRIVER, 'local'),
      detail: `Path: ${readValue(config.STORAGE_PATH, './data/uploads')}`,
    },
  ]), [config]);

  if (!isOpen) return null;

  const activeStep = steps[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;
  const workspaceNameValid = workspaceName.trim().length >= 2;
  const accountEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$|^[^\s@]+@local$/i.test(accountEmail.trim());
  const accountPasswordValid = accountPassword.length === 0 || accountPassword.length >= 8;
  const accountValid = accountName.trim().length >= 1 && accountEmailValid && accountPasswordValid;

  const createWorkspace = async () => {
    if (!accountValid) {
      setError('Set a display name, a valid email, and a password with at least 8 characters if you change it.');
      setStepIndex(0);
      return;
    }

    if (!workspaceNameValid) {
      setError('Give the workspace a name with at least two characters.');
      setStepIndex(1);
      return;
    }

    setSaving(true);
    setError('');

    try {
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to create workspace');

      onTeamCreated?.(data.data);
    } catch (err) {
      setError(err.message || 'Setup failed');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (activeStep.id === 'account' && !accountValid) {
      setError('Set a display name, a valid email, and a password with at least 8 characters if you change it.');
      return;
    }
    if (activeStep.id === 'workspace' && !workspaceNameValid) {
      setError('Give the workspace a name with at least two characters.');
      return;
    }
    setError('');
    setStepIndex(index => Math.min(index + 1, steps.length - 1));
  };

  const goBack = () => {
    setError('');
    setStepIndex(index => Math.max(index - 1, 0));
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-gray-100/95 px-4 py-6 text-gray-950 backdrop-blur dark:bg-gray-950/95 dark:text-white midnight:bg-black/95 midnight:text-white">
      <section className="relative flex max-h-[calc(100vh-48px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900 midnight:border-white/10 midnight:bg-gray-950">
        {canClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200 midnight:hover:bg-white/10 midnight:hover:text-gray-200"
            aria-label="Close setup"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        <header className="border-b border-gray-100 px-6 py-5 dark:border-white/10 midnight:border-white/10">
          <div className="max-w-2xl">
            <p className={labelClass}>Workspace setup</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white midnight:text-white">
              Start with a clean local workspace.
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
              Name the workspace, verify the app is pointed at the right local services, then open the dashboard.
            </p>
          </div>
          <div className="mt-5">
            <StepRail stepIndex={stepIndex} />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7">
          {activeStep.id === 'account' && (
            <div className="max-w-xl">
              <p className={labelClass}>Local account</p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white midnight:text-white">
                Make the login yours.
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                This updates the account stored in the local SQLite database.
              </p>

              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Display name</span>
                  <input
                    value={accountName}
                    onChange={(event) => setAccountName(event.target.value)}
                    className={`${inputClass} mt-2`}
                    placeholder="Your name"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Email</span>
                  <input
                    value={accountEmail}
                    onChange={(event) => setAccountEmail(event.target.value)}
                    className={`${inputClass} mt-2`}
                    placeholder="you@local"
                    type="email"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className={labelClass}>New password</span>
                  <input
                    value={accountPassword}
                    onChange={(event) => setAccountPassword(event.target.value)}
                    className={`${inputClass} mt-2`}
                    placeholder="Leave blank to keep the current password"
                    type="password"
                  />
                </label>
              </div>
            </div>
          )}

          {activeStep.id === 'workspace' && (
            <div className="max-w-xl">
              <p className={labelClass}>Workspace</p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white midnight:text-white">
                Choose a name and marker.
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                This creates an empty workspace owned by the current local account.
              </p>

              <div className="mt-8 space-y-5">
                <label className="block">
                  <span className={labelClass}>Workspace name</span>
                  <input
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    className={`${inputClass} mt-2`}
                    placeholder="My Workspace"
                    autoFocus
                  />
                </label>

                <div>
                  <span className={labelClass}>Marker</span>
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {emojiOptions.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setEmoji(option)}
                        className={`flex h-11 items-center justify-center rounded-lg border text-xl transition ${
                          emoji === option
                            ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950 midnight:border-white midnight:bg-white midnight:text-gray-950'
                            : 'border-gray-200 bg-white hover:border-gray-400 dark:border-white/10 dark:bg-gray-950 dark:hover:border-white/30 midnight:border-white/10 midnight:bg-black midnight:hover:border-white/30'
                        }`}
                        aria-label={`Use ${option} as workspace marker`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeStep.id === 'environment' && (
            <div>
              <p className={labelClass}>Environment</p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white midnight:text-white">
                Confirm the app endpoints.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400 midnight:text-gray-500">
                Frontend values are baked into the Vite app. Backend values come from `den/.env`.
              </p>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className="rounded-lg border border-gray-200 px-4 dark:border-white/10 midnight:border-white/10">
                  <div className="border-b border-gray-100 py-3 text-sm font-semibold text-gray-950 dark:border-white/10 dark:text-white midnight:border-white/10 midnight:text-white">
                    Frontend
                  </div>
                  {frontendRows.map(row => <EnvRow key={row.label} {...row} />)}
                </div>

                <div className="rounded-lg border border-gray-200 px-4 dark:border-white/10 midnight:border-white/10">
                  <div className="border-b border-gray-100 py-3 text-sm font-semibold text-gray-950 dark:border-white/10 dark:text-white midnight:border-white/10 midnight:text-white">
                    Backend
                  </div>
                  {configLoading ? (
                    <div className="flex h-40 items-center justify-center gap-3 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Reading backend values
                    </div>
                  ) : (
                    backendRows.map(row => <EnvRow key={row.label} {...row} />)
                  )}
                </div>
              </div>
            </div>
          )}

          {activeStep.id === 'finish' && (
            <div>
              <p className={labelClass}>Create</p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white midnight:text-white">
                Open {workspaceName.trim() || 'the workspace'}.
              </h2>
              <div className="mt-7 rounded-lg border border-gray-200 px-4 dark:border-white/10 midnight:border-white/10">
                <EnvRow icon={ShieldCheck} label="Account" value={`${accountName.trim() || 'Local user'} · ${accountEmail.trim() || 'admin@local'}`} detail={accountPassword ? 'Password will be updated before the workspace is created.' : 'Current password will be kept.'} />
                <EnvRow icon={Check} label="Workspace" value={`${emoji} ${workspaceName.trim() || 'My Workspace'}`} detail="Created as an empty local workspace." />
                <EnvRow icon={Server} label="Backend" value={`:${readValue(config.PORT, '8716')}`} detail="Workspace data will be written to the configured SQLite database." />
                <EnvRow icon={Globe2} label="Frontend API" value={readValue(import.meta.env.VITE_USER_URL, API_URL)} detail="The workspace list refreshes after creation." />
              </div>
            </div>
          )}

          {(error || message) && (
            <div className={`mt-6 rounded-lg px-4 py-3 text-sm ${
              error
                ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300 midnight:border-red-900 midnight:bg-red-950/60 midnight:text-red-300'
                : 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/60 dark:text-amber-300 midnight:border-amber-900 midnight:bg-amber-950/60 midnight:text-amber-300'
            }`}>
              {error || message}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-gray-100 px-6 py-5 dark:border-white/10 midnight:border-white/10">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirstStep || saving}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10 midnight:border-white/10 midnight:text-gray-300 midnight:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={createWorkspace}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 midnight:bg-white midnight:text-gray-950 midnight:hover:bg-gray-200"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Create workspace
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-70 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 midnight:bg-white midnight:text-gray-950 midnight:hover:bg-gray-200"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};

export default CreateWorkspaceModal;
