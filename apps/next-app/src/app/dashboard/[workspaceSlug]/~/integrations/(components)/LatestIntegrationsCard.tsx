import type { Integration } from "@repo/database/schema";
import { Button } from "@repo/ui/components/ui/button";
import { Card } from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Layers } from "lucide-react";
import Link from "next/link";
import { IntegrationLogo } from "./IntegrationLogo";

interface LatestIntegrationsCardProps {
  integrations: Integration[];
  marketplaceHref: string;
  baseHref: string;
  limit?: number;
}

export function LatestIntegrationsCard({
  integrations,
  marketplaceHref,
  baseHref,
  limit = 7,
}: LatestIntegrationsCardProps) {
  const items = [...integrations]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);

  if (items.length === 0) return null;

  return (
    <Card className="w-full p-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground">
          <Layers className="h-4 w-4" />
        </div>
        <h2 className="text-base font-medium">Latest Integrations</h2>
        <p className="mt-1 max-w-[36ch] text-sm text-muted-foreground">
          Explore more integrations to expand your workspace.
        </p>
      </div>
      <ul className="mt-5 space-y-4">
        {items.map((intg) => (
          <li key={intg.id}>
            <Link
              href={`${baseHref}/${intg.slug}`}
              className="flex gap-3 rounded-sm outline-none ring-offset-background hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IntegrationLogo
                id={intg.id}
                name={intg.name}
                iconUrl={intg.iconUrl}
                size="md"
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{intg.name}</div>
                {intg.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {intg.description}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Separator className="my-5" />
      <Button asChild variant="outline" className="w-full">
        <Link href={marketplaceHref}>Browse Marketplace</Link>
      </Button>
    </Card>
  );
}
