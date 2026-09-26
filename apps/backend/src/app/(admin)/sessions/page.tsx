import { SessionTable } from "@/components/admin/SessionTable";
import { requireAdmin } from "@/lib/admin-auth";
import { db, getSafeSessions } from "@repo/database";
import { tenant } from "@repo/database/schema";
import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";

async function getSessions(tenantId: string | undefined) {
  try {
    return await getSafeSessions({ tenantId });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return [];
  }
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  await requireAdmin();
  const tenantId = (await searchParams).tenant?.trim() || undefined;
  const [sessions, tenants] = await Promise.all([
    getSessions(tenantId),
    db().select({ id: tenant.id, name: tenant.name }).from(tenant),
  ]);
  const filters = [{ id: undefined, name: "All sites" }, ...tenants];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Session Management
        </h1>
        <p className="text-muted-foreground">
          View active user sessions across every site
        </p>
      </div>
      <nav aria-label="Filter by site" className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.id ?? "all"}
            href={filter.id ? `/sessions?tenant=${filter.id}` : "/sessions"}
            className={cn(
              "rounded-md border px-3 py-1 text-sm",
              filter.id === tenantId
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {filter.name}
          </Link>
        ))}
      </nav>
      <SessionTable sessions={sessions} />
    </div>
  );
}
