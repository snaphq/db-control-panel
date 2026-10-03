import "server-only";
import {
  type ListPlatformOperationsQuery,
  adminNodesResponseSchema,
  adminSafekeepersResponseSchema,
  listPlatformOperationsResponseSchema,
  platformOperationResponseSchema,
} from "@repo/control-plane-contract";
import { ControlPlaneConfigError } from "./errors";
import {
  type TransportConfig,
  createTransport,
  pathSegment,
  queryString,
  readBaseUrl,
} from "./transport";

/**
 * Server-only client of the platform admin API (`/v1/admin/*`), for the admin
 * portal (`apps/backend`). It holds `ALLOYDB_ADMIN_API_TOKEN`, a different
 * secret from the console's `ALLOYDB_API_TOKEN`: the control plane refuses each
 * token on the other's routes, so a site never needs, or can use, this one.
 * Nothing here is scoped to an organization or project.
 */

/** Reads `ALLOYDB_API_URL` (default https://api.alloydb.net) and `ALLOYDB_ADMIN_API_TOKEN`. */
export function readPlatformAdminConfig(
  env: Record<string, string | undefined> = process.env,
): TransportConfig {
  const token = env.ALLOYDB_ADMIN_API_TOKEN?.trim();
  if (!token) {
    throw new ControlPlaneConfigError(
      "ALLOYDB_ADMIN_API_TOKEN is not set; the admin portal cannot reach the platform admin API.",
    );
  }
  return { baseUrl: readBaseUrl(env), token };
}

export function createPlatformAdminClient(config: TransportConfig) {
  const request = createTransport(config, {
    rejectedMessage:
      "The AlloyDB control plane rejected the admin portal's credentials.",
  });
  return {
    listNodes: async () =>
      request(adminNodesResponseSchema, "GET", "/admin/nodes"),
    listSafekeepers: async () =>
      request(adminSafekeepersResponseSchema, "GET", "/admin/safekeepers"),
    /** Platform operations, newest first. */
    listOperations: async (query: Omit<ListPlatformOperationsQuery, "scope">) =>
      request(
        listPlatformOperationsResponseSchema,
        "GET",
        `/admin/operations${queryString({ scope: "platform", ...query })}`,
      ),
    getOperation: async (operationId: string) =>
      request(
        platformOperationResponseSchema,
        "GET",
        `/admin/operations/${pathSegment(operationId)}`,
      ),
    /** 409 `platform_busy` (a `ControlPlaneConflictError`) while any platform operation is active. */
    rebalancePageservers: async () =>
      request(
        platformOperationResponseSchema,
        "POST",
        "/admin/pageservers/rebalance",
      ),
    spreadSafekeepers: async () =>
      request(
        platformOperationResponseSchema,
        "POST",
        "/admin/safekeepers/spread",
      ),
  };
}

export type PlatformAdminClient = ReturnType<typeof createPlatformAdminClient>;

/** A client configured from the environment. */
export function platformAdmin(): PlatformAdminClient {
  return createPlatformAdminClient(readPlatformAdminConfig());
}
