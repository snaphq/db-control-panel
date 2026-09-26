"use client";

import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type ReferralStatus =
  | "pending"
  | "trial"
  | "refund_period"
  | "converted"
  | "cancelled";

interface ReferralRow {
  id: string;
  referrerId: string;
  refereeId: string;
  status: ReferralStatus;
  createdAt: string | Date;
}

interface ApiResponse {
  rows: ReferralRow[];
  total: number;
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: "" | ReferralStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "trial", label: "Trial" },
  { value: "refund_period", label: "Refund Period" },
  { value: "converted", label: "Converted" },
  { value: "cancelled", label: "Cancelled" },
];

function StatusBadge({ status }: { status: ReferralStatus }) {
  if (status === "converted") {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600/80">
        Converted
      </Badge>
    );
  }
  if (status === "cancelled") {
    return <Badge variant="destructive">Cancelled</Badge>;
  }
  if (status === "trial") {
    return <Badge variant="secondary">Trial</Badge>;
  }
  if (status === "refund_period") {
    return <Badge variant="outline">Refund Period</Badge>;
  }
  return <Badge variant="outline">Pending</Badge>;
}

function truncateId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function ReferralsTable() {
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | ReferralStatus>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/referrals/list?${params}`);
      if (!res.ok) throw new Error("Failed to fetch referrals");
      const data: ApiResponse = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load referrals");
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (value: "" | ReferralStatus) => {
    setOffset(0);
    setStatusFilter(value);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) =>
            handleFilterChange(e.target.value as "" | ReferralStatus)
          }
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="icon" onClick={fetchData} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          No referrals found.
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Referral ID
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Referrer ID
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Referee ID
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Status
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <td className="p-4 align-middle">
                    <code
                      className="text-xs bg-muted px-1.5 py-0.5 rounded"
                      title={row.id}
                    >
                      {truncateId(row.id)}
                    </code>
                  </td>
                  <td className="p-4 align-middle">
                    <code
                      className="text-xs bg-muted px-1.5 py-0.5 rounded"
                      title={row.referrerId}
                    >
                      {truncateId(row.referrerId)}
                    </code>
                  </td>
                  <td className="p-4 align-middle">
                    <code
                      className="text-xs bg-muted px-1.5 py-0.5 rounded"
                      title={row.refereeId}
                    >
                      {truncateId(row.refereeId)}
                    </code>
                  </td>
                  <td className="p-4 align-middle">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="p-4 align-middle text-sm text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
