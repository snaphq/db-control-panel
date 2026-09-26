import { requireAdmin } from "@/lib/admin-auth";
import { db, eq, getTenantAdminStats } from "@repo/database";
import { tenant, tenantDomain } from "@repo/database/schema";
import { Badge } from "@repo/react-ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Per-site overview. Every figure is scoped by the tenant foreign key, so a
 * platform admin sees exactly one site's data here.
 */
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [row] = await db().select().from(tenant).where(eq(tenant.id, id));
  if (!row) notFound();

  const [domains, stats] = await Promise.all([
    db().select().from(tenantDomain).where(eq(tenantDomain.tenantId, id)),
    getTenantAdminStats(id),
  ]);

  const figures = [
    { label: "Users", value: stats.totalUsers },
    { label: "Organizations", value: stats.totalOrganizations },
    {
      label: "Active sessions",
      value: stats.activeSessions,
      href: `/sessions?tenant=${id}`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-normal tracking-tight">{row.name}</h1>
        <Badge variant={row.status === "active" ? "default" : "secondary"}>
          {row.status}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        {row.platformName} · <span className="font-mono">{row.id}</span>
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {figures.map((figure) => (
          <Card key={figure.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {figure.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl">
              {figure.href ? (
                <Link href={figure.href} className="hover:underline">
                  {figure.value}
                </Link>
              ) : (
                figure.value
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <p className="text-muted-foreground text-sm">No domains yet.</p>
          ) : (
            <ul className="space-y-2">
              {domains.map((domain) => (
                <li key={domain.id} className="flex items-center gap-2">
                  <span className="font-mono text-sm">{domain.domain}</span>
                  {domain.isPrimary && <Badge variant="outline">primary</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin MCP</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Connect an MCP client to{" "}
          <code className="font-mono">/mcp?tenant={row.id}</code> to run the
          admin tools against this site.
        </CardContent>
      </Card>
    </div>
  );
}
