"use client";

import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";
import type { Tenant, User } from "@repo/database/schema";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface UserTableProps {
  users: User[];
  tenants: Tenant[];
}

export function UserTable({ users: initialUsers, tenants }: UserTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [users] = useState(initialUsers);

  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.publicEmail?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <CreateUserDialog tenants={tenants} />
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left align-middle font-medium">
                Name
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Email
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Tenant
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Role
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Verified
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
            {filteredUsers.map((user) => {
              const archived = Boolean(user.archivedAt);
              return (
                <tr
                  key={user.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/50",
                    archived && "text-muted-foreground",
                  )}
                >
                  <td className="p-4 align-middle">
                    <span className="flex items-center gap-2">
                      {user.name}
                      {archived && (
                        <Badge variant="outline" className="text-xs">
                          Archived
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="p-4 align-middle">{user.publicEmail}</td>
                  <td className="p-4 align-middle">{user.tenantId}</td>
                  <td className="p-4 align-middle">
                    <Badge
                      variant={
                        user.role === "site-admin" ? "default" : "secondary"
                      }
                    >
                      {user.role}
                    </Badge>
                  </td>
                  <td className="p-4 align-middle">
                    <Badge variant={user.emailVerified ? "default" : "outline"}>
                      {user.emailVerified ? "Yes" : "No"}
                    </Badge>
                  </td>
                  <td className="p-4 align-middle">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 align-middle">
                    <div className="flex items-center gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/users/${user.id}`}>View</Link>
                      </Button>
                      <RowActionsMenu
                        archived={archived}
                        archiveUrl={`/api/admin/users/${user.id}/archive`}
                        unarchiveUrl={`/api/admin/users/${user.id}/unarchive`}
                        deleteUrl={`/api/admin/users/${user.id}`}
                        onDone={() => router.refresh()}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No users found
          </div>
        )}
      </div>
    </div>
  );
}
