// The Cat form's values: from a Cat (or a template), to what the backend
// takes, and the choices the form offers.

import { useEffect, useState } from 'react';
import { agentApi, profilesApi, projectsApi } from '../CommandCenter/api';
import { aiProviderApi } from '../Settings/settingApi.js';
import { localTimeZone } from './scheduleForm.js';

export const TEXTAREA = 'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-[13px] leading-5 text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20';

const numberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

/** The form's values for a Cat being edited, or a new one (optionally from a template). */
export function formFromCat(cat = null, template = null) {
  const source = cat || template || {};
  return {
    name: source.name || '',
    avatar: source.avatar || '🐱',
    mission: source.mission || '',
    profileId: cat?.profileId || '',
    providerProfileId: cat?.providerProfileId || '',
    projectId: cat?.projectId || '',
    folderMode: cat?.folderMode || 'own',
    folder: cat?.folderMode === 'custom' ? cat.folder : '',
    triggers: (source.triggers || []).filter((trigger) => trigger.kind !== 'chat').map((trigger) => ({ ...trigger })),
    freedom: source.freedom || cat?.freedom || 'ask_risky',
    limits: {
      runsPerDay: cat?.limits?.runsPerDay ?? '',
      tokensPerDay: cat?.limits?.tokensPerDay ?? '',
      minutesPerDay: cat?.limits?.minutesPerDay ?? '',
      costPerDay: cat?.limits?.costPerDay ?? '',
      pricePerMillion: cat?.limits?.pricePerMillion ?? '',
    },
    allowedSites: cat?.allowedSites || [],
    allowedTools: cat?.allowedTools || [],
    connectors: Array.isArray(cat?.connectors) ? cat.connectors : null,
    approvalTimeoutMinutes: cat?.approvalTimeoutMinutes || 120,
    timezone: cat?.timezone || localTimeZone(),
  };
}

/** What to send to the backend for the form's values. */
export function payloadFromForm(form, { cat = null } = {}) {
  const payload = {
    name: form.name.trim(),
    avatar: form.avatar,
    mission: form.mission.trim(),
    profileId: form.profileId || null,
    projectId: form.projectId || null,
    folderMode: form.folderMode,
    folder: form.folderMode === 'custom' ? form.folder.trim() : null,
    triggers: [
      ...form.triggers.map((trigger) => ({ id: trigger.id, kind: trigger.kind, config: trigger.config, enabled: trigger.enabled })),
      ...(cat?.triggers || []).filter((trigger) => trigger.kind === 'chat').map((trigger) => ({ id: trigger.id, kind: 'chat' })),
    ],
    freedom: form.freedom,
    limits: {
      runsPerDay: numberOrNull(form.limits.runsPerDay),
      tokensPerDay: numberOrNull(form.limits.tokensPerDay),
      minutesPerDay: numberOrNull(form.limits.minutesPerDay),
      costPerDay: numberOrNull(form.limits.costPerDay),
      pricePerMillion: numberOrNull(form.limits.pricePerMillion),
    },
    allowedSites: form.allowedSites,
    allowedTools: form.allowedTools,
    connectors: Array.isArray(form.connectors) ? form.connectors : null,
    approvalTimeoutMinutes: Number(form.approvalTimeoutMinutes) || 120,
    timezone: form.timezone || localTimeZone(),
  };
  // A model is only sent when it changed, so a Cat keeps its saved one.
  if (!cat || (form.providerProfileId || '') !== (cat.providerProfileId || '')) payload.providerProfileId = form.providerProfileId || null;
  return payload;
}

/** Projects, agents, saved models and tools the form offers. */
export function useCatFormOptions() {
  const [options, setOptions] = useState({ projects: [], agents: [], models: [], activeModel: null, tools: [] });
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      projectsApi.getProjects(),
      profilesApi.listProfiles(),
      aiProviderApi.listProfiles(),
      aiProviderApi.getConfig(),
      agentApi.getTools(),
    ]).then(([projects, agents, models, config, tools]) => {
      if (cancelled) return;
      const value = (result) => (result.status === 'fulfilled' ? result.value : null);
      setOptions({
        projects: value(projects)?.data || value(projects)?.projects || [],
        agents: value(agents)?.profiles || [],
        models: value(models)?.profiles || [],
        activeModel: value(config)?.model ? value(config) : null,
        tools: (value(tools)?.tools || []).filter((tool) => tool.permission !== 'safe' && tool.category !== 'schedule'),
      });
    });
    return () => { cancelled = true; };
  }, []);
  return options;
}

