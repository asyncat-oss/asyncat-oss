// Projects, agents and Cats, for the Memory page's owner picker.

import { useEffect, useState } from 'react';
import { catsApi, profilesApi, projectsApi } from '../CommandCenter/api';

export function useMemoryOwners(active) {
  const [owners, setOwners] = useState({ projects: [], agents: [], cats: [] });
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    Promise.all([
      projectsApi.getProjects().then((res) => res.data || res.projects || []).catch(() => []),
      profilesApi.listProfiles().then((res) => res.profiles || []).catch(() => []),
      catsApi.list().then((res) => res.cats || []).catch(() => []),
    ]).then(([projects, agents, cats]) => {
      if (alive) setOwners({ projects, agents, cats });
    });
    return () => { alive = false; };
  }, [active]);
  return owners;
}

