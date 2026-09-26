"use client";

import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type GrantStatus = "pending" | "applying" | "applied" | "rejected" | "failed";

interface GrantRow {
  id: string;
  referralId: string;
  recipientUserId: string;
  recipientRole: "referrer" | "referee";
  amountCents: number;
  currency: string;
  status: GrantStatus;
  createdAt: string | Date;
}

interface ApiResponse {
  rows: GrantRow[];
  total: number;
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: "" | GrantStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "applying", label: "Applying" },
  { value: "applied", label: "Applied" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
];

function GrantStatusBadge({ status }: { status: GrantStatus }) {
  if (status === "applied") {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600/80">
        Applied
      </Badge>
    );
  }
  if (status === "rejected") {
    return <Badge variant="destructive">Rejected</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  if (status === "applying") {
    return <Badge variant="secondary">Applying</Badge>;
  }
  return <Badge variant="outline">Pending</Badge>;
}

function truncateId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function ReferralGrantsTable() {
  const [rows, setRows] = useState<GrantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | GrantStatus>("");
  const [actioning, setActioning] = useState<string | null>(null);

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/referrals/grants?${params}`);
      if (!res.ok) throw new Error("Failed to fetch grants");
      const data: ApiResponse = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load credit grants");
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (value: "" | GrantStatus) => {
    setOffset(0);
    setStatusFilter(value);
  };

  const handleApprove = async (id: string) => {
    setActioning(id);
    try {
      const res = await fetch(`/api/admin/referrals/grants/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve grant");
      toast.success("Grant approved");
      await fetchData();
    } catch {
      toast.error("Failed to approve grant");
    } finally {
      setActioning(null);
    }
  };

  const openRejectDialog = (id: string) => {
    setRejectTargetId(id);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTargetId) return;
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setRejecting(true);
    try {
      const res = await fetch(
        `/api/admin/referrals/grants/${rejectTargetId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason }),
        },
      );
      if (!res.ok) throw new Error("Failed to reject grant");
      toast.success("Grant rejected");
      setRejectDialogOpen(false);
      setRejectTargetId(null);
      await fetchData();
    } catch {
      toast.error("Failed to reject grant");
    } finally {
      setRejecting(false);
    }
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
            handleFilterChange(e.target.value as "" | GrantStatus)
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
          No credit grants found.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Grant ID
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Referral ID
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Recipient
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Role
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Amount
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Status
                </th>
                <th className="h-12 px-4 text-right align-middle font-medium">
                  Actions
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
                      title={row.referralId}
                    >
                      {truncateId(row.referralId)}
                    </code>
                  </td>
                  <td className="p-4 align-middle">
                    <code
                      className="text-xs bg-muted px-1.5 py-0.5 rounded"
                      title={row.recipientUserId}
                    >
                      {truncateId(row.recipientUserId)}
                    </code>
                  </td>
                  <td className="p-4 align-middle text-sm capitalize">
                    {row.recipientRole}
                  </td>
                  <td className="p-4 align-middle text-sm font-medium">
                    {formatAmount(row.amountCents, row.currency)}
                  </td>
                  <td className="p-4 align-middle">
                    <GrantStatusBadge status={row.status} />
                  </td>
                  <td className="p-4 align-middle text-right">
                    {row.status === "pending" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actioning === row.id}
                          onClick={() => handleApprove(row.id)}
                          title="Approve"
                        >
                          {actioning === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          <span className="ml-1">Approve</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actioning === row.id}
                          onClick={() => openRejectDialog(row.id)}
                          title="Reject"
                        >
                          <X className="h-3 w-3" />
                          <span className="ml-1">Reject</span>
                        </Button>
                      </div>
                    )}
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

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Credit Grant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="reject-reason">Rejection reason</Label>
            <Input
              id="reject-reason"
              placeholder="Explain why this grant is being rejected..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !rejecting && handleReject()
              }
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectReason.trim()}
            >
              {rejecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
