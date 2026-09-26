import "server-only";

import { auth } from "@repo/auth/server";
import { db, resolveTenantFromHost } from "@repo/database";
import { and, eq, inArray } from "@repo/database";
import { member, organization } from "@repo/database/schema";
import { headers as nextHeaders } from "next/headers";

// Cookie name for caching workspace status
export const HAS_WORKSPACE_COOKIE = "has_workspace";

// Cookie TTL in seconds (5 minutes)
export const WORKSPACE_COOKIE_TTL = 5 * 60;

type HeaderSource = Pick<Headers, "get">;

/**
 * Resolve the request tenant for helpers that are called from server
 * components without an explicit tenant argument. A missing or unknown host
 * must fail closed instead of falling back to the default tenant.
 */
async function resolveWorkspaceTenantId(
  requestHeaders?: HeaderSource,
): Promise<string | null> {
  const source = requestHeaders ?? (await nextHeaders());
  const tenant = await resolveTenantFromHost(source.get("host"));
  return tenant?.id ?? null;
}

/**
 * Check if the current user has any workspaces/organizations.
 */
export async function hasWorkspaces(headers: Headers): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers });

    if (!session?.user?.id) {
      return false;
    }

    const tenantId = await resolveWorkspaceTenantId(headers);
    if (!tenantId || session.user.tenantId !== tenantId) {
      return false;
    }

    const count = await getWorkspaceCount(session.user.id, tenantId);
    return count > 0;
  } catch (error) {
    console.error("[workspace-utils] Error checking workspaces:", error);
    return false;
  }
}

/**
 * Get the count of workspaces/organizations for a user.
 */
export async function getWorkspaceCount(
  userId: string,
  tenantId?: string,
): Promise<number> {
  try {
    const scopedTenantId =
      tenantId?.trim() || (await resolveWorkspaceTenantId());
    if (!scopedTenantId) return 0;

    const userMembers = await db()
      .select({ organizationId: member.organizationId })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, userId),
          eq(member.tenantId, scopedTenantId),
          eq(organization.tenantId, scopedTenantId),
        ),
      );

    return userMembers.length;
  } catch (error) {
    console.error("[workspace-utils] Error getting workspace count:", error);
    return 0;
  }
}

/**
 * Get all workspaces/organizations for a user.
 */
export async function getUserWorkspaces(userId: string, tenantId?: string) {
  try {
    const scopedTenantId =
      tenantId?.trim() || (await resolveWorkspaceTenantId());
    if (!scopedTenantId) return [];

    const userMembers = await db()
      .select({ organizationId: member.organizationId })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(
        and(
          eq(member.userId, userId),
          eq(member.tenantId, scopedTenantId),
          eq(organization.tenantId, scopedTenantId),
        ),
      );

    const organizationIds = userMembers.map((m) => m.organizationId);

    if (organizationIds.length === 0) {
      return [];
    }

    const organizations = await db()
      .select()
      .from(organization)
      .where(
        and(
          eq(organization.tenantId, scopedTenantId),
          inArray(organization.id, organizationIds),
        ),
      );

    return organizations;
  } catch (error) {
    console.error("[workspace-utils] Error getting user workspaces:", error);
    return [];
  }
}

/**
 * Parse the workspace cookie value.
 */
export function parseWorkspaceCookie(
  cookieValue: string | undefined,
): boolean | undefined {
  if (cookieValue === "1") return true;
  if (cookieValue === "0") return false;
  return undefined;
}

/**
 * Generate the Set-Cookie header value for workspace status.
 */
export function getWorkspaceCookieValue(hasWorkspace: boolean): string {
  const value = hasWorkspace ? "1" : "0";
  return `${HAS_WORKSPACE_COOKIE}=${value}; Path=/; Max-Age=${WORKSPACE_COOKIE_TTL}; SameSite=Lax`;
}

/**
 * Generate the Set-Cookie header value to clear the workspace cookie.
 */
export function getClearWorkspaceCookieValue(): string {
  return `${HAS_WORKSPACE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
