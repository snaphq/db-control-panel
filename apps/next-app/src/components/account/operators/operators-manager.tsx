"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { OperatorFormDialog } from "./operator-form-dialog";
import type {
  OperatorOrganizationOption,
  OperatorTokenView,
  OperatorView,
} from "./types";

const EXPIRATIONS = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "60d", label: "60 days" },
  { value: "90d", label: "90 days" },
  { value: "180d", label: "180 days" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" },
] as const;

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeOrNever(value: string | null): string {
  if (!value) return "Never";
  const diffMs = Date.now() - new Date(value).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function isExpired(value: string | null): boolean {
  return value !== null && new Date(value).getTime() <= Date.now();
}

function scopeLabel(
  operator: OperatorView,
  organizations: OperatorOrganizationOption[],
): string {
  if (operator.scope.mode === "all_owned") {
    return "All organizations I own";
  }
  if (operator.scope.mode === "unknown") {
    return "Unknown scope";
  }
  const names = operator.scope.organizationIds.map((id) => {
    const org = organizations.find((candidate) => candidate.id === id);
    return org ? org.slug : id;
  });
  return names.length > 0 ? names.join(", ") : "No organizations";
}

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === "string" ? data.error : "Request failed";
}

export function OperatorsManager({
  initialOperators,
  organizations,
}: {
  initialOperators: OperatorView[];
  organizations: OperatorOrganizationOption[];
}) {
  const [operators, setOperators] = useState(initialOperators);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OperatorView | null>(null);
  const [tokenTarget, setTokenTarget] = useState<OperatorView | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{
    operator: OperatorView;
    token?: OperatorTokenView;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/account/operators", {
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { operators: OperatorView[] };
    setOperators(data.operators);
  }, []);

  const setStatus = async (operator: OperatorView, status: string) => {
    const res = await fetch(`/api/account/operators/${operator.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error(await readError(res));
      return;
    }
    toast.success(
      status === "active" ? "Operator resumed" : "Operator suspended",
    );
    await refresh();
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      const url = revokeTarget.token
        ? `/api/account/operators/${revokeTarget.operator.id}/tokens/${revokeTarget.token.id}`
        : `/api/account/operators/${revokeTarget.operator.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readError(res));
        return;
      }
      toast.success(revokeTarget.token ? "Token revoked" : "Operator revoked");
      setRevokeTarget(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Operators</CardTitle>
            <CardDescription>
              Programmatic access via MCP and APIs. Each operator is scoped to
              organizations and every request is attributed to it.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New operator
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {operators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No operators yet. Create one to authenticate programmatic
              requests.
            </p>
          ) : (
            operators.map((operator) => (
              <div key={operator.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {operator.name}
                      </span>
                      {operator.status !== "active" ? (
                        <Badge variant="secondary">Suspended</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {scopeLabel(operator, organizations)}
                      {operator.description ? ` · ${operator.description}` : ""}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setTokenTarget(operator)}
                        disabled={operator.status !== "active"}
                      >
                        <KeyRound className="mr-2 h-4 w-4" /> Add token
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditTarget(operator)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          void setStatus(
                            operator,
                            operator.status === "active"
                              ? "suspended"
                              : "active",
                          )
                        }
                      >
                        {operator.status === "active" ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4" /> Suspend
                          </>
                        ) : (
                          <>
                            <RotateCcw className="mr-2 h-4 w-4" /> Resume
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setRevokeTarget({ operator })}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {operator.tokens.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No active tokens.
                  </p>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">
                            Token
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Expires
                          </th>
                          <th className="px-3 py-2 text-left font-medium">
                            Last active
                          </th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {operator.tokens.map((token) => (
                          <tr key={token.id}>
                            <td className="px-3 py-2">
                              <div>{token.label ?? "Token"}</div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {token.tokenPrefix}…
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {isExpired(token.expiresAt) ? (
                                <Badge variant="outline">Expired</Badge>
                              ) : (
                                formatDate(token.expiresAt)
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {relativeOrNever(token.lastUsedAt)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  setRevokeTarget({ operator, token })
                                }
                              >
                                Revoke
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <OperatorFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizations={organizations}
        onSaved={refresh}
        onCreated={setPlaintext}
      />

      <OperatorFormDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        organizations={organizations}
        operator={editTarget}
        onSaved={refresh}
        onCreated={() => {}}
      />

      <AddTokenDialog
        operator={tokenTarget}
        onOpenChange={(open) => {
          if (!open) setTokenTarget(null);
        }}
        onCreated={setPlaintext}
      />

      <PlaintextDialog value={plaintext} onClose={() => setPlaintext(null)} />

      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {revokeTarget?.token ? "Revoke token" : "Revoke operator"}
            </DialogTitle>
            <DialogDescription>
              {revokeTarget?.token
                ? "This token stops authenticating immediately. This cannot be undone."
                : "This operator and all of its tokens stop authenticating immediately. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRevokeTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmRevoke()}
              disabled={busy}
            >
              {busy ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddTokenDialog({
  operator,
  onOpenChange,
  onCreated,
}: {
  operator: OperatorView | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (plaintext: string) => void;
}) {
  const open = operator !== null;
  const [expiration, setExpiration] = useState<string>("30d");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setExpiration("30d");
    setLabel("");
    setError(null);
    setSaving(false);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operator) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/operators/${operator.id}/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiration, label: label.trim() }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = (await res.json()) as { plaintext: string };
      onOpenChange(false);
      onCreated(data.plaintext);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add token</DialogTitle>
            <DialogDescription>
              Issue a new credential for {operator?.name}. Existing tokens keep
              working until revoked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label
                htmlFor="new-token-expiration"
                className="text-xs uppercase text-muted-foreground"
              >
                Expiration
              </Label>
              <select
                id="new-token-expiration"
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {EXPIRATIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label
                htmlFor="new-token-label"
                className="text-xs uppercase text-muted-foreground"
              >
                Label (optional)
              </Label>
              <Input
                id="new-token-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. CI"
                maxLength={60}
                className="mt-1"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlaintextDialog({
  value,
  onClose,
}: {
  value: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={value !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Operator token created</DialogTitle>
          <DialogDescription>
            Copy this token now. For security reasons, it will not be shown
            again.
          </DialogDescription>
        </DialogHeader>
        {value ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm">
            <span className="flex-1 truncate">{value}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void copy()}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3 w-3" /> Copy
                </>
              )}
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
