import { DashboardCharts } from "@/app/(admin)/dashboard/(components)/DashboardCharts";
import { StatsCards } from "@/components/admin/StatsCards";
import { getAdminStats } from "@repo/database";
import { Suspense } from "react";

async function getStats() {
  try {
    return await getAdminStats();
  } catch (error) {
    console.error("Error fetching stats:", error);
    return {
      totalUsers: 0,
      totalOrganizations: 0,
      totalPayments: 0,
      activeSessions: 0,
    };
  }
}

export default async function AdminDashboard() {
  const stats = await getStats();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-normal tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of system statistics and metrics
        </p>
      </div>
      <StatsCards
        totalUsers={stats.totalUsers}
        totalOrganizations={stats.totalOrganizations}
        totalPayments={stats.totalPayments}
        activeSessions={stats.activeSessions}
      />
      <Suspense fallback={null}>
        <DashboardCharts />
      </Suspense>
    </div>
  );
}
