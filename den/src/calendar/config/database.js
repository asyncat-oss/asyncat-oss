// den/src/calendar/config/database.js — re-exports the SQLite client.
export {
  sqliteDb as db,
  sqliteDb as supabase,
  sqliteDb as supabaseAuth,
  sqliteDb as mainDb,
  createDbClient as createAuthenticatedClient,
} from '../../db/sqlite.js';

export const testConnection = async () => {
  console.log('Database: SQLite (connection always ready)');
};
