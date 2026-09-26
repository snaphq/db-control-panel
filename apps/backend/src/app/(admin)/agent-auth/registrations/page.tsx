import {
  agentRegistration,
  and,
  db,
  desc,
  eq,
  organization,
  user,
} from "@repo/database";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
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

const STATUSES = ["unclaimed", "claimed", "expired", "revoked"];
const TYPES = ["anonymous", "service_auth", "identity_assertion"];

interface PageProps {
  searchParams: Promise<{ status?: string; type?: string }>;
}

async function getRegistrations(
  status: string | undefined,
  type: string | undefined,
) {
  try {
    const conditions = [];
    if (status && STATUSES.includes(status)) {
      conditions.push(eq(agentRegistration.status, status));
    }
    if (type && TYPES.includes(type)) {
      conditions.push(eq(agentRegistration.type, type));
    }

    return await db()
      .select({
        id: agentRegistration.id,
        type: agentRegistration.type,
        status: agentRegistration.status,
        claimEmail: agentRegistration.claimEmail,
        userEmail: user.email,
        orgName: organization.name,
        registrationIp: agentRegistration.registrationIp,
        createdAt: agentRegistration.createdAt,
        registrationExpiresAt: agentRegistration.registrationExpiresAt,
      })
      .from(agentRegistration)
      .leftJoin(user, eq(agentRegistration.userId, user.id))
      .leftJoin(
        organization,
        eq(agentRegistration.organizationId, organization.id),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(agentRegistration.createdAt))
      .limit(200);
  } catch (error) {
    console.error("Error fetching agent registrations:", error);
    return [];
  }
}

export default async function AgentRegistrationsPage({
  searchParams,
}: PageProps) {
  const { status, type } = await searchParams;
  const rows = await getRegistrations(status, type);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Agent Registrations
        </h1>
        <p className="text-sm text-muted-foreground">
          All agentic registrations across the platform (latest 200).
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">All</option>
            {STATUSES.map((value) => (
              <option key={value} value={value} className="capitalize">
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            defaultValue={type ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">All</option>
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

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
                Org
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                IP
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Created
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Expires
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b transition-colors hover:bg-muted/50"
              >
                <td className="p-4 align-middle font-mono text-xs">
                  {row.id.slice(0, 16)}…
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
                  {row.orgName || "—"}
                </td>
                <td className="p-4 align-middle font-mono text-xs">
                  {row.registrationIp || "—"}
                </td>
                <td className="p-4 align-middle text-sm">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="p-4 align-middle text-sm">
                  {row.registrationExpiresAt
                    ? new Date(row.registrationExpiresAt).toLocaleString()
                    : "—"}
                </td>
                <td className="p-4 align-middle text-sm">
                  <Link
                    href={`/agent-auth/registrations/${row.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No registrations found
          </div>
        )}
      </div>
    </div>
  );
}
