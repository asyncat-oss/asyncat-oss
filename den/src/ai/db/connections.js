// Replaced: ai/db/connections.js — now re-exports the SQLite compat layer.
export {
  supabaseCompat as default,
  supabaseCompat as supabase,
  supabaseCompat as supabaseAuth,
  supabaseCompat as mainDb,
  supabaseCompat as supabaseAdmin,
  createCompatClient as createAuthenticatedClient,
} from '../../db/compat.js';
