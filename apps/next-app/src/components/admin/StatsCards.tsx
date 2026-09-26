import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Activity, Building2, CreditCard, Users } from "lucide-react";

interface StatsCardsProps {
  totalUsers: number;
  totalOrganizations: number;
  totalPayments: number;
  activeSessions: number;
}

export function StatsCards({
  totalUsers,
  totalOrganizations,
  totalPayments,
  activeSessions,
}: StatsCardsProps) {
  const stats = [
    {
      title: "Total Users",
      value: totalUsers,
      icon: Users,
      description: "Registered users",
    },
    {
      title: "Organizations",
      value: totalOrganizations,
      icon: Building2,
      description: "Active organizations",
    },
    {
      title: "Payments",
      value: totalPayments,
      icon: CreditCard,
      description: "Total transactions",
    },
    {
      title: "Active Sessions",
      value: activeSessions,
      icon: Activity,
      description: "Current sessions",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
