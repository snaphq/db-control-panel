import { OrganizationTable } from "@/components/admin/OrganizationTable";
import { db } from "@repo/database";
import { organization, tenant } from "@repo/database/schema";

async function getOrganizations() {
  try {
    const organizations = await db()
      .select()
      .from(organization)
      .orderBy(organization.createdAt);
    return organizations;
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return [];
  }
}

async function getTenants() {
  try {
    return await db().select().from(tenant).orderBy(tenant.createdAt);
  } catch (error) {
    console.error("Error fetching tenants:", error);
    return [];
  }
}

export default async function OrganizationsPage() {
  const [organizations, tenants] = await Promise.all([
    getOrganizations(),
    getTenants(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Organization Management
        </h1>
        <p className="text-muted-foreground">
          View and manage all organizations
        </p>
      </div>
      <OrganizationTable organizations={organizations} tenants={tenants} />
    </div>
  );
}
