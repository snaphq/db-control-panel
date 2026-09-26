"use client";

import { CreateOrganizationDialog } from "@/components/admin/CreateOrganizationDialog";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import type { Organization, Tenant } from "@repo/database/schema";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import { Input } from "@repo/react-ui/components/ui/input";
import { cn } from "@repo/react-ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function statusLabel(status: string): { label: string; archived: boolean } {
  switch (status) {
    case "suspended":
      return { label: "Archived", archived: true };
    case "readonly":
      return { label: "Read-only", archived: false };
    case "pending":
      return { label: "Pending", archived: false };
    default:
      return { label: "Active", archived: false };
  }
}

interface OrganizationTableProps {
  organizations: Organization[];
  tenants: Tenant[];
}

export function OrganizationTable({
  organizations: initialOrganizations,
  tenants,
}: OrganizationTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [organizations] = useState(initialOrganizations);

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.slug?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search organizations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <CreateOrganizationDialog tenants={tenants} />
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left align-middle font-medium">
                Name
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Slug
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Tenant
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Status
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Created
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredOrganizations.map((org) => {
              const status = statusLabel(org.status);
              return (
                <tr
                  key={org.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/50",
                    status.archived && "text-muted-foreground",
                  )}
                >
                  <td className="p-4 align-middle">{org.name}</td>
                  <td className="p-4 align-middle">{org.slug}</td>
                  <td className="p-4 align-middle">{org.tenantId}</td>
                  <td className="p-4 align-middle">
                    <Badge variant={status.archived ? "outline" : "secondary"}>
                      {status.label}
                    </Badge>
                  </td>
                  <td className="p-4 align-middle">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 align-middle">
                    <div className="flex items-center gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/organizations/${org.id}`}>View</Link>
                      </Button>
                      <RowActionsMenu
                        archived={status.archived}
                        archiveUrl={`/api/admin/organizations/${org.id}/archive`}
                        unarchiveUrl={`/api/admin/organizations/${org.id}/unarchive`}
                        deleteUrl={`/api/admin/organizations/${org.id}`}
                        onDone={() => router.refresh()}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredOrganizations.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No organizations found
          </div>
        )}
      </div>
    </div>
  );
}
