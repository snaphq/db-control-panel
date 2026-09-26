import { SessionTable } from "@/components/admin/SessionTable";
import { auth } from "@repo/auth/server";
import { getSiteAdminStatus } from "@repo/core/auth-utils";
import { getSafeSessions, resolveTenantFromHost } from "@repo/database";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

async function getSessions(tenantId: string) {
  try {
    return await getSafeSessions({ tenantId });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return [];
  }
}

export default async function SessionsPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    redirect("/auth/sign-in?redirect=/adminx/sessions");
  }
  const tenant = await resolveTenantFromHost(requestHeaders.get("host"));
  if (!tenant) notFound();
  if (!(await getSiteAdminStatus(session.user.id, tenant.id))) notFound();

  const sessions = await getSessions(tenant.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Session Management
        </h1>
        <p className="text-muted-foreground">
          View and manage active user sessions
        </p>
      </div>
      <SessionTable sessions={sessions} />
    </div>
  );
}
