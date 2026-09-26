import { auth } from "@repo/auth/server";
import { canUserCreateFreeWorkspace } from "@repo/billing";
import { getPricingTiers } from "@repo/billing/stripe/queries";
import { SidebarProvider } from "@repo/ui/components/dashboard/sidebar-context";
import { CreateWorkspaceProvider } from "@repo/ui/components/workspace/create/CreateWorkspaceContext";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import DashboardSideBar from "../(components)/DashboardSideBar";
import DashboardTopNav from "../(components)/DashboardTopNav";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  const [pricingTiers, canCreateFree] = await Promise.all([
    getPricingTiers(),
    session?.user?.id
      ? canUserCreateFreeWorkspace(session.user.id)
      : Promise.resolve(false),
  ]);

  return (
    <CreateWorkspaceProvider
      pricingTiers={pricingTiers}
      canCreateFree={canCreateFree}
    >
      <SidebarProvider>
        <DashboardSideBar />
        <DashboardTopNav>
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </DashboardTopNav>
      </SidebarProvider>
    </CreateWorkspaceProvider>
  );
}
