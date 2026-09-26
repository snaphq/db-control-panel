import { UserTable } from "@/components/admin/UserTable";
import { db } from "@repo/database";
import { tenant, user } from "@repo/database/schema";

async function getUsers() {
  try {
    const users = await db().select().from(user).orderBy(user.createdAt);
    return users;
  } catch (error) {
    console.error("Error fetching users:", error);
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

export default async function UsersPage() {
  const [users, tenants] = await Promise.all([getUsers(), getTenants()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          View and manage all registered users
        </p>
      </div>
      <UserTable users={users} tenants={tenants} />
    </div>
  );
}
