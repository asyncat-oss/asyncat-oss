// Automations/AutomationsLayout.jsx — one sidebar entry for Workflows,
// Schedules and Activity, with tabs to move between them.

import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, CalendarClock, Workflow } from 'lucide-react';
import { AUTOMATION_PAGES, rememberAutomationPath } from './automationsNav.js';

const ICONS = {
  '/workflows': Workflow,
  '/schedules': CalendarClock,
  '/activity': Bell,
};

export default function AutomationsLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    rememberAutomationPath(pathname);
  }, [pathname]);

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-gray-900 midnight:bg-slate-950">
      <nav
        aria-label="Automations"
        className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-200/80 px-4 dark:border-gray-800/80 midnight:border-slate-800/80"
      >
        <span className="mr-3 hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 sm:inline dark:text-gray-500 midnight:text-slate-500">
          Automations
        </span>
        {AUTOMATION_PAGES.map(({ path, label }) => {
          const Icon = ICONS[path];
          return (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-400/40 ${
                isActive
                  ? 'border-indigo-500 text-gray-900 dark:text-gray-100 midnight:text-slate-100'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 midnight:text-slate-400 midnight:hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
