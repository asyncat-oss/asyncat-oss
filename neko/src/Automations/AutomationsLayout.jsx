// Automations/AutomationsLayout.jsx — one sidebar entry for Workflows,
// Schedules and Activity, with tabs to move between them.

import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, Workflow } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { AUTOMATION_PAGES, rememberAutomationPath } from './automationsNav.js';

const ICONS = {
  '/workflows': Workflow,
  '/schedules': CalendarClock,
  '/activity': Bell,
};

export default function AutomationsLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activePath = AUTOMATION_PAGES.find(({ path }) => pathname.startsWith(path))?.path || AUTOMATION_PAGES[0].path;

  useEffect(() => {
    rememberAutomationPath(pathname);
  }, [pathname]);

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <PageHeader
        title="Automations"
        description="Workflows, schedules and the activity they produce, running on their own."
      >
        <Tabs
          className="mt-4"
          label="Automations"
          value={activePath}
          onChange={(path) => navigate(path)}
          items={AUTOMATION_PAGES.map(({ path, label }) => ({ value: path, label, icon: ICONS[path] }))}
        />
      </PageHeader>
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
