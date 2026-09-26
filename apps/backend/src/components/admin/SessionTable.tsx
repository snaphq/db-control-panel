"use client";

import type { SafeSession } from "@repo/database";
import { Badge } from "@repo/react-ui/components/ui/badge";
import { Input } from "@repo/react-ui/components/ui/input";
import { useState } from "react";

interface SessionTableProps {
  sessions: SafeSession[];
}

export function SessionTable({ sessions: initialSessions }: SessionTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sessions] = useState(initialSessions);

  const filteredSessions = sessions.filter(
    (session) =>
      session.userId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.ipAddress?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const isExpired = (expiresAt: Date) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-12 px-4 text-left align-middle font-medium">
                User ID
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                IP Address
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                User Agent
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Created
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Expires
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map((session) => {
              const expired = isExpired(session.expiresAt);
              return (
                <tr
                  key={session.id}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <td className="p-4 align-middle font-mono text-sm">
                    {session.userId.substring(0, 8)}...
                  </td>
                  <td className="p-4 align-middle">
                    {session.ipAddress || "N/A"}
                  </td>
                  <td className="p-4 align-middle text-sm max-w-xs truncate">
                    {session.userAgent || "N/A"}
                  </td>
                  <td className="p-4 align-middle">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 align-middle">
                    {new Date(session.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 align-middle">
                    <Badge variant={expired ? "secondary" : "default"}>
                      {expired ? "Expired" : "Active"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredSessions.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No sessions found
          </div>
        )}
      </div>
    </div>
  );
}
