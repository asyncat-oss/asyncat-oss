// teams/teamApi.js — workspace / team-member API helpers
import authService from '../services/authService';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const teamMembersApi = {
  // GET /api/teams/:teamId/members
  async getTeamMembers(teamId) {
    const res  = await authService.authenticatedFetch(`${API_BASE}/api/teams/${teamId}/members`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch team members');
    return data;
  },

  // GET /api/teams/:teamId/available-members (for invite flows)
  async getAvailableMembers(teamId) {
    const res  = await authService.authenticatedFetch(`${API_BASE}/api/teams/${teamId}/available-members`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch available members');
    return data;
  },
};

export const teamsApi = {
  // GET /api/teams
  async getTeams() {
    const res  = await authService.authenticatedFetch(`${API_BASE}/api/teams`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch teams');
    return data;
  },
};

export default teamMembersApi;
