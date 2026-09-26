import type { Integration } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import { Card } from "@repo/ui/components/ui/card";
import Link from "next/link";
import { IntegrationLogo } from "./IntegrationLogo";

interface IntegrationTileProps {
  integration: Integration;
  baseHref: string;
}

export function IntegrationTile({
  integration,
  baseHref,
}: IntegrationTileProps) {
  return (
    <Link
      href={`${baseHref}/${integration.slug}`}
      className="group block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-foreground/20">
        <div className="flex items-start justify-between gap-3">
          <IntegrationLogo
            id={integration.id}
            name={integration.name}
            iconUrl={integration.iconUrl}
          />
          <Badge variant="secondary" className="capitalize">
            {integration.category}
          </Badge>
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{integration.name}</div>
          {integration.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {integration.description}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
