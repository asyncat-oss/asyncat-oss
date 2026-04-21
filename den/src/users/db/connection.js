// den/src/users/db/connection.js — re-exports the SQLite client.
export {
  sqliteDb as default,
  sqliteDb as db,
  sqliteDb as supabaseClient,
  sqliteDb as supabaseAuth,
  createDbClient as createAuthenticatedClient,
} from '../../db/sqlite.js';
