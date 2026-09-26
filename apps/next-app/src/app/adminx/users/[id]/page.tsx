import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import { db } from "@repo/database";
import { eq } from "@repo/database";
import { user } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getUser(id: string) {
  try {
    const [userRecord] = await db()
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return userRecord || null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser(id);

  if (!user) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-normal tracking-tight">
              User Details
            </h1>
            <p className="text-muted-foreground">
              View and edit user information
            </p>
          </div>
          {user.archivedAt && (
            <Badge variant="outline" className="ml-2">
              Archived
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/adminx/users">Back to Users</Link>
          </Button>
          <RowActionsMenu
            archived={Boolean(user.archivedAt)}
            archiveUrl={`/api/admin/users/${user.id}/archive`}
            unarchiveUrl={`/api/admin/users/${user.id}/unarchive`}
            deleteUrl={`/api/admin/users/${user.id}`}
          />
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">ID</dt>
              <dd className="font-mono text-sm">{user.id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Name
              </dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Email
              </dt>
              <dd>{user.publicEmail}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Tenant
              </dt>
              <dd>{user.tenantId}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Role
              </dt>
              <dd>
                <Badge
                  variant={user.role === "site-admin" ? "default" : "secondary"}
                >
                  {user.role}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Email Verified
              </dt>
              <dd>
                <Badge variant={user.emailVerified ? "default" : "outline"}>
                  {user.emailVerified ? "Yes" : "No"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Created At
              </dt>
              <dd>{new Date(user.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                Updated At
              </dt>
              <dd>{new Date(user.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
