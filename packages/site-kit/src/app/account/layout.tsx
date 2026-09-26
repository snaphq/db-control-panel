import { requireSession } from "@repo/core/auth/require-membership";
import { AccountSidebar } from "@repo/ui/components/account/account-sidebar";
import { SidebarProvider } from "@repo/ui/components/dashboard/sidebar-context";
import type { ReactNode } from "react";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession("/account");
  return (
    <SidebarProvider>
      <AccountSidebar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </SidebarProvider>
  );
}
