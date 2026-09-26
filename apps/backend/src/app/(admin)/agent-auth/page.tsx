import {
  agentRegistration,
  and,
  asc,
  count,
  db,
  desc,
  eq,
  gte,
  lte,
  user,
} from "@repo/database";
import { Badge } from "@repo/react-ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/react-ui/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  unclaimed:
    "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  claimed:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  expired: "border-transparent bg-secondary text-secondary-foreground",
  revoked: "border-transparent bg-destructive/15 text-destructive",
};

async function getStats() {
  try {
    return await db()
      .select({ status: agentRegistration.status, total: count() })
      .from(agentRegistration)
      .groupBy(agentRegistration.status);
  } catch (error) {
    console.error("Error fetching agent auth stats:", error);
    return [];
  }
}

async function getExpiringSoon() {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return await db()
      .select({
        id: agentRegistration.id,
        type: agentRegistration.type,
        createdAt: agentRegistration.createdAt,
        registrationExpiresAt: agentRegistration.registrationExpiresAt,
      })
      .from(agentRegistration)
      .where(
        and(
          eq(agentRegistration.status, "unclaimed"),
          gte(agentRegistration.registrationExpiresAt, now),
          lte(agentRegistration.registrationExpiresAt, in24h),
        ),
      )
      .orderBy(asc(agentRegistration.registrationExpiresAt))
      .limit(10);
  } catch (error) {
    console.error("Error fetching expiring registrations:", error);
    return [];
  }
}

async function getRecentRegistrations() {
  try {
    return await db()
      .select({
        id: agentRegistration.id,
        type: agentRegistration.type,
        status: agentRegistration.status,
        claimEmail: agentRegistration.claimEmail,
        userEmail: user.email,
        createdAt: agentRegistration.createdAt,
      })
      .from(agentRegistration)
      .leftJoin(user, eq(agentRegistration.userId, user.id))
      .orderBy(desc(agentRegistration.createdAt))
      .limit(10);
  } catch (error) {
    console.error("Error fetching recent registrations:", error);
    return [];
  }
}

export default async function AgentAuthPage() {
  const [stats, expiringSoon, recent] = await Promise.all([
    getStats(),
    getExpiringSoon(),
    getRecentRegistrations(),
  ]);

  const counts: Record<string, number> = {
    unclaimed: 0,
    claimed: 0,
    expired: 0,
    revoked: 0,
  };
  for (const row of stats) {
    counts[row.status] = row.total;
  }

  const statCards = [
    { label: "Unclaimed", value: counts.unclaimed },
    { label: "Claimed", value: counts.claimed },
    { label: "Expired", value: counts.expired },
    { label: "Revoked", value: counts.revoked },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Agent Auth</h1>
        <p className="text-sm text-muted-foreground">
          Monitor agentic registrations, claims, and issued tokens.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-normal tracking-tight">
                {card.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expiring soon</CardTitle>
          <CardDescription>
            Unclaimed registrations expiring within the next 24 hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expiringSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing expiring in the next 24 hours.
            </p>
          ) : (
            <div className="grid gap-2">
              {expiringSoon.map((row) => (
                <Link
                  key={row.id}
                  href={`/agent-auth/registrations/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="font-mono text-xs">
                    {row.id.slice(0, 16)}…
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {row.type}
                  </Badge>
                  <span className="text-muted-foreground">
                    created {new Date(row.createdAt).toLocaleString()}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400">
                    expires{" "}
                    {row.registrationExpiresAt
                      ? new Date(row.registrationExpiresAt).toLocaleString()
                      : "N/A"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent registrations</CardTitle>
          <CardDescription>The latest 10 agent registrations.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No agent registrations yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      ID
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Type
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Status
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Email
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="p-4 align-middle font-mono text-xs">
                        <Link
                          href={`/agent-auth/registrations/${row.id}`}
                          className="hover:underline"
                        >
                          {row.id.slice(0, 16)}…
                        </Link>
                      </td>
                      <td className="p-4 align-middle text-sm capitalize">
                        {row.type}
                      </td>
                      <td className="p-4 align-middle">
                        <Badge
                          variant="outline"
                          className={`capitalize ${STATUS_STYLES[row.status] ?? ""}`}
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {row.userEmail || row.claimEmail || "—"}
                      </td>
                      <td className="p-4 align-middle text-sm">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
