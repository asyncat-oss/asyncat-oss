// Replaced: supabaseClient.js — now re-exports the SQLite compat layer.
// All callers that import createAuthenticatedClient / createServiceClient /
// verifyUser / supabase get the compat shim instead of a Supabase client.
export {
  supabaseCompat as default,
  supabaseCompat as supabase,
  createCompatClient as createAuthenticatedClient,
  createCompatClient as createServiceClient,
} from '../../db/compat.js';

// verifyUser was auth-verifying via Supabase. In OSS the middleware in
// authMiddleware.js handles that; re-export a no-op shim for legacy imports.
export const verifyUser = async (tokenOrReq) => {
  throw new Error('[supabaseClient] verifyUser() is no longer supported — use authMiddleware.verifyUser instead');
};
