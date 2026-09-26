"use client";

import type { Integration } from "@repo/database/schema";
import { Plug } from "lucide-react";
import Link from "next/link";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export type AvailableIntegration = Integration;

interface AvailableIntegrationsListProps {
  integrations: AvailableIntegration[];
  /** Base href for browsing an integration's install page */
  baseHref: string;
}

export function AvailableIntegrationsList({
  integrations,
  baseHref,
}: AvailableIntegrationsListProps) {
  if (integrations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No integrations available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {integrations.map((intg) => (
        <Link key={intg.id} href={`${baseHref}/${intg.slug}`}>
          <Card className="transition-colors hover:border-foreground/20">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-white p-1.5 dark:bg-black">
                    <Plug className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">{intg.name}</CardTitle>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {intg.category}
                </Badge>
              </div>
            </CardHeader>
            {intg.description && (
              <CardContent className="pt-0 text-sm text-muted-foreground">
                {intg.description}
              </CardContent>
            )}
          </Card>
        </Link>
      ))}
    </div>
  );
}
