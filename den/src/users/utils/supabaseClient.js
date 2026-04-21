// den/src/users/utils/supabaseClient.js — re-exports the SQLite client.
export {
  sqliteDb as default,
  sqliteDb as db,
  createDbClient as createAuthenticatedClient,
  createDbClient as createServiceClient,
} from '../../db/sqlite.js';

export const verifyUser = async (tokenOrReq) => {
  throw new Error('[sqlite] verifyUser() is no longer supported — use authMiddleware.verifyUser instead');
};
