import AdminSidebar from "@/app/(admin)/(components)/AdminSidebar";
import AdminTopNav from "@/app/(admin)/(components)/AdminTopNav";
import { requireAdmin } from "@/lib/admin-auth";
import { SidebarProvider } from "@repo/ui/components/dashboard/sidebar-context";
import { ReactQueryProvider } from "@repo/ui/providers/react-query-provider";
import type { ReactNode } from "react";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();
  return (
    <ReactQueryProvider>
      <SidebarProvider>
        <AdminSidebar />
        <AdminTopNav adminEmail={admin.user.email}>
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </AdminTopNav>
      </SidebarProvider>
    </ReactQueryProvider>
  );
}
