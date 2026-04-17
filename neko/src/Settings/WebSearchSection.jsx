// Settings/WebSearchSection.jsx — Web search engine configuration
import React, { useState, useEffect, useCallback } from 'react';
import { Check, Loader2, Search, Globe, Server } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700 ' +
  'bg-white dark:bg-gray-800 midnight:bg-gray-800 ' +
  'text-gray-900 dark:text-gray-100 midnight:text-gray-100 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 ' +
  'transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500';

const PUBLIC_SEARXNG_INSTANCES = [
  { url: 'https://searx.be', name: 'searx.be' },
  { url: 'https://search.sapti.me', name: 'search.sapti.me' },
  { url: 'https://searx.tiekoetter.com', name: 'searx.tiekoetter.com' },
];

const WebSearchSection = () => {
  const [engine, setEngine] = useState('searxng'); // 'searxng' | 'duckduckgo'
  const [customUrl, setCustomUrl] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('asyncat_web_search_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        setEngine(settings.engine || 'searxng');
        setCustomUrl(settings.customUrl || '');
        setUseCustom(settings.useCustom || false);
      }
    } catch (err) {
      console.error('Failed to load web search settings:', err);
    }
  }, []);

  const flash = useCallback((setter, msg, ms = 2500) => {
    setter(msg);
    setTimeout(() => setter(null), ms);
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const settings = {
        engine,
        customUrl: useCustom ? customUrl.trim() : '',
        useCustom,
      };
      localStorage.setItem('asyncat_web_search_settings', JSON.stringify(settings));
      flash(setSaveMsg, { type: 'success', text: 'Settings saved' });
    } catch (err) {
      flash(setSaveMsg, { type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const testSearchEngine = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const testUrl = useCustom ? customUrl.trim() : PUBLIC_SEARXNG_INSTANCES[0].url;

      // Test by making a simple search request
      const url = new URL('/search', testUrl);
      url.searchParams.set('q', 'test');
      url.searchParams.set('format', 'json');

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (!data.results) throw new Error('Invalid response format');

      setTestResult({
        success: true,
        message: `✓ Connected successfully (${data.results?.length || 0} test results)`,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: `✗ Connection failed: ${err.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="font-sora space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 midnight:text-gray-500">
            Web Search Engine
          </h3>
        </div>
        {saveMsg && (
          <span className={`text-xs font-medium ${saveMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {saveMsg.text}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-400">
        Choose which search engine to use when you enable web search in chat. SearXNG provides better results by aggregating multiple search engines.
      </p>

      {/* Engine selection */}
      <div className="space-y-3">
        {/* SearXNG */}
        <label className="flex items-start gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-800/50"
          style={{
            borderColor: engine === 'searxng'
              ? 'rgb(59, 130, 246)'
              : 'rgb(229, 231, 235)',
          }}
        >
          <input
            type="radio"
            name="engine"
            value="searxng"
            checked={engine === 'searxng'}
            onChange={e => setEngine(e.target.value)}
            className="mt-0.5 accent-blue-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                SearXNG (Recommended)
              </span>
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                Meta-search
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Aggregates results from Google, Bing, DuckDuckGo, and more. Better quality, no API keys needed, privacy-focused.
            </p>
          </div>
        </label>

        {/* DuckDuckGo */}
        <label className="flex items-start gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 midnight:hover:bg-gray-800/50"
          style={{
            borderColor: engine === 'duckduckgo'
              ? 'rgb(59, 130, 246)'
              : 'rgb(229, 231, 235)',
          }}
        >
          <input
            type="radio"
            name="engine"
            value="duckduckgo"
            checked={engine === 'duckduckgo'}
            onChange={e => setEngine(e.target.value)}
            className="mt-0.5 accent-blue-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Search className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                DuckDuckGo
              </span>
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                Fallback
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Direct DuckDuckGo search. Used as fallback if SearXNG is unavailable.
            </p>
          </div>
        </label>
      </div>

      {/* SearXNG instance configuration */}
      {engine === 'searxng' && (
        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-gray-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              SearXNG Instance
            </h4>
          </div>

          {/* Use custom URL toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={e => setUseCustom(e.target.checked)}
              className="accent-blue-500"
            />
            Use custom instance URL
          </label>

          {useCustom ? (
            /* Custom URL input */
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Instance URL
              </label>
              <input
                type="url"
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="https://your-searxng-instance.com"
                className={inputCls}
              />
              <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                Run your own via Docker: <code className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono text-xs">docker run -d -p 8080:8080 searxng/searxng</code>
              </p>
            </div>
          ) : (
            /* Public instances list */
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Default Public Instance
              </label>
              <div className="space-y-1">
                {PUBLIC_SEARXNG_INSTANCES.map((instance, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Check className="w-3 h-3 text-green-500" />
                    <a href={instance.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {instance.name}
                    </a>
                    {i === 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px] font-medium">
                        Primary
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Automatically falls back to other instances if the primary is down.
              </p>
            </div>
          )}

          {/* Test button */}
          <div className="flex items-center gap-3">
            <button
              onClick={testSearchEngine}
              disabled={testing || (useCustom && !customUrl.trim())}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                bg-blue-600 hover:bg-blue-700 text-white
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Test Connection
            </button>
            {testResult && (
              <span className={`text-xs ${testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center justify-end pt-4 border-t border-gray-100 dark:border-gray-800 midnight:border-gray-800">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
            bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:hover:bg-white
            midnight:bg-gray-100 midnight:hover:bg-white
            text-white dark:text-gray-900 midnight:text-gray-900
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default WebSearchSection;
