"use client";

import { Badge } from "@repo/react-ui/components/ui/badge";
import { Button } from "@repo/react-ui/components/ui/button";
import { Input } from "@repo/react-ui/components/ui/input";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ReferralCodeRow {
  id: string;
  code: string;
  userId: string;
  usageCount: number;
  isActive: boolean;
  createdAt: string | Date;
  ownerEmail: string | null;
}

interface ApiResponse {
  rows: ReferralCodeRow[];
  total: number;
}

const PAGE_SIZE = 20;

export function ReferralCodesTable() {
  const [rows, setRows] = useState<ReferralCodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search) params.set("search", search);
      if (filterActive !== "") params.set("isActive", filterActive);

      const res = await fetch(`/api/admin/referrals/codes?${params}`);
      if (!res.ok) throw new Error("Failed to fetch codes");
      const data: ApiResponse = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      toast.error("Failed to load referral codes");
    } finally {
      setLoading(false);
    }
  }, [offset, search, filterActive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = () => {
    setOffset(0);
    setSearch(searchInput);
  };

  const handleFilterChange = (value: "" | "true" | "false") => {
    setOffset(0);
    setFilterActive(value);
  };

  const handleToggle = async (row: ReferralCodeRow) => {
    setToggling(row.id);
    try {
      const res = await fetch(`/api/admin/referrals/codes/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      if (!res.ok) throw new Error("Failed to update code");
      toast.success(`Code ${row.isActive ? "deactivated" : "activated"}`);
      await fetchData();
    } catch {
      toast.error("Failed to update code status");
    } finally {
      setToggling(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2">
          <Input
            placeholder="Search codes..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-48"
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
        </div>
        <select
          value={filterActive}
          onChange={(e) =>
            handleFilterChange(e.target.value as "" | "true" | "false")
          }
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
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
          No referral codes found.
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Code
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Owner
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium">
                  Usage
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
                  <td className="p-4 align-middle font-mono text-sm">
                    {row.code}
                  </td>
                  <td className="p-4 align-middle text-sm text-muted-foreground">
                    {row.ownerEmail ?? <span className="italic">Unknown</span>}
                  </td>
                  <td className="p-4 align-middle">{row.usageCount}</td>
                  <td className="p-4 align-middle">
                    {row.isActive ? (
                      <Badge
                        variant="default"
                        className="bg-green-600 hover:bg-green-600/80"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                  <td className="p-4 align-middle text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={toggling === row.id}
                      onClick={() => handleToggle(row)}
                    >
                      {toggling === row.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : row.isActive ? (
                        "Deactivate"
                      ) : (
                        "Activate"
                      )}
                    </Button>
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
