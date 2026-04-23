// den/src/ai/db/connections.js — re-exports the SQLite client.
export {
  sqliteDb as default,
  sqliteDb as db,
  sqliteDb as mainDb,
  sqliteDb as supabaseAdmin,
  createDbClient as createAuthenticatedClient,
} from '../../db/sqlite.js';
