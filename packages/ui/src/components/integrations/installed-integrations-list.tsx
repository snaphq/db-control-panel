"use client";

import type {
  Integration,
  IntegrationInstallation,
} from "@repo/database/schema";
import { AlertCircle, CheckCircle2, Plug } from "lucide-react";
import Link from "next/link";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export type InstalledItem = {
  installation: Omit<IntegrationInstallation, "configEncrypted"> & {
    hasSecret?: boolean;
  };
  integration: Integration;
  /** True if this install belongs to the parent workspace (shown when viewing project page) */
  inherited?: boolean;
};

interface InstalledIntegrationsListProps {
  items: InstalledItem[];
  /** Base href for browsing installation detail */
  baseHref: string;
}

export function InstalledIntegrationsList({
  items,
  baseHref,
}: InstalledIntegrationsListProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No integrations installed yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map(({ installation, integration, inherited }) => {
        const isError = installation.status === "error";
        return (
          <Link
            key={installation.id}
            href={`${baseHref}/${integration.slug}/${installation.id}`}
          >
            <Card className="transition-colors hover:border-foreground/20">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-white p-1.5 dark:bg-black">
                      <Plug className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base">
                      {installation.displayName ?? integration.name}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {inherited && <Badge variant="outline">workspace</Badge>}
                    {isError ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> error
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> active
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                {integration.name}
                {installation.lastVerifiedAt && (
                  <span className="ml-2">
                    · verified{" "}
                    {new Date(installation.lastVerifiedAt).toLocaleString()}
                  </span>
                )}
                {isError && installation.lastError && (
                  <p className="mt-1 text-destructive">
                    {installation.lastError}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
