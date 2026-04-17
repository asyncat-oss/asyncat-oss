// Replaced: calendar/config/database.js — now re-exports the SQLite compat layer.
export {
  supabaseCompat as supabase,
  supabaseCompat as supabaseAuth,
  supabaseCompat as mainDb,
  createCompatClient as createAuthenticatedClient,
} from '../../db/compat.js';

export const testConnection = async () => {
  console.log('Database: SQLite (connection always ready)');
};
