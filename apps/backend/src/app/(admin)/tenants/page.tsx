import { TenantTable } from "@/components/admin/TenantTable";
import { db, eq } from "@repo/database";
import { tenant, tenantDomain } from "@repo/database/schema";

async function getTenants() {
  try {
    return await db()
      .select({
        tenant,
        domain: tenantDomain.domain,
      })
      .from(tenant)
      .leftJoin(tenantDomain, eq(tenantDomain.tenantId, tenant.id))
      .orderBy(tenant.createdAt);
  } catch (error) {
    console.error("Error fetching tenants:", error);
    return [];
  }
}

export default async function TenantsPage() {
  const rows = await getTenants();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Tenant Management
        </h1>
        <p className="text-muted-foreground">
          Manage whitelabel tenants, platform names, and primary domains.
        </p>
      </div>
      <TenantTable rows={rows} />
    </div>
  );
}
