import { db } from "@repo/database";
import { eq } from "@repo/database";
import { member, organization, user } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export const dynamic = "force-dynamic";

async function getMembers() {
  const members = await db()
    .select({
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      userId: member.userId,
      organizationId: member.organizationId,
      userName: user.name,
      userEmail: user.publicEmail,
      orgName: organization.name,
      orgSlug: organization.slug,
    })
    .from(member)
    .leftJoin(user, eq(member.userId, user.id))
    .leftJoin(organization, eq(member.organizationId, organization.id))
    .orderBy(member.createdAt);

  return members;
}

export default async function MembersPage() {
  const members = await getMembers();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Member Management
        </h1>
        <p className="text-muted-foreground">
          View and manage organization memberships
        </p>
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left align-middle font-medium">
                User
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Organization
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Role
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Joined
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.id}
                className="border-b transition-colors hover:bg-muted/50"
              >
                <td className="p-4 align-middle">
                  <div>
                    <div className="font-medium">{m.userName || "N/A"}</div>
                    <div className="text-sm text-muted-foreground">
                      {m.userEmail || "N/A"}
                    </div>
                  </div>
                </td>
                <td className="p-4 align-middle">
                  <div>
                    <div className="font-medium">{m.orgName || "N/A"}</div>
                    <div className="text-sm text-muted-foreground">
                      {m.orgSlug || "N/A"}
                    </div>
                  </div>
                </td>
                <td className="p-4 align-middle">
                  <Badge variant="secondary">{m.role}</Badge>
                </td>
                <td className="p-4 align-middle">
                  {new Date(m.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No members found
          </div>
        )}
      </div>
    </div>
  );
}
