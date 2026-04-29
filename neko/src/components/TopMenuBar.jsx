// components/TopMenuBar.jsx - OS-style top menu bar
import { useState, useEffect } from "react";
import { ServerCrash, Wifi, WifiOff, Search, RotateCw } from "lucide-react";
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';

// Time formatting helper
const formatSystemTime = (date) => (
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
);

// Format date helper
const formatSystemDate = (date) => (
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)
);

// System Clock Component
const SystemClock = () => {
  const [time, setTime] = useState(() => formatSystemTime(new Date()));
  const [date, setDate] = useState(() => formatSystemDate(new Date()));

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(formatSystemTime(now));
      setDate(formatSystemDate(now));
    };

    const now = new Date();
    const delayUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let interval = null;

    const timeout = window.setTimeout(() => {
      updateTime();
      interval = window.setInterval(updateTime, 60 * 1000);
    }, delayUntilNextMinute);

    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 midnight:text-gray-300">
      <time className="text-sm font-medium" dateTime={new Date().toISOString()}>
        {time}
      </time>
      <span className="text-xs opacity-60 hidden sm:inline">•</span>
      <span className="text-xs opacity-70 hidden sm:inline">
        {date}
      </span>
    </div>
  );
};

// Network Status Component
const NetworkStatus = () => {
  const network = useNetworkStatus({ pollMs: 6000 });

  const status = !network.online
    ? {
        label: "No internet",
        detail: "This device is offline.",
        Icon: WifiOff,
        dotClassName: "bg-red-500",
        iconClassName: "text-red-500 dark:text-red-400 midnight:text-red-400",
        textClassName: "text-red-600 dark:text-red-400 midnight:text-red-400",
      }
    : !network.backendOnline
      ? {
          label: "Backend offline",
          detail: "Local Asyncat services are unreachable.",
          Icon: ServerCrash,
          dotClassName: "bg-amber-500",
          iconClassName: "text-amber-500 dark:text-amber-400 midnight:text-amber-400",
          textClassName: "text-amber-600 dark:text-amber-400 midnight:text-amber-400",
        }
      : {
          label: "Online",
          detail: "Browser and backend are reachable.",
          Icon: Wifi,
          dotClassName: "bg-emerald-500",
          iconClassName: "text-emerald-500 dark:text-emerald-400 midnight:text-emerald-400",
          textClassName: "text-emerald-600 dark:text-emerald-400 midnight:text-emerald-400",
        };

  const Icon = status.Icon;

  return (
    <div className="relative group flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${status.dotClassName}`} />
      <Icon className={`h-3.5 w-3.5 ${status.iconClassName}`} aria-hidden="true" />
      <span className={`text-xs font-medium hidden sm:inline ${status.textClassName}`}>
        {status.label}
      </span>
      {/* Tooltip */}
      <div className="pointer-events-none absolute right-0 top-full mt-2 w-max max-w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 dark:bg-gray-800 midnight:bg-gray-800 z-50">
        {status.detail}
      </div>
    </div>
  );
};

// Main TopMenuBar Component
const TopMenuBar = ({ onSearchOpen }) => {
  const [isVisible, setIsVisible] = useState(() => {
    return localStorage.getItem('topMenuBarVisibility') !== 'hidden';
  });

  useEffect(() => {
    const checkVisibility = () => {
      const visibility = localStorage.getItem('topMenuBarVisibility');
      setIsVisible(visibility !== 'hidden');
    };

    const interval = setInterval(checkVisibility, 500);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[70] h-10 bg-white/90 dark:bg-gray-900/90 midnight:bg-black/90 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800 midnight:border-gray-900">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left side - App Name */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200">
            Asyncat
          </span>
        </div>

        {/* Right side - Actions and Status */}
        <div className="flex items-center gap-3">
          {/* Search button */}
          <button
            onClick={onSearchOpen}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 midnight:text-gray-400"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Refresh button */}
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 midnight:text-gray-400"
            title="Refresh"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-gray-300/50 dark:bg-gray-700/50 midnight:bg-gray-800/50" />

          <NetworkStatus />
          <div className="w-px h-5 bg-gray-300/50 dark:bg-gray-700/50 midnight:bg-gray-800/50" />
          <SystemClock />
        </div>
      </div>
    </div>
  );
};

export default TopMenuBar;