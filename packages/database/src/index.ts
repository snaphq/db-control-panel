// Re-export everything from schema and client
export * from "./schema";
export * from "./schema-agent-auth";
export * from "./schema-agents";
export * from "./schema-operators";
export * from "./schema-analytics";
export * from "./schema-seo";
export {
  db,
  withDbTransaction,
  type DatabaseTransaction,
} from "./client";
export {
  DEFAULT_TENANT_ID,
  buildTenantAuthEmail,
  ensureDefaultTenant,
  isLocalTenantHost,
  normalizeTenantHost,
  normalizeTenantDomain,
  readDefaultTenantSeedFromEnv,
  resolveTenantFromHost,
} from "./tenant";

// DAL helpers
export { getAdminStats, getTenantAdminStats } from "./dal/admin";
export { getSafeSessions } from "./dal/admin";
export type { AdminStats, SafeSession, TenantAdminStats } from "./dal/admin";
export {
  searchOrganizations,
  searchProjects,
  searchUsers,
} from "./dal/search";
export type {
  AdminSearchUser,
  OrganizationSearchResult,
  ProjectSearchResult,
  SearchPage,
  UserSearchResult,
} from "./dal/search";

// Re-export drizzle-orm operators for convenience
export {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  and,
  or,
  not,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  sql,
  asc,
  desc,
  count,
  sum,
  avg,
  min,
  max,
} from "drizzle-orm";
