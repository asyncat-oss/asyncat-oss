// Replaced: notes/config/supabase.js — now re-exports the SQLite compat layer.
export {
  supabaseCompat as default,
  supabaseCompat as supabase,
} from '../../db/compat.js';

export const initializeSupabase = () => supabaseCompat;
export const getSupabase        = () => supabaseCompat;
export const createAuthenticatedSupabaseClient = (_token) => supabaseCompat;

import { supabaseCompat } from '../../db/compat.js';
