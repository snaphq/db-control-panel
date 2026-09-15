/**
 * @repo/auth - Better Auth implementation
 *
 * This is a simplified, direct-export auth package for Better Auth.
 * No dynamic provider switching - just Better Auth.
 */

export * from "./types";
export {
  auth,
  currentAuthTenantContext,
  getSession,
  getBetterAuthServer,
  runWithAuthTenantContext,
  withTenantBoundAuthAdapter,
} from "./server";
export {
  signIn,
  signUp,
  signOut,
  getSession as getClientSession,
  useSession,
  forgotPassword,
  getBaseClient,
} from "./client";
