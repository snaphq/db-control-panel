import { db } from "@repo/database";
import { integration } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Plus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  const rows = await db().select().from(integration).orderBy(integration.slug);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Manage the integration registry available to all workspaces.
          </p>
        </div>
        <Button asChild>
          <Link href="/adminx/integrations/new">
            <Plus className="mr-2 h-4 w-4" />
            New integration
          </Link>
        </Button>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No integrations yet.
            </CardContent>
          </Card>
        )}
        {rows.map((row) => (
          <Link key={row.id} href={`/adminx/integrations/${row.id}`}>
            <Card className="transition-colors hover:border-foreground/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    {row.name}{" "}
                    <span className="text-muted-foreground font-normal">
                      · {row.slug}
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {row.category}
                    </Badge>
                    <Badge
                      variant={row.status === "active" ? "default" : "outline"}
                      className="capitalize"
                    >
                      {row.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {row.description && (
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {row.description}
                </CardContent>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
