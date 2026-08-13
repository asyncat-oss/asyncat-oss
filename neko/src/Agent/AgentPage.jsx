// neko/src/Agent/AgentPage.jsx
// ─── Agent Management Shell ───────────────────────────────────────────────────
// Agent profile management. Scheduling lives in the top-level Schedules page.

import { BrainCircuit } from 'lucide-react';
import ProfilesPage from '../Profiles/ProfilesPage';

export default function AgentPage() {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 midnight:bg-slate-950">
      <div className="flex-shrink-0 border-b border-gray-100 px-6 py-4 dark:border-gray-800 midnight:border-slate-800">
        <div className="flex items-center gap-2.5">
          <BrainCircuit className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100">Agents</h1>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 midnight:text-slate-500">Reusable profiles that define behavior, tools, permissions, and working context.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ProfilesPage embedded />
      </div>
    </div>
  );
}
