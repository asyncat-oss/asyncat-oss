// den/src/notes/config/supabase.js — re-exports the SQLite client.
export {
  sqliteDb as default,
  sqliteDb as supabase,
} from '../../db/sqlite.js';

export const initializeSupabase = () => sqliteDb;
export const getSupabase        = () => sqliteDb;
export const createAuthenticatedSupabaseClient = (_token) => sqliteDb;
