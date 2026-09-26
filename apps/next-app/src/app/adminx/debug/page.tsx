import { auth } from "@repo/auth/server";
import { getCurrentUserRole, getSiteAdminStatus } from "@repo/core/auth-utils";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { headers } from "next/headers";

export default async function DebugPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAdmin = session?.user?.id
    ? await getSiteAdminStatus(session.user.id)
    : false;
  const userRole = await getCurrentUserRole();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Debug Information
        </h1>
        <p className="text-muted-foreground">
          Check your authentication and admin status
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Has Session
            </p>
            <div>
              <Badge variant={session ? "default" : "secondary"}>
                {session ? "Yes" : "No"}
              </Badge>
            </div>
          </div>

          {session && (
            <>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  User ID
                </p>
                <p className="font-mono text-sm">{session.user.id}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Email
                </p>
                <p>{session.user.email}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Name
                </p>
                <p>{session.user.name}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Current Role
            </p>
            <div>
              <Badge
                variant={userRole === "site-admin" ? "default" : "secondary"}
              >
                {userRole || "Not found"}
              </Badge>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Is Admin
            </p>
            <div>
              <Badge variant={isAdmin ? "default" : "destructive"}>
                {isAdmin ? "Yes ✓" : "No ✗"}
              </Badge>
            </div>
          </div>

          {!isAdmin && (
            <div className="p-4 border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>⚠️ You need admin access</strong>
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                To make yourself an admin:
              </p>
              <ol className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 list-decimal list-inside space-y-1">
                <li>Run: npm run db:studio</li>
                <li>Open the "user" table</li>
                <li>Find your user record</li>
                <li>Change role to: "site-admin"</li>
                <li>Save and refresh this page</li>
              </ol>
            </div>
          )}

          {isAdmin && (
            <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>✓ You have admin access!</strong>
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                You can access all admin features including Stripe management.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment Check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Stripe Secret Key
            </p>
            <div>
              <Badge
                variant={
                  process.env.STRIPE_SECRET_KEY ? "default" : "destructive"
                }
              >
                {process.env.STRIPE_SECRET_KEY ? "Set ✓" : "Not Set ✗"}
              </Badge>
              {process.env.STRIPE_SECRET_KEY && (
                <p className="text-xs text-muted-foreground mt-1">
                  {process.env.STRIPE_SECRET_KEY.substring(0, 20)}...
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Key Format
            </p>
            <div>
              {process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && (
                <Badge variant="default">Valid (Test Mode) ✓</Badge>
              )}
              {process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") && (
                <Badge variant="default">Valid (Live Mode) ✓</Badge>
              )}
              {process.env.STRIPE_SECRET_KEY?.startsWith("pk_") && (
                <Badge variant="destructive">
                  ERROR: This is a publishable key! ✗
                </Badge>
              )}
              {!process.env.STRIPE_SECRET_KEY && (
                <Badge variant="destructive">Not Set ✗</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
