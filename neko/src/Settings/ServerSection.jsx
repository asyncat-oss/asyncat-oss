// Settings/ServerSection.jsx — server config and secrets management
import { useState, useEffect } from 'react';
import { Server, Eye, EyeOff, Loader2, RotateCcw } from 'lucide-react';
import { configApi, apiUtils } from './settingApi';

const soraFontBase = 'font-sora';

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 ' +
  'bg-white dark:bg-gray-800 midnight:bg-gray-800 ' +
  'text-gray-900 dark:text-gray-100 midnight:text-gray-100 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 ' +
  'transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500';

const readOnlyCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200/60 dark:border-gray-700/40 midnight:border-gray-700/40 ' +
  'bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 ' +
  'text-gray-400 dark:text-gray-500 midnight:text-gray-500 text-sm cursor-default select-none';

const ServerSection = ({ session: _session }) => {
  const [config, setConfig] = useState({});
  const [, setSecrets] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [editValues, setEditValues] = useState({});
  const [showPasswords, setShowPasswords] = useState({});

  useEffect(() => {
    loadConfig();
  }, []);

  const flash = (msg, ms = 3000) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), ms);
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [cfg, sec] = await Promise.all([
        configApi.getConfig(),
        configApi.getSecrets(),
      ]);
      if (cfg.success) setConfig(cfg.config);
      if (sec.success) {
        setSecrets(sec.secrets);
        setEditValues(sec.secrets);
      }
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to load config') });
    } finally {
      setLoading(false);
    }
  };

  const saveSecret = async (key) => {
    const value = editValues[key]?.trim();
    if (!value) {
      flash({ type: 'error', text: `${key} cannot be empty` });
      return;
    }

    setSaving(true);
    try {
      const res = await configApi.updateSecret(key, value);
      if (!res.success) throw new Error(res.error);

      setSecrets(prev => ({ ...prev, [key]: value }));
      flash({ type: 'success', text: res.message || `${key} updated` });
    } catch (err) {
      flash({ type: 'error', text: apiUtils.handleError(err, 'Failed to save') });
    } finally {
      setSaving(false);
    }
  };

  const toggleShow = (key) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const editableSecrets = [
    { key: 'JWT_SECRET', label: 'JWT Secret', placeholder: 'Enter JWT secret key' },
  ];

  const nonEditableConfig = [
    { key: 'PORT', label: 'Server Port' },
    { key: 'NODE_ENV', label: 'Environment' },
    { key: 'FRONTEND_URL', label: 'Frontend URL' },
    { key: 'LOCAL_EMAIL', label: 'Seed Email' },
    { key: 'DB_PATH', label: 'Database Path' },
    { key: 'LLAMA_SERVER_PORT', label: 'Local Model Port' },
    { key: 'MODELS_PATH', label: 'Models Path' },
    { key: 'STORAGE_PATH', label: 'Storage Path' },
  ];

  if (loading) {
    return (
      <div className={`space-y-3 ${soraFontBase}`}>
        {[20, 16, 12].map((h, i) => (
          <div key={i} className={`h-${h / 2} bg-gray-100 dark:bg-gray-800 rounded`} />
        ))}
      </div>
    );
  }

  const _getDisplayValue = (key, value) => {
    if (showPasswords[key]) return value;
    if (!value || value.length < 8) return '••••••••';
    return value.slice(0, 4) + '••••••••' + value.slice(-4);
  };

  return (
    <div className={`space-y-6 ${soraFontBase}`}>
      {message && (
        <div className={`p-4 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200 midnight:bg-green-900 midnight:text-green-300'
            : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200 midnight:bg-red-900 midnight:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Secrets Section */}
      <div className="border-0 py-2">
        <div className="flex items-center gap-2 mb-4">
          <Server size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Server Secrets
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Update server-level secrets. Account password changes belong in Profile or the setup walkthrough.
        </p>

        <div className="space-y-4">
          {editableSecrets.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1.5">
                {label}
              </label>
              <div className="relative">
                <input
                  type={showPasswords[key] ? 'text' : 'password'}
                  value={editValues[key] || ''}
                  onChange={(e) => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => toggleShow(key)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPasswords[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => saveSecret(key)}
                  disabled={saving || !editValues[key]}
                  className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5
                    bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:hover:bg-white
                    midnight:bg-gray-100 midnight:hover:bg-white
                    text-white dark:text-gray-900 midnight:text-gray-900
                    disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : null}
                  Save {label}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Server Info (read-only) */}
      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <RotateCcw size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-gray-100">
            Server Configuration
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Current server settings (read-only). Edit the .env file to change these.
        </p>

        <div className="space-y-3">
          {nonEditableConfig.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 mb-1">
                {label}
              </label>
              <div className={readOnlyCls}>
                {config[key] || '(not set)'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Restart Hint */}
      <div className="border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800 pt-6">
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/20 border border-amber-200 dark:border-amber-800 midnight:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200 midnight:text-amber-200">
            <strong>Note:</strong> After updating secrets, restart the server for changes to take effect.
            Run <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-800 midnight:bg-amber-800">asyncat restart</code> in your terminal.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ServerSection;
