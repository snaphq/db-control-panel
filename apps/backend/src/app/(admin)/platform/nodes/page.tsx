import { NodesView } from "@/components/admin/platform/nodes-view";
import { PlatformActionButton } from "@/components/admin/platform/platform-action-button";
import { PlatformUnavailable } from "@/components/admin/platform/platform-unavailable";
import { requireAdmin } from "@/lib/admin-auth";
import { loadPlatform } from "@/lib/platform/load";

export default async function PlatformNodesPage() {
  await requireAdmin();
  const result = await loadPlatform((client) => client.listNodes());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Nodes</h1>
        <p className="text-muted-foreground">
          The cluster's machines and what runs on each: pageservers, safekeepers
          and libSQL databases
        </p>
      </div>
      {result.status === "ok" ? (
        <>
          <PlatformActionButton
            label="Rebalance pageservers"
            description="Plans and moves tenant shards so every pageserver carries a fair share. Moves are done one tenant at a time and can take several minutes. Only one platform operation can run at once."
            url="/api/admin/platform/pageservers/rebalance"
          />
          <NodesView nodes={result.data.nodes} />
        </>
      ) : (
        <PlatformUnavailable result={result} />
      )}
    </div>
  );
}
