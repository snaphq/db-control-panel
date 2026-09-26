import { SidebarProvider } from "@repo/ui/components/dashboard/sidebar-context";
import { ReactQueryProvider } from "@repo/ui/providers/react-query-provider";
import type { ReactNode } from "react";
import AdminSidebar from "./(components)/AdminSidebar";
import AdminTopNav from "./(components)/AdminTopNav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ReactQueryProvider>
      <SidebarProvider>
        <AdminSidebar />
        <AdminTopNav>
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </AdminTopNav>
      </SidebarProvider>
    </ReactQueryProvider>
  );
}
