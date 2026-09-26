import type { Integration } from "@repo/database/schema";
import {
  InstalledIntegrationsList,
  type InstalledItem,
} from "@repo/ui/components/integrations/installed-integrations-list";
import { Button } from "@repo/ui/components/ui/button";
import { Card } from "@repo/ui/components/ui/card";
import { Info } from "lucide-react";
import Link from "next/link";
import { LatestIntegrationsCard } from "./LatestIntegrationsCard";

interface ConsoleViewProps {
  workspaceSlug: string;
  installs: InstalledItem[];
  available: Integration[];
}

export function ConsoleView({
  workspaceSlug,
  installs,
  available,
}: ConsoleViewProps) {
  const baseHref = `/dashboard/${encodeURIComponent(workspaceSlug)}/~/integrations`;
  const marketplaceHref = `${baseHref}/marketplace`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="min-w-0">
        {installs.length === 0 ? (
          <Card className="flex min-h-[420px] flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border text-muted-foreground">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-medium">
                No Integrations Installed
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                You don&rsquo;t have any integration installed.
              </p>
            </div>
            <Button asChild>
              <Link href={marketplaceHref}>Browse Marketplace</Link>
            </Button>
          </Card>
        ) : (
          <InstalledIntegrationsList items={installs} baseHref={baseHref} />
        )}
      </div>
      <aside className="min-w-0">
        <LatestIntegrationsCard
          integrations={available}
          marketplaceHref={marketplaceHref}
          baseHref={baseHref}
        />
      </aside>
    </div>
  );
}
