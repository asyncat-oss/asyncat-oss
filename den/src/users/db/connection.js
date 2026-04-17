// Replaced: users/db/connection.js — now re-exports the SQLite compat layer.
export {
  supabaseCompat as default,
  supabaseCompat as supabase,
  supabaseCompat as supabaseClient,
  supabaseCompat as supabaseAuth,
  createCompatClient as createAuthenticatedClient,
} from '../../db/compat.js';
