import { and, db, eq, isNull, or } from "@repo/database";
import {
  integration,
  integrationInstallation,
  organization,
  project,
} from "@repo/database/schema";
import { decryptJson } from "./encryption";
import { assertSafeMcpEndpoint, setManagedMcpHeader } from "./mcp-proxy";
import { getProviderHandler } from "./provider-handlers";
import {
  type CustomMCPServerConfig,
  normalizeMcpHeaders,
  publicMcpHeaders,
} from "./types";

/**
 * Resolved MCP server connection ready to be consumed by an MCP client.
 *
 * Includes decrypted credentials. Treat as sensitive — never log or
 * return to the browser.
 */
export type LoadedMCPServer = {
  installationId: string;
  displayName: string;
  endpointUrl: string;
  authType: CustomMCPServerConfig["authType"];
  /** Final HTTP headers to send (incl. auth header), keyed by name. */
  headers: Record<string, string>;
  /** Optional allowlist of tool names; null/undefined means allow all. */
  toolAllowlist: string[] | null;
};

const CUSTOM_MCP_SLUG = "custom-mcp-server";

function buildHeaders(cfg: CustomMCPServerConfig): Record<string, string> {
  const headers: Record<string, string> = { ...(cfg.headers ?? {}) };
  if (cfg.authType === "bearer" && cfg.credentials) {
    setManagedMcpHeader(headers, "Authorization", `Bearer ${cfg.credentials}`);
  } else if (cfg.authType === "apiKey" && cfg.credentials) {
    setManagedMcpHeader(headers, "X-API-Key", cfg.credentials);
  } else if (cfg.authType === "basic" && cfg.credentials) {
    setManagedMcpHeader(
      headers,
      "Authorization",
      `Basic ${Buffer.from(cfg.credentials).toString("base64")}`,
    );
  }
  return headers;
}

/**
 * Load all custom MCP server installations visible to the given scope.
 *
 * Project scope returns project-scoped + workspace-scoped servers (project
 * takes precedence on display-name collisions). Workspace scope returns
 * workspace-scoped only. Disabled / errored installations are skipped.
 */
export async function loadMCPServers(scope: {
  tenantId: string;
  organizationId: string;
  projectId?: string | null;
}): Promise<LoadedMCPServer[]> {
  const projectFilter = scope.projectId
    ? or(
        eq(integrationInstallation.projectId, scope.projectId),
        isNull(integrationInstallation.projectId),
      )
    : isNull(integrationInstallation.projectId);

  const rows = await db()
    .select({ installation: integrationInstallation, integration: integration })
    .from(integrationInstallation)
    .innerJoin(
      integration,
      eq(integrationInstallation.integrationId, integration.id),
    )
    .innerJoin(
      organization,
      eq(integrationInstallation.organizationId, organization.id),
    )
    .leftJoin(project, eq(integrationInstallation.projectId, project.id))
    .where(
      and(
        eq(integration.slug, CUSTOM_MCP_SLUG),
        eq(organization.tenantId, scope.tenantId),
        eq(integrationInstallation.organizationId, scope.organizationId),
        eq(integrationInstallation.status, "active"),
        // A nullable installation.projectId denotes workspace scope. When a
        // project id is present, require the joined project row itself to be
        // present and to belong to this tenant and organization; checking only
        // project.tenantId would let a stale/missing join pass through.
        or(
          isNull(integrationInstallation.projectId),
          and(
            eq(project.id, integrationInstallation.projectId),
            eq(project.tenantId, scope.tenantId),
            eq(project.organizationId, scope.organizationId),
          ),
        ),
        projectFilter,
      ),
    );

  // Project-scoped installs override workspace-scoped on displayName collision.
  const byName = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = row.installation.displayName ?? row.installation.id;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }
    const incomingIsProject = row.installation.projectId !== null;
    const existingIsProject = existing.installation.projectId !== null;
    if (incomingIsProject && !existingIsProject) byName.set(key, row);
  }

  const servers = (
    await Promise.all(
      Array.from(byName.values()).map(
        async (row): Promise<LoadedMCPServer | null> => {
          try {
            const publicValue = row.installation.configPublic;
            if (
              publicValue !== null &&
              (typeof publicValue !== "object" || Array.isArray(publicValue))
            ) {
              throw new Error("public configuration is malformed");
            }
            const publicCfg =
              (publicValue as Partial<CustomMCPServerConfig> | null) ?? {};
            const secret = row.installation.configEncrypted
              ? (decryptJson(row.installation.configEncrypted) as Partial<
                  Pick<CustomMCPServerConfig, "credentials" | "headers">
                >)
              : {};
            if (
              secret !== null &&
              (typeof secret !== "object" || Array.isArray(secret))
            ) {
              throw new Error("encrypted configuration is malformed");
            }
            const cfg: CustomMCPServerConfig = {
              endpointUrl: publicCfg.endpointUrl ?? "",
              authType: publicCfg.authType ?? "none",
              credentials: secret?.credentials,
              // Headers saved by the current provider handler are encrypted. Keep
              // non-sensitive legacy public headers for compatibility, but never send
              // credential-bearing values read from configPublic.
              headers: {
                ...publicMcpHeaders(publicCfg.headers),
                ...normalizeMcpHeaders(secret?.headers),
              },
              toolAllowlist: publicCfg.toolAllowlist ?? undefined,
            };
            if (!cfg.endpointUrl) throw new Error("endpointUrl is missing");
            getProviderHandler(CUSTOM_MCP_SLUG)?.validate(
              cfg as unknown as Record<string, unknown>,
            );
            await assertSafeMcpEndpoint(cfg.endpointUrl);
            return {
              installationId: row.installation.id,
              displayName: row.installation.displayName ?? row.integration.name,
              endpointUrl: cfg.endpointUrl,
              authType: cfg.authType,
              headers: buildHeaders(cfg),
              toolAllowlist:
                cfg.toolAllowlist && cfg.toolAllowlist.length > 0
                  ? cfg.toolAllowlist
                  : null,
            };
          } catch (error) {
            // A single corrupt or undecryptable installation must not make every
            // other tenant-visible server disappear. Fail closed for this row and
            // keep the listing usable; never include ciphertext or secret details in
            // the warning.
            console.warn(
              `[mcp-proxy] skipping invalid installation ${row.installation.id}: ${
                error instanceof Error ? error.message : "configuration error"
              }`,
            );
            return null;
          }
        },
      ),
    )
  ).filter((server): server is LoadedMCPServer => server !== null);
  return servers;
}
