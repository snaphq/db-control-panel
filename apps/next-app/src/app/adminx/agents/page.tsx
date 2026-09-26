import { agent, db } from "@repo/database";
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

export default async function AdminAgentsPage() {
  const rows = await db().select().from(agent).orderBy(agent.slug);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Manage the AI agent registry available to all workspaces.
          </p>
        </div>
        <Button asChild>
          <Link href="/adminx/agents/new">
            <Plus className="mr-2 h-4 w-4" />
            New agent
          </Link>
        </Button>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No agents yet.
            </CardContent>
          </Card>
        )}
        {rows.map((row) => (
          <Link key={row.id} href={`/adminx/agents/${row.id}`}>
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
                    {row.model && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {row.model}
                      </Badge>
                    )}
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
