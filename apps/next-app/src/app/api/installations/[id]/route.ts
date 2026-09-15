import { loadAuthorizedInstallation } from "@/lib/integrations/access";
import { encryptJson } from "@/lib/integrations/encryption";
import { decryptJson } from "@/lib/integrations/encryption";
import { assertSafeMcpEndpoint } from "@/lib/integrations/mcp-proxy";
import { getProviderHandler } from "@/lib/integrations/provider-handlers";
import {
  normalizeMcpHeaders,
  toSafeInstallation,
} from "@/lib/integrations/types";
import { and, db, eq } from "@repo/database";
import {
  type IntegrationInstallation,
  integrationInstallation,
  organization,
} from "@repo/database/schema";
import { exists } from "drizzle-orm";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/installations/[id]
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await loadAuthorizedInstallation(id);
  if ("error" in result) return result.error;
  return NextResponse.json(toSafeInstallation(result.row));
}

/**
 * PATCH /api/installations/[id]
 * Body may include: displayName, configPublic, secretConfig, status.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await loadAuthorizedInstallation(id, {
    requireWriteRole: true,
  });
  if ("error" in result) return result.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { displayName, configPublic, secretConfig, status } = body as {
    displayName?: string;
    configPublic?: Record<string, unknown>;
    secretConfig?: Record<string, unknown> | null;
    status?: "active" | "disabled";
  };

  const update: Partial<IntegrationInstallation> = {};
  if (typeof displayName === "string") update.displayName = displayName;
  const isCustomMcp = result.integrationSlug === "custom-mcp-server";
  if (
    configPublic !== undefined &&
    (configPublic === null ||
      typeof configPublic !== "object" ||
      Array.isArray(configPublic))
  ) {
    return NextResponse.json(
      { error: "configPublic must be an object" },
      { status: 400 },
    );
  }
  if (
    secretConfig !== undefined &&
    secretConfig !== null &&
    (typeof secretConfig !== "object" || Array.isArray(secretConfig))
  ) {
    return NextResponse.json(
      { error: "secretConfig must be an object or null" },
      { status: 400 },
    );
  }

  const storedPublicConfig =
    result.row.configPublic &&
    typeof result.row.configPublic === "object" &&
    !Array.isArray(result.row.configPublic)
      ? { ...(result.row.configPublic as Record<string, unknown>) }
      : {};
  let storedSecretConfig: Record<string, unknown> | null = null;
  const readStoredSecret = (): Record<string, unknown> => {
    if (storedSecretConfig) return { ...storedSecretConfig };
    if (!result.row.configEncrypted) {
      storedSecretConfig = {};
      return {};
    }
    const decoded = decryptJson<unknown>(result.row.configEncrypted);
    if (
      decoded === null ||
      typeof decoded !== "object" ||
      Array.isArray(decoded)
    ) {
      throw new Error("encrypted configuration is malformed");
    }
    storedSecretConfig = { ...(decoded as Record<string, unknown>) };
    return { ...storedSecretConfig };
  };

  let nextPublicConfig: Record<string, unknown> | undefined;
  if (configPublic !== undefined) {
    // PATCH semantics preserve public fields that were not included in the
    // request. This is important for credential rotation: the UI sends only
    // the new secret values and must not accidentally erase endpointUrl or
    // authType.
    nextPublicConfig = isCustomMcp
      ? { ...storedPublicConfig, ...(configPublic as Record<string, unknown>) }
      : { ...(configPublic as Record<string, unknown>) };
  } else if (isCustomMcp && secretConfig !== undefined) {
    // A secret-only PATCH also gets a chance to remove legacy credential
    // fields from configPublic; otherwise those stale plaintext values would
    // remain in the database even after a successful rotation.
    nextPublicConfig = { ...storedPublicConfig };
  }

  let nextSecretConfig: Record<string, unknown> | null | undefined =
    secretConfig;
  try {
    if (secretConfig !== undefined && secretConfig !== null) {
      // Secret updates are partial rotations. Keep existing encrypted values
      // unless the caller explicitly clears the blob with null.
      nextSecretConfig = {
        ...readStoredSecret(),
        ...(secretConfig as Record<string, unknown>),
      };
      if ("headers" in secretConfig) {
        nextSecretConfig.headers =
          secretConfig.headers === null
            ? {}
            : {
                ...normalizeMcpHeaders(readStoredSecret().headers),
                ...normalizeMcpHeaders(secretConfig.headers),
              };
      }
    }

    if (isCustomMcp && nextPublicConfig !== undefined) {
      // Older clients sent credentials/headers as configPublic. Move them into
      // the encrypted blob instead of persisting another plaintext copy. An
      // explicitly supplied secretConfig wins over these legacy fields.
      const {
        credentials: publicCredentials,
        headers: publicHeaders,
        ...publicConfigWithoutSecrets
      } = nextPublicConfig;
      nextPublicConfig = publicConfigWithoutSecrets;
      if (publicCredentials !== undefined || publicHeaders !== undefined) {
        if (nextSecretConfig === null) {
          // Explicit null means clear; do not resurrect secrets from a legacy
          // public payload in the same PATCH request.
        } else {
          const explicitSecret = nextSecretConfig !== undefined;
          const migratedSecret = explicitSecret
            ? { ...nextSecretConfig }
            : readStoredSecret();
          if (publicCredentials !== undefined && !explicitSecret) {
            if (typeof publicCredentials !== "string") {
              return NextResponse.json(
                { error: "credentials must be a string" },
                { status: 400 },
              );
            }
            migratedSecret.credentials = publicCredentials;
          }
          if (publicHeaders !== undefined) {
            const legacyHeaders = normalizeMcpHeaders(publicHeaders);
            const explicitHeaders = normalizeMcpHeaders(migratedSecret.headers);
            migratedSecret.headers = explicitSecret
              ? { ...legacyHeaders, ...explicitHeaders }
              : {
                  ...normalizeMcpHeaders(readStoredSecret().headers),
                  ...legacyHeaders,
                };
          }
          nextSecretConfig = migratedSecret;
        }
      }
    }

    if (
      isCustomMcp &&
      nextSecretConfig !== undefined &&
      nextSecretConfig !== null
    ) {
      nextSecretConfig = {
        ...nextSecretConfig,
        ...(nextSecretConfig.headers !== undefined
          ? { headers: normalizeMcpHeaders(nextSecretConfig.headers) }
          : {}),
      };
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read installation secrets",
      },
      { status: 400 },
    );
  }

  if (isCustomMcp) {
    // PATCH is an installation write boundary, so apply the same endpoint
    // validation used by create/verify before persisting a changed URL. This
    // closes the gap where a verified installation could later be turned into
    // an arbitrary internal-network proxy via a direct update.
    try {
      const handler = getProviderHandler(result.integrationSlug);
      if (!handler) throw new Error("No handler registered for installation.");
      const existingSecret =
        nextSecretConfig === undefined
          ? readStoredSecret()
          : (nextSecretConfig ?? {});
      const publicConfigForValidation = nextPublicConfig ?? storedPublicConfig;
      const mergedConfig = {
        ...publicConfigForValidation,
        ...existingSecret,
      } as Record<string, unknown>;
      handler.validate(mergedConfig);
      await assertSafeMcpEndpoint(String(mergedConfig.endpointUrl));
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid custom MCP configuration",
        },
        { status: 400 },
      );
    }
  }

  if (nextPublicConfig) {
    update.configPublic = nextPublicConfig;
  }
  if (nextSecretConfig !== undefined) {
    update.configEncrypted = nextSecretConfig
      ? encryptJson(nextSecretConfig)
      : null;
  }
  if (status === "active" || status === "disabled") {
    update.status = status;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  const [updated] = await db()
    .update(integrationInstallation)
    .set(update)
    .where(
      and(
        eq(integrationInstallation.id, id),
        eq(integrationInstallation.organizationId, result.row.organizationId),
        exists(
          db()
            .select({ id: organization.id })
            .from(organization)
            .where(
              and(
                eq(organization.id, integrationInstallation.organizationId),
                eq(organization.tenantId, result.tenantId),
              ),
            ),
        ),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "Installation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(toSafeInstallation(updated));
}

/**
 * DELETE /api/installations/[id]
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await loadAuthorizedInstallation(id, {
    requireWriteRole: true,
  });
  if ("error" in result) return result.error;
  if (result.row.isSystemManaged) {
    return NextResponse.json(
      { error: "System-managed installations cannot be deleted." },
      { status: 400 },
    );
  }
  await db()
    .delete(integrationInstallation)
    .where(
      and(
        eq(integrationInstallation.id, id),
        eq(integrationInstallation.organizationId, result.row.organizationId),
        exists(
          db()
            .select({ id: organization.id })
            .from(organization)
            .where(
              and(
                eq(organization.id, integrationInstallation.organizationId),
                eq(organization.tenantId, result.tenantId),
              ),
            ),
        ),
      ),
    );
  return NextResponse.json({ success: true });
}
