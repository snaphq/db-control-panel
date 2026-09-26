import { and, db, eq, inArray } from "@repo/database";
import { member, organization } from "@repo/database/schema";

/**
 * Better Auth's organization adapter scopes by user membership, but its
 * generated join does not know about this application's tenant column. Filter
 * the adapter projection against an explicit tenant + user membership query
 * before returning it from an application route.
 */
export async function filterOrganizationsForTenant(
  organizations: unknown,
  tenantId: string,
  userId: string,
): Promise<unknown[]> {
  if (!Array.isArray(organizations)) return [];
  const ids = organizations.flatMap((value) => {
    if (!value || typeof value !== "object" || !("id" in value)) return [];
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
  if (ids.length === 0) return [];

  const rows = await db()
    .select({ id: organization.id })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.userId, userId),
        eq(member.tenantId, tenantId),
        eq(organization.tenantId, tenantId),
        inArray(organization.id, ids),
      ),
    );
  const allowed = new Set(rows.map((row) => row.id));
  return organizations.filter((value) => {
    if (!value || typeof value !== "object" || !("id" in value)) return false;
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" && allowed.has(id);
  });
}
