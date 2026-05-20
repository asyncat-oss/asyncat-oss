// neko/src/Agent/AgentPage.jsx
// ─── Agent Management Shell ───────────────────────────────────────────────────
// Unified header + tabs. Child pages render in embedded mode (no own header).

import { useNavigate, useLocation } from 'react-router-dom';
import { BrainCircuit, Layers, Clock } from 'lucide-react';
import ProfilesPage from '../Profiles/ProfilesPage';
import SchedulerPage from '../Scheduler/SchedulerPage';

export default function AgentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.pathname.startsWith('/agent/scheduler') ? 'scheduler' : 'profiles';

  const tabCls = (active) =>
    `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      active
        ? 'border-gray-900 dark:border-gray-100 midnight:border-slate-100 text-gray-900 dark:text-white midnight:text-slate-100'
        : 'border-transparent text-gray-400 dark:text-gray-500 midnight:text-slate-500 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-slate-300'
    }`;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      {/* Unified header */}
      <div className="flex-shrink-0 px-6 pt-4 pb-0 bg-white dark:bg-gray-900 midnight:bg-slate-950">
        <div className="flex items-center gap-2.5 mb-3">
          <BrainCircuit className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h1 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Agent</h1>
        </div>
        <div className="flex border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 -mx-6 px-6">
          <button onClick={() => navigate('/agent/profiles')} className={tabCls(tab === 'profiles')}>
            <Layers className="w-3.5 h-3.5" />
            Profiles
          </button>
          <button onClick={() => navigate('/agent/scheduler')} className={tabCls(tab === 'scheduler')}>
            <Clock className="w-3.5 h-3.5" />
            Scheduler
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'profiles' ? <ProfilesPage embedded /> : <SchedulerPage embedded />}
      </div>
    </div>
  );
}
