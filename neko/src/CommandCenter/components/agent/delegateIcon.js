// The mark beside a helper agent in the run feed: the agent's own emoji when
// the user gave it one, else the first letter of its name. A one-off helper
// role (den sends profile id 'default' for it) has no profile of its own, so
// any icon sent with it is skipped, as is the robot older agents were given
// by default.

import { chosenAgentIcon } from '../../../Agent/agentIcon.js';

export const AD_HOC_PROFILE_ID = 'default';

/** The emoji or initial to show for a delegated agent. */
export function delegateIcon({ profile = {}, data = {}, name = '' } = {}) {
  const id = profile?.id || data?.profileId;
  const own = id === AD_HOC_PROFILE_ID ? null : chosenAgentIcon(profile?.icon || data?.profileIcon);
  if (own) return own;
  const initial = String(name || '').trim().charAt(0).toUpperCase();
  return initial || 'A';
}
