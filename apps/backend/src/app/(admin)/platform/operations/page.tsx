import { AutoRefresh } from "@/components/admin/platform/auto-refresh";
import { OperationsTable } from "@/components/admin/platform/operations-table";
import { PlatformActionButton } from "@/components/admin/platform/platform-action-button";
import { PlatformUnavailable } from "@/components/admin/platform/platform-unavailable";
import { requireAdmin } from "@/lib/admin-auth";
import { loadPlatform } from "@/lib/platform/load";
import { hasActiveOperation } from "@/lib/platform/operations";
import { cn } from "@repo/react-ui/lib/utils";
import Link from "next/link";

const FILTERS = [
  { id: "all", label: "All", href: "/platform/operations" },
  { id: "active", label: "Active", href: "/platform/operations?status=active" },
] as const;

export default async function PlatformOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const active = (await searchParams).status === "active";
  const result = await loadPlatform((client) =>
    client.listOperations({ limit: 50, status: active ? "active" : undefined }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Platform operations
        </h1>
        <p className="text-muted-foreground">
          Cluster-wide work started by you or by the worker, one at a time
        </p>
      </div>
      {result.status === "ok" ? (
        <>
          <div className="flex flex-wrap items-start gap-4">
            <PlatformActionButton
              label="Rebalance pageservers"
              description="Plans and moves tenant shards so every pageserver carries a fair share. Moves are done one tenant at a time and can take several minutes. Only one platform operation can run at once."
              url="/api/admin/platform/pageservers/rebalance"
            />
            <PlatformActionButton
              label="Spread safekeepers"
              description="Moves one safekeeper to a better node if the layout calls for it. If nothing needs to move, the operation says so. Only one platform operation can run at once."
              url="/api/admin/platform/safekeepers/spread"
            />
          </div>
          <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <Link
                key={filter.id}
                href={filter.href}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm",
                  (filter.id === "active") === active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {filter.label}
              </Link>
            ))}
          </nav>
          <AutoRefresh active={hasActiveOperation(result.data.operations)} />
          <OperationsTable operations={result.data.operations} />
          {result.data.next_cursor ? (
            <p className="text-sm text-muted-foreground">
              Showing the newest 50 operations.
            </p>
          ) : null}
        </>
      ) : (
        <PlatformUnavailable result={result} />
      )}
    </div>
  );
}
