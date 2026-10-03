import { PlatformActionButton } from "@/components/admin/platform/platform-action-button";
import { PlatformUnavailable } from "@/components/admin/platform/platform-unavailable";
import { SafekeepersView } from "@/components/admin/platform/safekeepers-view";
import { requireAdmin } from "@/lib/admin-auth";
import { loadPlatform } from "@/lib/platform/load";

export default async function PlatformSafekeepersPage() {
  await requireAdmin();
  const result = await loadPlatform(async (client) => {
    const [safekeepers, nodes] = await Promise.all([
      client.listSafekeepers(),
      client.listNodes(),
    ]);
    return { ...safekeepers, nodes: nodes.nodes };
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Safekeepers</h1>
        <p className="text-muted-foreground">
          The write-ahead-log servers, how far they are from their ideal layout,
          and any that are being moved away
        </p>
      </div>
      {result.status === "ok" ? (
        <>
          <PlatformActionButton
            label="Spread safekeepers"
            description="Moves one safekeeper to a better node if the layout calls for it: a new safekeeper is started there, the timelines move over, and the old one is retired. If nothing needs to move, the operation says so. Only one platform operation can run at once."
            url="/api/admin/platform/safekeepers/spread"
          />
          <SafekeepersView
            safekeepers={result.data.safekeepers}
            layout={result.data.layout}
            nodeNames={new Map(result.data.nodes.map((n) => [n.id, n.name]))}
          />
        </>
      ) : (
        <PlatformUnavailable result={result} />
      )}
    </div>
  );
}
